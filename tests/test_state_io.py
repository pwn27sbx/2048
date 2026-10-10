"""Tests for the bounded, symlink-safe state helper (helpers/state_io.py).

The helper is exercised as a subprocess (`python3 -I`) pointed at a temporary
XDG_STATE_HOME / HOME, so the real user state file is never touched.
"""

import os
import stat
import subprocess
import sys
import tempfile
import unittest

HELPER = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "helpers",
    "state_io.py",
)

MAX_BYTES = 65536


class StateIOTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.xdg = os.path.join(self.tmp.name, "xdg")
        self.home = os.path.join(self.tmp.name, "home")
        os.makedirs(self.home)
        self.state_dir = os.path.join(self.xdg, "pwnsxb-2048")
        self.state_file = os.path.join(self.state_dir, "state.json")

    def env(self, **over):
        env = dict(os.environ)
        env["XDG_STATE_HOME"] = self.xdg
        env["HOME"] = self.home
        env.update(over)
        return env

    def run_helper(self, *args, stdin=None, env=None, timeout=15):
        return subprocess.run(
            [sys.executable, "-I", HELPER, *args],
            input=stdin,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env if env is not None else self.env(),
            timeout=timeout,
        )

    def make_state(self, data):
        os.makedirs(self.state_dir, exist_ok=True)
        with open(self.state_file, "wb") as handle:
            handle.write(data)

    # ---- read ----------------------------------------------------------

    def test_missing_dir_returns_empty(self):
        result = self.run_helper("read")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, b"")

    def test_missing_file_returns_empty(self):
        os.makedirs(self.state_dir)
        result = self.run_helper("read")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, b"")

    def test_normal_read(self):
        payload = b'{"score": 12}'
        self.make_state(payload)
        result = self.run_helper("read")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, payload)

    def test_max_bytes_ok(self):
        payload = b"a" * MAX_BYTES
        self.make_state(payload)
        result = self.run_helper("read")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, payload)

    def test_over_max_rejected(self):
        self.make_state(b"a" * (MAX_BYTES + 1))
        result = self.run_helper("read")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")

    def test_symlinked_file_rejected(self):
        os.makedirs(self.state_dir)
        target = os.path.join(self.tmp.name, "target.json")
        with open(target, "wb") as handle:
            handle.write(b'{"x": 1}')
        os.symlink(target, self.state_file)
        result = self.run_helper("read")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")

    def test_symlinked_dir_rejected(self):
        real_dir = os.path.join(self.tmp.name, "real-dir")
        os.makedirs(real_dir)
        os.makedirs(self.xdg, exist_ok=True)
        os.symlink(real_dir, self.state_dir)
        result = self.run_helper("read")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")

    def test_fifo_rejected_without_hanging(self):
        os.makedirs(self.state_dir)
        os.mkfifo(self.state_file)
        result = self.run_helper("read", timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")

    def test_non_utf8_rejected(self):
        self.make_state(b"\xff\xfe\x00")
        result = self.run_helper("read")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")

    def test_relative_xdg_falls_back_to_home(self):
        home_state_dir = os.path.join(self.home, ".local", "state", "pwnsxb-2048")
        os.makedirs(home_state_dir)
        payload = b'{"fallback": true}'
        with open(os.path.join(home_state_dir, "state.json"), "wb") as handle:
            handle.write(payload)
        result = self.run_helper("read", env=self.env(XDG_STATE_HOME="relative/state"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, payload)

    # ---- write ---------------------------------------------------------

    def test_write_creates_dir_0700_and_file_0600(self):
        payload = b'{"score": 1}'
        result = self.run_helper("write", stdin=payload)
        self.assertEqual(result.returncode, 0, result.stderr)
        dir_stat = os.stat(self.state_dir)
        self.assertTrue(stat.S_ISDIR(dir_stat.st_mode))
        self.assertEqual(stat.S_IMODE(dir_stat.st_mode), 0o700)
        file_stat = os.stat(self.state_file)
        self.assertEqual(stat.S_IMODE(file_stat.st_mode), 0o600)
        with open(self.state_file, "rb") as handle:
            self.assertEqual(handle.read(), payload)

    def test_write_over_symlink_replaces_link_without_touching_target(self):
        os.makedirs(self.state_dir)
        target = os.path.join(self.tmp.name, "target.json")
        with open(target, "wb") as handle:
            handle.write(b"ORIGINAL")
        os.symlink(target, self.state_file)
        payload = b'{"new": 1}'
        result = self.run_helper("write", stdin=payload)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(os.path.islink(self.state_file))
        with open(target, "rb") as handle:
            self.assertEqual(handle.read(), b"ORIGINAL")
        with open(self.state_file, "rb") as handle:
            self.assertEqual(handle.read(), payload)

    def test_write_oversize_rejected_nothing_written(self):
        os.makedirs(self.xdg, exist_ok=True)
        result = self.run_helper("write", stdin=b"a" * (MAX_BYTES + 1))
        self.assertEqual(result.returncode, 1)
        self.assertFalse(os.path.exists(self.state_file))

    def test_write_invalid_json_rejected_nothing_written(self):
        os.makedirs(self.xdg, exist_ok=True)
        result = self.run_helper("write", stdin=b"not json")
        self.assertEqual(result.returncode, 1)
        self.assertFalse(os.path.exists(self.state_file))

    def test_write_leaves_no_temp_file(self):
        result = self.run_helper("write", stdin=b'{"a": 1}')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(os.listdir(self.state_dir), ["state.json"])


if __name__ == "__main__":
    unittest.main()
