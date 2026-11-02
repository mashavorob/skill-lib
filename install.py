#!/usr/bin/env python3
"""Copy the library to an OpenCode configuration directory (Python 3.9+)."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parent


def validate_destination(destination, parser):
    # Do not follow existing symlinks outside the selected config directory.
    if any(part.is_symlink() for part in (destination, *destination.parents)):
        parser.error(f"Symlink in destination path: {destination}")
    for parent in destination.parents:
        if parent.exists() and not parent.is_dir():
            parser.error(f"Not a directory: {parent}")
    if destination.exists() and not destination.is_file():
        parser.error(f"Not a regular file: {destination}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default = Path(os.environ.get("OPENCODE_CONFIG_DIR") or
                   Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "opencode")
    parser.add_argument("--target", type=Path, default=default,
                        help="OpenCode config directory (default: OPENCODE_CONFIG_DIR or XDG config)")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing")
    parser.add_argument("--force", action="store_true", help="Back up and replace conflicting files")
    args = parser.parse_args()
    target = args.target.expanduser().resolve()
    if target == ROOT or ROOT in target.parents or target in ROOT.parents:
        parser.error("Target must be separate from this library")

    changes = []
    conflicts = []
    backups = []
    unchanged = 0
    for directory in ("skills", "agents", "plugins"):
        for source in sorted((ROOT / directory).rglob("*")):
            if not source.is_file() or "__pycache__" in source.parts:
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
            saved = backup / destination.relative_to(target)
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(destination, saved)
        print(f"Backup: {backup}")
    for source, destination, data in changes:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        if source is not None:
            shutil.copymode(source, destination)
    print(f"Installed to {target}. Restart OpenCode to install plugin dependencies and load the library.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
