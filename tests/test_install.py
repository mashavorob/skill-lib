"""Installation integration checks using isolated destination directories."""

import json
import os
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
        self.project = Path(self.temporary.name).resolve() / "test project"
        self.project.mkdir()
        self.target = self.project / ".opencode"
        self.global_config = self.project.parent / "global config"
        self.global_config.mkdir()
        self.env = {**os.environ, "OPENCODE_CONFIG_DIR": str(self.global_config),
                    "XDG_CONFIG_HOME": str(self.global_config), "HOME": str(self.global_config)}

    def install(self, *arguments):
        return subprocess.run(
            [sys.executable, str(ROOT / "install.py"), "--target", str(self.project), *arguments],
            env=self.env, capture_output=True, text=True, check=False,
        )

    def assert_success(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_installs_only_project_assets_with_relative_imports(self):
        manifest = self.project / "package.json"
        manifest.write_text('{"name":"application"}\n')
        guide = self.project / "AGENTS.md"
        guide.write_text("Existing project instructions.\n")
        self.assert_success(self.install())
        expected = {
            path.relative_to(ROOT)
            for folder in ("skills", "agents", "plugins", "workflows", "lib")
            for path in (ROOT / folder).rglob("*")
            if path.is_file() and "__pycache__" not in path.parts
        }
        installed = {path.relative_to(self.target) for path in self.target.rglob("*") if path.is_file()}
        self.assertEqual(installed, expected | {Path("package.json"), Path("PROJECT.md")})
        self.assertFalse((self.target / "agent").exists())
        self.assertEqual(list(self.global_config.iterdir()), [])
        self.assertEqual(manifest.read_text(), '{"name":"application"}\n')
        self.assertEqual(guide.read_text(), "Existing project instructions.\n")
        self.assertIn(f"Canonical project root: `{self.project}`", (self.target / "PROJECT.md").read_text())
        for relative in expected:
            self.assertEqual((self.target / relative).read_bytes(), (ROOT / relative).read_bytes())
        for name in ("python-development", "python-memory"):
            skill = self.target / f"skills/{name}/SKILL.md"
            self.assertIn(f"name: {name}", skill.read_text())
        package = json.loads((self.target / "package.json").read_text())
        required = json.loads((ROOT / "package.json").read_text())["dependencies"]
        self.assertEqual(package["dependencies"], required)
        self.assertNotIn("scripts", package)
        self.assertTrue((self.target / "plugins/sprinter-phase.js").is_file())
        self.assertTrue((self.target / "lib/phase-compaction.mjs").is_file())

    def test_target_is_required(self):
        result = subprocess.run([sys.executable, str(ROOT / "install.py")],
                                env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--target", result.stderr)
        self.assertEqual(list(self.global_config.iterdir()), [])

    def test_relative_target_resolves_from_callers_directory(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "install.py"), "--target", self.project.name],
            cwd=self.temporary.name, capture_output=True, text=True, check=False,
        )
        self.assert_success(result)
        self.assertTrue((self.target / "agents/developer.md").is_file())
        self.assertTrue((self.target / "agents/sprinter.md").is_file())
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

    def test_conflicts_stop_before_writing_and_force_backs_up_without_resetting_profile(self):
        self.assert_success(self.install())
        profile = self.target / "PROJECT.md"
        profile.write_text("Local profile\n")
        custom = self.target / "agents/custom.md"
        custom.write_text("Local agent\n")
        coder = self.target / "agents/coder.md"
        coder.write_text("Local coder\n")
        plugin = self.target / "plugins/sprinter-phase.js"
        plugin.unlink()
        result = self.install()
        self.assertEqual(result.returncode, 1)
        self.assertFalse(plugin.exists(), "A conflict must prevent unrelated writes")
        self.assert_success(self.install("--force", "--dry-run"))
        self.assertFalse((self.target / ".skill-lib-backups").exists())
        self.assert_success(self.install("--force"))
        self.assertTrue(plugin.is_file())
        saved = list((self.target / ".skill-lib-backups").glob("*/agents/coder.md"))
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0].read_text(), "Local coder\n")
        self.assertEqual(coder.read_bytes(), (ROOT / "agents/coder.md").read_bytes())
        self.assertEqual(profile.read_text(), "Local profile\n")
        self.assertEqual(custom.read_text(), "Local agent\n")

    def test_singular_agent_collision_stops_even_with_force(self):
        existing = self.target / "agent/coder.md"
        existing.parent.mkdir(parents=True)
        existing.write_text("Existing agent\n")
        self.assertNotEqual(self.install("--force").returncode, 0)
        self.assertEqual(existing.read_text(), "Existing agent\n")
        self.assertFalse((self.target / "agents").exists())

    def test_symlinked_opencode_directory_is_not_followed(self):
        self.target.symlink_to(self.global_config, target_is_directory=True)
        self.assertNotEqual(self.install("--force").returncode, 0)
        self.assertEqual(list(self.global_config.iterdir()), [])

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
        (self.target / "agents/coder.md").write_text("local edit\n")
        self.assertEqual(self.install().returncode, 1)
        self.assertEqual(manifest.read_bytes(), before)
        self.assertFalse((self.target / ".skill-lib-backups").exists())


if __name__ == "__main__":
    unittest.main()
