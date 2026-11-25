# Iteration Git workflow

Applies to explicitly launched implementation tasks/phases. Configuration edits
and review-only requests do not authorize this workflow or commits. Resolve an
explicit no-Git instruction before starting; do not retrofit completed units.

Developer/Sprinter owns iteration branches and checkpoint commits; `git-delivery`
alone performs accepted squash/transfer under `.opencode/workflows/git-delivery.md`.
Run Git at the canonical project root declared in `PROJECT.md`, without path
overrides. If the harness is in a separate output directory, run Git
from the canonical project root, never from the output directory. Never mutate
external checkouts, stash user work, create extra
worktrees, change Git config, skip hooks, push, amend, reset, clean, rebase,
force-switch/delete refs or rewrite history. The isolated accepted squash is the
only merge exception. On conflicts or interrupted Git operations, preserve state
and report `BLOCKED`; never auto-resolve, abort/reset or retry blindly.

Set the shell tool's `workdir` to that root. Each mutation uses one foreground
Git command, without `cd`, `&&`, `;`, pipes or `echo $?`. Read-only inspection
pipelines/chains are allowed where the role's shared inspection contract permits
them; mutation chains are never allowed. Read each exit status from the tool
result. Read-only `git merge-base` is not `git merge`: parent ancestry checks
are permitted, while actual merge/squash/transfer remains delivery-owned.
For `git merge-base --is-ancestor <BASE> <FINAL>`, 0 establishes ancestry, 1
establishes its absence and other failures require investigation; neither 1 nor
a missing-ref result is a permission rejection. Preserve the full SHA/ref and
actual outcome rather than hiding it behind a successful `echo`.

## Entry and checkpoints

For each new unit, capture the currently checked-out local branch and its HEAD
before planning or switching to any helper branch:

```bash
git symbolic-ref --quiet --short HEAD
git rev-parse --verify HEAD
```

That branch is the unit's target; save its name, full `refs/heads/...` ref and
SHA (`BASE`) in the unit ledger. Never select a target from profile/config values,
`origin/HEAD`, a default branch or another unit's history. Each new task/phase
captures its own current branch. On resume restore the saved target and BASE;
the currently checked-out helper branch does not become a new target. Missing
or contradictory origin metadata is `BLOCKED`, not permission to guess a branch.

Record the unit, original file exclusions, unique unused
`agent/iterations/<unit-id>` and `agent/squash/<unit-id>` refs, coder/ledger and
checkpoint manifest. Reject detached HEAD or an iteration/squash branch as a new
target. Validate branch names and require a clean tracked worktree, empty index,
no active Git sequence and no conflicting worktree use. Exclude unrelated
untracked/ignored files; stop if they conflict with inputs or safe switching.

```bash
git switch -c agent/iterations/<unit-id> <BASE>
```

Before each mutation recheck root, overrides, branch and expected HEAD. Before
each checkpoint inspect the diff, stage only explicit unit-owned inputs, inspect
the staged diff and run `git diff --cached --check`. Never use blanket staging,
`git commit -a` or empty commits; exclude build configurations, credentials, generated outputs
and ledgers unless explicitly approved as tracked inputs.

Checkpoint each completed bounded coder batch, even an honestly labelled failing
snapshot. A no-op needs only a ledger entry. Use normal hooks, then record the
actual SHA/tree/parent, changed scope, findings and verification. Checkpoints are
history, not acceptance. Use `checkpoint: <unit-id> - <concise change>` with:

```text
Iteration-Target: refs/heads/<target-branch>
Iteration-Base: <BASE>
```

Keep that origin metadata in each real checkpoint so the helper branch records
its link to the original branch. Do not create an empty metadata-only commit.

Before review require the tracked worktree/index and all task inputs to match
the checkpoint. Full review sees `BASE..CHECKPOINT`; correction review sees the
entire `REVIEWED_CHECKPOINT..CHECKPOINT` delta and impacted surfaces. Supply exact
SHAs/trees, preserve original reports, and give coder the ledger and earlier
fixes before correction. Never substitute a clean working-tree diff for history.
Resume the existing unit/refs/counters; new checkpoints do not create new limits.

## Accepted delivery handoff

Maintain the DRAFT packet and original evidence under
`artifacts/git-delivery/<unit-id>/` as the unit proceeds. After both review tiers,
required tests/QA and finding dispositions clear, freeze the exact accepted FINAL,
seal the packet and call a fresh `git-delivery` session under
`.opencode/workflows/git-delivery.md`. The orchestrator does not create squash
branches, merge or cherry-pick, and does not fall back to direct delivery.

Keep Git mutations exclusive to the current owner: no checkpoints or branch
switches while the delivery worker is active. A blocked or interrupted delivery
preserves its receipt, evidence and Git state for explicit same-unit recovery.
Before cleanup or phase advance, verify the worker's receipt through read-only
Git queries: for `DELIVERED`, check target/ref, BASE/FINAL/SQUASH/RESULT, trees,
parents and trailers; for `NO_CHANGES`, verify the unchanged checkout and
BASE/FINAL tree equality under the delivery workflow. Preserve that mapping in
the final result; cleanup removes the temporary packet and reports only after
full successful closeout.
