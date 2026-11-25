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
        custom_profile = profile.read_bytes().replace(b"- Commit prefix: `agent:`", b"- Commit prefix: `local:`")
        profile.write_bytes(custom_profile)
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
        self.assertEqual(profile.read_bytes(), custom_profile)
        self.assertEqual(custom.read_text(), "Local agent\n")

    def test_reinstall_after_move_updates_only_profile_locations_with_force(self):
        self.assert_success(self.install())
        old_project, old_target = self.project, self.target
        profile = old_target / "PROJECT.md"
        original = (profile.read_text().replace("`agent:`", "`local:`")
                    + f"\nLocal note mentioning {old_project}.\n").replace("\n", "\r\n").encode()
        profile.write_bytes(original)
        self.project = old_project.with_name("relocated project")
        old_project.rename(self.project)
        self.target = self.project / ".opencode"
        profile = self.target / "PROJECT.md"
        missing_asset = self.target / "agents/coder.md"
        missing_asset.unlink()

        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Location mismatch", result.stderr)
        self.assertIn(str(old_project), result.stderr)
        self.assertIn(str(self.project), result.stderr)
        self.assert_success(self.install("--force", "--dry-run"))
        self.assertEqual(profile.read_bytes(), original)
        self.assertFalse(missing_asset.exists())
        self.assertFalse((self.target / ".skill-lib-backups").exists())

        self.assert_success(self.install("--force"))
        expected = original.replace(f"Canonical project root: `{old_project}`".encode(),
                                    f"Canonical project root: `{self.project}`".encode())
        expected = expected.replace(f"Harness location: `{old_target}`".encode(),
                                    f"Harness location: `{self.target}`".encode())
        self.assertEqual(profile.read_bytes(), expected)
        self.assertTrue(missing_asset.is_file())
        saved = list((self.target / ".skill-lib-backups").glob("*/PROJECT.md"))
        self.assertEqual([backup.read_bytes() for backup in saved], [original])
        self.assertIn("Files to install: 0;", self.install().stdout)

    def test_singular_agent_collision_stops_even_with_force(self):
        existing = self.target / "agent/coder.md"
        existing.parent.mkdir(parents=True)
        existing.write_text("Existing agent\n")
        self.assertNotEqual(self.install("--force").returncode, 0)
        self.assertEqual(existing.read_text(), "Existing agent\n")
        self.assertFalse((self.target / "agents").exists())

    def test_frontmatter_agent_collision_in_either_layout_stops_before_writing(self):
        for layout in ("agent", "agents"):
            with self.subTest(layout=layout):
                local = self.target / layout / "nested" / "local-reviewer.md"
                local.parent.mkdir(parents=True)
                original = b'---\n"name": "code-reviewer" # explicit ID\nmode: subagent\n---\nLocal prompt.\n'
                local.write_bytes(original)
                result = self.install("--force")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(str(local), result.stderr)
                self.assertIn("Agent ID 'code-reviewer'", result.stderr)
                self.assertEqual(local.read_bytes(), original)
                self.assertFalse((self.target / "agents/code-reviewer.md").exists())
                self.assertFalse((self.target / "PROJECT.md").exists())
                local.unlink()

    def test_top_level_mode_agent_collisions_are_detected(self):
        for layout, name, frontmatter in (("mode", "coder.md", ""),
                                          ("modes", "local.md", "---\nname: coder\n---\n")):
            with self.subTest(layout=layout):
                local = self.target / layout / name
                local.parent.mkdir(parents=True)
                local.write_text(frontmatter + "Local prompt.\n")
                result = self.install("--force")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"Agent ID 'coder' already provided by {local}", result.stderr)
                self.assertFalse((self.target / "agents").exists())
                local.unlink()

    def test_nested_mode_file_is_not_discovered(self):
        local = self.target / "modes/nested/coder.md"
        local.parent.mkdir(parents=True)
        local.write_text("---\nname: coder\n---\nLocal prompt.\n")
        self.assert_success(self.install())

    def test_project_config_conflicts_stop_before_writes(self):
        self.target.mkdir()
        for parent in (self.project, self.target):
            for filename in ("opencode.json", "opencode.jsonc"):
                with self.subTest(parent=parent, filename=filename):
                    file = parent / filename
                    original = (b'{"agent":{"coder":{"model":"local/coder"}}}' if filename.endswith(".json")
                                else b'{/* local */ "agent": {"coder": {"prompt": "http://local/*x*/,}",},},}')
                    file.write_bytes(original)
                    result = self.install("--force")
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(f"agent.coder in {file}", result.stderr)
                    self.assertFalse((self.target / "agents").exists())
                    self.assertFalse((self.target / "PROJECT.md").exists())
                    self.assertEqual(file.read_bytes(), original)
                    file.unlink()

    def test_project_config_can_set_fields_not_shipped_by_the_harness(self):
        file = self.project / "opencode.jsonc"
        original = b'{"agent": { // keep the selected variant\n "coder": {"variant": "high"},},}'
        file.write_bytes(original)
        self.assert_success(self.install())
        self.assertTrue((self.target / "agents/coder.md").exists())
        self.assertEqual(file.read_bytes(), original)

    def test_project_config_expands_environment_before_parsing_jsonc(self):
        file = self.project / "opencode.jsonc"
        original = '{/* project */ "compaction": {"auto": {env:OPENCODE_AUTO_COMPACT},},}'
        file.write_text(original)
        self.env["OPENCODE_AUTO_COMPACT"] = "true"
        self.assert_success(self.install("--dry-run"))
        self.assertFalse(self.target.exists())
        self.assert_success(self.install())
        self.assertEqual(file.read_text(), original)

    def test_environment_substitution_does_not_hide_agent_conflicts(self):
        file = self.project / "opencode.json"
        file.write_text('{"agent":{"{env:LOCAL_AGENT_ID}":{"disable":{env:LOCAL_AGENT_DISABLED}}}}')
        self.env.update(LOCAL_AGENT_ID="coder", LOCAL_AGENT_DISABLED="true")
        result = self.install("--dry-run", "--force")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Required agent 'coder' is disabled", result.stderr)
        self.assertFalse(self.target.exists())

    def test_file_substitution_does_not_hide_disabled_agent(self):
        self.target.mkdir()
        file = self.target / "opencode.jsonc"
        (self.target / "agent-id.txt").write_text("  coder\n")
        self.env["LOCAL_AGENT_ID_FILE"] = "agent-id.txt"
        original = ('{\n // example: {file:missing.txt}\n'
                    ' "agent":{"{file:{env:LOCAL_AGENT_ID_FILE}}":{"disable":true}}\n}')
        file.write_text(original)
        result = self.install("--dry-run", "--force")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Required agent 'coder' is disabled", result.stderr)
        self.assertFalse((self.target / "agents").exists())
        self.assertEqual(file.read_text(), original)

    def test_file_substitution_escapes_contents_inside_jsonc_strings(self):
        (self.project / "value.txt").write_text('  a "quote" and a \\ backslash\nnext line\n')
        (self.project / "opencode.jsonc").write_text('{"username":"{file:value.txt}"}')
        self.assert_success(self.install("--dry-run"))
        self.assertFalse(self.target.exists())

    def test_local_agent_permissions_allow_install_and_update(self):
        file = self.project / "opencode.json"
        original = json.dumps({"agent": {
            "coder": {"permission": {"bash": "deny"}},
            "qa-run": {"tools": {"bash": False}},
        }})
        file.write_text(original)
        self.assert_success(self.install())
        self.assert_success(self.install())
        agent = self.target / "agents" / "coder.md"
        shipped = agent.read_bytes()
        agent.write_bytes(shipped + b"\nLocal edit\n")
        self.assert_success(self.install("--force"))
        self.assertEqual(agent.read_bytes(), shipped)
        self.assertEqual(file.read_text(), original)

    def test_conflicting_local_agent_permissions_stop_before_writes(self):
        file = self.project / "opencode.jsonc"
        for name, definition, tool, local, shipped in (
            ("sprinter", {"permission": {"sprinter_phase": "deny"}}, "sprinter_phase", "deny", "allow"),
            ("coder", {"permission": {"edit": {"docs/*": "deny"}}}, "edit", "deny", "allow"),
            ("coder", {"permission": {"edit": {"*": "allow", "../*": "allow"}}}, "edit", "allow", "ask"),
            ("code-reviewer", {"tools": {"write": True}}, "edit", "allow", "deny"),
        ):
            with self.subTest(name=name):
                original = json.dumps({"agent": {name: definition}})
                file.write_text(original)
                result = self.install("--dry-run", "--force")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"Permission conflict in {file}: agent.{name}.permission.{tool}", result.stderr)
                self.assertIn(f"sets {local!r}, but the shipped profile sets {shipped!r}", result.stderr)
                self.assertFalse(self.target.exists())
                self.assertEqual(file.read_text(), original)
                self.assertNotEqual(self.install("--force").returncode, 0)
                self.assertFalse(self.target.exists())

    def test_identical_permissions_and_explicit_override_of_legacy_toggle_are_allowed(self):
        file = self.project / "opencode.jsonc"
        file.write_text(json.dumps({"agent": {
            "sprinter": {"tools": {"sprinter_phase": False}, "permission": {"sprinter_phase": "allow"}},
            "coder": {"permission": {"edit": {"*": "allow", "../*": "ask"}}},
        }}))
        self.assert_success(self.install())

    def test_permission_conflicts_use_the_last_project_config_value(self):
        self.target.mkdir()
        (self.project / "opencode.json").write_text(json.dumps({
            "agent": {"sprinter": {"permission": {"sprinter_phase": "deny"}}},
        }))
        file = self.target / "opencode.jsonc"
        file.write_text(json.dumps({"agent": {"sprinter": {"permission": {"sprinter_phase": "allow"}}}}))
        self.assert_success(self.install("--dry-run"))
        file.write_text(json.dumps({"agent": {"sprinter": {"permission": {"sprinter_phase": "ask"}}}}))
        result = self.install("--dry-run")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"Permission conflict in {file}", result.stderr)
        self.assertIn("sets 'ask', but the shipped profile sets 'allow'", result.stderr)

    def test_local_rule_after_an_existing_catch_all_keeps_its_precedence(self):
        (self.project / "opencode.jsonc").write_text(json.dumps({
            "agent": {"coder": {"permission": {"edit": {"*": "allow", "docs/*": "deny"}}}},
        }))
        self.assert_success(self.install("--dry-run"))

    def test_compatibility_agent_conflicts_are_detected_after_lowering(self):
        file = self.project / "opencode.json"
        for definition, field in (({"model": "local/coder#high"}, "model"), ({"system": "Local prompt"}, "prompt")):
            with self.subTest(field=field):
                file.write_text(json.dumps({"agents": {"coder": definition}}))
                result = self.install("--force")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"agents.coder in {file} (fields: {field})", result.stderr)
                self.assertFalse(self.target.exists())

    def test_disabled_shipped_agents_are_rejected_even_with_force(self):
        file = self.project / "opencode.json"
        for section, key in (("agent", "disable"), ("agents", "disabled")):
            with self.subTest(section=section):
                file.write_text(json.dumps({section: {"coder": {key: True}}}))
                result = self.install("--force")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"Required agent 'coder' is disabled by {section}.coder.{key}", result.stderr)
                self.assertFalse(self.target.exists())

    def test_disable_uses_the_last_explicit_project_config_value(self):
        self.target.mkdir()
        (self.project / "opencode.json").write_text('{"agents":{"coder":{"disabled":true}}}')
        file = self.target / "opencode.jsonc"
        file.write_text('{"agent":{"coder":{"variant":"high"}}}')
        result = self.install("--dry-run")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"agents.coder.disabled in {self.project / 'opencode.json'}", result.stderr)

        file.write_text('{"agent":{"coder":{"disable":false}}}')
        self.assert_success(self.install("--dry-run"))

        file.write_text('{"agent":{"coder":{"disable":true}}}')
        result = self.install("--force")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"agent.coder.disable in {file}", result.stderr)
        self.assertFalse((self.target / "agents").exists())

    def test_v1_agent_takes_precedence_over_compatibility_entry_in_same_file(self):
        (self.project / "opencode.json").write_text(json.dumps({
            "agent": {"coder": {"variant": "high", "disable": False}},
            "agents": {"coder": {"model": "local/coder", "disabled": True}},
        }))
        self.assert_success(self.install())

    def test_empty_project_configs_are_ignored_but_invalid_json_is_rejected(self):
        self.target.mkdir()
        files = [self.project / "opencode.json", self.target / "opencode.jsonc"]
        for file in files:
            file.touch()
        self.assert_success(self.install("--dry-run"))
        files[1].write_text("{broken")
        result = self.install("--force")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"Cannot read {files[1]}", result.stderr)
        self.assertFalse((self.target / "agents").exists())

    def test_legacy_project_mode_cannot_turn_a_worker_into_a_primary_agent(self):
        (self.project / "opencode.json").write_text('{"mode":{"coder":{"variant":"high"}}}')
        result = self.install("--dry-run")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mode.coder", result.stderr)
        self.assertFalse(self.target.exists())

    def test_explicit_nonconflicting_id_overrides_the_filename(self):
        local = self.target / "agent/code-reviewer.md"
        local.parent.mkdir(parents=True)
        local.write_text("---\nname: local-reviewer\n---\nLocal prompt.\n")
        self.assert_success(self.install())
        self.assertTrue((self.target / "agents/code-reviewer.md").is_file())
        self.assertIn("Local prompt.", local.read_text())

    def test_frontmatter_retry_accepts_an_unquoted_colon_and_checks_the_id(self):
        local = self.target / "agent/local-reviewer.md"
        local.parent.mkdir(parents=True)
        original = "---\nname: local-reviewer\ndescription: CLI: helpers\n---\nLocal prompt.\n"
        local.write_text(original)
        self.assert_success(self.install("--dry-run"))
        self.assertEqual(local.read_text(), original)
        self.assertFalse((self.target / "agents").exists())

        local.write_text(original.replace("name: local-reviewer", "name: code-reviewer"))
        result = self.install("--force")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"Agent ID 'code-reviewer' already provided by {local}", result.stderr)
        self.assertFalse((self.target / "agents").exists())

    def test_yml_frontmatter_language_is_accepted(self):
        local = self.target / "agent/local-reviewer.md"
        local.parent.mkdir(parents=True)
        original = "---yml\nname: local-reviewer\nmode: subagent\n---\nLocal prompt.\n"
        local.write_text(original)
        self.assert_success(self.install("--dry-run"))
        self.assertEqual(local.read_text(), original)
        self.assertFalse((self.target / "agents").exists())

        local.write_text(original.replace("name: local-reviewer", "name: code-reviewer"))
        result = self.install("--force")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"Agent ID 'code-reviewer' already provided by {local}", result.stderr)
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
