# Accepted Git delivery

Only `git-delivery` performs final delivery. Developer/Sprinter owns initial
iteration branches and checkpoint commits under
`.opencode/workflows/iteration-git.md`, then calls a fresh `git-delivery` subagent
after both review tiers and all required pre-delivery checks and QA have cleared.
Verify the launched agent/model identity (`git-delivery`, `opencode/worker`) before
accepting its output. Missing agent/identity or a blocked result is `BLOCKED`;
there is no direct-delivery fallback in the orchestrator.

## Verification timing

Complete all checks that can verify the accepted checkpoint before delivery. Defer
only checks whose documented acceptance criteria require the target revision
after delivery, such as verifying a build that embeds the delivered commit SHA.
Missing prerequisites or failing checks on FINAL are not reasons to defer them.

## Ownership and handoff

Keep one unit-owned directory `artifacts/git-delivery/<unit-id>/` under the
canonical project root. Use a stable path-safe unit ID and existing unit refs.
Validate containment, no symlinked parents, no tracked/user files at these paths
and no collisions before creating records. These service artifacts need no
profile configuration and must never enter a product checkpoint.

Developer/Sprinter maintains `handoff.json` and `evidence/` incrementally as the
unit runs, including the unit ledger and original review/verification results.
Do not assemble the packet by reconstructing a long conversation at closeout.
The handoff stays `DRAFT` until the pre-delivery gates clear, then becomes `READY`
and is frozen for the whole delivery attempt. Record its SHA-256 digest after
sealing; the worker verifies that digest and the referenced immutable report
receipts before Git mutation. Seal immutable acceptance snapshots, not mutable
live-ledger files; keep later parent progress updates separate from the digest
set. Sealed reports remain unchanged until unit closeout. The packet contains:

- version, unit ID, explicit implementation/Git authorization, canonical root
  and artifact directory;
- the original target branch and full ref, BASE, iteration ref, exact accepted
  FINAL SHA/tree, the reserved squash ref and checkpoint manifest;
- approved scope, included paths, excluded user/untracked inputs with baseline
  evidence, and command working directories;
- effective implementation profile set, selected profiles and current acceptance
  coverage at both review tiers, original report/evidence
  paths/digests and verified identities, findings/dispositions and corrective-delta
  coverage through FINAL; a generic `PASS` claim is insufficient;
- required pre-delivery checks/QA and their actual results/snapshots, explicit
  reasons for non-required checks, planning acceptance when applicable, and
  unchanged inputs;
- required post-delivery checks, listed separately as pending: for each, record
  why the target revision is required, the documented command/scenario, working
  directory, prerequisites, expected result and planned evidence location;
- approved commit subject/summary, project commit conventions and the reserved
  receipt/message paths. For a net no-op, record why the approved requirements
  are already satisfied and omit the commit subject and message path.

Keep old-SHA results as old-SHA evidence with the recorded revalidation chain;
never relabel them as FINAL results. Acceptance must cover the exact FINAL tree.
Each referenced file must exist and be readable. Missing or contradictory
authorization, coverage, evidence or snapshots blocks delivery before Git mutation.

The parent supplies only the sealed packet path/digest, evidence references and
explicit `deliver` or `resume` action. For the first `deliver` call, omit
`task_id` to start a fresh worker. For `resume`, pass the original worker's saved
`task_id` in the `task` call and reference the same unchanged packet and receipt.
Omit model overrides to use the worker's configured model.
Use a foreground delegation so the parent waits. While it runs,
do not alter that packet, run
coding/review/tests/QA or mutate the unit's Git state. Only one delivery executor
may be active. A new call after interruption must be an explicit resume of the
same unit after confirming the previous executor has stopped, not a new attempt
with fresh refs. Delivery does not consume/reset planning or coding iterations.

## Preflight

Read the profile, applicable `AGENTS.md`, handoff and referenced evidence. Check
required coverage using the same `Profile selection` rules in
`.opencode/workflows/focused-review.md`: resolve the effective set from `PROJECT.md`
and check it against the sealed set, tier selections and acceptance evidence.
Block on disagreement or missing required coverage. Check verification/QA
obligations against the approved task and project instructions: require passing
evidence for each pre-delivery check and a justified plan for each required
post-delivery check. Pending post-delivery checks do not block transfer when
their prerequisites other than the target revision are in place. Do not run
these checks or re-review code. Verify root/ref names and full SHAs against
Git, without path/config/environment overrides. The packet root, profile's
canonical root and Git's actual toplevel must agree. Resolve artifact paths
canonically with `realpath -- <path>` and verify packet/report digests with
`sha256sum -- <file>`. These tools come from GNU coreutils and must exist on the
delivery host; a missing one is a blocked prerequisite reported before delegation
or any Git mutation. Record a blocked receipt only after the unit/root and owned
artifact location are validated; otherwise return an inline blocker without
writing guessed paths. Require:

- a `READY` packet bound to this unit, root, refs, evidence and FINAL;
- original target/ref agreement, BASE/FINAL commits, FINAL descended from BASE,
  iteration ref still at FINAL and expected tree equal to `FINAL^{tree}`;
- no missing task inputs, altered excluded files, unexpected checkpoints or
  conflicting worktree use; fresh delivery requires clean tracked/index state,
  while resume accepts only the exact recorded staging states described below;
- no active merge/cherry-pick/revert/rebase sequence or unmerged index. A finished
  command with a lost receipt update is reconciled below; an active/failed
  sequence is preserved and reported, never automatically repaired;
- no branch-switch collisions with preserved untracked/ignored files; only
  recorded unit artifacts may differ from their earlier untracked manifest;
- for a fresh delivery, current branch is the recorded iteration branch at FINAL,
  the squash ref is unused and the original target still equals BASE.

A moved target or stale acceptance is `BLOCKED`. Do not repair these
conditions, create new acceptance, select another target or invent replacement
refs. For a resume, inspect the recovery cases below before any command that
changes Git.

## No-change delivery

If `FINAL^{tree} == BASE^{tree}`, use `NO_CHANGES` only after the same acceptance
and safety preflight. Equal trees alone do not prove the task is complete;
require evidence that the approved requirements are already satisfied. If not,
return `BLOCKED` and preserve the iteration state. Do not use the squash path
for equal trees.

Record `PREPARED` and the pending switch intent in the validated receipt. Use
only the original-target switch from step 4 below. After the switch verify the
current branch is the original target, HEAD and target ref are still at BASE,
the iteration ref is still at FINAL, the trees still match, the squash ref does
not exist, and the index/worktree, excluded files and Git sequence state are
unchanged as required by preflight. Record `NO_CHANGES`, the unchanged target
HEAD (BASE), and the verified BASE/FINAL/tree mapping. Do not write a commit
message, create a squash ref or record SQUASH/RESULT commits.

## Receipt and execution

The worker alone writes this unit's `receipt.json` and `message.txt`. The receipt
binds the frozen handoff path/digest, unit/root, target/ref, BASE/FINAL/tree, helper
refs and worker session. Keep verified stages, pending action, actual ref/HEAD/
index observations, SQUASH/RESULT when known, commands/exit codes and evidence
paths. Before each mutation persist its intent and expected state; after it,
inspect Git and persist the observed outcome. Never assume a failed command had
no side effects. Use bounded output and one mutation per foreground call, waiting
for its exit status with normal hooks. Do not background Git operations.

Use the shell tool's `workdir` for the canonical root, without `cd`, and take the
exit code from the tool result. Prefer `read` for handoff, receipt and evidence;
discover paths with `glob`. Ordinary read-only utilities, hashing and inspection
pipelines/chains are permitted. Optional `--no-ext-diff --no-textconv` suppress
configured Git diff helpers; they are not mandatory permission spellings. Bounded
captures and ordinary validation tools are allowed within the unit's paths.
Keep mutations separate; broad shell access does not authorize unrelated writes.

Before delegation, the parent ensures a JSON validator is available. After each receipt write,
validate its JSON, preferably with:

```sh
jq -e . -- artifacts/git-delivery/<unit-id>/receipt.json
```

Replace the unit placeholder and use only that unit's literal receipt path
(double quotes are allowed). This is a syntax/non-null check, not validation of
the receipt's authority, schema or Git observations; those checks still apply.
Only successful validation permits continuing. A local standard-library validator
is also fine; do not change input paths, acceptance semantics or install software
to hide a failure. Malformed JSON, unavailable required tooling or rejected access
blocks the next mutation/closeout. Never switch tools to bypass a denial. Report
the precise prerequisite or failed call instead. An expected missing-ref exit
or false ancestry result must be interpreted separately from permission denial.

1. After preflight, record `PREPARED`. Recheck root, branch/HEAD, target at BASE,
   exclusions and sequence/index state immediately before each mutation.
2. Create only the reserved helper branch:

   ```sh
   git switch -c agent/squash/<unit-id> <BASE>
   ```

   Record `SQUASH_BRANCH_CREATED`. Then:

   ```sh
   git merge --squash <FINAL>
   git diff --no-ext-diff --no-textconv --cached --check
   git diff --no-ext-diff --no-textconv --cached --exit-code <FINAL> --
   ```

   Require index/tree equal to FINAL and unchanged excluded files before recording
   `SQUASH_STAGED`. No manual staging, product edits or conflict resolution.
3. Write the approved message to the owned `message.txt`, including exactly one
   of each required trailer:

   ```text
   Review-Unit: <unit-id>
   Iteration-Target: refs/heads/<original-target>
   Iteration-Base: <BASE>
   Iteration-Head: <FINAL>
   ```

   Commit with normal hooks:

   ```sh
   git commit -F artifacts/git-delivery/<unit-id>/message.txt
   ```

   Inspect the actual commit after hooks. Require its only parent to be BASE,
   its tree to equal FINAL's, the required trailers/subject to agree with the
   handoff, and clean tracked/index state. Record SQUASH and `SQUASHED` only after
   those checks. A hook-induced content change or rejected commit is `BLOCKED`;
   do not stage additional files, skip hooks or amend the commit.
4. Recheck the target at BASE and switch to exactly the original branch:

   ```sh
   git switch -- <original-target>
   ```

   Verify current branch/HEAD, record `TARGET_CHECKED_OUT`, then:

   ```sh
   git cherry-pick --no-edit <SQUASH>
   ```

   Record the actual RESULT and `APPLIED`. Require the target to have advanced
   by exactly one commit, RESULT's only parent BASE, intact trailers and
   `RESULT^{tree} == SQUASH^{tree} == FINAL^{tree}`. Verify excluded files and clean
   tracked/index/sequence state, then record `DELIVERED` and return the receipt.

Git mutations are limited to these helper/squash/transfer commands. Do not push,
stash, reset, clean, rebase, amend, abort/continue a failed sequence, rewrite refs,
change Git config, force-switch/delete branches, create worktrees or use aliases,
interpreters or another agent to bypass this workflow.

## Interrupted delivery

Receipt stages describe verified observations, not proof that an outstanding
mutation did not run. Before resuming compare the frozen packet, receipt and
actual refs/trees/parents/trailers/index/sequence state:

- For equal BASE/FINAL trees, reconcile only the no-change path. With all
  preconditions intact and the iteration branch still checked out, record or
  reconcile the switch intent and perform the switch. If the original target
  is already checked out at BASE and the receipt records the pending no-change
  switch or `NO_CHANGES`, reverify the no-change postconditions and return
  `NO_CHANGES` without another mutation. Any other state is `BLOCKED`.
- For different BASE/FINAL trees, with no squash ref, original iteration still
  at FINAL, target at BASE and clean tracked/index/sequence state: repeat full
  preflight and record PREPARED, or reconcile the existing pending helper
  creation, before the missing first step.
- Helper at BASE: a clean BASE index means merge has not taken effect; an index
  exactly equal to FINAL means squash staging already completed. Reconcile the
  pending action and resume only the missing step. Other index/worktree state
  is `BLOCKED` without cleanup or repair.
- A valid SQUASH commit with only BASE as parent, FINAL's tree and matching
  trailers means commit already completed. Record/verify it instead of making
  another squash commit. If target remains BASE, resume only the missing switch
  or transfer after rechecking the expected current branch and clean state.
- Target already at a valid RESULT with one parent BASE, the expected tree and
  matching unit/target/BASE/FINAL trailers: verify the SQUASH mapping, reconcile
  `DELIVERED` and return the existing RESULT. Never cherry-pick again, even if
  the last receipt update was lost.
- Active sequence/unmerged files, unexpected ref movement, ambiguous ownership,
  changed handoff, missing recovery evidence or an unexpected current branch:
  preserve everything and return `BLOCKED` with actual state and next decision.
  A proven existing result followed by unrelated target commits must be reported
  as already applied with unexpected target movement, never reapplied.

Missing receipt/history before a helper's ownership can be established is
`BLOCKED`. Matching commit trailers can reconcile a completed result only together
with the explicit resume authorization, immutable packet and verified Git state.
Do not silently adopt an unrelated helper ref or claim success from receipt text.

## Parent closeout

Developer/Sprinter verifies the returned agent/model identity, unit/receipt
binding and command outcomes through read-only Git queries. For `DELIVERED`,
verify the actual RESULT target ref and parent/tree/trailer mapping. For
`NO_CHANGES`, verify the unchanged target checked out at BASE, the BASE/FINAL
tree equality, absence of a squash ref and the clean index/worktree and sequence
state. A partial or blocked receipt cannot authorize another delivery attempt,
cleanup or phase advance on its own.

Run the pending post-delivery checks on the verified target revision: RESULT for
`DELIVERED`, BASE for `NO_CHANGES`. Record the actual SHA, outcomes and evidence
in the parent's ledger without changing the sealed handoff or delivery receipt.
Do not relabel earlier test results as checks of the target revision. Content
changes need review revalidation.

If a required post-delivery check fails or cannot run, report the verified Git
outcome and target SHA separately from the blocked closeout. Preserve evidence
and stop before cleanup or phase advance. Do not retry delivery or roll back
the target automatically. Only after all required checks pass and artifact
cleanup is verified may the parent report completion or start the next phase or
code-intelligence refresh. Keep the sealed handoff and delivery records until
successful closeout, then remove them under the artifact cleanup workflow.
Carry only the self-contained result into the next phase.
