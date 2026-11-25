# Implementation workflow

Shared by Developer (one whole task) and Sprinter (one phase at a time).
Read `.opencode/workflows/agent-rules.md`, `.opencode/workflows/focused-review.md`,
`.opencode/workflows/iteration-git.md` and
`.opencode/workflows/artifact-cleanup.md` before execution. Accepted delivery uses
`.opencode/workflows/git-delivery.md`.

In OpenCode 1.x, use `task` with the exact `subagent_type`. Use separate parallel
tool calls for a review batch; if the client/model cannot dispatch in parallel,
report the limitation and collect the same frozen-snapshot reports before any
mutation. Omit `task_id` for a fresh session and use the returned ID only when
the workflow calls for resuming that same session.
Match the `OpenCode worker identity (session metadata)` line appended by the
harness to the expected role/model and any explicitly configured variant when a
workflow requires verified identity. `variant: null` means no named variant was
recorded. Do not substitute a worker's self-report for runtime metadata.

## Entry

For multi-step work, publish the working plan and progress through native
`todowrite` under `Visible TODO progress` below. A Markdown checklist or a ledger
alone does not populate the user's sidebar.

1. Read the named plan in full, otherwise use the latest agreed conversation plan
   with its verification and user decisions. Never guess a filename or rewrite
   requirements. Developer asks about missing decisions; Sprinter reports
   `BLOCKED` if it cannot resolve them.
2. Record the unit, scope, completion criteria, current local target branch and
   original Git/file baseline under the Git workflow. Restore the saved target
   and baseline for an existing unit. Record excluded user changes and inspect
   relevant diffs, untracked and ignored inputs; stop on an unisolatable conflict
   rather than overwriting or staging user work.
3. Establish the iteration branch under the Git workflow before coding. Resolve
   an explicit no-Git instruction before starting this commit-based workflow.
4. Record disposable build/output/evidence paths before the first build/test.
    Keep the native TODO list and one unit ledger synchronized until successful closeout.
   Maintain DRAFT handoff and evidence/ledger records under
   `artifacts/git-delivery/<unit-id>/`, updating them after checkpoints, reviews
   and verification so final delivery needs no reconstruction of conversation
   history. The parent owns handoff/evidence; the delivery worker owns its
   receipt/message. Keep all four kinds of service artifacts out of Git.

Apply the shared `Language skills` rules before assigning work. Record affected
components, selected skill IDs, interpreter/runtime constraints, memory risks and
required evidence (or why no measurement is needed). Load applicable skills in
the parent and require each worker to load them in its own session; language
guidance does not change the coding/review/verification gates or role boundaries.

Before using any build tree, establish its generated contents, consumers and
closeout disposition. Owned or verified reproducible build outputs are disposable
in full; pre-existing build caches do not require a new retention/deletion decision
solely because they can be reused. Resolve active other users/tasks, non-generated
contents or uncertainty first, or select an unused unit-owned build leaf. Honor
explicit retention; ignored status is neither proof of safe contents nor retention.

For Sprinter, entry uses the current phase's `BRIEF_READY` handoff
from `.opencode/workflows/phase-planning.md`, including the complete brief,
revision/hash, approved parent-plan/phase identity and unchanged repository inputs.
For new phases include the bounded material-review protocol, brief_version,
review_round, reports/dispositions and last correction mapping; V3 needs no new
reviewer PASS. Existing ready/started phases keep their saved planning contract.
Restore that planning ledger, original target branch and baseline instead of
recreating them. Verify the target and baseline before creating a helper branch.
Hand the ready brief directly to coder without repeating phase-plan review;
implementation still follows the code-review and verification gates below.
Drafting/review does not consume `coding_iteration`. Developer continues to use the
user's approved task plan without this drafting step.

## Visible TODO progress

Developer and Sprinter own the visible list in the parent session. When
`todowrite` is available, call it before the first worker assignment on any
multi-step task or phase, and whenever the list or its statuses change. Include
the approved scope/baseline, implementation, development review, final review,
required pre-delivery checks/QA, delivery, required post-delivery checks and
cleanup; omit stages outside the user's scope.
Review-only work lists only its requested review/check stages, never authorizes
implementation or extra QA. A child session's TODO list does not update its parent.

Send the full list on every `todowrite` call: it replaces, not appends to, the
previous list. Use native statuses `pending`, `in_progress`, `completed` and
`cancelled`; keep at most one current sequential stage `in_progress`. Mark a
stage active before starting it and completed only after its actual result has
been verified. Reconcile after each worker result, review disposition, check,
delivery receipt and cleanup result; do not rewrite an unchanged list.
On a blocker, keep the affected stage incomplete, annotate its content with the
blocker and leave dependent stages pending. There is no native `blocked` status.
Use `cancelled` only for work explicitly removed from scope, not failed work.
Never mark the whole list completed while review, verification, delivery or
required cleanup is pending. Reopen only affected stages when corrections are
needed; do not reset already verified progress.

Save the current TODO content/status snapshot in the existing owned unit ledger
(handoff/evidence), including before pause or compaction; it is not another plan
file. On the next authorized work step after resume/compaction, reconcile native
progress with the snapshot, verified results and actual Git/delivery/cleanup
state. Restore through `todowrite` when needed, without restarting completed work
or inventing historical progress. Sprinter also keeps a concise phase/TODO
snapshot in its `sprinter_phase` handoff/note. Preserve completed-phase summaries
when replacing current-phase details for the next authorized phase.

If `todowrite` is unavailable, explicitly say native TODO progress is unavailable
and report a concise chat checklist plus the durable ledger instead. Do not claim
the sidebar was updated, silently substitute a Markdown file, broaden permissions
or add a UI plugin. Enabling TODO/configuration alone does not resume completed,
paused or blocked work, authorize a new phase, or backfill old sessions.

## Execution

1. Delegate bounded implementation to `coder`; inspect its actual diff against
   the plan and checkpoint each completed batch. Before every new assignment,
   reserve its `coding_iteration` and record the attempt ID/bounds under the
   focused workflow's single 32-attempt budget, including initial implementation.
   The orchestrator alone mutates Git during iteration/checkpoint work; final
   delivery belongs to `git-delivery`. Reuse one coder session per unit; replace
   it only if unavailable or the user requests replacement, supplying its history
   to the replacement.
2. Run the development review, then independent final review under the focused
    workflow and its single unit-wide coding budget. Resolve the eligible
    profiles from `PROJECT.md` using that workflow. Developer uses development
    `correctness` then final `general`, adding eligible specialists for concrete
    risks. Sprinter runs the entire eligible set in each discovery tier.
   Launch selected focuses concurrently within each tier, not the tiers together.
   Collect all selected reports and consolidate accepted findings before correction.
3. Run required pre-delivery verification. Use commands from the applicable `AGENTS.md`
   and its referenced documentation for ordinary checks, and `qa-run` only for
   documented project scenarios/packs. QA never changes product
   code or pass criteria. Product defects return to coder and reviewer within the
   same coding budget; unavailable prerequisites are blockers. Record any required
   checks that need the target revision under `Verification timing` in
   `.opencode/workflows/git-delivery.md` as pending in the delivery handoff.
4. Complete the [cleanup check before delivery](artifact-cleanup.md#cleanup-check-before-delivery),
    including any logs at the project root. Once required cleanup is
   accounted for, seal a READY packet for the accepted checkpoint and invoke
   `git-delivery` in a fresh subagent session. Verify its actual model/agent
   identity and returned receipt against read-only Git queries. Never perform
   the transfer directly or run other unit work while it is active. A missing,
   blocked or partial delivery stops closeout without automatic retry or fallback.
   An accepted net no-op still requires verification that the scope is already
   satisfied, both review tiers and required pre-delivery checks; hand it off for
   `NO_CHANGES`.
5. After verifying the `DELIVERED` or `NO_CHANGES` receipt, run the planned checks
   on the target revision under `Parent closeout` in the delivery workflow. If a
   required check fails or cannot run, report the Git outcome and blocker, preserve
   evidence and stop. Once all required checks pass, record a self-contained result
   summary and reconcile the cleanup inventory with actual outputs and permissions.
   Remove outputs and standalone logs first; keep the ledger, ownership record and
   delivery evidence until all other removals are verified. Remove those service
   records last, verify cleanup, then attempt the optional code-intelligence
   refresh below. Sprinter closes each phase before
   entering the next; Developer closes the whole task. No archive is required
   unless the user explicitly requests retention.

Discover QA requirements and locations from `AGENTS.md` and its referenced
documentation, not from profile settings. If neither project instructions nor
the task require scenario QA, use the ordinary documented verification; no QA
setup is needed in the harness. Explicitly required but missing QA is a real prerequisite
blocker, not a reason to edit the profile or invent a test pack.

Assign project-relative `tmp/<unit-id>/<attempt-id>/` before every coder/QA
assignment, including corrections and resumed verification. Supply the absolute
originating cwd, absolute capture directory and expected output paths; record
them in the ledger before launching the worker. Workers must not run checks
without this metadata or invent root-level log names. For scenario runners,
preserve documented internal output/archive locations and inventory them as
explicit exceptions; only captured stdout/stderr goes in the assigned directory.
Record originating cwd and ownership before writing; retain logs through review,
verification and delivery. Create or reuse known task-owned project-local scratch
normally, with no plugin registration or first-write ceremony. External scratch,
including `/tmp/opencode/`, requires approved native writes and a known cleanup
owner, not approval merely to read the directory.
Before deletion verify exact target, ownership, stopped writers and evidence
lifetime under `artifact-cleanup.md`. Clean known task leaves or reproducible
build outputs at closeout, subject to configured permissions. Account for all
targets under the pre-delivery cleanup check.
If approval is pending or rejected, preserve the files and report the blocker;
do not bypass it by changing cwd, tool or operand.
Check required delivery validation tools before delegation; report unresolved
prerequisites rather than installing software or changing validation semantics.

Keep coding, builds/tests, review, QA and delivery mutually exclusive. Reuse valid results
for unchanged content; do not repeat successful checks without a reason or rerun
an unchanged failure. On recurrence, inspect the earlier cause/fix before trying
again. Stop on scope expansion, missing required evidence, unresolved owner
decisions or an exhausted coding budget; never weaken acceptance to finish.

## Optional code-intelligence refresh

After accepted target delivery and verified artifact/log/evidence cleanup,
Developer refreshes once per completed task and Sprinter once per
completed phase. If the configured code-intelligence MCP exposes an
`index_repository` tool, call it directly through MCP with `repo_path` set to
the canonical project root declared in `PROJECT.md`. If no such tool is configured, skip this step.

Ignore any refresh error, including timeout; do not retry or poll for completion.
Do not use a CLI fallback, locate a RAG executable, install RAG or start its server.
Skipped or failed refresh never fails or blocks the task, artifact cleanup or
the next phase. Claim a refreshed index only when confirmed by the MCP result.

## Worker context and ledger

Each call must stand alone: supply the unit requirements, user decisions, exact
scope/baseline/snapshot, excluded files, relevant evidence and completion criteria.
For relevant planning/coder/reviewer/QA calls, also supply the selected skill IDs,
affected components, interpreter/runtime constraints, memory risks and required
evidence. Do not assume another session has already loaded the skills.
For coder add the reserved `coding_iteration`, attempt ID/bounds and whether this
continues the same interrupted attempt; only the orchestrator advances the counter.
For reviews add tier, mode and focus; for corrections add finding IDs, full ledger,
earlier fixes, the corrective delta and impacted surfaces. For delivery supply
the immutable handoff path/digest, evidence references and explicit deliver/resume
action, not the full conversation. Every coder/QA packet also includes the
absolute originating cwd and `tmp/<unit-id>/<attempt-id>/` capture directory.
Workers return actual
output/log paths and originating cwd so the orchestrator can resolve absolute or
relative paths, inspect evidence while the unit is unfinished and clean outputs
after success.

Keep the ledger concise but complete: findings, causes, fixes, dispositions,
original reports, tested/reviewed SHAs, current acceptance, coder session,
`coding_iteration`, attempt IDs/bounds/outcomes and the Git/evidence mappings.
Coder returns ledger updates; the orchestrator reconciles them against the diff
and verification. An applied
fix remains pending until its tests and reviewer check pass. Preserve earlier
verified fixes; resolve conflicting requirements before reverting them.

## Handoff and completion

Before compaction or pause, save the plan/scope, original baseline, progress,
original target branch/ref, BASE and checkpoint refs, coder/ledger, current snapshot,
`coding_iteration`, the current attempt ID/status, review coverage/findings, verification,
cleanup/evidence paths and next action.
Preserve the language/skill context, runtime constraints and memory-evidence
decisions so resumed or replacement sessions can reload the applicable skills.
Include delivery handoff identity, worker session, receipt/pending action and any
verified SQUASH/RESULT. Resume delivery by reconciling actual state under its
workflow; never start fresh refs or repeat a transfer merely because its last
report was lost.
For Sprinter include the phase brief/hash, planning protocol/version/round,
reserved attempts, reviewer sessions/reports, dispositions/correction mappings,
readiness, planner session, approved inputs and any unresolved prerequisite as well.
Restore this state on resume rather than creating a new unit.
At successful closeout, keep only the delivered commit or unchanged target SHA,
verified outcomes, relevant limitations and cleanup summary for the next phase. Delete disposable
ledger/reports under the cleanup workflow; do not depend on their old paths.

Completion requires the whole selected scope, both review tiers, required checks,
accepted target delivery and artifact cleanup; code-intelligence refresh is optional.
Otherwise report pending work or `BLOCKED`, not completion. The final report
includes the result/changed areas, commit mapping (or unchanged target SHA and
why no commit was needed), review coverage, coding budget
used, test results, cleanup totals, explicitly retained paths and remaining limitations.
If QA was used, include its complete result, tables, evidence, failures and notes,
not a replacement summary; mark disposed output paths as removed by cleanup.
