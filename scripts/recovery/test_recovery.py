import copy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import recovery as r
import restore


def name(n):
    return "mn-recovery-202610%02dT040000Z-00000000.tar.gz.age" % n


class FakeDrive:
    root = "drive:"

    def __init__(self):
        self.files = {"personal-notes.txt": b"untouched"}
        self.actions = []
        self.free = 10 ** 9
        self.fail_upload = False
        self.corrupt = False
        self.fail_marker = False
        self.fail_delete = False

    def add(self, n):
        data = ("backup-%s" % n).encode()
        self.files[name(n)] = data
        self.files[name(n) + ".sha256"] = (hashlib.sha256(data).hexdigest() + "\n").encode()

    def listing(self):
        return [{"Name": n, "Size": len(v)} for n, v in self.files.items()]

    def read(self, key):
        return self.files[key]

    def available(self):
        return self.free

    def command(self, args):
        self.actions.append(tuple(args))
        if args[0] != "copyto": raise AssertionError(args)
        if self.fail_upload or (self.fail_marker and args[2].endswith(".sha256")):
            raise r.RecoveryError("Simulated upload failure")
        self.files[args[2].split(":", 1)[1]] = Path(args[1]).read_bytes()

    def verify(self, key, expected, size):
        self.actions.append(("verify", key))
        if self.corrupt or hashlib.sha256(self.files[key]).hexdigest() != expected or len(self.files[key]) != size:
            raise r.RecoveryError("Readback mismatch")

    def delete(self, key):
        self.actions.append(("delete", key))
        if self.fail_delete: raise r.RecoveryError("Deletion failed")
        self.files.pop(key, None)


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.archive = Path(self.temp.name) / name(4)
        self.archive.write_bytes(b"new encrypted backup")
        self.drive = FakeDrive()
        for n in [1, 2, 3]: self.drive.add(n)
        self.previous = copy.deepcopy(self.drive.files)

    def tearDown(self): self.temp.cleanup()

    def assert_previous_preserved(self):
        for key, data in self.previous.items(): self.assertEqual(self.drive.files[key], data)

    def test_fourth_verified_backup_retains_latest_three_only(self):
        self.drive.files["mn-recovery-unrelated.age"] = b"other"
        result = r.publish(self.drive, self.archive)
        self.assertEqual(result["retained"], [name(2), name(3), name(4)])
        self.assertNotIn(name(1), self.drive.files)
        self.assertNotIn(name(1) + ".sha256", self.drive.files)
        self.assertEqual(self.drive.files["personal-notes.txt"], b"untouched")
        self.assertEqual(self.drive.files["mn-recovery-unrelated.age"], b"other")
        verify = next(i for i, action in enumerate(self.drive.actions) if action[0] == "verify")
        delete = next(i for i, action in enumerate(self.drive.actions) if action == ("delete", name(1)))
        self.assertLess(verify, delete)

    def test_insufficient_space_does_not_upload_or_delete(self):
        self.drive.free = 0
        with self.assertRaises(r.RecoveryError): r.publish(self.drive, self.archive)
        self.assertEqual(self.drive.actions, [])
        self.assert_previous_preserved()

    def test_upload_failure_preserves_old_backups(self):
        self.drive.fail_upload = True
        with self.assertRaises(r.RecoveryError): r.publish(self.drive, self.archive)
        self.assert_previous_preserved()

    def test_corruption_preserves_old_backups_and_removes_new_incomplete_file(self):
        self.drive.corrupt = True
        with self.assertRaises(r.RecoveryError): r.publish(self.drive, self.archive)
        self.assert_previous_preserved()
        self.assertNotIn(name(4), self.drive.files)

    def test_completion_marker_failure_cannot_rotate_old_backups(self):
        self.drive.fail_marker = True
        with self.assertRaises(r.RecoveryError): r.publish(self.drive, self.archive)
        self.assert_previous_preserved()
        self.assertNotIn(name(4), self.drive.files)

    def test_prune_failure_keeps_new_verified_backup(self):
        self.drive.fail_delete = True
        with self.assertRaises(r.RecoveryError): r.publish(self.drive, self.archive)
        self.assert_previous_preserved()
        self.assertIn(name(4) + ".sha256", self.drive.files)

    def test_orphan_and_malformed_marker_do_not_count_as_success(self):
        self.drive.files[name(5)] = b"partial"
        self.drive.files[name(6)] = b"bad"
        self.drive.files[name(6) + ".sha256"] = b"not a checksum"
        self.assertEqual([n for n, _ in r.committed_backups(self.drive)], [name(1), name(2), name(3)])

    def test_unexpected_backup_name_is_rejected_before_cloud_access(self):
        wrong = self.archive.with_name("personal.txt"); wrong.write_bytes(b"x")
        with self.assertRaises(r.RecoveryError): r.publish(self.drive, wrong)
        self.assertEqual(self.drive.actions, [])


def fixture_payload(root):
    names = ["database.dump", "globals.sql", "roles.json", "inventory.json", "baseline.json", "validation.json", "images.tar",
             "production-compose.json", "proxy.json", "harden-database.sh", "backup-config.json", "rclone.conf",
             "smtp-password", "tools/recovery.py", "tools/restore.py", "tools/setup.py", "tools/README.md"]
    for name_ in names:
        path = root / name_; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(b"fixture")
    r.write_json(root / "validation.json", {"databaseRestore": "passed"})
    r.write_json(root / "backup-config.json", {})
    r.write_json(root / "manifest.json", r.make_manifest(root, {}))


class PayloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name); fixture_payload(self.root)
    def tearDown(self): self.temp.cleanup()

    def test_valid_complete_payload(self): self.assertEqual(r.validate_payload(self.root)["formatVersion"], 1)
    def test_missing_required_file_rejected(self):
        (self.root / "rclone.conf").unlink()
        with self.assertRaises(r.RecoveryError): r.validate_payload(self.root)
    def test_public_proxy_bundle_requires_every_deployment_file(self):
        r.write_json(self.root / "backup-config.json", {"public_info_dir": "/protected/public-info"})
        with self.assertRaises(r.RecoveryError): r.make_manifest(self.root, {})
        for name_ in r.PUBLIC_INFO_FILES:
            path = self.root / "public-info" / name_
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture")
        r.write_json(self.root / "manifest.json", r.make_manifest(self.root, {}))
        self.assertEqual(r.validate_payload(self.root)["formatVersion"], 1)
    def test_same_length_corruption_rejected(self):
        (self.root / "database.dump").write_bytes(b"corrupt")
        with self.assertRaises(r.RecoveryError): r.validate_payload(self.root)
    def test_unexpected_file_rejected(self):
        (self.root / "unexpected").write_text("extra")
        with self.assertRaises(r.RecoveryError): r.validate_payload(self.root)
    def test_forged_manifest_cannot_omit_required_configuration(self):
        (self.root / "smtp-password").unlink()
        m = json.loads((self.root / "manifest.json").read_text()); del m["files"]["smtp-password"]
        r.write_json(self.root / "manifest.json", m)
        with self.assertRaises(r.RecoveryError): r.validate_payload(self.root)
    def test_no_successful_restore_report_rejected(self):
        r.write_json(self.root / "validation.json", {"databaseRestore": "failed"})
        r.write_json(self.root / "manifest.json", r.make_manifest(self.root, {}))
        with self.assertRaises(r.RecoveryError): r.validate_payload(self.root)
    def test_unsupported_format_rejected(self):
        m = json.loads((self.root / "manifest.json").read_text()); m["formatVersion"] = 2
        r.write_json(self.root / "manifest.json", m)
        with self.assertRaises(r.RecoveryError): r.validate_payload(self.root)
    def test_symlink_rejected(self):
        (self.root / "linked").symlink_to(self.root / "smtp-password")
        with self.assertRaises(r.RecoveryError): r.make_manifest(self.root, {})


class ArchiveTests(unittest.TestCase):
    def check_bad(self, member):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); archive = root / "archive.tar.gz"
            with tarfile.open(archive, "w:gz") as tar: tar.addfile(member, io.BytesIO(b"x") if member.isfile() else None)
            target = root / "out"; target.mkdir()
            with self.assertRaises(r.RecoveryError): r.safe_extract(archive, target)
    def test_parent_traversal(self):
        member = tarfile.TarInfo("../secret"); member.size = 1; self.check_bad(member)
    def test_absolute_path(self):
        member = tarfile.TarInfo("/tmp/secret"); member.size = 1; self.check_bad(member)
    def test_symlink(self):
        member = tarfile.TarInfo("symlink"); member.type = tarfile.SYMTYPE; member.linkname = "../secret"; self.check_bad(member)
    def test_hardlink(self):
        member = tarfile.TarInfo("hardlink"); member.type = tarfile.LNKTYPE; member.linkname = "../secret"; self.check_bad(member)


class SafetyTests(unittest.TestCase):
    def test_drive_cannot_bind_root_or_wrong_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            conf = Path(tmp) / "rclone.conf"; conf.write_text("[mn-backup]\ntype=drive\nscope=drive.file\nroot_folder_id=wrong\n")
            with self.assertRaises(r.RecoveryError): r.Drive({"rclone_config": str(conf), "drive_folder_id": "expected"})
    def test_drive_delete_rejects_other_files(self):
        drive = object.__new__(r.Drive)
        for name_ in ["personal.txt", "../" + name(1), "folder/" + name(1)]:
            with self.assertRaises(r.RecoveryError): drive.delete(name_)
    def test_subprocess_error_does_not_disclose_stderr_or_arguments(self):
        exception = subprocess.CalledProcessError(1, ["tool", "secret-argument"], stderr=b"secret-password")
        with patch.object(r.subprocess, "run", side_effect=exception):
            with self.assertRaises(r.RecoveryError) as caught: r.run(["tool", "secret-argument"])
        self.assertNotIn("secret", str(caught.exception))
    def test_classic_and_containerd_ids_match_by_filesystem_and_config(self):
        image = {"Id": "classic", "Os": "linux", "Architecture": "amd64", "RootFS": {"Layers": ["one"]}, "Config": {"Env": ["A=B"]}}
        other = {**image, "Id": "containerd"}
        self.assertEqual(r.image_fingerprint(image), r.image_fingerprint(other))
        other["RootFS"] = {"Layers": ["changed"]}
        self.assertNotEqual(r.image_fingerprint(image), r.image_fingerprint(other))
    def test_cleanup_refuses_non_generated_project_before_docker_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); r.write_json(root / "compose.json", {"name": "mn"}); r.write_json(root / "restore-state.json", {"project": "mn"})
            with patch.object(restore, "run") as mocked:
                with self.assertRaises(r.RecoveryError): restore.cleanup(root)
                mocked.assert_not_called()


if __name__ == "__main__": unittest.main()
