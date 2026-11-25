---
description: "Independent final-tier read-only review using the shared reviewer profiles and report contract."
mode: subagent
model: openai/reviewer
permission:
  bash:
    "*": allow
    "sudo *": deny
    "rm *": ask
    "rmdir *": ask
    "unlink *": ask
    "git *reset *": ask
    "git *clean *": ask
    "git *restore *": ask
    "git *checkout *": ask
    "git *rebase *": ask
    "git *push *": ask
    "git *commit *--amend*": ask
    "sudo": deny
    "*/sudo *": deny
    "* sudo *": deny
    "* */sudo *": deny
  external_directory:
    "*": allow
    "~/.ssh": deny
    "~/.ssh/*": deny
    "~/.secret": deny
    "~/.secret/*": deny
    "~/.secrets": deny
    "~/.secrets/*": deny
    "~/.config/secret": deny
    "~/.config/secret/*": deny
    "~/.config/secrets": deny
    "~/.config/secrets/*": deny
    "~/.config/.secret": deny
    "~/.config/.secret/*": deny
    "~/.config/.secrets": deny
    "~/.config/.secrets/*": deny
    "~/.config/.sercrets": deny
    "~/.config/.sercrets/*": deny
    "~/.config/opencode/secret": deny
    "~/.config/opencode/secret/*": deny
    "~/.config/opencode/secrets": deny
    "~/.config/opencode/secrets/*": deny
  read:
    "~/.ssh": deny
    "~/.ssh/*": deny
    "~/.secret": deny
    "~/.secret/*": deny
    "~/.secrets": deny
    "~/.secrets/*": deny
    "~/.config/secret": deny
    "~/.config/secret/*": deny
    "~/.config/secrets": deny
    "~/.config/secrets/*": deny
    "~/.config/.secret": deny
    "~/.config/.secret/*": deny
    "~/.config/.secrets": deny
    "~/.config/.secrets/*": deny
    "~/.config/.sercrets": deny
    "~/.config/.sercrets/*": deny
    "~/.config/opencode/secret": deny
    "~/.config/opencode/secret/*": deny
    "~/.config/opencode/secrets": deny
    "~/.config/opencode/secrets/*": deny
  edit: deny
  task: deny
  question: deny
  sprinter_phase: deny
---

You are the independent final-tier read-only reviewer. Read
`.opencode/PROJECT.md` and the complete body of `.opencode/agents/code-reviewer.md`
after its frontmatter; it defines your shared rules, canonical profiles and
report format. Its model and permissions are not inherited. Missing shared
instructions means `BLOCKED`.

Require tier `final`; use discovery unless targeted verification was supplied.
Full discovery independently inspects the accumulated diff, not another tier's
conclusions. Targeted checks stay within the supplied delta and impacted surfaces.
Do not fall back to another tier/model. Review-only remains read-only: return
findings without corrections, builds, QA or commits.
