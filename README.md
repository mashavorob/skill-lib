# OpenCode Skill Library

A project-local port of the `l3.ai` development harness for OpenCode **1.x**,
verified with **1.19.6**. It includes shared agents for Python, C++ and mixed
projects, plus two on-demand Python skills.

## Install

Requires Python 3.9+ and OpenCode. From this repository:

```sh
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
The installer uses **`agents/`** and refuses a same-name file in `agent/` to
avoid duplicate IDs. The project's `AGENTS.md` remains the source of build,
verification and QA instructions. The installer does not touch user-level config,
the project's `opencode.json(c)`, or its root `package.json`.

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

The agents use these aliases from your OpenCode configuration. The harness sets
no variant; configure reasoning on the aliases themselves.

| Agents | Model alias |
| --- | --- |
| `developer`, `sprinter`, `plan-reviewer`, `qa-run`, `git-delivery` | `opencode/worker` |
| `code-reviewer` | `opencode/reviewer` |
| `code-reviewer-final` | `openai/reviewer` |
| `coder` | `openai/coder` |
| `sprint-planner` | `openai/planner` |

Plan and Build keep their prompts and existing shell permissions. The runtime
plugin prevents them from invoking harness roles or the phase checkpoint tool.

### Updating

An identical installation is a no-op. Differing shipped files stop installation
before any writes. To preview and apply replacements:

```sh
python3 install.py --target ~/src/myproject --dry-run --force
python3 install.py --target ~/src/myproject --force
```

Replacements are backed up under `.opencode/.skill-lib-backups/`. Existing
`PROJECT.md`, unrelated files and existing plugin dependency versions are kept.
The installer never prunes old components. If this target project contains a
previous `py-*`/`cpp-*` installation, remove only its obsolete files and plugin
after confirming ownership. Restart OpenCode after updating.

If you installed an earlier development snapshot of this port, remove its shipped
`agents/plan.md`, `agents/build.md` and `plugins/worker-identity.js` from the
project's `.opencode/`. The runtime plugin replaces those files.

## Workflow

Developer starts with development correctness and independent final general
review, adding specialist focuses when the change warrants them. Sprinter runs
the five focuses in each code-review tier and uses a bounded phase-brief review
before coding: at most two review rounds and three brief versions. Both share a
32-attempt coding budget per task or phase, run project-defined checks, and hand
accepted changes to `git-delivery` for local delivery. That workflow uses Git
and needs a JSON validator (`jq` is recommended).

Prefer putting verification logs in `tmp/<unit>/<attempt>/`. Check logs outside
the [automatic cleanup paths](workflows/artifact-cleanup.md) before transferring
the commit; a task-owned log at the project root still requires shell permission.

The [shared rules](workflows/agent-rules.md) select Python skills by the affected
component and memory risks. C++ guidance lives in those rules and the shared
review profiles. Native permissions help enforce delegation and read-only edit
roles; command-pattern checks are not an OS sandbox.

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
