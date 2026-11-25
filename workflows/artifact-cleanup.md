# Artifact cleanup workflow

Developer cleans after the whole task succeeds; Sprinter after each successful
phase, before the next compaction or final report. The orchestrator owns cleanup,
not coder, reviewers or QA. Review-only work does not clean.

## Ownership and timing

Before builds/tests, record the unit, canonical project root, selected build
configurations, actual output/evidence paths and pre-existing/user exclusions.
Discover outputs from `AGENTS.md`, documented commands and workers' actual results,
not guessed directory names. Default evidence is `artifacts/evidence/<unit>/`.
Use project-local `tmp/<unit-id>/<attempt-id>/` for notes and captured output;
ordinary mkdir and reuse of known task-owned directories are fine. There is no
scratch registry, exclusive first-write requirement or cleanup plugin preflight.

Filename, age, ignored status or an untracked Git status is not proof of ownership.
Identify reproducible generated outputs and other consumers before selecting a
build tree. Reusable `build/`, `dist/` and nested build directories need no extra
retention/deletion decision solely because they predate this task: they can be
rebuilt. Do not delete active/shared consumers' data, tracked sources, user files
or explicitly retained outputs. If contents or consumers are uncertain, clarify
or use a separate owned leaf. Do not invent a developer-cache retention exception.

External scratch, including `/tmp/opencode/`, requires approved native writes and
a known cleanup owner before use. Read-only directory access needs no approval.
Write approval is not deletion approval or proof
of ownership. Record the exact owned leaf, not `/tmp`, `/tmp/opencode` or another
shared parent. Do not follow symlink aliases into other data.

Wait for all writers, workers and consumers to stop, required reviews/checks/QA
to finish, accepted delivery to be verified and a self-contained result summary.
The pre-delivery check below permits early removal only of unneeded outputs,
never the acceptance evidence or recovery records.
Never clean active, failed, blocked, paused or uncommitted implementation work.
Preserve diagnostics/resume state and report remaining paths/sizes. Earlier failed
attempts of a now-successful unit may be disposed of at its successful closeout.
Historical maintenance requires user approval of an exact candidate list with
provenance, sizes, retention requests and active/unknown exclusions. A new policy
does not authorize historical deletion or reopen completed phases.

## Inventory and evidence lifetime

Before the first build/test, inventory pre-existing logs and outputs, including
ignored `*.log`, `*.log.*`, `*.stdout` and `*.stderr` outside build trees. Record
paths, sizes and modification times; fingerprint shared logs when attribution
needs it. Do not follow symlinks or cross mounts while inventorying.

After writers stop, reconcile new/changed files with that baseline and workers'
command/cwd/output records. A new or changed file alone is not proof of ownership.
Preserve pre-existing/shared logs unless the whole file is known disposable;
never truncate a shared log. Include root logs and earlier attempts of this unit.

Keep complete logs, review reports/ledger, QA output, runner archives and delivery
receipts while the unit is unfinished, including pause, correction and compaction.
Reviewers/QA must deliver complete results before the parent removes evidence.
Scenario-required archives and cleanup proofs must pass their acceptance checks.

After successful delivery, remove disposable unit-owned outputs, evidence, raw
logs, archives, exported reports/dialogues, diffs and checkpoint manifests unless
the user explicitly requested retention. Do not preserve copies via a replacement
archive or invent retention. Keep the unit ledger, cleanup state, handoff, receipt
and necessary recovery evidence until other removals and the repeated inventory
are verified; delete that service tree last. Never discard recovery evidence first.
On a failure record completed/pending/failed paths, preserve that evidence and stop.

## Cleanup check before delivery

Prefer documented output settings that place logs in the assigned unit directory.
If a runner requires a fixed output elsewhere, record it before starting the
runner. After the final checks, reconcile actual outputs (including root logs
such as `app.log`) and list the exact cleanup commands before sealing the delivery
packet. Include any known outputs from checks scheduled after delivery.

Ownership and permission are separate. If configured permissions require approval,
account for it before delivery. An unneeded output may be removed before delivery
if doing so preserves verification and recovery evidence. If a required removal
cannot be authorized and the user has not requested retention, report the exact
command/path as blocked before transferring the commit. Do not test permissions
by deleting evidence or assume a prompt will be answered in a non-interactive run.

## Task cleanup and target checks

Typical cleanup candidates for Developer/Sprinter include:

- `tmp/<unit-id>/` and its children;
- reproducible `build/` and `dist/`, including the directories themselves, trailing
  slash spellings and children; this includes `build/agent-<unit-id>/` and preset
  builds once their writers/consumers have stopped;
- nested `<component>/build/` directories and their children, when project commands
  establish that they contain reproducible build outputs, not sources;
- `artifacts/<unit-id>/`, or unit children of `artifacts/git-delivery/`,
  `artifacts/evidence/` and `artifacts/phase-planning/`.

Prefer `rm -f -- <relative-path>` for a file and `rm -rf -- <relative-path>` for a
directory. Use one concrete project-relative operand, quote it as needed, and
use the canonical project cwd. The harness adds no shell command rules or cleanup
grants. There is no ownership registry or cleanup hook; the parent checks targets.

Do not ask a separate workflow question for verified leaves or reproducible build
outputs. A directory's name or ignored status alone is not proof of reproducibility.
Stop and clarify if contents, consumers or retention are uncertain. Honor configured
permissions. A workflow question answer does not change a native permission rule.

Before every deletion:

1. Resolve the originating cwd and absolute target. Inspect the target and parents
   for symlinks, unexpected mounts or other aliases; do not follow them into data
   outside the intended leaf. Use the canonical project root as shell workdir.
2. Verify task ownership or reproducible generated-only contents, stopped
   writers/consumers and no tracked/user/other-task files. Check Git for project-local
   targets. Preserve uncertain data and report it.
3. Protect the project root, `.git`, `.opencode`, shared temporary/evidence roots,
   `/tmp`, `/tmp/opencode`, user-retained materials and external checkouts.
   Select one owned leaf/file or verified build-output directory, never a wildcard
   operand or a parent containing unrelated work.
4. Follow the target's pre-delivery disposition. If the tool requests permission,
   show the exact operand and prefer `Allow once`.
   Native-write and shell-deletion approval are separate from directory reading;
   neither replaces the ownership checks above.
5. Execute one foreground deletion, inspect its exit status and verify target
   absence in a separate read-only call, e.g. `test ! -e <path> && test ! -L <path>`.
   Do not append `echo $?`, `ls` or other commands to a deletion: there is no hook
   to reject mixed calls, and `ls` of an absent target returns a misleading nonzero exit.
   Record success before continuing. On rejection or failure, stop and
   report the exact command/path/cwd/error; do not retry via another spelling,
   interpreter, cwd, larger target or unchanged rejected permission.

Build-output roots may be removed in full. Keep empty `tmp`, `artifacts` and
shared service/evidence roots; never run `rmdir artifacts` or `rmdir --parents`.
These are workflow requirements, not
runtime path checks or an OS sandbox. Do not use another spelling, a script or a
different cwd to evade a prompt or denial.

## Closeout

Repeat the inventory and report actual cleanup results, retained paths/reasons,
Git state and any blocked removals. Remove the service records only after other
cleanup is verified. Then perform the optional MCP-only code-intelligence refresh
from `implementation.md`; absent tools or refresh errors do not invalidate cleanup.
Keep a concise self-contained result, not raw disposable evidence, in the final
response and phase handoff. Do not report completed cleanup while approval is pending.
