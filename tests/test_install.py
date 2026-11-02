"""Installation integration checks using isolated destination directories."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class InstallationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="skill-lib-install-")
        self.addCleanup(self.temporary.cleanup)
        self.target = Path(self.temporary.name) / "custom config"

    def install(self, *arguments):
        return subprocess.run(
            [sys.executable, str(ROOT / "install.py"), "--target", str(self.target), *arguments],
            capture_output=True, text=True, check=False,
        )

    def assert_success(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_both_workflows_install_unchanged_with_relative_imports(self):
        self.assert_success(self.install())
        expected = {
            path.relative_to(ROOT)
            for folder in ("skills", "agents", "plugins")
            for path in (ROOT / folder).rglob("*")
            if path.is_file() and "__pycache__" not in path.parts
        }
        installed = {path.relative_to(self.target) for path in self.target.rglob("*") if path.is_file()}
        self.assertEqual(installed, expected | {Path("package.json")})
        for relative in expected:
            self.assertEqual((self.target / relative).read_bytes(), (ROOT / relative).read_bytes())
        for prefix in ("py", "cpp"):
            skill = self.target / f"skills/{prefix}-development-loop"
            self.assertIn(f"name: {prefix}-development-loop", (skill / "SKILL.md").read_text())
        package = json.loads((self.target / "package.json").read_text())
        required = json.loads((ROOT / "package.json").read_text())["dependencies"]
        self.assertEqual(package["dependencies"], required)
        self.assertNotIn("scripts", package)
        plugin = self.target / "plugins/py-sprinter-compact.js"
        self.assertTrue((plugin.parent / "../skills/py-development-loop/lib/sprinter-compaction.mjs").is_file())

    def test_relative_target_resolves_from_callers_directory(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "install.py"), "--target", "custom config"],
            cwd=self.temporary.name, capture_output=True, text=True, check=False,
        )
        self.assert_success(result)
        self.assertTrue((self.target / "agents/py-developer.md").is_file())
        self.assertTrue((self.target / "agents/cpp-developer.md").is_file())
        self.assertIn(str(self.target), result.stdout)

    def test_dry_run_creates_nothing(self):
        self.assert_success(self.install("--dry-run"))
        self.assertFalse(self.target.exists())

    def test_repeated_installation_is_a_noop(self):
        self.assert_success(self.install())
        result = self.install()
        self.assert_success(result)
        self.assertIn("Files to install: 0;", result.stdout)
        self.assertFalse((self.target / ".skill-lib-backups").exists())

    def test_conflicts_stop_before_writing_and_force_backs_up_both_languages(self):
        self.assert_success(self.install())
        for prefix in ("py", "cpp"):
            (self.target / f"agents/{prefix}-coder.md").write_text(f"local {prefix} edit\n")
        plugin = self.target / "plugins/py-sprinter-compact.js"
        plugin.unlink()
        result = self.install()
        self.assertEqual(result.returncode, 1)
        self.assertFalse(plugin.exists(), "A conflict must prevent unrelated writes")
        self.assert_success(self.install("--force", "--dry-run"))
        self.assertFalse((self.target / ".skill-lib-backups").exists())
        self.assert_success(self.install("--force"))
        self.assertTrue(plugin.is_file())
        for prefix in ("py", "cpp"):
            saved = list((self.target / ".skill-lib-backups").glob(f"*/agents/{prefix}-coder.md"))
            self.assertEqual(len(saved), 1)
            self.assertEqual(saved[0].read_text(), f"local {prefix} edit\n")
            installed = self.target / f"agents/{prefix}-coder.md"
            self.assertEqual(installed.read_bytes(), (ROOT / f"agents/{prefix}-coder.md").read_bytes())

    def test_missing_dependency_merges_with_backup_and_preserves_unrelated_fields(self):
        self.target.mkdir()
        manifest = self.target / "package.json"
        original = {"type": "module", "scripts": {"check": "custom-check"},
                    "dependencies": {"another-plugin": "^2.0.0"}, "custom": [1, 2]}
        original_bytes = json.dumps(original, indent=4).encode()
        manifest.write_bytes(original_bytes)
        self.assert_success(self.install("--dry-run"))
        self.assertEqual(manifest.read_bytes(), original_bytes)
        self.assertFalse((self.target / ".skill-lib-backups").exists())
        self.assert_success(self.install())
        merged = json.loads(manifest.read_text())
        self.assertIn("@opencode-ai/plugin", merged["dependencies"])
        del merged["dependencies"]["@opencode-ai/plugin"]
        self.assertEqual(merged, original)
        saved = list((self.target / ".skill-lib-backups").glob("*/package.json"))
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0].read_bytes(), original_bytes)

    def test_existing_plugin_version_and_manifest_formatting_remain_unchanged(self):
        self.target.mkdir()
        manifest = self.target / "package.json"
        original = b'{ "dependencies": { "@opencode-ai/plugin": "9.8.7" }, "private": true }\n'
        manifest.write_bytes(original)
        self.assert_success(self.install("--force"))
        self.assertEqual(manifest.read_bytes(), original)
        self.assertFalse((self.target / ".skill-lib-backups").exists())

    def test_malformed_manifest_stops_before_copying_even_with_force(self):
        self.target.mkdir()
        manifest = self.target / "package.json"
        for invalid in ("{broken", "[]", '{"dependencies": []}'):
            with self.subTest(invalid=invalid):
                manifest.write_text(invalid)
                result = self.install("--force")
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(manifest.read_text(), invalid)
                self.assertFalse((self.target / "agents").exists())

    def test_file_conflict_prevents_dependency_merge(self):
        self.assert_success(self.install())
        manifest = self.target / "package.json"
        manifest.write_text('{"dependencies": {"another-plugin": "1.0.0"}}\n')
        before = manifest.read_bytes()
        (self.target / "agents/py-coder.md").write_text("local edit\n")
        self.assertEqual(self.install().returncode, 1)
        self.assertEqual(manifest.read_bytes(), before)
        self.assertFalse((self.target / ".skill-lib-backups").exists())


if __name__ == "__main__":
    unittest.main()
