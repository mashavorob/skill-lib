# Phase planning

Sprinter obtains and materially reviews one concise implementation brief for an
approved phase, after the phase-entry checkpoint and before coding. Read
`.opencode/workflows/agent-rules.md`. The approved parent plan, selected phase and
user decisions remain authoritative. Developer uses the user's approved task
plan directly and does not need this drafting step.

## Inputs and ownership

Record the parent-plan identity/content hash, phase ID, requirements, exclusions,
user decisions, original target branch/ref and BASE, and relevant repository
inputs. Include uncommitted/new inputs explicitly. Capture the original target
and baseline under `.opencode/workflows/iteration-git.md` before any helper-branch
switch; preserve them on resume rather than silently selecting a new baseline.

Before drafting, apply the shared `Language skills` selection rules. Sprinter
loads applicable skills and supplies the selected skill IDs, affected components,
interpreter/runtime constraints, memory risks and required evidence (or why no
measurement is needed) to the planner. The planner loads the skills in its own
session and carries these constraints into the brief for coder. Supply the same
context to each plan reviewer, which loads its own skills; planning does not
execute profiling or impose benchmarks on every Python change.

Sprinter owns the brief and concise phase ledger under the canonical project's
`artifacts/phase-planning/<unit>/`. Establish the ledger before drafting, honoring
user exclusions and existing files. The approved implementation request authorizes
these unit-owned records, not parent-plan or product edits. The planner returns
text; reviewers return reports. Sprinter persists them and records each brief's
version/content hash. Planning does not run builds/tests/QA, make implementation
commits or perform delivery.

## Bounded material review

New phases use protocol `bounded-material-v1`: at most three brief versions
(`brief_version` 1..3) and two review rounds (`review_round` 1..2). A version is a
planner drafting/revision assignment, not a review round or a coding attempt.
Reserve its number, attempt ID/bounds and status in the ledger before the call;
failed/abandoned assignments consume their slot. Resume the same interrupted
attempt with unchanged bounds rather than silently resetting or minting retries.
Missing output/history or a failed required worker is `BLOCKED`, not acceptance.

1. Reuse the latest complete phase brief when it still matches the approved
   requirements and current inputs, preserving its protocol/status under Resume
   below. For a new phase, call `sprint-planner` for V1 with phase scope, user
   decisions, baseline and relevant source evidence. Its model is `openai/planner`.
   Require requirement-to-step mapping, actual source references, bounded ordered
   edits, exact proposed verification and completion criteria. Mark assumptions
   and prerequisites; planned checks are not executed evidence. Concrete content
   omissions in an available brief go through material review, not pre-review
   redrafting. Missing/truncated output is `BLOCKED`, not permission for extra calls.
2. Freeze V1's complete text/hash and approved repository inputs. Record round 1
   and launch all three plan-review focuses concurrently in fresh `plan-reviewer`
   sessions: `general`, `architecture`, `verification`. All use
   `opencode/worker`, not the code-review model. Verify each actual agent/model
   and the planner identity before accepting results;
   prompts/self-identification are not proof. Missing/mismatched identity is
   `BLOCKED`, not permission for fallback. Include the approved plan/phase,
   protocol, brief_version/hash, review_round, focus, original BASE/input
   identities, exclusions, language context and prior dispositions in each packet.
3. Keep the brief and inputs frozen during collection; wait for all three reports
   before reconciliation or planner correction, even if one finds a blocker.
   Do not run planner, coder, builds/tests, QA or delivery alongside the collection.
   General must supply whole-brief coverage; specialists may give scope-based
   `NOT_APPLICABLE` but must still be called. Missing/blocked reports leave the
   round incomplete: preserve state and report `BLOCKED`, not a smaller collection.
4. Reconcile only material findings under `.opencode/agents/plan-reviewer.md`:
   concrete omissions, contradictions, infeasible steps or substantial in-scope
   risks without adequate checks. Require requirement/source evidence, consequence
   and a minimal correction. Record accepted/rejected/duplicate dispositions and
   evidence; do not blindly accept every reviewer suggestion. Reject nonmaterial
   preferences, verbosity/style and scope expansion; do not send them to planner.
   If no accepted material findings remain and no prerequisite is unresolved,
   mark the current brief ready immediately; another round is not obligatory.
5. Consolidate accepted round-1 findings into one `sprint-planner` correction for
   V2, reusing its session/history. Supply finding IDs, complete prior brief/hash,
   original inputs and dispositions. Require a complete replacement plus a concise
   finding-to-change mapping. Check that agreed corrections were actually applied,
   scope/inputs are unchanged and required content is present. This is a mechanical
   handoff check, not an additional review or optional refinement pass.
6. Freeze V2 and collect round 2 using all three fresh reviewer sessions under the
   same materiality/concurrency rules. Review the complete updated brief, retaining
   earlier finding IDs and dispositions. If no accepted material findings remain,
   mark V2 ready. Otherwise consolidate them into one final planner correction V3.
7. After the agreed V3 corrections are applied and the handoff check succeeds,
   record `BRIEF_READY` and hand the brief directly to coder through
   `.opencode/workflows/implementation.md`. Do not review V3: no third round,
   targeted correction verification, final plan reviewer or new clean PASS is
   required. Also record readiness on earlier clean exits. Include the exact
   version/hash, protocol, original baseline/inputs, reports, dispositions and
   last correction mapping. Readiness is an execution handoff within the approved
   phase, not new task authorization or a claim that unreviewed V3 passed review.

Limits are ceilings, not targets. At most six reviewer sessions run in total,
three per round, never six simultaneously. No extra planner versions or reviewer
calls through targeted checks, renamed focuses or restarted units. A missing
worker report/output, unapplied agreed correction, unresolved requirement conflict,
scope/input drift or unavailable prerequisite is `BLOCKED`; the cap never means
pretending a blocker is fixed. Resolve a necessary owner decision without silently
renewing the budget. Do not use `coding_iteration` to pay for planning retries.

There is one plan-review tier, not the code-review development/final scheme.
These limits are instruction/ledger contracts, not a runtime-enforced scheduler.
Code defects and implementation findings belong to the unchanged `coding_iteration`
budget. Both code-review tiers, required verification, delivery and cleanup remain
mandatory. A real scope change still requires the owner's decision.

## Resume and evidence lifetime

Carry the complete brief/hash, approved phase inputs, original target/ref and
BASE, planner session and next action into implementation and compaction handoffs.
Save protocol, brief_version, review_round, reserved attempt IDs/status, reviewer
sessions/identities, frozen input hashes, original reports, dispositions, correction
mappings and readiness status in the ledger and `sprinter_phase` handoff/note.
Restore them on resume without resetting counters, repeating completed collections
or requiring review of V3. Resume an incomplete collection only in its recorded
sessions/snapshot; unavailable history/worker sessions are a blocker, not fresh
reviewer calls outside the limit.
Reconcile input drift before coding; never silently rewrite an in-use brief.
Preserve the selected skills, component/runtime constraints and memory-evidence
decisions in the brief and handoff; resumed workers reload applicable skills.
Keep brief snapshots and planning records until the whole phase successfully
closes, then apply `.opencode/workflows/artifact-cleanup.md`.

For an existing unfinished phase, keep historical briefs/reports as evidence.
Existing `BRIEF_READY` or implementation-started phases keep their handoff; do not
reopen them just because this protocol was installed. A previously begun
direct-handoff phase without this protocol continues its saved drafting contract on
authorized resume; it does not acquire new review requirements. If its state is
unclear, stop for reconciliation instead of guessing a new budget. New phases
record `bounded-material-v1` before drafting. Never relabel historical reports as
current approvals. Configuration changes alone do not resume paused work or
authorize a new phase.
