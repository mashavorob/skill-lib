# Python implementation, review and QA

## Discover the project's contract

Read root and affected nested AGENTS.md, pyproject.toml/setup metadata, lockfiles, CI,
lint/type/test configuration and relevant README/contribution guidance. Explicitly record:

- Supported Python versions, including the minimum; actual interpreter used for checks.
- Package/environment manager and locked installation command. Respect local dependencies,
  editable packages, submodules and offline data/service requirements.
- Required check order and commands. Use configured lint/import/type tools; do not assume
  Ruff, mypy, pytest, uv, Poetry or PDM. CI and explicit project instructions outrank taste.
- Behavior contracts: public APIs, persistence/migrations, ordering/delivery semantics,
  async lifecycle, external resources and performance-sensitive paths.

An isolated worktree may lack ignored .env, data, scenarios, virtualenvs and built artifacts.
Inventory prerequisites explicitly. Use documented setup; do not blindly copy ignored files
or secrets. Submodule initialization must stay scoped to the assigned worktree. Do not
rewrite a lockfile or upgrade dependencies merely to make the environment install.

## Required review focuses

Developer/Sprinter request distinct Reviewer tasks for these focus groups by default.
Each task receives the SAME baseline and frozen candidate SHA and reviews the full diff.
Combine adjacent focuses only for a genuinely tiny change; record the covered focuses.
Performance may be not applicable to a documentation-only change, with a recorded reason.

1. **Correctness and contracts**: requirement coverage, boundary/empty/error cases, exception
   handling, validation, resource cleanup, numerical precision, timezone/datetime semantics,
   iterator consumption, mutation/aliasing, transaction boundaries, API/schema compatibility.
   For async/threaded code inspect cancellation, task ownership, shutdown, races, locks,
   delivery ordering, unbounded queues and backpressure.
2. **Simplicity and supported Python**: direct readable solutions, appropriate standard
   library, context managers, comprehensions/generators where clearer, narrow exceptions,
   intentional mutability/defaults, compatible typing and annotations. Reject syntax or
   APIs unsupported by the project's minimum Python; do not demand the latest syntax.
   Avoid overly clever expressions, unnecessary wrappers and speculative abstractions.
3. **Architecture, duplication and dead code**: dependency direction, cohesive responsibilities,
   established extension points, repeated logic, unused parameters/imports/branches/helpers,
   obsolete paths, test-only leakage into production, unnecessary dependencies or public API.
   Check callers before deleting or changing a contract; keep refactoring tied to the task.
4. **Performance and latency**: actual hot paths, algorithmic growth, repeated linear scans
   in loops, avoidable allocations/copies/sorts, data-frame and database query amplification,
   N+1 I/O, batching, cache correctness/invalidation/bounds, blocking I/O/CPU inside the event
   loop, repeated serialization and excessive logging. Explain the mechanism and scale;
   ask for measurement when the finding depends on a disputed runtime assumption.
5. **Test adequacy**: regression coverage of the changed contract and error paths, deterministic
   meaningful assertions, realistic integration boundaries, fixture isolation, teardown,
   mocks that do not merely reproduce implementation, and tests that fail for the original
   bug. Small reversible documentation/style changes do not justify synthetic unit tests.

Use additional narrowly named focuses when the task needs them (e.g. migrations or numerical
stability). Do not turn optional style preferences into blocking findings. A concrete bug in
another focus may always be reported; deduplicate it in the journal.

## Mandatory general review

After ALL required focused passes approve, invoke a separate fresh Reviewer task with focus
`general` on the SAME frozen candidate SHA, before QA. This is required even for tiny changes;
it cannot be folded into a focused pass or replaced by an orchestrator's report aggregation.
Pass original requirements, the phase/overall plan, full baseline diff, focused reports,
finding dispositions and Coder's responses. The reviewer independently inspects the solution:

- Does the complete result solve the original task, with every requirement covered?
- Do changes to components, interfaces and error paths work together coherently?
- Are there gaps at focus boundaries or incompatible assumptions in individually valid fixes?
- Have iterative fixes introduced contradictions, avoidable complexity or unrelated scope?
- Does the solution fit the project's architecture and supported versions as a whole?

Prior focused approval is context, not proof. Apply the same evidence/severity/closure rules
to general findings and preserve their IDs across fixes. General CHANGES_REQUESTED returns
to Coder through the journal if round budget remains; BLOCKED cannot be treated as approval.
Focused plus general reports for one candidate form ONE round, not six separate rounds.
If a focused pass fails, general review may be skipped for that failed candidate; the failed
round still counts. Only candidates with both focused and general approval can proceed to QA.
The maximum is 32 rounds per task/phase; the counting/recovery rules are in workflow.md.

## QA selection and evidence

- Coder owns authoring/fixing tests; QA independently executes them on the candidate SHA.
- Use the required project check order. Run focused checks during iterations and the
  project's required completion checks before integration. Include affected integration
  scenarios and final cross-phase checks. Broaden once when justified, not endlessly.
- Record baseline failures before implementation where practical; a pre-existing failure
  remains visible and needs explicit disposition, not a false PASS.
- A configured command that requires unavailable data/credentials/service is BLOCKED.
  Report the exact missing prerequisite and which acceptance criterion remains unverified.
- Preserve the first failure; no retries to obtain a pass. Follow scenario-specific runner,
  archive, continuation, cleanup and rerun policies. Read linked scenario documents fully.
- Record exact command/working directory/exit status, meaningful output, log/archive paths,
  tested SHA and unexpected file modifications. Never infer success from exit code alone
  where the scenario also requires evidence, artifacts or cleanup.

Repository-specific policies belong in that repository's AGENTS.md/scenario documents,
not in this global skill. They continue to apply when work happens in a linked worktree.
