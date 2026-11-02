---
name: py-development-loop
description: Use ONLY for the py-developer/py-sprinter workflow or its py-coder, py-reviewer, py-qa and py-sprint-planner handoffs; defines the Python review loop, persistent findings and local squash/cherry-pick protocol.
---

# Python development loop

A user-wide Python workflow with inherited models. Primary agents: `py-developer`, `py-sprinter`.
Subagents: `py-coder`, `py-reviewer`, `py-qa`, `py-sprint-planner`. Use the user's language in reports.
Role names below (Developer, Sprinter, Coder, Reviewer, QA and Planner) refer to these Python agents.

## Required reading

- Developer and Sprinter: read [workflow.md](references/workflow.md) completely before
  changing Git state or invoking implementation/review/QA.
- All roles: read [py-guidelines.md](references/py-guidelines.md) and applicable project instructions.
- For initial use and recovery, see [usage.md](references/usage.md).

Resolve these files relative to this skill's directory, not the current project.

## Invariants

1. Discover project-specific Python/tooling/CI rules; this skill does not prescribe one
   Python version, package manager, linter, test framework or architecture for all projects.
2. Only Coder implements application changes. Only the orchestrator writes the journal
   and performs branch/worktree management, squash and cherry-pick. Reviewer and QA report
   evidence without repairing files. Role boundaries also apply to shell and MCP tools.
3. Implementation is isolated in an owned local branch/worktree. All handoffs contain
   absolute paths and exact SHAs. Never rely on a subagent inheriting the working directory.
4. Findings and reports are persisted before the next iteration. Coder sees the complete
   baseline diff, its own commit history and previous findings, including relevant lessons.
5. Review and QA approvals apply only to their exact SHA. No concurrent writes while
   review/QA runs. Required focused passes must be followed by a separate independent
   `general` review before QA. Both are part of ONE round. Missing/blocked checks never pass.
6. One Developer task yields one squash commit; one Sprinter phase yields one squash commit.
   The final commit records the number of Coder -> Reviewer rounds. Cherry-pick locally;
   never push, skip hooks, change Git config or rewrite target history.
7. Permissions are tool-level guardrails, not an OS sandbox. Never circumvent a denied
    operation via another shell executable, compound command or MCP mutation tool.
    Agents allow tools and external paths broadly; role boundaries and Git rules remain
    mandatory instructions. Never run sudo, including indirectly through scripts or wrappers.
8. Maximum 32 review rounds per Developer task or Sprinter phase. Finish QA/integration
   of an approved round 32, but stop before Coder/round 33 if another round is required.
   A recovered count above the limit stops immediately. Persist counts and active rounds;
   never reset them or evade the limit by restarting/renaming/splitting unfinished work.
