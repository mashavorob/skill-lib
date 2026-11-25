#!/usr/bin/env python3
"""Install the OpenCode 1.x harness into a project's .opencode directory (Python 3.9+)."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
from string import Template
import sys


ROOT = Path(__file__).resolve().parent
ASSET_DIRS = ("agents", "skills", "workflows", "plugins", "lib")
PROJECT_PROFILE = Template("""\
# Harness project profile

## Harness location

- Canonical project root: `$project`
- Harness location: `$harness`
- Project instructions: the canonical root's `AGENTS.md` and applicable nested guides.
- Working area: the entire canonical project, including new files and directories.
- Run project commands, Git operations and cleanup from the canonical root.
- Project paths below are relative to that root.

## Git

- Iteration branch: `agent/iterations/<unit-id>`
- Squash branch: `agent/squash/<unit-id>`
- Commit prefix: `agent:`

## Cleanup

- Disposable roots: `build`, `dist`, `out`, `target`, `log`, `var`, `tmp`, `artifacts`, `*/artifacts`
- Evidence roots: `artifacts/evidence`
- Log patterns: `*.log`, `*.log.*`, `*.stdout`, `*.stderr`
- Retain: none

## Compaction

- Use native automatic compaction and the `sprinter_phase` tool at phase boundaries.
- Keep the project ledger authoritative; session history holds the compaction receipt.

## Review

- Enabled profiles: correctness, general, architecture, latency-concurrency, simplification
- Disabled profiles: none

## Notes and exclusions

None.
""")


def validate_destination(destination, parser):
    # Do not follow existing symlinks outside the selected config directory.
    if any(part.is_symlink() for part in (destination, *destination.parents)):
        parser.error(f"Symlink in destination path: {destination}")
    for parent in destination.parents:
        if parent.exists() and not parent.is_dir():
            parser.error(f"Not a directory: {parent}")
    if destination.exists() and not destination.is_file():
        parser.error(f"Not a regular file: {destination}")


def relocate_profile(profile, project, target, force, parser):
    try:
        original = profile.read_bytes().decode("utf-8")
    except (OSError, UnicodeError) as error:
        parser.error(f"Cannot read {profile}: {error}")
    updated = original
    mismatches = []
    for label, expected in (("Canonical project root", project), ("Harness location", target)):
        pattern = re.compile(rf"^(- {label}:[ \t]+`)([^\r\n]+)(`[ \t]*\r?$)", re.MULTILINE)
        matches = list(pattern.finditer(updated))
        if len(matches) != 1:
            parser.error(f"Expected one '{label}' entry in {profile}; set it to `{expected}` and retry")
        match = matches[0]
        if match[2] != str(expected):
            mismatches.append(f"{label}: `{match[2]}` -> `{expected}`")
            updated = updated[:match.start(2)] + str(expected) + updated[match.end(2):]
    if not mismatches:
        return None
    details = "; ".join(mismatches)
    if not force:
        parser.error(f"Location mismatch in {profile}: {details}. Use --force to back up the profile and update its paths.")
    print(f"Profile location update: {details}")
    return updated.encode("utf-8")


def normalize_frontmatter(lines):
    # Match OpenCode's retry for unquoted top-level values containing colons.
    for line in lines:
        entry = re.fullmatch(r"([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)", line)
        if entry:
            value = entry[2].strip()
            if ":" in value and not value.startswith(('"', "'")):
                yield f"{entry[1]}: |-"
                yield f"  {value}"
                continue
        yield line


def agent_frontmatter(file, yaml, parser):
    try:
        lines = file.read_text(encoding="utf-8-sig").splitlines()
        if not lines or not lines[0].startswith("---") or lines[0].startswith("----"):
            return {}
        language = lines[0][3:].strip()
        if language not in ("", "yaml", "yml", "json"):
            parser.error(f"Unsupported agent frontmatter language in {file}: {language}")
        end = next((i for i, line in enumerate(lines[1:], 1) if line.startswith("---")), len(lines))
        frontmatter = lines[1:end]
        try:
            data = yaml.safe_load("\n".join(frontmatter))
        except yaml.YAMLError:
            if lines[0] != "---" or end == len(lines):
                raise
            data = yaml.safe_load("\n".join(normalize_frontmatter(frontmatter)))
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        parser.error(f"Cannot read agent ID in {file}: {error}")
    return data if isinstance(data, dict) else {}


def agent_id(file, directory, frontmatter):
    fallback = file.relative_to(directory).as_posix().removesuffix(".md")
    name = frontmatter.get("name", fallback)
    # Only a string can alias a shipped ID; leave other field validation to OpenCode.
    return name if isinstance(name, str) else None


def expand_config_variables(text, file):
    # OpenCode expands env tokens first, even when they form part of a file token.
    text = re.sub(r"\{env:([^}]+)\}", lambda match: os.environ.get(match[1], ""), text)

    def read_reference(match):
        line_start = text.rfind("\n", 0, match.start()) + 1
        if text[line_start:match.start()].lstrip().startswith("//"):
            return match[0]
        name = match[1]
        path = Path(name).expanduser() if name.startswith("~/") else Path(name)
        contents = (file.parent / path).read_bytes().decode("utf-8-sig").strip()
        # The runtime inserts JSON-escaped contents without the surrounding quotes.
        return json.dumps(contents, ensure_ascii=False)[1:-1]

    return re.sub(r"\{file:([^}]+)\}", read_reference, text)


def read_opencode_config(file, parser):
    # OpenCode accepts comments and trailing commas in both file extensions.
    # Tokenize strings first so comment markers and commas inside them stay intact.
    string = r'"(?:[^"\\]|\\.)*"'
    try:
        text = file.read_text(encoding="utf-8-sig")
        if not text:
            return {}
        text = expand_config_variables(text, file)
        text = re.sub(rf'{string}|//[^\r\n]*|/\*[\s\S]*?\*/',
                      lambda match: match[0] if match[0].startswith('"') else " ", text)
        text = re.sub(rf'{string}|,(?=\s*[}}\]])',
                      lambda match: match[0] if match[0].startswith('"') else "", text)
        config = json.loads(text)
    except (OSError, ValueError) as error:
        parser.error(f"Cannot read {file}: {error}")
    if not isinstance(config, dict):
        parser.error(f"Expected a JSON object in {file}")
    return config


def config_agent_fields(section, definition):
    if section == "agents":
        # OpenCode lowers its compatibility format to V1 before loading Markdown.
        fields = definition.keys() & {"description", "mode", "hidden", "color", "steps", "model"}
        fields.update(field for key, field in (("system", "prompt"), ("disabled", "disable")) if key in definition)
        if isinstance(definition.get("request"), dict) and "body" in definition["request"]:
            fields.add("options")
        return fields
    fields = definition.keys() - {"permission", "tools"}  # Check individual tool rules separately.
    if section == "mode":
        fields.add("mode")  # Legacy modes force the agent to primary.
    return fields


def agent_permissions(definition):
    rules = {}
    tools = definition.get("tools")
    if isinstance(tools, dict):
        for tool, enabled in tools.items():
            if isinstance(enabled, bool):
                name = "edit" if tool in ("write", "edit", "patch") else tool
                rules[name] = "allow" if enabled else "deny"
    permissions = definition.get("permission")
    if isinstance(permissions, str):
        rules["*"] = permissions
    elif isinstance(permissions, dict):
        rules.update(permissions)
    return rules


def permission_patterns(rule):
    return rule if isinstance(rule, dict) else {"*": rule}


def merge_permission_rule(previous, rule):
    # A scalar replaces the entire rule; two maps merge without moving existing keys.
    return {**previous, **rule} if isinstance(previous, dict) and isinstance(rule, dict) else rule


def check_agent_permissions(name, local, sources, shipped, parser):
    for tool in sorted(local.keys() & shipped.keys()):
        local_rules = permission_patterns(local[tool])
        effective = permission_patterns(merge_permission_rule(local[tool], shipped[tool]))
        for pattern, action in local_rules.items():
            matching = {"*", pattern}
            # Compare exact keys and the catch-all without inferring overlap between other globs.
            before = next(value for key, value in reversed(local_rules.items()) if key in matching)
            after = next((value for key, value in reversed(effective.items()) if key in matching), None)
            if before == action and after is not None and after != action:
                file = sources[tool, pattern]
                parser.error(f"Permission conflict in {file}: agent.{name}.permission.{tool} "
                             f"(pattern {pattern!r}) sets {action!r}, but the shipped profile sets "
                             f"{after!r}; remove or reconcile the local rule before installing")


def check_config_agents(target, shipped_fields, shipped_permissions, parser):
    local_permissions = {name: {} for name in shipped_fields}
    permission_sources = {name: {} for name in shipped_fields}
    disabled_agents = {}
    for directory in (target.parent, target):
        for filename in ("opencode.json", "opencode.jsonc"):
            file = directory / filename
            if not file.exists():
                continue
            config = read_opencode_config(file, parser)
            for section in ("agent", "agents", "mode"):
                definitions = config.get(section, {})
                if not isinstance(definitions, dict):
                    parser.error(f"Expected a {section} object in {file}")
                for name in sorted(shipped_fields.keys() & definitions.keys()):
                    if section == "agents" and name in config.get("agent", {}):
                        continue  # A V1 entry wins outright over the same ID in this file.
                    definition = definitions[name]
                    if not isinstance(definition, dict):
                        parser.error(f"Expected a {section}.{name} object in {file}")
                    fields = shipped_fields[name] & config_agent_fields(section, definition)
                    disabled_key = "disabled" if section == "agents" else "disable"
                    if definition.get(disabled_key) is True:
                        disabled_agents[name] = (file, f"{section}.{name}.{disabled_key}")
                    elif definition.get(disabled_key) is False:
                        disabled_agents.pop(name, None)
                    if fields:
                        parser.error(f"Agent ID {name!r} conflicts with {section}.{name} in {file} "
                                     f"(fields: {', '.join(sorted(fields))}); rename the local agent "
                                     "or remove the overlapping settings before installing")
                    if section == "agent":
                        for tool, rule in agent_permissions(definition).items():
                            rules = local_permissions[name]
                            rules[tool] = merge_permission_rule(rules.get(tool), rule)
                            for pattern in permission_patterns(rule):
                                permission_sources[name][tool, pattern] = file
    for name, (file, key) in disabled_agents.items():
        parser.error(f"Required agent {name!r} is disabled by {key} in {file}; enable it before installing")
    for name, local in local_permissions.items():
        check_agent_permissions(name, local, permission_sources[name], shipped_permissions[name], parser)


def check_agent_ids(target, yaml, parser):
    source_dir = ROOT / "agents"
    destination_dir = target / "agents"
    shipped = {}
    shipped_fields = {}
    shipped_permissions = {}
    for file in sorted(source_dir.rglob("*.md")):
        if not file.is_file():
            continue
        frontmatter = agent_frontmatter(file, yaml, parser)
        name = agent_id(file, source_dir, frontmatter)
        shipped[name] = destination_dir / file.relative_to(source_dir)
        shipped_fields[name] = set(frontmatter) | {"prompt"}
        shipped_permissions[name] = agent_permissions(frontmatter)
    installed_paths = set(shipped.values())
    if target.is_symlink():
        parser.error(f"Symlink in destination path: {target}")
    check_config_agents(target, shipped_fields, shipped_permissions, parser)
    for directory in (target / "agent", destination_dir, target / "mode", target / "modes"):
        if directory.is_symlink():
            parser.error(f"Symlink in agent discovery path: {directory}")
        if not directory.exists():
            continue
        if not directory.is_dir():
            parser.error(f"Not a directory: {directory}")

        def scan_error(error):
            parser.error(f"Cannot scan {directory}: {error}")

        for root, dirs, files in os.walk(directory, onerror=scan_error):
            if directory.name in ("mode", "modes"):
                dirs.clear()  # OpenCode only discovers top-level mode files.
            for name in sorted(dirs + [name for name in files if name.endswith(".md")]):
                file = Path(root) / name
                if file.is_symlink():
                    parser.error(f"Symlink in agent discovery path: {file}")
                if name in dirs or file in installed_paths:
                    continue
                validate_destination(file, parser)
                name = agent_id(file, directory, agent_frontmatter(file, yaml, parser))
                if name is not None and name in shipped:
                    parser.error(f"Agent ID {name!r} already provided by {file}; conflicts with {shipped[name]}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, required=True, help="Existing project root")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing")
    parser.add_argument("--force", action="store_true", help="Back up and replace conflicting files")
    args = parser.parse_args()
    project = args.target.expanduser().resolve()
    if not project.is_dir():
        parser.error(f"Not an existing project directory: {project}")
    if project == ROOT or ROOT in project.parents or project in ROOT.parents:
        parser.error("Target must be separate from this library")
    target = project / ".opencode"
    try:
        import yaml
    except ImportError:
        parser.error("PyYAML is required to check agent IDs. Install the dependencies in requirements.txt.")
    check_agent_ids(target, yaml, parser)

    changes = []
    conflicts = []
    backups = []
    unchanged = 0
    for directory in ASSET_DIRS:
        for source in sorted((ROOT / directory).rglob("*")):
            if not source.is_file() or {"__pycache__", "node_modules", ".DS_Store"}.intersection(source.parts):
                continue
            relative = source.relative_to(ROOT)
            destination = target / relative
            validate_destination(destination, parser)
            data = source.read_bytes()
            if destination.exists():
                if destination.read_bytes() == data:
                    unchanged += 1
                    continue
                conflicts.append(destination)
                backups.append(destination)
            changes.append((source, destination, data))

    profile = target / "PROJECT.md"
    validate_destination(profile, parser)
    if not profile.exists():
        data = PROJECT_PROFILE.substitute(project=project, harness=target).encode("utf-8")
        changes.append((None, profile, data))
    else:
        data = relocate_profile(profile, project, target, args.force, parser)
        if data is None:
            unchanged += 1
        else:
            changes.append((None, profile, data))
            backups.append(profile)

    # Merge only missing runtime dependencies; never replace the user's manifest.
    manifest = target / "package.json"
    validate_destination(manifest, parser)
    try:
        package: dict = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else {"private": True}
    except (ValueError, OSError) as error:
        parser.error(f"Cannot read {manifest}: {error}")
    if not isinstance(package, dict):
        parser.error(f"Expected a JSON object in {manifest}")
    dependencies = package.get("dependencies", {})
    if not isinstance(dependencies, dict):
        parser.error(f"Expected a dependencies object in {manifest}")
    required = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["dependencies"]
    missing = {name: version for name, version in required.items() if name not in dependencies}
    if missing:
        package["dependencies"] = {**dependencies, **missing}
        data = (json.dumps(package, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        changes.append((None, manifest, data))
        if manifest.exists():
            backups.append(manifest)
    else:
        unchanged += 1

    for _, destination, _ in changes:
        action = "REPLACE" if destination.exists() else "ADD"
        print(f"{action} {destination}")
    print(f"Files to install: {len(changes)}; unchanged: {unchanged}")
    if conflicts and not args.force:
        print("Conflicting files found. Use --force to back them up and replace them.", file=sys.stderr)
        return 1
    if args.dry_run:
        return 0

    backup = None
    if backups:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        backup = target / ".skill-lib-backups" / stamp
        for destination in backups:
            validate_destination(backup / destination.relative_to(target), parser)
        for destination in backups:
            saved = backup / destination.relative_to(target)
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(destination, saved)
        print(f"Backup: {backup}")
    for source, destination, data in changes:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        if source is not None:
            shutil.copymode(source, destination)
    print(f"Installed to {target}. Start or restart OpenCode from {project}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
