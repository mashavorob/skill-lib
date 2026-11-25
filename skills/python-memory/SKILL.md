---
name: python-memory
description: "Design or review memory-efficient Python code and investigate memory regressions: peak/retained memory, large inputs, copies, caches, queues, task fan-out, object retention and Python/native allocations. Use for Python runtime/data-flow changes with memory risks, not only explicit out-of-memory reports."
---

# Python memory

Use within the assigned role and project instructions. This skill does not grant
permission to edit, execute profiling, install tools or expand QA. Reviewers and
planners inspect source and existing evidence only; coder/parent may run authorized
checks, and QA runs only documented scenarios. Keep evidence in assigned captures.

## Reason about the working set

1. Trace input size, processing stages, ownership and how many objects/bytes are
   simultaneously live. Distinguish steady-state retained memory, peak temporary
   memory and growth with input size or repeated operations. Separate startup
   costs from per-request, per-batch and long-lived service state.
2. Look for full materialization, repeated conversions, concatenation and copies,
   duplicate representations, oversized records and accumulated results. Prefer
   streaming, bounded batches and compact representations where semantics allow.
   A generator alone is not bounded if a downstream consumer collects everything.
3. Bound caches, queues, prefetch, pending tasks and workers by the real workload;
   item counts alone may not bound bytes when records vary in size. Check eviction,
   backpressure, cancellation and cleanup. Avoid creating all tasks before applying
   a concurrency limit. Multiprocessing can replicate state and serialization
   buffers; do not assume a worker count or fork makes sharing free.
4. Trace references retained by globals, caches, closures, callbacks, tasks,
   generators, exceptions and traceback frames. Check shutdown/error paths and
   repeated-operation lifetimes. A small view may keep a large backing buffer
   alive; avoiding a copy can increase retained memory.
5. At native/array/dataframe boundaries, inspect actual ownership, dtype/layout,
   views, copy behavior and library contracts. Do not prescribe a new data library,
   `__slots__`, weak references, manual `gc.collect()` or allocator tuning without
   evidence and compatibility checks. `sys.getsizeof` is shallow, not the size of
   an object graph.

## Preserve behavior

Before reducing storage, check repeatable iteration, random access, ordering,
exception/evaluation timing, snapshots, aliasing and resource lifetime. Preserve
justified caches and representations. Removing storage is useful only if total
working-set benefit survives downstream behavior and does not break correctness
or required throughput. Do not trade away native/C++ runtime guarantees in mixed
projects. Latency tuning is secondary unless the task or project requires it;
concurrency safety remains required.

## Measure the relevant quantity

- Measure when a task sets a memory target or a concrete risk needs runtime
  evidence. Do not add mandatory benchmarks or arbitrary universal memory limits
  to ordinary edits. Use authorized existing tools; unavailable required tooling
  is a prerequisite to resolve, not permission to install it.
- Define a representative workload, input sizes, warm-up, operation count,
  concurrency and lifecycle checkpoints. Compare baseline and changed code under
  equivalent conditions, preferably in fresh processes when allocator history
  would confound results. Record interpreter/build, environment, metric, units,
  command, peak/retained results and limitations. Avoid brittle exact-byte tests
  across interpreters/platforms; use approved budgets or scaling expectations.
- `tracemalloc` tracks traced Python allocations, not all native allocations or
  total process memory; it also adds overhead. Snapshot differences help locate
  retained traced allocations, while peak tracking answers a different question.
  A clean snapshot delta does not prove absence of large temporary peaks.
- RSS includes resident process memory; allocator arenas, fragmentation, shared
  mappings and native libraries affect it. High RSS alone does not prove a leak,
  and released objects need not immediately reduce RSS. A process high-water mark
  is a peak, not current usage; record platform-dependent units and whether child
  processes are included. Account for workers when assessing a process family.
- Correlate process-level growth with traced allocations and concrete ownership
  evidence. Repeated workload growth is evidence to investigate, not by itself
  proof of a specific leak. Do not claim native allocations are covered by
  `tracemalloc`, or call an unmeasured optimization a verified memory saving.

## Report by consequence

For a finding or change, give the reachable path, data size/lifetime, retained or
peak cost, observation versus inference, smallest bounded fix and needed check.
Memory/resource issues belong to `latency-concurrency`; redundant authoritative
copies/complexity may belong to `simplification`, and behavioral/resource-lifetime
defects to `correctness` or `general`. Follow the assigned focus rather than
inventing a sixth review profile. Static evidence can establish an unbounded
retention path without a fabricated measurement; disclose unknown magnitudes.
