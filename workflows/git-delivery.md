# Accepted Git delivery

Only `git-delivery` performs final delivery. Developer/Sprinter owns initial
iteration branches and checkpoint commits under
`.opencode/workflows/iteration-git.md`, then calls a fresh `git-delivery` subagent
after both review tiers and all required verification/QA have cleared. Verify
the launched agent/model identity (`git-delivery`, `opencode/worker`) before
accepting its output. Missing agent/identity or a blocked result is `BLOCKED`;
there is no direct-delivery fallback in the orchestrator.

## Ownership and handoff

Keep one unit-owned directory `artifacts/git-delivery/<unit-id>/` under the
canonical project root. Use a stable path-safe unit ID and existing unit refs.
Validate containment, no symlinked parents, no tracked/user files at these paths
and no collisions before creating records. These service artifacts need no
profile configuration and must never enter a product checkpoint.

Developer/Sprinter maintains `handoff.json` and `evidence/` incrementally as the
unit runs, including the unit ledger and original review/verification results.
Do not assemble the packet by reconstructing a long conversation at closeout.
The handoff stays `DRAFT` until acceptance is complete, then becomes `READY`
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
- current acceptance coverage at both review tiers, original report/evidence
  paths/digests and verified identities, findings/dispositions and corrective-delta
  coverage through FINAL; a generic `PASS` claim is insufficient;
- required checks/QA and their actual results/snapshots, explicit reasons for
  non-required checks, planning acceptance when applicable, and unchanged inputs;
- approved commit subject/summary, project commit conventions and the reserved
  receipt/message paths.

Keep old-SHA results as old-SHA evidence with the recorded revalidation chain;
never relabel them as FINAL results. Acceptance must cover the exact FINAL tree.
Each referenced file must exist and be readable. Missing or contradictory
authorization, coverage, evidence or snapshots blocks delivery before Git mutation.

The parent supplies only the sealed packet path/digest, evidence references and
explicit `deliver` or `resume` action to a fresh worker. Resume uses the same
unchanged packet and names the existing delivery session/receipt. Omit `sessionID`
to start the fresh worker and omit model overrides to use its configured pin.
Use a foreground delegation so the parent waits. While it runs,
do not alter that packet, run
coding/review/tests/QA or mutate the unit's Git state. Only one delivery executor
may be active. A new call after interruption must be an explicit resume of the
same unit after confirming the previous executor has stopped, not a new attempt
with fresh refs. Delivery does not consume/reset planning or coding iterations.

## Preflight

Read the profile, applicable `AGENTS.md`, handoff and referenced evidence. Check
required coverage against `.opencode/workflows/focused-review.md` and configured
profiles, and verification/QA obligations against the approved task and project
instructions; do not re-review code. Verify root/ref names and full SHAs against
Git, without path/config/environment overrides. The packet root, profile's
canonical root and Git's actual toplevel must agree. Resolve artifact paths
canonically with `realpath -- <path>` and verify packet/report digests with
`sha256sum -- <file>`. Record a blocked receipt only after the unit/root and owned
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

A net no-op, moved target or stale acceptance is `BLOCKED`. Do not repair these
conditions, create new acceptance, select another target or invent replacement
refs. For a resume, inspect the recovery cases below before any command that
changes Git.

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

- No helper ref, original iteration still at FINAL, target at BASE and clean
  tracked/index/sequence state: repeat full preflight and record PREPARED, or
  reconcile the existing pending helper creation, before the missing first step.
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
binding, actual RESULT target ref, parent/tree/trailer mapping and command
outcomes through read-only Git queries. A partial or blocked receipt cannot
authorize another delivery attempt, cleanup or phase advance on its own.
Keep all handoff/evidence/message/receipt files until full successful closeout;
then remove them with other unit artifacts under the ordinary cleanup workflow.
Keep only the self-contained result mapping/outcome for the next phase.

Do not relabel old test results as RESULT tests. Any required checks that depend
on revision identity/generated Git metadata stay with the orchestrator. Content
changes need review revalidation. Only after verification and artifact cleanup
may it report completion or start the next phase/code-intelligence refresh.
