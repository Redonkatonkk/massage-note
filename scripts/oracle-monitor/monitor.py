#!/usr/bin/env python3
"""Bounded OCI Always Free provisioner. Credentials and durable state stay on the NAS."""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import secrets
import signal
import smtplib
import ssl
import time
from email.message import EmailMessage

SHAPE = "VM.Standard.A1.Flex"
OCPUS = 2
MEMORY_GB = 12
REGION = "us-ashburn-1"
ACCOUNT = "jr24839652@gmail.com"


class Halt(Exception):
    pass


class CapacityUnavailable(Exception):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def save(path, value):
    path = Path(path)
    temporary = path.with_suffix(".tmp")
    with temporary.open("w") as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def config_read(path):
    cfg = json.loads(Path(path).read_text())
    required = {"tenancy", "compartment", "subnet", "image", "monitor_id", "oci_config", "ssh_public_key", "smtp_password_file", "state_dir"}
    if not required <= cfg.keys() or cfg.get("region") != REGION:
        raise Halt("invalid_configuration")
    for field, kind in [("tenancy", "tenancy"), ("compartment", "compartment"), ("subnet", "subnet"), ("image", "image")]:
        if not cfg[field].startswith("ocid1." + kind + "."):
            raise Halt("invalid_configuration")
    if not cfg["monitor_id"] or not cfg["monitor_id"].isascii() or len(cfg["monitor_id"]) > 64:
        raise Halt("invalid_monitor_id")
    return cfg


def guard(instances, volumes, ocpus, memory):
    """Count all non-terminated A1 instances, including stopped VMs, and all allocated disks."""
    active = [x for x in instances if x["lifecycle_state"] != "TERMINATED"]
    if any(x["shape"] != SHAPE for x in active):
        raise Halt("unexpected_compute_usage")
    used_cpu = sum(x["shape_config"]["ocpus"] for x in active)
    used_memory = sum(x["shape_config"]["memory_in_gbs"] for x in active)
    if used_cpu + ocpus > 2 or used_memory + memory > 12:
        raise Halt("free_compute_limit")
    allocated = sum(x["size_in_gbs"] for x in volumes if x["lifecycle_state"] != "TERMINATED")
    if allocated + 50 > 200:
        raise Halt("free_storage_limit")


class Oracle:
    def __init__(self, cfg):
        import oci
        self.oci, self.cfg = oci, cfg
        profile = oci.config.from_file(cfg["oci_config"])
        if profile["tenancy"] != cfg["tenancy"] or profile["region"] != REGION:
            raise Halt("credential_scope_mismatch")
        options = {"timeout": (10, 45), "retry_strategy": oci.retry.NoneRetryStrategy()}
        self.compute = oci.core.ComputeClient(profile, **options)
        self.block = oci.core.BlockstorageClient(profile, **options)
        self.network = oci.core.VirtualNetworkClient(profile, **options)
        self.identity = oci.identity.IdentityClient(profile, **options)

    def all(self, method, *args, **kwargs):
        return self.oci.pagination.list_call_get_all_results(method, *args, **kwargs).data

    def inventory(self):
        cfg = self.cfg
        # ANY is deliberate: an inaccessible compartment must fail the inventory, not count as empty.
        compartments = self.all(self.identity.list_compartments, cfg["tenancy"], compartment_id_in_subtree=True, access_level="ANY")
        ids = {cfg["tenancy"]} | {c.id for c in compartments if c.lifecycle_state == "ACTIVE"}
        if cfg["compartment"] not in ids:
            raise Halt("compartment_not_found")
        ads = self.all(self.identity.list_availability_domains, cfg["tenancy"])
        instances, volumes = [], []
        for cid in sorted(ids):
            instances += self.all(self.compute.list_instances, cid)
            volumes += self.all(self.block.list_volumes, compartment_id=cid)
            for ad in ads:
                volumes += self.all(self.block.list_boot_volumes, availability_domain=ad.name, compartment_id=cid)
        return self.oci.util.to_dict(instances), self.oci.util.to_dict(volumes), [a.name for a in ads]

    def validate_target(self):
        subnet = self.network.get_subnet(self.cfg["subnet"]).data
        if subnet.compartment_id != self.cfg["compartment"] or subnet.prohibit_public_ip_on_vnic:
            raise Halt("invalid_subnet")
        image = self.compute.get_image(self.cfg["image"]).data
        if image.operating_system != "Canonical Ubuntu" or "24.04" not in image.display_name or "aarch64" not in image.display_name:
            raise Halt("invalid_platform_image")
        shapes = self.all(self.compute.list_shapes, self.cfg["compartment"], image_id=self.cfg["image"])
        if not any(s.shape == SHAPE for s in shapes):
            raise Halt("image_shape_mismatch")

    def capacity(self, ad, cpu, memory):
        models = self.oci.core.models
        result = self.compute.create_compute_capacity_report(models.CreateComputeCapacityReportDetails(
            availability_domain=ad, compartment_id=self.cfg["tenancy"],
            shape_availabilities=[models.CreateCapacityReportShapeAvailabilityDetails(
                instance_shape=SHAPE, instance_shape_config=models.CapacityReportInstanceShapeConfig(ocpus=cpu, memory_in_gbs=memory))])).data
        return any(x.availability_status == "AVAILABLE" and (x.available_count or 0) > 0 for x in result.shape_availabilities)

    def launch(self, pending):
        if (pending["cpu"], pending["memory"]) != (OCPUS, MEMORY_GB):
            raise Halt("unexpected_pending_configuration")
        models = self.oci.core.models
        details = models.LaunchInstanceDetails(
            availability_domain=pending["ad"], compartment_id=self.cfg["compartment"],
            display_name="massage-note-free", shape=SHAPE,
            shape_config=models.LaunchInstanceShapeConfigDetails(ocpus=pending["cpu"], memory_in_gbs=pending["memory"]),
            source_details=models.InstanceSourceViaImageDetails(image_id=self.cfg["image"], boot_volume_size_in_gbs=50),
            create_vnic_details=models.CreateVnicDetails(subnet_id=self.cfg["subnet"], assign_public_ip=True),
            metadata={"ssh_authorized_keys": Path(self.cfg["ssh_public_key"]).read_text().strip()},
            freeform_tags={"massage-note-monitor": self.cfg["monitor_id"]},
            is_pv_encryption_in_transit_enabled=True,
            instance_options=models.InstanceOptions(are_legacy_imds_endpoints_disabled=True))
        try:
            return self.compute.launch_instance(details, opc_retry_token=pending["token"]).data.id
        except self.oci.exceptions.ServiceError as exc:
            if "out of" in exc.message.lower() and ("capacity" in exc.message.lower()):
                raise CapacityUnavailable() from None
            # All other failures retain the token; a timeout must never result in a second VM.
            raise

    def public_ip(self, instance):
        attachments = self.all(self.compute.list_vnic_attachments, self.cfg["compartment"], instance_id=instance["id"])
        for attachment in attachments:
            if attachment.lifecycle_state == "ATTACHED":
                value = self.network.get_vnic(attachment.vnic_id).data.public_ip
                if value:
                    return value
        return None


def mail(cfg, subject, body):
    message = EmailMessage()
    message["From"] = ACCOUNT
    message["To"] = ACCOUNT
    message["Subject"] = subject
    message.set_content(body + "\n\n" + now())
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(ACCOUNT, Path(cfg["smtp_password_file"]).read_text().strip())
        smtp.send_message(message)


class Monitor:
    def __init__(self, cfg, oracle, notify=mail):
        self.cfg, self.oracle, self.notify = cfg, oracle, notify
        self.path = Path(cfg["state_dir"]) / "state.json"
        self.state = json.loads(self.path.read_text()) if self.path.exists() else {"status": "waiting", "attempts": 0}

    def persist(self):
        self.state["checked_at"] = now()
        save(self.path, self.state)

    def notification(self):
        if self.state.get("notified") or self.state["status"] not in {"completed", "blocked"}:
            return
        if self.state["status"] == "completed":
            subject = "Massage Note：Oracle 免费实例已创建成功"
            body = (f"免费 A1 实例已运行，自动申请已停止。\n区域：{REGION}\n"
                    f"配置：{self.state['cpu']} OCPU / {self.state['memory']} GB\n公网 IP：{self.state['public_ip']}\n"
                    f"实例：{self.state['instance_id']}\n创建时间：{self.state['instance_created_at']}\n"
                    f"控制台：https://cloud.oracle.com/compute/instances/{self.state['instance_id']}?region={REGION}\n"
                    "此通知仅表示实例已就绪，Massage Note 服务尚未自动迁移。")
        else:
            subject = "Massage Note：Oracle 自动申请需要处理"
            body = "自动申请已暂停，未继续创建资源。\n原因代码：" + self.state.get("reason", "unknown")
        try:
            self.notify(self.cfg, subject, body)
            self.state["notified"] = True
            self.state.pop("mail_error", None)
        except Exception:
            self.state["mail_error"] = "delivery_failed_will_retry"
        self.persist()

    def cycle(self):
        if self.state["status"] in {"completed", "blocked"}:
            self.notification()
            self.persist()
            return 3600
        try:
            self.oracle.validate_target()
            instances, volumes, ads = self.oracle.inventory()
            own = [x for x in instances if x.get("freeform_tags", {}).get("massage-note-monitor") == self.cfg["monitor_id"] and x["lifecycle_state"] != "TERMINATED"]
            if len(own) > 1:
                raise Halt("multiple_managed_instances")
            if own:
                vm = own[0]
                if vm["shape"] != SHAPE or (vm["shape_config"]["ocpus"], vm["shape_config"]["memory_in_gbs"]) != (OCPUS, MEMORY_GB):
                    raise Halt("unexpected_managed_instance")
                self.state.update(status="provisioning", instance_id=vm["id"])
                self.state.pop("pending", None)
                if vm["lifecycle_state"] == "RUNNING":
                    ip = self.oracle.public_ip(vm)
                    if ip:
                        self.state.update(status="completed", public_ip=ip, cpu=vm["shape_config"]["ocpus"],
                                          memory=vm["shape_config"]["memory_in_gbs"], instance_created_at=str(vm["time_created"]))
                        self.persist()
                        self.notification()
                elif vm["lifecycle_state"] not in {"PROVISIONING", "STARTING"}:
                    raise Halt("managed_instance_not_running")
                self.persist()
                return 300
            if self.state.get("instance_id"):
                raise Halt("managed_instance_disappeared")
            pending = self.state.get("pending")
            if pending:
                if (pending["cpu"], pending["memory"]) != (OCPUS, MEMORY_GB):
                    raise Halt("unexpected_pending_configuration")
                age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(pending["at"])
                if age.total_seconds() > 20 * 3600:
                    raise Halt("ambiguous_launch_requires_review")
                guard(instances, volumes, pending["cpu"], pending["memory"])
                candidates = [pending]
            else:
                candidates = [{"ad": ad, "cpu": OCPUS, "memory": MEMORY_GB} for ad in ads]
            for candidate in candidates:
                guard(instances, volumes, candidate["cpu"], candidate["memory"])
                if not pending and not self.oracle.capacity(candidate["ad"], candidate["cpu"], candidate["memory"]):
                    continue
                if not pending:
                    candidate.update(token=secrets.token_hex(24), at=now())
                    self.state["pending"] = candidate
                    self.persist()  # Durable retry token before a potentially ambiguous remote write.
                self.state["attempts"] += 1
                try:
                    vm_id = self.oracle.launch(candidate)
                except CapacityUnavailable:
                    self.state.pop("pending", None)
                    self.state["status"] = "waiting"
                    self.persist()
                    return 300
                self.state.update(status="provisioning", instance_id=vm_id)
                self.state.pop("pending", None)
                self.persist()
                return 300
            self.state.update(status="waiting", consecutive_errors=0)
            self.state.pop("last_error", None)
            self.persist()
            return 300
        except Halt as exc:
            self.state.update(status="blocked", reason=str(exc), notified=False)
            self.persist()
            self.notification()
            return 3600

    def transient(self, reason):
        count = self.state.get("consecutive_errors", 0) + 1
        self.state.update(consecutive_errors=count, last_error=reason)
        self.persist()
        return min(3600, 300 * 2 ** min(count - 1, 4))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/config/config.json")
    parser.add_argument("command", choices=["run", "check", "test-mail", "health"])
    args = parser.parse_args()
    os.umask(0o077)
    cfg = config_read(args.config)
    root = Path(cfg["state_dir"])
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if args.command == "health":
        state = json.loads((root / "state.json").read_text())
        age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(state["checked_at"])
        return 0 if age.total_seconds() < 4500 else 1
    if args.command == "test-mail":
        mail(cfg, "Massage Note：Oracle 监控通知配置测试", "这是一封通知链路测试邮件。尚未创建 Oracle 实例。创建成功或申请暂停时，会由 NAS 发邮件到本邮箱。")
        save(root / "mail-test.json", {"sent_at": now(), "recipient": ACCOUNT})
        print("Notification test accepted by Gmail SMTP.")
        return 0
    oracle = Oracle(cfg)
    if args.command == "check":
        oracle.validate_target()
        instances, volumes, ads = oracle.inventory()
        guard(instances, volumes, OCPUS, MEMORY_GB)
        result = [{"ad": ad, "cpu": OCPUS, "memory": MEMORY_GB, "available": oracle.capacity(ad, OCPUS, MEMORY_GB)} for ad in ads]
        save(root / "preflight.json", {"checked_at": now(), "checks": result, "resourceCreation": False})
        print(json.dumps({"checks": result, "resourceCreation": False}))
        return 0
    with (root / "monitor.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if not (Path(args.config).parent / "enabled").is_file():
            raise Halt("monitor_not_activated")
        monitor = Monitor(cfg, oracle)
        stopped = False

        def stop(*_):
            nonlocal stopped
            stopped = True

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        while not stopped:
            try:
                delay = monitor.cycle()
            except Exception as exc:
                import oci
                if isinstance(exc, oci.exceptions.ServiceError):
                    if exc.status in {401, 403, 404} or (exc.status < 500 and exc.status != 429):
                        monitor.state.update(status="blocked", reason="oci_" + str(exc.status), notified=False)
                        monitor.persist()
                        monitor.notification()
                        delay = 3600
                    else:
                        delay = monitor.transient("oci_" + str(exc.status))
                else:
                    # Never print SDK exceptions: they can carry signed request details.
                    delay = monitor.transient("request_failed")
            print(json.dumps({"at": now(), "status": monitor.state["status"], "attempts": monitor.state["attempts"], "next_check_seconds": delay}), flush=True)
            for _ in range(delay):
                if stopped:
                    break
                time.sleep(1)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        print("Oracle monitor did not start; inspect protected configuration and permissions.", flush=True)
        raise SystemExit(1)
