# Using the C++ workflow

Install the full library and restart OpenCode. Switch with Tab:

- **cpp-developer**: one C++ task and its acceptance criteria; the default target is
  the local branch checked out when the task starts.
- **cpp-sprinter**: a multi-phase goal or existing plan. Planner refines the phases;
  each completed phase yields one locally integrated reviewed/tested squash commit.

`cpp-coder`, `cpp-reviewer`, `cpp-qa` and `cpp-sprint-planner` are subagents.
Models are inherited, not pinned. Project agents can override globals of the same name.
The agent discovers your C++ standard, compiler, library, build and test commands;
C++20 and CMake are not mandatory.

Examples:

> Fix the dangling view after the buffer is resized. Add a regression test.
> Use the current branch as the target and preserve the supported C++17 toolchain.

> Execute this migration in phases. Preserve the public ABI and validate the
> documented compiler configurations before integrating the final phase.

## Reviews

The canonical profiles are correctness, duplication, data-duplication, simplification,
cpp20, reuse, architecture, latency-concurrency and general. See
[cpp-guidelines.md](cpp-guidelines.md) for applicability and evidence requirements.
Each applicable narrow profile uses a fresh reviewer on the frozen candidate; a
separate independent general review follows before QA. All form one review round.
There is a maximum of 32 rounds per task or phase, persistent across interruptions.

Direct `@cpp-qa` requests can run existing builds/tests/scenarios without creating an
implementation branch. Direct `@cpp-reviewer` requests require an absolute worktree,
baseline and exact clean candidate SHA, scope/acceptance and journal context; the
reviewer defaults to general and reports without changing source or running builds.

## Compaction, evidence and recovery

The shared `sprinter_compact` tool is provided by `plugins/py-sprinter-compact.js`.
It accepts `py-sprinter` and `cpp-sprinter` and compacts only their current session.
Before every phase, C++ Sprinter saves its checkpoint, queues native compaction,
then confirms the exact successful summary after automatic continuation. A queued
receipt is not completion; no manual `/compact` is normally needed.

The shared [protocol](workflow.md) stores journals at
`<Git common directory>/opencode-development/runs/<run-id>/` and implementation
worktrees under the sibling `.opencode-worktrees/` directory. The journal preserves
requirements, plan/state, findings, reports, counts and integration SHAs. Resume
with the same primary agent and run ID or journal path. It reconciles Git state and
preserves budgets/approvals rather than inferring progress from chat memory.

Development checks, including native smoke coverage for both languages, run from the
cloned library root with Python 3.9+, Node.js 22+ and npm (`opencode` is also needed
for smoke tests). These extra tools are not prerequisites for using installed agents:

```bash
npm ci
npm test
npm run test:smoke
```

The installer merges missing plugin dependencies into the config's `package.json`;
OpenCode installs them on startup. Smoke tests verify this clean-install path using
a local mock LLM; dependency downloads may still require network access.

Restart OpenCode after any agent, skill or plugin update.
