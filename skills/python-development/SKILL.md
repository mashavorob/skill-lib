---
name: python-development
description: "Develop, plan, review or verify Python changes, including mixed Python/native projects. Use for Python implementation, corrections, tests, typing, resource management and async behavior; follow the project's interpreter, tooling and verification conventions."
---

# Python development

Apply this guidance within the assigned role and approved scope. Loading a skill
does not authorize edits, execution, dependencies, Git operations or extra work.
Reviewers and planners remain read-only and do not run builds/tests/profiling;
QA runs only its documented scenarios. Project instructions take precedence.

## Establish the contract

- Read the applicable `AGENTS.md` and linked component guides for supported Python
  versions/implementations, environments, dependencies and exact verification
  commands. Inspect relevant source and declared configuration to understand the
  contract, not to invent undocumented commands. Missing required instructions
  are a blocker, not permission to select a new toolchain.
- Use the project's existing environment and tools. Do not mandate or install
  pytest, uv, Ruff, mypy, a profiler or another dependency. Do not update lockfiles
  or create environments unless the assignment authorizes it.
- Keep syntax, standard-library APIs and typing compatible with the supported
  interpreter. Do not modernize unrelated code or add framework layers for style.
- For mixed Python/C++ changes, scope guidance to each component and inspect the
  binding boundary: ownership, copies/views, buffer lifetime, errors and threading.
  Preserve existing native/C++ latency, lifetime and memory-ordering requirements.

## Implement and inspect

- Prefer small explicit functions, clear ownership and existing abstractions.
  Introduce types where they clarify contracts; annotations alone do not validate
  runtime input. Preserve public signatures and serialization behavior.
- Check mutable defaults, aliasing, shallow versus deep copies, iterator
  exhaustion, ordering, missing/`None` distinctions and numeric/boundary behavior.
  Do not replace a reusable collection with a one-shot iterator without checking
  callers, exceptions, evaluation timing and resource lifetime.
- Use context managers or explicit `try/finally` for owned files, connections,
  locks and other resources. Do not rely on garbage collection or immediate
  CPython reference-count destruction for correctness.
- Catch exceptions at the boundary that can handle them; preserve useful causes
  and cleanup. Do not hide failures behind broad catches, silent defaults or
  returns from `finally`. Avoid retaining exception/traceback graphs unnecessarily.
- For async changes, inspect cancellation propagation, task ownership and joining,
  cleanup and blocking calls. Bound queues, task creation, prefetch and worker
  counts. The GIL does not make compound operations thread-safe; do not assume
  every interpreter/build has the same GIL or scheduling behavior.
- Treat memory as a design constraint for runtime/data-processing changes. Load
  `python-memory` under the shared selection rules; prefer bounded working sets
  over latency micro-optimizations unless the project explicitly requires latency.
  Correctness and required throughput still constrain any memory tradeoff.

## Concise Python docstrings

- A docstring documents an interface contract, not its implementation. Omit it
  for self-explanatory internal functions, classes and modules; do not require
  one for every definition or merely because a name lacks a leading underscore.
- Prefer a single physical line: `"""Return a single-use iterator that owns the file."""`.
  Apply the shared one-or-two-line norm and exceptional longer-contract rule.
- Do not repeat the name, type annotations or obvious parameters. Do not generate
  Args/Returns/Raises sections, examples or algorithm descriptions by default.
- When necessary, state non-obvious units, side effects, resource ownership,
  iterator consumption, boundary behavior or important error conditions.
  Preserve documented public API and project-required documentation conventions;
  move tutorials to external docs without removing a caller's essential contract.

## Verification and handoff

Coder runs the narrowest meaningful documented checks; the parent arranges final
verification. Use existing tests to cover normal, boundary and error paths, resource
cleanup, and cancellation when relevant. Apply configured type/lint checks without
imposing a new tool. Test commands and capture directories come from the assignment
and project instructions, not examples in this skill.

Require memory measurements when the task sets a memory target or a concrete risk
needs runtime evidence; do not benchmark every Python edit. Report supported
interpreter/environment, changed contracts, commands/results, actual evidence and
limitations. Planned or unavailable checks are not passing results. Reviewers
identify needed checks and assess supplied evidence without executing them.
