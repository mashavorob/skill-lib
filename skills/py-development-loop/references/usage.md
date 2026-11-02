# Using the workflow

Restart OpenCode after installing or changing agents/skills. Switch with Tab:

- **py-developer**: give one task and acceptance criteria. Unless specified, the target is
  the local branch checked out when the task starts.
- **py-sprinter**: give a larger goal or an existing plan. Planner creates/refines phases;
  each completed phase is integrated as one local commit. Before EVERY phase, including
  the first/phase 0, Sprinter checkpoints its journal and calls `sprinter_compact` to
  automatically perform native compaction in the same session. OpenCode compacts and
  auto-continues; Sprinter checks the native summary receipt and recovers the journal
  before phase execution. You do not need to type `/compact` between phases.
  Retries within an already started phase do not require another pre-phase compaction.

The shared Python/C++ tool is provided by `<config-dir>/plugins/py-sprinter-compact.js`
(by default `~/.config/opencode/`); its controller
and regression tests live under this skill's `lib/` and `tests/`. Restart OpenCode after
installing/changing the plugin or agent. The tool requests permission `sprinter_compact`,
which the Sprinter agent allows; it accepts only `py-sprinter` and `cpp-sprinter`, cannot target another session or run
as a Coder/Reviewer/QA subagent. It verifies completion using native session history and
can recover a receipt from the persisted tool result after a plugin reload.

Local regression checks, from the cloned library root (Python 3.9+, Node.js 22+
and npm; no external model calls):

```bash
npm ci
npm test
npm run test:smoke
```

Smoke checks install the library into clean temporary config directories, let OpenCode
install and discover the local plugin, then run the actual agent loop and native summary
with a local mock LLM for both Python and C++ Sprinter. Each verifies one compaction,
automatic continuation, and matching request/completion receipts without touching the
active sprint session or calling an external provider. They require `opencode` on PATH;
dependency downloads may need network access. Node.js/npm are not needed for normal
installed use: OpenCode handles plugin dependencies from the config's `package.json`.

Examples:

> Fix subscription recovery after reconnect. Add a regression check.
> Use the current branch as the target.

> Execute this plan in phases. Each phase must produce a separate verified commit on feature/x.

No model is pinned. Primary agents use the selected model; subagents inherit the invoking
primary's model. `py-coder`, `py-reviewer`, `py-qa` and `py-sprint-planner` are subagents, not Tab entries.
Built-in agents remain available. Project agents of the same name can override globals.

## Reviews and round limit

Each candidate goes through focused reviews, then a mandatory independent general review,
then QA. General review checks the complete solution, consistency between components/fixes,
cross-focus gaps and overall simplicity. It uses a fresh Reviewer session on the same SHA.
All focused passes plus general review count as ONE round; a failed focus can close a round
without general review, but that candidate is not approved.

The maximum is **32 review rounds per Developer task or Sprinter phase**. A candidate approved
in round 32 may still complete QA and integration. If another correction/review round is
needed, the orchestrator stops BEFORE Coder/round 33, records `stopped_round_limit`, and
preserves the worktree, commits, reports and open findings. A recovered count greater than
32 also stops immediately. Previously integrated sprint phases remain delivered.

Restarts/resume do not reset counts. Interrupted reviews resume their reserved active round
on the same SHA, without double charging or refunding it. Renaming a run or phase, or moving
unfinished work into a new phase, cannot renew its budget. Changing the limit requires
explicit user authorization recorded with the existing accumulated count.

## What is saved

The Git common directory contains `opencode-development/runs/<run-id>/` with requirements,
plan/state, findings, reports, integration checkpoints and both final SHAs. Relevant
verified recurring lessons are stored in `opencode-development/lessons.md` for this repo.
These files are outside application commits, shared by linked worktrees, and survive
squashing or restarting OpenCode. They are local: cloning the repo does not copy them.

Temporary implementation checkouts live next to the repository under `.opencode-worktrees/`.
Ignored credentials, runtime data and virtualenvs are not automatically copied there.
The orchestrator retains run branches/worktrees after integration unless removal is
explicitly requested. This preserves evidence and the pre-squash history reference.

To resume, select the same primary agent and provide the run ID or journal path. It must
read the saved state and reconcile real Git SHAs before continuing. No guesswork from
an incomplete conversation is needed.

## Direct QA

`@py-qa` can execute a project's tests/scenarios without a development task. It records the
current SHA and dirty state and follows project instructions, including nested testbed
rules. It does not create commits or repair tests. Other implementation/review subagents
expect the orchestrator's full handoff.

## Scope of automation

This is an agent/skill protocol, not a background daemon or Git hook. Orchestrators perform
and journal the steps through OpenCode tools. Tool permissions are deliberately permissive
except for sudo; role boundaries are instructions rather than tool-level restrictions.
Interrupted or blocked runs preserve their evidence. Push is prohibited. Review and QA
must return actual reports before an orchestrator can integrate a candidate.
