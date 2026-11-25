# Shared agent rules

Read `.opencode/PROJECT.md` first for harness locations, commit conventions and
cleanup defaults. Then read the canonical project root's `AGENTS.md`, applicable
nested `AGENTS.md` files and component guides.

`AGENTS.md` is the authority for project identity, language/toolchain, setup,
build, test, lint, QA scenarios/runners and verification commands, including
documents it references. Do not infer commands from filenames or rewrite project
instructions to fill gaps. Missing required instructions are a real blocker.

## Language skills

Select language guidance from the approved scope, applicable project instructions
and actual affected components, not a repository-wide language guess or a new
`PROJECT.md` field. For Python planning, implementation, corrections, review or
verification, load `python-development` with the `skill` tool before substantive
work. Also load `python-memory` for Python runtime/data-flow changes involving
collections, copies, retention, caches, queues, workers/tasks or large inputs;
for explicit memory work; and for a Python `latency-concurrency` review. Pure
documentation/configuration changes with no such consequences need no memory skill.
Inspect the changed path to determine applicability; do not require measurements
merely to select a skill. For non-Python work do not load Python skills by default.

The parent records affected languages/components, selected skill IDs, applicable
interpreter/runtime constraints, memory risks and required evidence (or why no
measurement is needed) in the unit ledger and each relevant worker packet/brief.
Each new or replacement worker session loads the selected skills itself; a parent
loading a skill does not load it into a child. Reconcile this context on resume or
scope drift without resetting progress. Missing required skills are `BLOCKED`;
report the exact ID instead of installing tools or silently skipping guidance.

Python skills live under `.opencode/skills/<id>/SKILL.md` in the project. They refine language guidance,
not task authorization or role permissions: reviewers/planners do not execute
tests/profiling, QA runs documented scenarios only, and git-delivery needs no
language skills for its metadata-only transfer. Project/user requirements win.
In mixed Python/C++ work apply each component's requirements and inspect binding
ownership/copies/lifetimes; preserve existing C++ latency/concurrency guarantees.

## Regression coverage

For bug fixes and new nontrivial behavior, implementers add or extend focused
runnable regression coverage in the existing project test system. Check the
changed behavior, preferably with a test that fails on the original defect.
Existing coverage may suffice when it already exercises that contract; do not
add redundant tests for a quota or mandate tests for trivial prose edits.

Tests assert the public contract and documented resource/lifetime constraints,
not a particular algorithm, private structure or unrequested ordering. Accept
other implementations that meet the same contract. Do not impose stricter bounds
than the requirements: a resource check must distinguish a contract violation
from a valid bounded implementation. Preserve validation and required runtime
guarantees; additional tests are useful only when they test a real requirement.

Use the approved tooling; do not introduce a test framework just for this rule.
If meaningful coverage cannot be added or run within scope, report the limitation
and needed verification, not a passing result. Missing explicitly required checks
remain blockers. Planners propose coverage; reviewers inspect source and existing
evidence without executing tests or changing code. Role and review gates do not change.

## Project documentation

Project documentation must describe only the project's current state. This
applies especially to root and nested `AGENTS.md` files: update or remove stale
guidance in scope rather than appending a record of what changed. Never recount
development history in `AGENTS.md`.

Git is the source of truth for development history. Only the development plan
and documents explicitly designated to record history (such as a changelog) may
include it.

## C++ optional values

Prefer an unambiguous sentinel value over `std::optional` where practical:
`0`, `-1`, `nullptr`, `std::numeric_limits<T>::max()`, an empty string or an empty
collection. Use a sentinel only when it cannot be confused with a valid value;
this is a preference, not an unconditional ban on `std::optional`.

## Error diagnostics and logging

When an application uses logging, log full error diagnostics where the error
originates. Pass callers only the minimum information needed to handle the error
correctly, rather than propagating full diagnostics through the call chain.

## Necessary, concise comments

- Add a comment only for necessary knowledge not clear from the code: why a
  non-obvious decision is required, an invariant, constraint or safety hazard.
  Prefer clearer names and structure to narration of what the code does.
- Normally use one or two physical lines per comment block. Longer blocks are
  exceptional: retain only information needed for a safe contract, invariant or
  safety explanation that cannot be shortened without losing necessary meaning.
  Do not evade this limit with oversized lines or split adjacent blocks.
- Do not add obvious headings, change histories, verification reports or
  commented-out code. Put substantial guides and examples in project documentation.
- Update or remove explanations made stale by an in-scope behavior change. Do not
  sweep unrelated code, erase necessary contracts or add churn to lower a count.
- Preserve required license notices, generated content and tool directives;
  their syntax and required documentation contracts take precedence over brevity.

## Mistake-prevention permissions

Models are trusted to follow their assignment, but can choose mistaken paths or
commands. Harness roles inherit Bash permissions from OpenCode and user/project
configuration; there are no shipped command filters or cleanup grants. Native
rules permit task-relevant external inspection and, for writable roles, ask before
direct native edits matching external path patterns. Read-only roles retain the
native edit denial; other roles may edit files without scratch registration.
Broad shell permission does not override read-only, delegation, scope or cleanup instructions.

In OpenCode 1.19.6, per-agent Bash rules take precedence over matching top-level
rules. A top-level `permission.bash: "deny"` does not disable Bash for a harness
role whose own rules allow it. Check effective per-agent permissions before
relying on a Bash restriction.

Directory inference by the shell scanner is **best effort**. Scripts, tools and
programs may access paths not inferred from command text; these rules are **not a sandbox**.
Do not claim containment or read-only isolation for arbitrary shell programs.
Use OS isolation when hard filesystem/process/network boundaries are required.

Read task-relevant installed libraries, SDKs, headers, configuration and tool
outputs wherever they live; no directory allowlist or colleague-specific path
inventory is required. No blanket `read` allow overrides native `.env` prompts or
explicit read restrictions. Directory access alone never authorizes external edits.
OpenCode 1.x matches native edits against worktree-relative paths. Writable roles
ask for parent-relative (`../...`) or absolute external paths; read-only roles and
built-in Plan keep their stronger restrictions. Inspect approval patterns and
prefer one-time or explicitly folder-scoped edit grants, not a blanket write grant.

## Protected secrets and managed captures

Treat these home-relative paths and everything beneath them as off limits. The
native `read` and `external_directory` rules deny matching resources; OpenCode
1.x can report a relative path or containing directory instead of the exact
operand, so a call that does not prompt is not authorization:

- `~/.ssh`
- `~/.secret` and `~/.secrets`
- `~/.config/secret` and `~/.config/secrets`
- `~/.config/.secret` and `~/.config/.secrets`
- `~/.config/.sercrets` (literal compatibility spelling)
- `~/.config/opencode/secret` and `~/.config/opencode/secrets`

Do not access these secrets through shell, scripts, imports, symlinks, aliases or
another tool. Avoid recursive searches over ancestors containing protected paths;
scope searches to the actual library/project directories instead. These are exact
roots, not a ban on any name containing `secret`: a dependency's `secrets.py` is
ordinary source. This list is not universal credential detection. Native per-tool
rules and best-effort shell scanning do not constrain arbitrary programs, recursive
ancestor searches or symlink targets. Even a direct shell `cat` can bypass native
read denials; use OS isolation for a hard secret boundary.

When shell output is truncated, read the service-reported capture using bounded
`read` offsets/limits, including custom data roots, without directory approval.
Captures are service-owned, read-only evidence, not task scratch. Never edit,
overwrite, delete or clean them, including through shell/scripts. Native edits in
the standard external OpenCode `tool-output/` location are denied. Do not browse
unrelated captures. Keep task-generated logs in the assigned project-local capture
directory. Never create or use capture symlinks/aliases to reach unrelated files;
path rules are not shell/OS read-only isolation or symlink-target containment.

`Allow once` approves one pending request. In OpenCode 1.19.6, `Allow always`
keeps the tool's proposed patterns in the running project instance. Inspect
them and avoid blanket external-write grants. When OpenCode checks a request,
a matching `Allow always` rule is evaluated after configured rules and can
override a `deny` if the tool is still available. Use OS-level isolation for
hard access limits. Non-interactive clients must decide or report a pending
write/deletion request as blocked. Never bypass a required edit approval using shell.

## Paths and operations

`PROJECT.md` records the canonical project root and its `.opencode/` location.
Set shell `workdir` explicitly to the canonical root for project work.
An authorized read-only dependency query may use its root without directory
approval. Do not guess a path, change cwd or use another tool to evade a rejection.

Use ordinary shell quoting, pipelines, searches, interpreters and capture files
when appropriate to the role. Put temporary notes/captures under project-relative
`tmp/<unit-id>/<attempt-id>/` by default. Create directories normally and reuse
known task-owned scratch when safe; no plugin registry or mandatory first write
is needed. Record actual output paths, originating cwd and ownership in the ledger
before workers run. Existing or untracked files are not proof of disposability.
External scratch needs a known cleanup owner and approved native writes; it is
not automatically authorized merely because reading the directory is allowed.

Run each Git mutation or deletion separately in the foreground and inspect its
actual result. Approval is not authority to perform an out-of-scope operation.
Before deletion, verify the resolved target, ownership or reproducible
generated-only contents, stopped writers/consumers and lack of tracked/user
files; never delete the project root or shared temporary roots.
Follow `artifact-cleanup.md`, preserve recovery evidence until other cleanup is
verified, and do not turn a rejected command into a script or larger operand.
Known unit-owned `tmp`/artifact leaves and verified reproducible `build/`, `dist/`
or nested build outputs need no separate workflow question at successful closeout.
Honor configured tool permissions and account for all cleanup paths before delivery.
Build roots may be removed in full after writers/consumers stop; names/ignored
status alone do not prove safe contents. Use the standard project-relative
`rm -f -- <path>` or `rm -rf -- <path>` recipes. There is no cleanup hook; the parent
owns the path, ownership, writer and retention checks. Shared temporary/evidence
roots stay in place, even when empty.
Run deletion and read-only absence verification in separate calls, not
`rm; echo; ls` chains.

Take exit status from the `OpenCode shell exit code` line appended to the tool
result. If it is unavailable, do not infer success from empty output. Nonzero
command outcomes are not permission rejections: ancestry false and diff differences
can legitimately return 1. On a rejection report exact command/path, cwd, executing
role, error and pending action.

- Follow approved scope, user decisions and project conventions; preserve unrelated work.
- The working area is the whole canonical project, including new files/directories.
  No per-file inventory or profile update is required. Product edits still belong
  to coder, accepted delivery to git-delivery, and closeout cleanup to the parent.
- External repositories remain read-only unless the user or project instructions
  authorize changes there. Read access alone does not authorize modifying
  another repository or expanding a task.
- Permission rules catch common mistakes, not every equivalent program or spelling.
  Never bypass a denial through scripts, shell aliases, other tools or delegation.
- Configuration changes do not resume paused work, reopen completed phases or
  authorize commits. Honor the user's selected scope and stop boundary.
- Distinguish observation from inference. Report blockers with evidence and the
  exact resumption condition, not fabricated successful checks.
