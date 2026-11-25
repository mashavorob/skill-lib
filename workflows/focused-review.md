# Focused review workflow

The unit is one Developer task or Sprinter phase. Keep its approved requirements,
baseline and full accumulated diff fixed. The canonical profiles are in the
`Focus profiles` section of `.opencode/agents/code-reviewer.md`.
Every collection, including targeted and review-only, uses a fresh session per
focus. Launch all selected focuses concurrently within a tier, at most five
reviewers at once, including correctness when selected. Do not wait for one
focus's report before launching the others. Wait for every selected report
before reconciliation or coding; a finding or blocked report does not cancel
the remaining selected reviews.

## Tiers

Implementation requires development (`code-reviewer`, `opencode/reviewer`), then
independent final review (`code-reviewer-final`, `openai/reviewer`). Verify the
configured agent is available and each launched session's actual
agent and model alias against its configuration before accepting its
report. Use the `OpenCode worker identity (session metadata)` line attached to
the `task` result. Missing or mismatched identity is `BLOCKED`; prompts and reviewer
self-identification are not proof, and no lower-model fallback is allowed.

Development and final tiers are sequential, never concurrent. Complete development
review and its accepted corrections before launching independent final discovery
on the resulting checkpoint.

## Profile selection

The five profiles are `correctness`, `general`, `architecture`,
`latency-concurrency` and `simplification`. Default Developer implementation routing is:

| Tier | Required whole-change profile | Risk-selected specialists |
| --- | --- | --- |
| Development | `correctness` | `architecture`, `latency-concurrency`, `simplification` |
| Final | `general` | `architecture`, `latency-concurrency`, `simplification` |

For Developer, do not automatically run both whole-change profiles in each tier or
every specialist in both tiers. Select specialists independently per tier when the
actual diff has concrete risks: ownership/interfaces/dependencies/orchestration
for architecture; reachable runtime costs, memory growth/retention, unbounded
collections/queues/tasks, blocking, races or lifecycle for
latency-concurrency; unnecessary complexity, duplicated logic or competing state
for simplification. Record the selected set and concise scope-based reasons for
selecting or omitting specialists in the ledger. Omission needs no reviewer call
or placeholder `NOT_APPLICABLE` report. Final general still covers the whole change,
including correctness and interactions, independently of development conclusions.
Explicitly requested additional retained profiles must be included.

Apply the shared `Language skills` rules for both tiers and review-only work.
For Python, `latency-concurrency` prioritizes memory/resource efficiency while
retaining concurrency safety; latency tuning needs project/task relevance.
Supply component/runtime constraints, selected skill IDs, memory risks and any
required/existing evidence to each reviewer. Each session loads its own skills.
Keep the same five profile IDs, routing, report prefixes and concurrency limits;
there is no extra memory profile. Non-Python/C++ review emphasis is unchanged.

Sprinter implementation discovery selects all five profiles in each tier,
including both correctness and general. Launch all five concurrently against one
frozen checkpoint per tier; do not omit specialists using Developer's risk-based
selection or skip calls based on an upfront applicability decision. Each specialist
may return `NOT_APPLICABLE` with a scope-based reason, but correctness and general
must both complete with actual whole-change coverage. Collect all five reports
before reconciliation or coding. Complete development and its accepted corrections
before launching the five independent final reviewers on the resulting checkpoint.
This also applies to any required full rediscovery. Targeted corrections still
verify only affected focuses under Corrections; do not rerun unchanged coverage.
Review-only requests retain their explicit subset regardless of orchestrator.

The shared reviewer body provides examples, not a command/flag allowlist. Use
ordinary read-only Git/search/hash commands and pipelines; keep diagnostic options
before `--end-of-options` when using it. Supply the canonical root as workdir.
Read relevant external dependency contracts without directory approval, except
protected secrets. Reviewers must not mutate
source/Git or run builds/tests; broad shell permissions are not hard read-only
isolation. A rejected required action is `BLOCKED` with command/cwd/agent/error,
not a reason to bypass it through a script or different path. Do not claim
coverage for a command that failed.

## Iteration budget

Keep one `coding_iteration` counter per unit, initially zero. There are at most
**32 coding attempts total**, shared by initial implementation, both review tiers
and QA corrections. Before each new bounded coder assignment:

1. If the counter is at least 32 and another coding attempt is needed, stop
   `BLOCKED: coding_limit_exhausted`.
2. Otherwise increment once and record the attempt ID, bounds and in-progress
   status in the ledger before calling coder. The first implementation is
   iteration 1; every further implementation batch or consolidated correction
   consumes the next number. Splitting initial implementation does not bypass
   the budget. Failed, abandoned and no-op attempts count.
3. Record the outcome, changed checkpoint and verification evidence. Resuming the
   same interrupted attempt does not count twice; a new assignment or correction
   cannot be relabeled as a continuation to avoid the counter.

Review collections, targeted verification, full rediscovery, tests/checkpoints
and QA belong to the current iteration and do not increment the counter. There
is no separate review-pass or per-tier budget. Repeat full discovery only when
changed code or a coverage gap requires it; do not repeat valid unchanged checks.
Unit acceptance still requires both review tiers and all required verification.

Preserve the counter across compaction, pause, resume, coder/session changes,
checkpoints and renamed findings. On explicit resume of older work, reconstruct
the number of actual started coder assignments from history, including initial
implementation batches, not just corrections or review collections. Insufficient
history is `BLOCKED`, not permission to reset to zero. Renaming or splitting an
unfinished unit does not renew its budget. Policy changes alone never reopen
completed work, resume paused work or authorize a new attempt.

Iteration 32 may complete review, checks, QA and delivery and be accepted. If
after its reviews/checks required implementation/corrections remain, stop
`BLOCKED: coding_limit_exhausted` with findings and the needed decision; do not
start iteration 33 or advance to another phase. Preserve the checkpoint, ledger
and pending evidence. Missing prerequisites or unresolved decisions stop earlier;
reaching the limit is not a goal. The planning budget remains independent.

## Full review

1. Freeze a checkpoint and supply requirements, exclusions, tests and exact
    `BASE..CHECKPOINT` commit/tree SHAs. Include new/ignored inputs explicitly;
    a clean worktree is not an empty accumulated diff.
2. Select profiles under Profile selection: Developer uses the tier's required
   whole-change profile and concrete-risk specialists; Sprinter selects all five.
   Full review always means full accumulated-diff coverage, not just the latest
   corrective delta.
3. Launch the entire selected set concurrently against that same frozen snapshot.
   Collect every selected report before any correction, including when correctness
   finds a blocker. Missing/blocked reports leave the collection incomplete and
   prevent clearance or advancing to the next tier; finish other selected reviews
   without attempting a coding workaround. For any selected specialist reporting
   `NOT_APPLICABLE`, require a scope-based reason, not missing evidence.
4. Reconcile findings as blocking defects, material bounded improvements or
   optional suggestions. Accept blocking/material findings within scope, reject
   with evidence when justified, and do not apply optional churn by default.

Keep code frozen during each collection; never run coder, builds or QA alongside
review. Final discovery inspects the accumulated diff independently, not another
tier's conclusions. Corrected snapshots may retain earlier coverage only with
explicit delta verification; never label old reports as reviews of the new SHA.

## Corrections

Send accepted findings in one consolidated coder task, reserving the next
`coding_iteration` under the shared budget and reusing the unit's session and
ledger. Supply the reviewed/current checkpoints, full corrective delta, earlier
causes/fixes and affected interfaces/callers. Investigate recurring
causes rather than repeating an equivalent patch. Missing history is a blocker.

After the correction, run affected tests, create its checkpoint and use fresh
reviewer sessions for the affected focuses at the same tier. Launch all affected
focuses concurrently, with no correctness-first gate, and collect every selected
report before further coding. Behavioral corrections need the tier's whole-change
reviewer to verify the delta; add specialist checks for affected concrete risks,
not an automatic rerun of unaffected profiles. Development corrections use
`opencode/reviewer`; final-tier corrections use `openai/reviewer`, including for
targeted correction verification.
Review the exact delta plus impacted surfaces, not unrelated cleanup. Keep
finding IDs and mark each verified fixed or unresolved.

Bounded new/unresolved findings may use another coding attempt within the same
budget. If targeted coverage is insufficient, run full rediscovery of the current
checkpoint without starting a new coding iteration. A QA correction after final
acceptance requires final-tier delta verification and affected tests
within the same coding budget; prior full coverage remains original-SHA evidence.
Scope expansion or unavailable required checks stops `BLOCKED`.

## Acceptance and records

A tier clears when its required whole-change profile and every selected
additional profile are complete, behavioral correctness is clear,
all accepted required findings are verified fixed or rejected with evidence,
and no report, conflict or blocker remains. Optional suggestions do not block.
Final acceptance must cover the current checkpoint through full reports and any
explicit correction-delta checks. Development clearance alone is insufficient.

Record `coding_iteration`, attempt IDs/bounds/outcomes, coder/ledger, original
report identities, verified reviewer metadata, tier/focus/mode/snapshot,
actual coverage or NA reason, finding
dispositions and test evidence until the implementation unit successfully closes.
Then remove disposable ledger/reports under the artifact-cleanup workflow; carry
only the result and relevant verified prevention rules into the next unit without
inventing new requirements. Keep complete records for unfinished units or an
explicit user retention request. Git delivery follows its own workflow.

On authorized resume of unfinished work, retain original reports, snapshots and
finding IDs. Route correction checks from retired profiles to a retained profile
by consequence, recording the mapping rather than rewriting history. Duplication
and redundant-state findings belong to simplification; language safety belongs
to correctness/general. Reconcile old reuse findings on their actual in-scope
consequence without launching a reuse reviewer. New calls accept only the five
canonical profiles; retired names are not aliases. This policy alone never
reopens completed work or resets the coding counter.

## Review-only requests

A standalone review needs scope and requirements, not an implementation plan.
Run only the requested collection; do not enter correction loops, edit, plan,
build, run tests/QA, commit or clean artifacts. Do not start or increment
`coding_iteration` for review-only work.
Explicit worktree/new-file snapshots are allowed without checkpoint commits.

- Named profiles: exactly that subset, no extra `general` or correctness call.
- Explicit full focused review: all five canonical profiles, with scope-based
  `NOT_APPLICABLE` allowed only for specialists.
- No focus named: one standalone `general` reviewer.
- Unknown profile: `BLOCKED`, without partially running or broadening the request.

Default to development; use final only on an explicit final-tier request.
`FINDINGS` does not prevent remaining selected reviews. Missing/blocked reports
leave review incomplete.
Return tier/verified identity, snapshot, coverage, all findings/dispositions,
limitations and blockers, using existing verification evidence only.
