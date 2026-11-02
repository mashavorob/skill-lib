---
name: cpp-development-loop
description: Use ONLY for the cpp-developer/cpp-sprinter workflow or its cpp-coder, cpp-reviewer, cpp-qa and cpp-sprint-planner handoffs; defines C++ focused reviews using the shared journaled development and Git integration protocol.
---

# C++ development loop

A user-wide C++ workflow with inherited models. Primary agents: `cpp-developer`,
`cpp-sprinter`. Subagents: `cpp-coder`, `cpp-reviewer`, `cpp-qa`, `cpp-sprint-planner`.
Use the user's language in reports. Role names in the shared protocol map to these
agents: Developer, Sprinter, Coder, Reviewer, QA and Planner, respectively.

## Required reading

- Developer and Sprinter: read [workflow.md](references/workflow.md) and the linked
  shared protocol completely before changing Git state or invoking implementation/review/QA.
- All roles: read [cpp-guidelines.md](references/cpp-guidelines.md) and applicable
  project instructions. The C++ guidelines are the canonical review-focus roster.
- For initial use and recovery, see [usage.md](references/usage.md).

Resolve these files relative to this skill's directory, not the current project.
Install this skill together with `py-development-loop` and `plugins/py-sprinter-compact.js`:
they supply the shared Git protocol and native compaction runtime.

## Invariants

1. Discover project-specific C++ standards, compilers, libraries, build systems and CI.
   Do not prescribe C++20, CMake, a package manager or a test framework for every project.
2. Only Coder implements application changes and commits on the assigned owned branch.
   Only the orchestrator writes the journal, manages branches/worktrees and integrates.
   Reviewer is read-only; QA executes checks and reports without repairing source.
3. Use an owned local branch/worktree, absolute handoff paths and exact SHAs. Preserve
   user work. Persist findings/reports and relevant lessons before the next iteration.
4. Serialize implementation writes. Reviews and QA apply only to the frozen exact SHA.
   All applicable narrow profiles must pass or have evidenced NOT_APPLICABLE dispositions,
   followed by a separate independent `general` review before QA. Missing checks never pass.
5. Focused and general reviews of one candidate form ONE round, with at most 32 rounds
   per Developer task or Sprinter phase. Preserve closed and active counts across resume;
   never reset budgets by renaming or splitting unfinished work. Round 32 may finish QA
   and integration, but another required correction stops before Coder/round 33.
6. One task or phase yields one reviewed/tested squash commit, cherry-picked locally.
   Never push, skip hooks, change Git config or rewrite target history. Preserve recovery
   evidence and the pre-squash history. Follow the shared protocol for all Git operations.
7. Sprinter checkpoints and confirms native same-session compaction before EVERY phase,
   including phase 0. Use `sprinter_compact` and recover from the journal before starting.
8. Permissions are tool-level guardrails, not an OS sandbox. Do not bypass role boundaries
    through shell/MCP tools. Keep dependency repositories read-only unless the task explicitly
    establishes a separate authorized implementation scope there.
    Agents allow tools and external paths broadly; role boundaries and Git rules remain
    mandatory instructions. Never run sudo, including indirectly through scripts or wrappers.
