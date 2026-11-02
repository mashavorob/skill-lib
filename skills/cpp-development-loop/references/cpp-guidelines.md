# C++ implementation, review and QA

## Discover the project's contract

Read root and affected nested AGENTS.md, build files and presets, toolchain files,
dependency manifests/lockfiles, CI, test configuration and contribution guidance.
Record:

- Supported C++ standard, compiler versions, standard-library implementations,
  target platforms/architectures, and the toolchain actually used for checks.
- Build system, generator, configuration and relevant compile definitions/options.
  Use documented presets and commands; do not assume CMake, Ninja, Conan or vcpkg.
- Dependency versions, generated-source ownership, required submodules and offline
  SDK/data/service requirements. Do not change dependencies just to make setup pass.
- Required build, formatting, static analysis, test and integration checks and their
  order. Read project-specific sanitizer and benchmark policies.
- Behavioral contracts: ownership/lifetime, error handling, ABI/API boundaries,
  persistence/protocol compatibility, threading, ordering and latency guarantees.

An isolated worktree may lack build trees, generated files, ignored fixtures and SDKs.
Configure/build in documented worktree-local locations. Do not reuse a sibling's build
tree or mutate dependencies to satisfy a check. Inspect external dependencies read-only.
Resolve real dependency paths and versions rather than guessing sibling names or indexes.

## Canonical review profiles

The roster below adapts the imported C++ focus profiles to the shared workflow. Run
one fresh `cpp-reviewer` per applicable narrow profile on the SAME baseline/candidate.
Then run a separate fresh `general` review after the narrow profiles approve and
before QA. All these reports form ONE round; use the shared 32-round budget.
There are no model-pinned tiers or separate correction budgets.

Record a concrete scope-based NOT_APPLICABLE reason for an irrelevant narrow profile.
Do not substitute that result for missing access, unsupported tools or insufficient
evidence. Correctness and general are always applicable. Unknown focus names are BLOCKED.
Keep reviews bounded to the assigned diff and its impacted interfaces/callers.

### correctness

Check behavior, requirement completeness, unsupported behavior still exposed,
regressions, sequencing and protocol rules, error handling, test adequacy, and
accidental unrelated changes. Inspect C++ ownership and lifetime, RAII/resource cleanup,
dangling references/views/iterators/captures, use-after-move, invalidation, bounds,
uninitialized values, undefined behavior, integer overflow and exception guarantees.
Check ABI, alignment, serialization and platform assumptions where the change affects them.

### duplication

Look for repeated algorithms, validation, mappings and invariants within the change
and against existing project code, including scripts and workflow logic. Cite both
locations and explain what should have one source of truth. Similar syntax alone
does not justify extraction; do not couple different responsibilities or lifecycles.

### data-duplication

Unlike repeated logic, inspect duplicate authoritative state, redundant stored/derived
fields, repeated constants/tables and needless retained copies. Cite both representations,
their owners and update paths. Explain a bounded correction and concrete consistency,
memory or maintenance benefit; similar values alone do not prove duplication.

Preserve justified caches, snapshots, independent protocol representations and
ultra-low-latency layouts. Verify semantics, lifetime and allocation/latency costs
before consolidating; do not refactor untouched data.

### cpp20

For changed C++ code, consider simpler, safer C++20 facilities: concepts/requires
instead of elaborate SFINAE, suitable ranges/algorithms, `std::span` for appropriate
non-owning contiguous views, and standard facilities instead of handwritten equivalents.
Verify the actual compiler, language mode and standard-library support first.

Explain the reduction in manual logic, invalid states or maintenance burden. Verify
lifetime, semantic equivalence and runtime cost. Do not demand syntax upgrades or
modernize untouched code. If the project targets an earlier standard, record that
this C++20-specific profile is NOT_APPLICABLE; correctness and simplification still
review changed C++ using supported facilities. Supporting C++20 is not an installation
or workflow prerequisite.

### reuse

Applicable when changed application code or support scripts implement or integrate
potentially shared utilities, types, algorithms or infrastructure. Prompt/documentation-
only changes do not make it applicable. Search the current repository and its actual
documented dependencies, using graph tools when available and direct reads otherwise.
Confirm candidate definitions against the dependency version the project actually uses.

For a proposed replacement cite the existing symbol and source. Compare semantics,
errors, ownership, lifetime, thread safety, dependency direction and allocation/latency
behavior. Similar names do not prove interchangeability. Briefly report searched areas
and rejected candidates. Do not propose modifying dependencies as part of reuse.
If necessary dependency evidence remains inaccessible, return BLOCKED rather than
claiming approval or inapplicability.

### architecture

Inspect changed responsibilities, state ownership, interfaces, dependencies and
orchestration, including workflows. Check separation of concerns, dependency direction,
component boundaries, duplicated ownership and unnecessary abstractions. Establish
whether headers are internal or public from the project's actual contract; do not
impose public-library guarantees on internal application interfaces, or ignore a real
public API/ABI. Cite a concrete boundary problem and bounded correction, not a speculative
framework or broad redesign.

### latency-concurrency

Applicable to changed runtime paths or lifecycle/ownership changes that affect them.
Inspect allocations, blocking operations, locks, syscalls, copies, unbounded work and
worst-case complexity on latency-critical paths. Check races, object lifetime, thread
ownership, publication and atomic memory ordering against the real threading model.
Distinguish initialization from hot-path work and demonstrate reachability before
claiming a latency regression. Preserve allocation-freedom, determinism, backpressure
and delivery guarantees where contracted. Explain the mechanism and scale; never
invent benchmark results or equate lock-free code with correctness.

### simplification

For changed logic, including scripts/workflows, look for equivalent behavior with
less: dead/unreachable code, redundant state, branches or conversions, needless
indirection, pass-through wrappers, one-use helpers that obscure their call site,
over-general templates/options with a single user, and comments restating code.
This differs from duplication (one logic in two places) and cpp20 (language facilities).
Show the simpler form and justify equivalence, including lifetime and error behavior.
Never trade latency determinism, allocation-freedom or protocol sequencing for brevity.

### general

Independently review the whole solution: requirement completeness, fit with the
surrounding design and AGENTS.md conventions, consistency of tests/config/examples/docs,
interactions between components/fixes, cross-focus gaps and unnecessary complexity.
Inspect the code/contracts rather than merely summarizing focused approvals; do not
repeat every narrow deep dive. General is always applicable. A standalone general
review is a complete review of its assigned scope, but does not itself grant workflow
QA or integration approval.

## Findings and acceptance

Use the shared workflow's APPROVED, CHANGES_REQUESTED and BLOCKED verdicts, stable
finding IDs, evidence and closure conditions. A narrow NOT_APPLICABLE result requires
its documented scope reason. Classify findings as MUST_FIX or OPTIONAL; do not import
the source bundle's model tiers, 24/48/48 counters or automatic quality-improvement gates.

A blocking finding needs a concrete failure or explicit requirement violation, with
location/symbol, scenario, consequence and verifiable closure condition. Bounded quality
improvements must explain their real consistency/memory/maintenance benefit; unless
required for correctness or an explicit acceptance criterion, report them as OPTIONAL.
Do not invent findings to fill a quota or turn tool/style preferences into blockers.
Retain earlier IDs and re-evaluate previous fixes/disputes against current evidence.

## QA selection and evidence

- Coder authors/fixes tests; QA independently builds and executes on the exact candidate.
  Follow configured check order, toolchains, build variants and completion requirements.
  Use focused checks while iterating and meaningful final integration checks.
- Compile affected targets and relevant consumers when templates, headers or interfaces
  change. Record actual compiler/library/platform coverage and untested required variants.
- Run configured static checks, unit/integration tests and documented scenarios. Use
  ASan/LSan, UBSan, TSan or Valgrind when required by project/task evidence. Keep incompatible
  sanitizer builds separate; do not claim a clean compile proves lifetime/thread safety.
- Interpret diagnostic logs as well as exit codes: memory errors, leaks, data races,
  undefined behavior and nonzero Valgrind error summaries require disposition. Do not
  hide errors with new suppressions or weakened checks to obtain approval.
- Follow local scenario runner, sequencing, evidence, archive and cleanup policies.
  Missing local testbed instructions are a blocker only when that testbed is required.
  Do not impose a particular connector, scenario directory or regression-pack name.
- Capture the first failure and baseline evidence. No retry just to turn a result green;
  any project-permitted diagnostic rerun retains original evidence and its reason.
- Report exact commands, working directories, build/toolchain settings, exit codes,
  artifact/log paths and cleanup. Missing tools/SDKs/services are BLOCKED, never PASS.
  Do not kill pre-existing processes or modify sources, fixtures or acceptance criteria.

Repository-specific operating rules belong in that repository, not this global skill.
