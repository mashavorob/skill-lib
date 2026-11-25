# OpenCode Skill Library

A project-local port of the `l3.ai` development harness for OpenCode **1.x**,
verified with **1.19.6**. It includes shared agents for Python, C++ and mixed
projects, plus two on-demand Python skills.

## Install

Requires Python 3.9+, PyYAML and OpenCode. From this repository, install the
Python dependency in your environment, then run the installer:

```sh
python3 -m pip install -r requirements.txt
python3 install.py --target ~/src/myproject --dry-run
python3 install.py --target ~/src/myproject
```

`--target` is required and points to an existing project root, not to its
`.opencode/` directory. Installation writes only inside `<project>/.opencode/`:

| Path | Contents |
| --- | --- |
| `agents/` | Developer, Sprinter and seven subagents |
| `skills/` | `python-development` and `python-memory` |
| `workflows/` | Planning, review, verification, Git delivery, cleanup and recovery instructions |
| `plugins/`, `lib/` | OpenCode 1.x phase compaction, shell status and worker identity reporting |
| `PROJECT.md` | Canonical root, Git conventions, cleanup defaults and optional project notes |
| `package.json` | Local plugin dependency, merged with any existing `.opencode/package.json` |

OpenCode 1.19.6 discovers both `.opencode/agent/` and `.opencode/agents/`.
The installer uses **`agents/`** and checks both directories and top-level
`mode/` and `modes/` files for conflicting IDs, including names declared in
Markdown frontmatter. It also checks `opencode.json` and `opencode.jsonc` in the
project root and `.opencode/`. Non-overlapping settings such as `variant` and
per-agent `permission.bash` are allowed. The installer rejects explicit conflicts
with shipped permission values after merging project files in load order and
converting legacy `tools` toggles. It checks matching patterns and later catch-all
rules within each tool; for other wildcard interactions, inspect the effective
rules with `opencode debug agent <name>`. Permission conflicts, overrides of
shipped fields (such as `model` or `prompt`), disabling a required agent, or
reusing a harness ID in a legacy `mode` entry stop installation even with `--force`.
The project's `AGENTS.md`
remains the source of build, verification and QA instructions. The installer does
not touch user-level config, the project's `opencode.json(c)`, or its root
`package.json`.

**Fully quit and restart OpenCode from the target project root**, then select
`developer` for one approved task or `sprinter` for a phase-based plan. OpenCode
discovers the local plugins and installs their dependencies on startup; it may
need registry access on first use. For diagnostics:

```sh
opencode debug agent developer
opencode debug agent sprinter
opencode debug skill
```

### Model aliases

The agents use these aliases from your OpenCode configuration. For Sprinter,
configure reasoning on the `opencode/worker` alias itself: in OpenCode 1.19.6
the phase compaction API does not carry a selected variant into the automatic
continuation, which uses the alias defaults.

| Agents | Model alias |
| --- | --- |
| `developer`, `sprinter`, `plan-reviewer`, `qa-run`, `git-delivery` | `opencode/worker` |
| `code-reviewer` | `opencode/reviewer` |
| `code-reviewer-final` | `openai/reviewer` |
| `coder` | `openai/coder` |
| `sprint-planner` | `openai/planner` |

Plan and Build keep their prompts and permissions. Developer and Sprinter use
their workflow instructions to choose workers and follow OpenCode's native
delegation permissions. The phase checkpoint tool is specific to Sprinter.
Harness roles inherit Bash permissions from OpenCode and your configuration.
The harness does not add shell command restrictions or exceptions for cleanup.
Check the effective rules with `opencode debug agent <name>`.

### Updating

An identical installation is a no-op. Differing shipped files stop installation
before any writes. To preview and apply replacements:

```sh
python3 install.py --target ~/src/myproject --dry-run --force
python3 install.py --target ~/src/myproject --force
```

Replacements are backed up under `.opencode/.skill-lib-backups/`. If a project
has moved, the installer reports mismatched locations in `PROJECT.md` and stops.
Use `--force` to back up the profile and update only its two location entries.
Other profile settings, unrelated files and existing plugin dependency versions
are kept.
The installer never prunes old components. If this target project contains a
previous `py-*`/`cpp-*` installation, remove only its obsolete files and plugin
after confirming ownership. Restart OpenCode after updating.

If you installed an earlier development snapshot of this port, remove its shipped
`agents/plan.md`, `agents/build.md` and `plugins/worker-identity.js` from the
project's `.opencode/`. The runtime plugin replaces those files.

## Workflow

Developer starts with development correctness and independent final general
review, adding enabled specialist focuses when the change warrants them. Sprinter
runs the enabled focuses from `PROJECT.md` in each code-review tier (all five by
default) and uses a bounded phase-brief review
before coding: at most two review rounds and three brief versions. Both share a
32-attempt coding budget per task or phase, run project-defined checks, and hand
accepted changes to `git-delivery` for local delivery. That workflow uses Git,
needs a JSON validator (`jq` is recommended) and the GNU coreutils tools
`sha256sum` and `realpath`; macOS without coreutils is not a supported delivery
host.
An accepted task or phase whose final tree matches its base closes as
`NO_CHANGES`, with the original branch checked out and no delivery commit.

Prefer putting verification logs in `tmp/<unit>/<attempt>/`. Before transferring
the commit, [account for all cleanup targets](workflows/artifact-cleanup.md),
including logs written at the project root, and honor configured permissions.

The [shared rules](workflows/agent-rules.md) select Python skills by the affected
component and memory risks. C++ guidance lives in those rules and the shared
review profiles. Role instructions and native permissions guide the workflow.
Use OS-level isolation when you need to restrict access to files or processes.

Sprinter uses the [native phase checkpoint](workflows/sprinter-compaction.md).
OpenCode automatically continues after compaction; Sprinter checks the native
receipt before work. The phase ledger remains authoritative. The 1.x gate is a
workflow rule, not a hard block on other tools. The runtime plugin adds the
native exit code to Bash results and the child agent's model and variant to `task`
results.

## Checks

```sh
npm test
npm run test:smoke
```

The focused checks cover project-local installation, conflicts, and checkpoint
recovery. The smoke check requires OpenCode, Git and Node 22+. It starts OpenCode
in a disposable project with an isolated HOME and a local scripted model, and
checks discovery, preservation of built-in configuration, native compaction,
visible Bash status and worker identity. The upstream evaluation framework is
not part of this repository.
