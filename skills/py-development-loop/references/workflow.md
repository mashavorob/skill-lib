# Orchestrator protocol

This protocol is shared by the Python and C++ skills. Resolve role names through the
active skill's agent mapping, and use that skill's language guidelines and review focuses.
It is stored here once so Git operations, journal recovery and budgets cannot drift.

Read this file completely. `RUN`, `COMMON`, `SOURCE`, `WORK`, `TARGET`, `BASE`, `CANDIDATE`
below are recorded values, not literal paths or refs. Use absolute paths and shell-safe
argument quoting. Use the command tool's working-directory parameter rather than `cd`.
Do not execute interpolated user text as shell code.

## 1. Establish context

1. Read applicable repository instructions, user requirements and the active skill's language guidelines. Record
   source worktree, current local branch/HEAD, status including untracked paths, target
   branch and target SHA. Default TARGET to the initial checked-out local branch. Detached
   HEAD or an ambiguous/nonlocal target needs clarification. Do not fetch or push.
2. Discover the common Git directory with `git rev-parse --path-format=absolute --git-common-dir`.
   Use a collision-resistant run ID (UTC timestamp plus a short unique suffix). Set RUN to
   `COMMON/opencode-development/runs/<run-id>`. Verify parent paths before creating folders.
   Store journals ONLY here, not in tracked `.opencode/` or the application tree.
3. Preserve dirty/untracked source work. Never stash, discard or commit it implicitly.
   The implementation starts from committed TARGET, not from unstaged source changes.
   If the task depends on such changes, ask how they should be included; otherwise it
   can proceed independently. The target checkout must be clean before integration.
4. Record project language/toolchain/build constraints, environment prerequisites and practical baseline checks.
   Ask QA to establish baseline evidence when behavior checks are relevant. In that handoff
   label it BASELINE, not candidate approval. Do not count baseline QA as final QA.
   Baseline results may be collected in the newly created owned worktree before Coder.
5. Developer records a one-phase task. Sprinter invokes Planner, persists its phase plan
   and requirement coverage, and executes one phase at a time. Each phase gets its own
   BASE, owned branch/worktree, review counters and integration state. Before starting
   EACH Sprinter phase (including the first/phase 0 and genuinely new corrective phases),
   apply the mandatory pre-phase compaction gate below. Developer's one-phase workflow
   does not gain this gate.

### Sprinter: pre-phase `/compact` gate

After planning or integrating the preceding phase, checkpoint requirements/user amendments,
the plan, integrated SHAs, the next phase ID/acceptance/dependencies, target branch/SHA,
environment/checks, unresolved findings and existing counters in the run journal. Add
`pre_phase_compaction` to that phase's state with `status: "pending"` and record the gate
in events.md. Keep the run ID and absolute journal path available for recovery.

Call the installed `sprinter_compact` tool as a standalone call with `action: "request"`,
`checkpoint: <absolute RUN>` and `phase: <phase ID>`. It uses native OpenCode
`client.session.summarize` for the current session, with its selected model and `auto: true`.
The endpoint queues compaction but waits for the running session loop before responding;
the plugin therefore observes the queued native message and returns control without
awaiting that response. Awaiting it inside the tool would deadlock the same loop.

`queued` is not proof of completion. Let the host loop compact and auto-continue, then
call `sprinter_compact` with `action: "status"` and the same checkpoint/phase. It confirms
a completed, error-free native summary for the exact compaction message. Persist its
sessionID/nativeRequestID/summaryMessageID as evidence. Repeated request/status calls
do not queue another compaction for this phase. Do not create the phase worktree, call
Coder or mark the gate complete while status is queued/unknown/failed.

Compaction is automatic; do not routinely stop to ask the user to type `/compact`.
If the tool is unavailable, diagnose the global plugin/configuration (a newly installed
plugin requires an OpenCode restart) rather than concluding that native compaction is
impossible. On an actual request/summary failure, preserve the pending gate and diagnose
the error. Printed `/compact` text or a fresh subagent/session is not compaction.

After tool-confirmed compaction, read requirements, plan, state/events and relevant reports,
reload applicable instructions and reconcile actual Git/worktree state under the normal
recovery rules. Set `pre_phase_compaction.status` to `"completed"` and journal the confirmed
compaction/recovery before starting the phase. Preserve all rounds, findings and approvals.
A completed gate for this same phase survives resume; in-phase retries do not require a
new gate. A new phase always gets its own gate. This requirement does not reset budgets
or permit reclassifying unfinished work as a new phase.

## 2. Journal layout and ownership

Orchestrator writes and updates these files before handing work to another agent:

```text
COMMON/opencode-development/
  lessons.md
  runs/<run-id>/
    requirements.md
    plan.md
    state.json
    events.md
    phases/<phase-id>/
      findings.md
      reports/                  # immutable numbered Coder/Reviewer/QA reports
      integration-message.txt
```

Only create optional files when needed. `state.json` is a current machine-readable index;
reports/events retain history. Preserve old reports, verdicts and finding dispositions.
Never put credentials, raw .env content or sensitive service output into these records.
Write a complete replacement JSON to a sibling temporary file, then atomically replace
state.json. On resume verify actual Git state, even if the last write was interrupted.

Minimum state shape (extend, do not erase history):

```json
{
  "version": 2,
  "run_id": "...",
  "mode": "py-developer",
  "source_worktree": "/absolute/source",
  "common_git_dir": "/absolute/source/.git",
  "target_branch": "feature/x",
  "initial_target_sha": "...",
  "status": "in_progress",
  "phases": [{
    "id": "01",
    "status": "in_progress",
    "base_sha": "...",
    "branch": "opencode/<run-id>/01",
    "worktree": "/absolute/parent/.opencode-worktrees/<repo>-<run-id>-01",
    "coder_iterations": 0,
    "max_review_rounds": 32,
    "review_rounds": 0,
    "active_review_round": null,
    "qa_attempts": 0,
    "candidate_sha": null,
    "reviewed_sha": null,
    "general_reviewed_sha": null,
    "qa_passed_sha": null,
    "original_head_sha": null,
    "squash_sha": null,
    "target_commit_sha": null,
    "reports": []
  }]
}
```

Each event/report has timestamp, role, phase, iteration/round, exact SHA, verdict and path.
Set `mode` to the actual orchestrator (`py-developer`, `py-sprinter`, `cpp-developer`
or `cpp-sprinter`); the example above shows a Python task.
Findings have stable IDs (e.g. F-001), focus/severity, first/last seen round, location,
failure evidence, closure condition, Coder response/fix SHA and Reviewer disposition.
Statuses: OPEN, DISPUTED, VERIFIED_FIXED, or ACCEPTED_WITH_REASON. Deduplicate reports of
one defect across focuses. Coder cannot close findings. A must-fix cannot be waived merely
to finish; accepting it requires evidence that it is not a defect/requirement, or explicit
user disposition. Capture that evidence. Closed findings remain readable.

`lessons.md` contains concise, verified recurring mistakes or relevant explicit conventions,
with scope, rationale, better approach and source finding IDs. Add/update a lesson when a
mistake actually recurs or reflects a reusable confirmed rule, not for every preference.
Coder reads relevant lessons before each iteration. Lessons do not override current project
instructions. Do not put noisy full reports or unverified Reviewer claims into lessons.

## 3. Owned implementation branch and environment

1. Resolve BASE from the current local TARGET. Check the phase branch and worktree path
   do not exist; use branch `opencode/<run-id>/<phase-id>` and a sibling checkout under
   `<source-parent>/.opencode-worktrees/<repo-name>-<run-id>-<phase-id>`.
2. Use `git worktree add -b <owned-branch> <absolute-worktree> <BASE>` from the source repo.
   Record exact paths/refs immediately. Never treat another branch as owned by inference.
3. Discover/setup the environment following project instructions. Ignored files may be
   absent. Do not copy credentials/data or mutate shared envs without a documented need.
   Record approved environment paths/commands. If applicable, explicitly initialize required
   submodules in this worktree; do not commit gitlink changes as setup side effects.
4. Pass original repository instructions that may exist only as uncommitted files as
   explicit context. Never silently copy unrelated uncommitted application changes.
5. Serialize all writes. Reviewer/QA see a frozen, clean candidate. Do not start Coder
   while review or tests are still running. QA packs with shared fixtures run sequentially.

## 4. Mandatory handoffs

Every subagent gets absolute project/worktree/journal paths and applicable instructions.
Require exact SHA and evidence in its returned report. Persist the report before the next
stage. Check task result contents; a tool returning successfully is not a role's PASS.

**Coder:** phase requirements/acceptance and plan context; owned branch, worktree, BASE;
current HEAD, own commits and baseline diff; all findings/previous reports and relevant
lessons; environment/checks; integration boundaries. Increment coder_iterations once per
actual implementation/fix invocation. Coder returns committed HEAD and finding responses.

**Reviewer:** phase acceptance; BASE and exact CANDIDATE; round number and one named focus
or `general`; full diff and relevant context; finding IDs, Coder responses and dispositions.
Use fresh task sessions per focus and for general review so reviews are independent.
General receives focused reports but independently inspects the complete solution. All
focused reports plus general for one candidate form ONE round; increment review_rounds
once when its aggregate is persisted, whether passed, failed or blocked. A failed focus
may close the round without general review, but cannot approve that candidate. New review
after Coder changes is another round. Focuses, general, tests and commits are not separate
rounds. Follow the reservation/recovery rules below to avoid duplicate counts.

**QA:** BASELINE or CANDIDATE label, exact SHA/worktree, acceptance criteria, discovered
commands/scenarios/required check scope, environment, baseline results and evidence rules.
For CANDIDATE QA include focused AND general approval reports for the same SHA.
Increment qa_attempts per candidate QA invocation (not baseline). Save original failures.

**Planner (Sprinter):** original requirements/existing plan, repository context, current
target, previous phase outcomes, constraints, and reason for any requested replanning.

## 5. Review/QA gates

1. Verify Coder's branch and actual HEAD; require a clean owned worktree (documented ignored
   runtime output is allowed). Inspect its intended full diff, status and commits. If there
   is no application change, report a truthful no-op; do not create an empty commit/cycle.
2. Set CANDIDATE to the committed HEAD. Check the 32-round budget and persist the active
    round reservation before dispatching Reviewer. Request focus groups from the active skill's language guidelines,
   plus plan-specific focuses. Independent reviews may run in parallel on this frozen SHA.
3. If any focus requests changes or is blocked, skip general review for that rejected
   candidate and proceed to aggregation. Otherwise persist stage `general` in the SAME
   active round and invoke a separate fresh Reviewer with focus `general` on the SAME SHA.
   This whole-solution pass is mandatory before QA, never merged into a focused pass or
   an orchestrator summary.
4. Aggregate/deduplicate focused AND general findings and close/journal the single round. Update
   verified closures/lessons. CHANGES_REQUESTED returns to Coder only if budget remains;
   BLOCKED is not approval. Set reviewed_sha and general_reviewed_sha only after every
   required focus and general approves the same SHA with all must-fix findings disposed.
5. Run QA after focused AND general approval; require every required check PASS for
   CANDIDATE. Set qa_passed_sha only when report and actual unchanged HEAD agree. QA failures
   return to Coder only if budget remains; no quick fixes or weakened tests at the limit.
6. Any commit, rebase, merged change, unexpected tracked modification, or amended candidate
   invalidates reviewed_sha, general_reviewed_sha and qa_passed_sha. Before changing that
   candidate verify a new round is allowed. Review its full diff again, including mandatory
   general review, and repeat required QA. Regression reruns may be scoped with evidence,
   but all affected focuses and configured completion checks must pass. Never transfer
   approvals by assumption or retroactively attach new reviews to an already closed round.

### Round budget, checkpoints and stopping

- Set `max_review_rounds` to **32** per Developer task or individual Sprinter phase. The
  sprint's overall sum may exceed 32 across genuinely separate phases. The limit is not
  OpenCode's `steps` setting and does not count tool calls or individual focus sessions.
- `review_rounds` counts CLOSED rounds. Before the first Reviewer dispatch, reserve
  `active_review_round` with `number = review_rounds + 1`, `candidate_sha`, `stage`
  (`focused` or `general`) and persisted report paths. Never reserve a number above 32.
  Before Coder or candidate-changing rebase/repair, check that such a round is available;
  do not create an unreviewable fix after the budget is exhausted.
- Close a round by persisting its aggregate/verdict, setting review_rounds to its number
  and clearing active_review_round in one checkpoint. General does NOT reserve another
  number. On restart reconcile the reports and state so a closed aggregate counts once.
- An interrupted active round may resume pending focuses/general for its EXACT candidate
  under the same number, even if it is round 32. Completed reports are not redone or charged
  twice. If its candidate changed or the round is abandoned, close it with that reason;
  it still consumes the reserved number. Never refund it or review a different SHA under it.
- After round 32 approves, QA and valid integration may finish for that same candidate.
  Metadata-only squash with verified tree equality remains allowed. If review fails, QA
  requires a code fix, or target advancement/hook changes invalidate the candidate, stop
  before another Coder invocation, candidate-changing rebase/repair, or round 33. A non-code
  prerequisite may be resolved and pending QA/integration resumed without spending a new
  round only while the recorded candidate, approvals and target preconditions remain valid.
- If recovered review_rounds or an active round number ALREADY exceeds 32, stop immediately
  before further Coder/review/QA/integration. Preserve the actual count; do not clamp it.
- On exhaustion set phase and run status to `stopped_round_limit`, record the limit/count,
  last SHA/verdict, open findings, pending checks and stop reason in state/events. Preserve
  branches, worktrees, commits and reports; do not squash/cherry-pick unapproved work or
  advance to the next sprint phase. Previously integrated phases remain delivered.
- Never evade exhaustion with a fresh session/run, reset count, renamed/replacement phase,
  or splitting unfinished work. Changing the budget needs explicit user authorization;
  journal that authorization and new limit while preserving all accumulated counts.

The following executable reference guard specifies the boundary decisions. Orchestrators
must apply these decisions before dispatch; it is not a background hook or a substitute
for the SHA/approval gates. `needs_new_round=False` is only for completing the existing
candidate's pending QA/integration with valid approvals, not permission to skip reviews.

```python
def review_budget_action(phase, *, needs_new_round):
    limit = phase.get("max_review_rounds", 32)
    completed = phase["review_rounds"]
    active = phase.get("active_review_round")
    if type(limit) is not int or limit < 1 or type(completed) is not int or completed < 0:
        return "RECONCILE_STATE"
    # A nondefault limit is valid only with the journaled explicit user authorization.
    if limit != 32 and not phase.get("review_limit_authorization"):
        return "RECONCILE_STATE"
    if completed > limit:
        return "STOP_ROUND_LIMIT"
    if active is not None:
        number = active["number"]
        if type(number) is not int:
            return "RECONCILE_STATE"
        if number > limit:
            return "STOP_ROUND_LIMIT"
        if number != completed + 1:
            return "RECONCILE_STATE"
        return "RESUME_ACTIVE_ROUND"
    if needs_new_round and completed >= limit:
        return "STOP_ROUND_LIMIT"
    return "START_ROUND" if needs_new_round else "CONTINUE_VALIDATED_CANDIDATE"
```

If progress repeats without new evidence, record the blocker, attempted fixes and missing
decision/prerequisite and stop resumably. Do not loop indefinitely or relax acceptance.

## 6. Finalize one task/phase

Perform these steps only as orchestrator, with all values verified against state. Write an
event/checkpoint BEFORE each history-changing operation and save its resulting SHA after.

### Preconditions

- Actual owned branch/worktree HEAD equals CANDIDATE == reviewed_sha == general_reviewed_sha
  == qa_passed_sha, and no review round is still active.
- Required focused AND general review, acceptance and QA passed; no unresolved must-fix
  findings. The closed round count is within the recorded authorized limit (default 32).
- Owned worktree/index are clean; BASE is an ancestor; only intended task commits/paths
  appear in BASE..CANDIDATE. Inspect `git status`, `git diff`, `git diff --check` and
  `git log --oneline -10` before committing. Hooks are never skipped.
- Resolve where TARGET is checked out using `git worktree list --porcelain`. Use that
  checkout if present; it must be clean, have TARGET checked out and have no in-progress
  merge/rebase/cherry-pick. Never switch the user's checkout implicitly. If TARGET has no
  checkout, create a dedicated integration worktree attached to TARGET, record it and keep
  it clean. Its path also lives under the sibling `.opencode-worktrees/` directory.
- Re-read TARGET SHA. If it differs from BASE, do NOT integrate stale approvals. Check that
  another review round is available; otherwise stop at the limit BEFORE rebasing. Rebase
  only the owned phase branch onto current TARGET, delegate conflicts/needed source fixes
  to Coder, update BASE, preserve prior reports but invalidate approvals, and rerun review
  including mandatory general review, and QA. Do not change TARGET to fit the candidate.
  Journal this as target advancement without resetting counters.

### Squash owned branch

1. Save original_head_sha = CANDIDATE and create a unique backup ref such as
   `refs/opencode-development/<run-id>/<phase-id>/pre-squash` pointing to it. Retain this
   ref after integration so Coder's original commit history remains available. Record it.
2. Persist a nonempty integration-message.txt in the phase journal. Follow repo subject
   style; include a concise summary, meaningful verification summary, and trailers:

   ```text
   Development-Run: <run-id>
   Coder-Review-Cycles: <this phase's review_rounds>
   Coder-Iterations: <this phase's coder_iterations>
   QA: passed
   Sprint-Phase: <phase-id>/<total phases>
   ```

   Omit Sprint-Phase for Developer. Counts reflect actual persisted events. Do not include
   sensitive logs or every raw command output in the commit message.
3. ONLY in the verified owned worktree run `git reset --soft <BASE>`, then inspect the
   staged diff and run `git commit -F <absolute-message-file>`. This rewrites only the
   explicitly owned implementation branch, never TARGET. Never reset a user branch.
4. Record squash_sha. Check its parent is BASE and its tree equals the reviewed candidate
   tree (`git rev-parse <sha>^{tree}`). A metadata-only squash preserves the reviewed tree.
   If a hook changes content or the tree differs, stop integration, invalidate approvals,
   and check the remaining review budget. If exhausted, stop at the limit; otherwise have
   Coder repair/commit and review (focused AND general)/test before another squash.
   If commit fails after soft reset, keep index/backup ref and journal the failure; inspect
   actual state and continue from this checkpoint, not by blindly resetting again.

### Cherry-pick locally

1. Immediately recheck that the clean target checkout is still on TARGET at BASE. If it
   advanced after squash, preserve the squash/backup, return to the target-advancement
   procedure and revalidate; do not cherry-pick under stale approvals.
2. From the target checkout run `git cherry-pick <squash_sha>` (no `--ff`, no push).
3. Record target_commit_sha and verify its parent is BASE, its tree equals the approved
   squash tree, target checkout is clean and no operation remains in progress. Target
   advancement beyond this phase requires the revalidation procedure, not assumed equality.
4. Mark phase integrated only after these checks. Keep original HEAD, backup ref, squash
   SHA, target SHA and reports. Keep phase branch/worktree unless user asks to remove them.
   Start the next phase from the newly resolved TARGET, not from an old phase branch.

A failed hook or unexpected conflict is not completion. Preserve state/evidence and do not
auto-resolve conflicts in the target checkout. Abort only this workflow's in-progress
cherry-pick if necessary, after recording evidence; never abort another user's operation.
Repair/revalidate on the owned branch, then retry integration. Do not amend an integrated
target commit or create an empty commit to mask an empty cherry-pick.

## 7. Recovery and final report

On resume read state, events, reports, findings, lessons and actual refs/worktrees. Never
reset counters or silently start a second run for the same task. Determine whether the
last completed checkpoint was Coder, focused/general review, QA, soft reset, squash or
cherry-pick. Reconcile active-round and aggregate checkpoints without double charging or
refunding numbers. Apply the budget guard before resuming; restart does not renew budget.
For older version-1 state, preserve/reconcile existing review counts/reports, add the
version-2 fields and default limit 32, and record migration. Missing general approval is
NOT inferred from focused approval: an old closed round cannot be reopened to add a free
general review. Obtain the newly required approvals in an available new round or stop at
the limit. If the historical count is ambiguous, stop for reconciliation rather than reset.
If target already contains the recorded phase tree/message/run trailers with the expected
parent and journal evidence, record its actual SHA rather than cherry-picking again.
If evidence does not identify the result unambiguously, stop for reconciliation.

For an interrupted soft reset inspect HEAD, index, backup ref and reflog before resuming.
Retain original failure records and report paths even after a fix passes. QA/refactoring
work after integration is a new corrective phase, not target history rewriting.

Final response: acceptance summary; target branch and commit SHA(s); per-phase review
rounds/limit and overall sum; focused/general verdicts; meaningful QA commands/results and
limitations; journal path; for a limit stop, report `stopped_round_limit` and open findings;
whether work is complete or blocked. Explicitly state local integration/no push. Report
partial phase delivery honestly. Do not imply a prompt-based workflow is a daemon or
that permissions alone prevent every possible shell mutation.
