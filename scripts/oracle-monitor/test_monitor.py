import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import create_autospec
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("oracle_monitor", Path(__file__).with_name("monitor.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def vm(**changes):
    value = {"id": "vm-one", "shape": m.SHAPE, "shape_config": {"ocpus": 2, "memory_in_gbs": 12},
             "lifecycle_state": "RUNNING", "freeform_tags": {"massage-note-monitor": "test-monitor"},
             "time_created": "2026-10-18T22:00:00Z"}
    value.update(changes)
    return value


class FakeOracle:
    def __init__(self):
        self.instances, self.volumes, self.launches = [], [], []
        self.available = set()
        self.capacity_queries = []
        self.failure = None

    def validate_target(self):
        pass

    def inventory(self):
        return copy.deepcopy(self.instances), copy.deepcopy(self.volumes), ["AD-1", "AD-2", "AD-3"]

    def capacity(self, ad, cpu, memory):
        self.capacity_queries.append((ad, cpu, memory))
        return (ad, cpu, memory) in self.available

    def launch(self, pending):
        self.launches.append(copy.deepcopy(pending))
        if self.failure:
            raise self.failure
        return "vm-one"

    def public_ip(self, instance):
        return "192.0.2.1"


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.cfg = {"state_dir": self.temp.name, "monitor_id": "test-monitor"}
        self.oracle = FakeOracle()
        self.messages = []
        self.monitor = m.Monitor(self.cfg, self.oracle, lambda *args: self.messages.append(args))

    def tearDown(self):
        self.temp.cleanup()

    def test_no_capacity_causes_no_launch_or_email(self):
        self.assertEqual(self.monitor.cycle(), 300)
        self.assertEqual(self.oracle.launches, [])
        self.assertEqual(self.messages, [])
        self.assertEqual(self.monitor.state["status"], "waiting")

    def test_only_requested_size_is_queried_and_launched_across_ads(self):
        self.oracle.available = {("AD-1", 1, 6), ("AD-3", 2, 12)}
        self.monitor.cycle()
        self.assertEqual([(x["ad"], x["cpu"], x["memory"]) for x in self.oracle.launches], [("AD-3", 2, 12)])
        self.assertEqual(self.oracle.capacity_queries, [("AD-1", 2, 12), ("AD-2", 2, 12), ("AD-3", 2, 12)])

    def test_smaller_capacity_never_causes_a_downgraded_launch(self):
        self.oracle.available = {("AD-1", 1, 6), ("AD-2", 1, 6), ("AD-3", 1, 6)}
        self.monitor.cycle()
        self.assertEqual(self.oracle.launches, [])
        self.assertEqual(self.messages, [])
        self.assertEqual(self.oracle.capacity_queries, [("AD-1", 2, 12), ("AD-2", 2, 12), ("AD-3", 2, 12)])

    def test_old_smaller_pending_request_is_not_replayed(self):
        self.monitor.state["pending"] = {"at": m.now(), "cpu": 1, "memory": 6, "ad": "AD-1", "token": "old-small-token"}
        self.monitor.cycle()
        self.assertEqual(self.oracle.launches, [])
        self.assertEqual(self.monitor.state["reason"], "unexpected_pending_configuration")
        self.assertEqual(self.monitor.state["pending"]["token"], "old-small-token")

    def test_smaller_managed_instance_is_not_reported_as_requested_success(self):
        self.oracle.instances = [vm(shape_config={"ocpus": 1, "memory_in_gbs": 6})]
        self.monitor.cycle()
        self.assertEqual(self.monitor.state["status"], "blocked")
        self.assertEqual(self.monitor.state["reason"], "unexpected_managed_instance")

    def test_sdk_launch_rejects_smaller_shape_before_calling_oracle(self):
        oracle = object.__new__(m.Oracle)
        with self.assertRaisesRegex(m.Halt, "unexpected_pending_configuration"):
            oracle.launch({"cpu": 1, "memory": 6})

    def test_network_timeout_persists_and_reuses_same_retry_token(self):
        self.oracle.available = {("AD-1", 2, 12)}
        self.oracle.failure = TimeoutError()
        with self.assertRaises(TimeoutError):
            self.monitor.cycle()
        saved = json.loads(self.monitor.path.read_text())
        token = saved["pending"]["token"]
        self.monitor = m.Monitor(self.cfg, self.oracle, lambda *args: self.messages.append(args))
        self.oracle.failure = None
        self.monitor.cycle()
        self.assertEqual(self.oracle.launches[-1]["token"], token)

    def test_recovery_finds_vm_after_ambiguous_response_and_never_relaunches(self):
        self.oracle.available = {("AD-1", 2, 12)}
        self.oracle.failure = TimeoutError()
        with self.assertRaises(TimeoutError):
            self.monitor.cycle()
        self.oracle.instances = [vm()]
        self.monitor.cycle()
        self.assertEqual(len(self.oracle.launches), 1)
        self.assertEqual(self.monitor.state["status"], "completed")
        self.monitor.cycle()
        self.assertEqual(len(self.messages), 1)

    def test_booting_instance_is_not_a_success_notification(self):
        self.oracle.instances = [vm(lifecycle_state="PROVISIONING")]
        self.monitor.cycle()
        self.assertEqual(self.messages, [])
        self.assertEqual(self.oracle.launches, [])

    def test_stopped_instance_counts_toward_free_allowance(self):
        self.oracle.instances = [vm(lifecycle_state="STOPPED", freeform_tags={})]
        self.monitor.cycle()
        self.assertEqual(self.monitor.state["reason"], "free_compute_limit")
        self.assertEqual(self.oracle.launches, [])

    def test_old_disks_count_toward_total_storage(self):
        self.oracle.volumes = [{"size_in_gbs": 151, "lifecycle_state": "AVAILABLE"}]
        self.monitor.cycle()
        self.assertEqual(self.monitor.state["reason"], "free_storage_limit")

    def test_non_a1_existing_instance_blocks_instead_of_assuming_free(self):
        self.oracle.instances = [vm(shape="VM.Standard.A2.Flex", freeform_tags={})]
        self.monitor.cycle()
        self.assertEqual(self.monitor.state["reason"], "unexpected_compute_usage")

    def test_multiple_owned_instances_halts(self):
        self.oracle.instances = [vm(), vm(id="vm-two")]
        self.monitor.cycle()
        self.assertEqual(self.monitor.state["reason"], "multiple_managed_instances")

    def test_expired_ambiguous_token_never_creates_new_request(self):
        self.monitor.state["pending"] = {"at": (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=21)).isoformat(), "cpu": 2, "memory": 12, "ad": "AD-1", "token": "old-token"}
        self.monitor.cycle()
        self.assertEqual(self.oracle.launches, [])
        self.assertEqual(self.monitor.state["reason"], "ambiguous_launch_requires_review")

    def test_missing_managed_vm_does_not_silently_replace_it(self):
        self.monitor.state["instance_id"] = "vm-disappeared"
        self.monitor.cycle()
        self.assertEqual(self.oracle.launches, [])
        self.assertEqual(self.monitor.state["reason"], "managed_instance_disappeared")

    def test_mail_failure_retries_notification_without_new_creation(self):
        self.oracle.instances = [vm()]
        self.monitor.notify = lambda *_: (_ for _ in ()).throw(ConnectionError())
        self.monitor.cycle()
        self.assertEqual(self.monitor.state["status"], "completed")
        self.assertFalse(self.monitor.state.get("notified", False))
        self.monitor.notify = lambda *args: self.messages.append(args)
        self.monitor.cycle()
        self.assertTrue(self.monitor.state["notified"])
        self.assertEqual(self.oracle.launches, [])

    def test_capacity_race_clears_definitively_failed_attempt(self):
        self.oracle.available = {("AD-1", 2, 12)}
        self.oracle.failure = m.CapacityUnavailable()
        self.monitor.cycle()
        self.assertNotIn("pending", self.monitor.state)
        self.assertEqual(self.monitor.state["status"], "waiting")
        self.assertEqual(self.messages, [])

    def test_backoff_is_bounded_and_slow(self):
        self.assertEqual([self.monitor.transient("test") for _ in range(7)], [300, 600, 1200, 2400, 3600, 3600, 3600])

    def test_sdk_serializes_real_capacity_and_launch_models(self):
        try:
            import oci
        except ImportError:
            self.skipTest("SDK check runs in the pinned runtime")
        shape = oci.core.models.CapacityReportInstanceShapeConfig(ocpus=2, memory_in_gbs=12)
        request = oci.core.models.CreateComputeCapacityReportDetails(compartment_id="root", availability_domain="AD-1", shape_availabilities=[oci.core.models.CreateCapacityReportShapeAvailabilityDetails(instance_shape=m.SHAPE, instance_shape_config=shape)])
        encoded = oci.util.to_dict(request)
        self.assertEqual(encoded["shape_availabilities"][0]["instance_shape_config"]["memory_in_gbs"], 12)

    def test_inventory_uses_real_sdk_call_signatures_for_every_compartment_and_ad(self):
        try:
            import oci
        except ImportError:
            self.skipTest("SDK check runs in the pinned runtime")
        oracle = object.__new__(m.Oracle)
        oracle.oci = oci
        oracle.cfg = {"tenancy": "root", "compartment": "target"}
        oracle.identity = create_autospec(oci.identity.IdentityClient, instance=True)
        oracle.compute = create_autospec(oci.core.ComputeClient, instance=True)
        oracle.block = create_autospec(oci.core.BlockstorageClient, instance=True)
        oracle.identity.list_compartments.return_value = SimpleNamespace(data=[oci.identity.models.Compartment(id="target", lifecycle_state="ACTIVE")])
        oracle.identity.list_availability_domains.return_value = SimpleNamespace(data=[oci.identity.models.AvailabilityDomain(name="AD-1"), oci.identity.models.AvailabilityDomain(name="AD-2")])
        for method in [oracle.compute.list_instances, oracle.block.list_volumes, oracle.block.list_boot_volumes]:
            method.return_value = SimpleNamespace(data=[])
        oracle.all = lambda method, *args, **kwargs: method(*args, **kwargs).data
        self.assertEqual(oracle.inventory(), ([], [], ["AD-1", "AD-2"]))
        self.assertEqual(oracle.compute.list_instances.call_count, 2)
        self.assertEqual(oracle.block.list_volumes.call_count, 2)
        self.assertEqual(oracle.block.list_boot_volumes.call_count, 4)
        oracle.block.list_boot_volumes.assert_any_call(availability_domain="AD-2", compartment_id="target")

    def test_launch_uses_fixed_shape_disk_tag_and_public_key_without_private_key(self):
        try:
            import oci
        except ImportError:
            self.skipTest("SDK check runs in the pinned runtime")
        public_key = Path(self.temp.name) / "ssh.pub"
        public_key.write_text("ssh-rsa test-public-key")
        oracle = object.__new__(m.Oracle)
        oracle.oci = oci
        oracle.cfg = {"compartment": "target", "image": "platform-image", "subnet": "public-subnet", "ssh_public_key": str(public_key), "monitor_id": "test-monitor"}
        captured = {}

        def launch(details, **options):
            captured.update(data=oci.util.to_dict(details), options=options)
            return SimpleNamespace(data=SimpleNamespace(id="vm-one"))

        oracle.compute = SimpleNamespace(launch_instance=launch)
        self.assertEqual(oracle.launch({"ad": "AD-1", "cpu": 2, "memory": 12, "token": "stable-token"}), "vm-one")
        self.assertEqual(captured["data"]["shape"], m.SHAPE)
        self.assertEqual(captured["data"]["source_details"]["boot_volume_size_in_gbs"], 50)
        self.assertEqual(captured["options"]["opc_retry_token"], "stable-token")
        self.assertEqual(captured["data"]["metadata"], {"ssh_authorized_keys": "ssh-rsa test-public-key"})
        self.assertTrue(captured["data"]["is_pv_encryption_in_transit_enabled"])


if __name__ == "__main__":
    unittest.main()
