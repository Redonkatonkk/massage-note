"""Real PostgreSQL regression for legacy CHECK expression representations."""
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import unittest

import recovery as r
import restore


@unittest.skipUnless(os.environ.get("RECOVERY_DOCKER_TESTS") == "1", "requires local Docker")
class ConstraintRoundtripTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.name = "mn-recovery-constraint-" + secrets.token_hex(6)
        r.run(["docker", "run", "-d", "--pull=never", "--platform", "linux/amd64", "--name", cls.name,
               "--network", "none", "--label", "com.massagenote.recovery=constraint-test",
               "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_USER=constraint_test",
               "-e", "POSTGRES_DB=constraint_test", "postgres:17-alpine"])
        cls.addClassCleanup(lambda: r.run(["docker", "rm", "-fv", cls.name]))
        r.wait_database(cls.name, "constraint_test", "constraint_test")
        cls.session = r.SqlSession(cls.name)
        cls.addClassCleanup(cls.session.close)
        cls.session.query("CREATE TABLE check_values (commission_bps integer,effective_to date,effective_from date,unit varchar)")

    def expression(self, sql):
        return r.canonical_check(self.session, "public", "check_values", sql)

    def test_legacy_nested_and_and_array_cast_are_equivalent(self):
        self.assertEqual(self.expression("((commission_bps >= 0 AND commission_bps <= 10000) AND (effective_to IS NULL OR effective_to > effective_from))"),
                         self.expression("(commission_bps >= 0 AND commission_bps <= 10000 AND (effective_to IS NULL OR effective_to > effective_from))"))
        self.assertEqual(self.expression("unit::text = ANY ((ARRAY['DAY'::varchar,'MONTH'::varchar])::text[])"),
                         self.expression("unit::text = ANY (ARRAY[('DAY'::varchar)::text,('MONTH'::varchar)::text])"))

    def test_actual_boundary_or_allowed_value_change_is_detected(self):
        self.assertNotEqual(self.expression("commission_bps <= 10000"), self.expression("commission_bps <= 9999"))
        self.assertNotEqual(self.expression("unit = ANY (ARRAY['DAY','MONTH'])"), self.expression("unit = ANY (ARRAY['DAY'])"))

    def test_validation_state_is_preserved_in_baseline(self):
        self.session.query("ALTER TABLE check_values ADD CONSTRAINT valid_commission CHECK (commission_bps >= 0) NOT VALID")
        before = r.constraint_baseline(self.session)
        self.session.query("ALTER TABLE check_values VALIDATE CONSTRAINT valid_commission")
        after = r.constraint_baseline(self.session)
        self.assertFalse(before[0]["validated"])
        self.assertTrue(after[0]["validated"])
        self.assertNotEqual(before, after)


@unittest.skipUnless(os.environ.get("RECOVERY_DOCKER_TESTS") == "1", "requires local Docker")
class ProxyConfigurationTests(unittest.TestCase):
    def test_real_caddy_accepts_both_recovery_routes(self):
        with tempfile.TemporaryDirectory() as temporary:
            for public_info in [False, True]:
                config = Path(temporary) / ("public.Caddyfile" if public_info else "app.Caddyfile")
                config.write_text(restore.caddy_document("massagenote.waltonjin.com", public_info))
                result = subprocess.run(["docker", "run", "--rm", "--pull=never", "--platform", "linux/amd64", "--network", "none",
                       "--entrypoint", "caddy", "-v", str(config) + ":/etc/caddy/Caddyfile:ro", "mn-recovery/proxy:2",
                       "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"], capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr.decode())


if __name__ == "__main__":
    unittest.main()
