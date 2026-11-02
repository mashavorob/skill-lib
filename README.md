# OpenCode Skill Library

A portable collection of skills and related components exported from `~/.config/opencode/`.
All library documentation, instructions and examples are written in English.

## Contents

| Path | Purpose |
| --- | --- |
| `skills/py-development-loop/` | Python development, review, QA, journaling and commit integration; includes references, the compaction controller and tests |
| `agents/py-developer.md` | Primary agent for a single Python task |
| `agents/py-sprinter.md` | Primary agent for a multi-phase Python task |
| `agents/py-{coder,reviewer,qa,sprint-planner}.md` | Python workflow subagents |
| `plugins/py-sprinter-compact.js` | Shared native compaction tool for `py-sprinter` and `cpp-sprinter` |
| `skills/cpp-development-loop/` | C++ guidelines, nine review profiles and references to the shared development/Git protocol |
| `agents/cpp-developer.md` | Primary agent for a single C++ task |
| `agents/cpp-sprinter.md` | Primary agent for a multi-phase C++ task |
| `agents/cpp-{coder,reviewer,qa,sprint-planner}.md` | C++ workflow subagents |

Both skills, all agents and the shared plugin are installed together because they reference one another.
Models are inherited from OpenCode settings. The global `opencode.jsonc`, provider
settings and `node_modules` are not part of the exported configuration.

### Naming conventions

Python skills and agents use `py-`; C++ skills and agents use `cpp-`. Language
guidelines are named `py-guidelines.md` and `cpp-guidelines.md`. Supporting files
inside namespaced skill directories retain descriptive names such as `workflow.md`.

The Git/journal protocol and native compaction controller are shared from
`skills/py-development-loop/` rather than duplicated. The C++ skill links to that
protocol and supplies its own agent mapping, toolchain rules and focus roster.
The existing `plugins/py-sprinter-compact.js` entry point keeps its filename for
installation compatibility and registers `sprinter_compact` once for both
`py-sprinter` and `cpp-sprinter`. No second C++ compaction plugin is needed.

The installer is shared library infrastructure: its name stays `install.py` even
though it is implemented in Python. Python and C++ agents coexist in one installation.

### C++ review profiles

The C++ workflow preserves the imported profiles: `correctness`, `duplication`,
`data-duplication`, `simplification`, `cpp20`, `reuse`, `architecture`,
`latency-concurrency` and `general`. Their canonical definitions and applicability
rules live in [cpp-guidelines.md](skills/cpp-development-loop/references/cpp-guidelines.md).
The imported source directory has been folded into these references.

Both languages use the same owned-worktree, durable-journal, 32-round protocol:
applicable focused reviews, an independent general review, QA, one squash commit
per task/phase and local cherry-pick. Models are inherited. C++20 is an optional
review profile subject to the project's actual toolchain, not a required standard.

### Agent permissions

All twelve agents use the same permissive tool policy: `"*": allow`,
`external_directory: allow`, and Bash allowed except explicit `sudo` command patterns.
File access has no path allowlist, so absolute paths, relative paths, home-directory
paths, external worktrees, dependency sources and custom config directories do not
need separate permission entries. Installed agents are copied without path rewriting.

The Bash deny rules follow the catch-all allow rule because OpenCode uses the last
matching rule. They cover `sudo`, `sudo <args>`, absolute/relative executable paths
such as `/usr/bin/sudo` and `./sudo`, and prefixed forms such as `env sudo <args>`.
Ordinary commands such as `/usr/bin/git`, `git -C ../repo ...`, `cmake`, `ctest`,
searches and diagnostic commands are allowed without command allowlists.

Role boundaries remain instructions: Reviewer and Planner do not modify code,
QA does not repair it, and orchestrators delegate implementation. The no-push,
history-preservation and review/QA gates also remain workflow requirements rather
than tool-level denies. Never invoke `sudo` indirectly through scripts, wrappers,
shells or other tools. Command patterns are not an OS-level privilege sandbox.
Project/global settings and host policies can impose additional restrictions.

## Install on another machine

Requirements: Python 3.9+ to run the installer, and OpenCode to use the library.
Separate Node.js/npm or Bun installations are not required for normal use.
The installation and compaction checks have been verified with OpenCode 1.19.5.

Clone this repository, open its directory and run:

```bash
python3 install.py --dry-run
python3 install.py
```

The installer copies both skills, all agents and the plugin, then adds missing runtime
dependencies to `<target>/package.json`. It preserves unrelated fields/dependencies
and any existing `@opencode-ai/plugin` version. Adding a dependency to an existing
manifest creates a backup automatically; no `--force` is needed for this additive merge.
An invalid manifest stops installation before any files are written.

On the next startup, OpenCode installs local plugin dependencies automatically using
its Bun runtime, as described in the [plugin documentation](https://opencode.ai/docs/plugins/#dependencies).
The first startup may need registry access unless the required packages are cached.
No manual `npm install` is needed, and the installer itself does not download packages.
The local plugin is auto-discovered from `plugins/`; do not also add it to the
`plugin` array in `opencode.json`/`opencode.jsonc`.

The repository pins `@opencode-ai/plugin@1.15.11` for development and uses it as the
initial manifest entry when missing. OpenCode may manage/update its own plugin SDK
version at startup; the installer does not downgrade an existing entry. The library's
`package-lock.json` is for repository checks and is not copied into your config directory.

The installer uses `OPENCODE_CONFIG_DIR` when set; otherwise it defaults to
`${XDG_CONFIG_HOME:-$HOME/.config}/opencode`. To use a different directory:

```bash
python3 install.py --target /path/to/opencode --dry-run
python3 install.py --target /path/to/opencode
OPENCODE_CONFIG_DIR=/path/to/opencode opencode
```

Configure OpenCode to use the same custom directory, for example with
`OPENCODE_CONFIG_DIR=/path/to/opencode`. Agent permissions are path-independent,
and the plugin's relative import remains valid.

Repeated installation skips identical files and an already-satisfied dependency
manifest without reformatting it. If existing library-owned files differ, installation
stops before writing anything. To preview and apply an update with backups:

```bash
python3 install.py --dry-run --force
python3 install.py --force
```

Previous versions of replaced library files and any updated `package.json` are saved under
`<target>/.skill-lib-backups/<UTC timestamp>/`, preserving their directory structure.
`--dry-run --force` previews replacements without writing files or creating backups.
Installation copies files, so the repository can be moved afterward.
Existing symlinks within destination file paths are rejected rather than followed.

**Fully quit and restart OpenCode after installation or updates.** Select
`py-developer`, `py-sprinter`, `cpp-developer` or `cpp-sprinter` with Tab.
For examples and task recovery, see the [Python usage guide](skills/py-development-loop/references/usage.md)
or [C++ usage guide](skills/cpp-development-loop/references/usage.md).

### Updating an earlier unprefixed installation

The installer adds the new prefixed components; it does not remove older components.
If you previously installed this library, back up and remove its old
`skills/development-loop/`, `agents/{developer,sprinter,coder,reviewer,qa,sprint-planner}.md`
and `plugins/sprinter-compact.js` from the destination configuration before restarting
OpenCode. Remove only files belonging to that earlier installation. In particular,
the old plugin and the new plugin must not both register `sprinter_compact`.
Remove any explicit config references to the old plugin as well. If the library
is already installed globally, avoid loading another copy of its plugin from a
project or additional config directory in the same OpenCode session.

## Checks

For library development only, install Python 3.9+ and Node.js 22+ with npm.
From the cloned library root (not the installed configuration directory):

```bash
npm ci
npm test
npm run test:smoke
```

Tests cover installation of both languages, absolute/relative destination paths, idempotence,
manifest merging/preservation, conflicts/backups and the shared compaction controller.
The repository's `node_modules/` is only a local development dependency tree and is
ignored by Git; it is separate from OpenCode's installed plugin dependencies.

Smoke tests also require `opencode` on `PATH`. They run the installer into clean,
isolated config directories, let OpenCode install/discover the plugin, and exercise
both `py-sprinter` and `cpp-sprinter` with a local mock LLM. They verify native
compaction and automatic continuation without calling an external model. Dependency
downloads may still require network access. Failed smoke runs retain their temporary
directory and print its path for diagnosis.

## Updating the library

Edit files in `skills/`, `agents/` and `plugins/`, run the checks and install again.
Add new skills as `skills/<skill-name>/SKILL.md` together with their resources;
the installer discovers them automatically. Save changes with a regular Git commit.
