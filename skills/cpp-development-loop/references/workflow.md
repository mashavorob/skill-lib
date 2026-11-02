# C++ orchestrator protocol

Read the complete [shared orchestrator protocol](../../py-development-loop/references/workflow.md).
The linked protocol is mandatory, not optional background. It defines owned worktrees,
Git integration, journals, persistent finding IDs, 32-round budgets, SHA-bound focused
and general review/QA gates, compaction, recovery, squash and local cherry-pick.

Use `cpp-development-loop` as the active skill and
[cpp-guidelines.md](cpp-guidelines.md) as its language guidelines. Map all protocol roles
to `cpp-developer`, `cpp-sprinter`, `cpp-coder`, `cpp-reviewer`, `cpp-qa` and
`cpp-sprint-planner`. Record the actual C++ orchestrator in the journal's `mode` field.
The Python `mode` in the shared example is illustrative, not a C++ routing instruction.

Select applicable C++ profiles from the C++ guidelines. Record scope-based reasons for
inapplicable narrow profiles; correctness and general are always applicable. A justified
NOT_APPLICABLE disposition satisfies only that narrow focus's applicability check, not
the whole review. Missing evidence is BLOCKED. Run general independently after all
applicable narrow profiles approve, before QA, within the same review round.
