# Sprinter phase compaction

Keep native automatic compaction enabled (the OpenCode default). In addition,
`.opencode/plugins/sprinter-phase.js` provides the `sprinter_phase` checkpoint tool
for phase boundaries. The project ledger remains the authority for recovery.

1. Resolve the approved scope, phase, plan reference and original baseline.
   Record a concise, self-contained handoff with the ledger location, current
   TODO status and next action. Use the approved file path or a stable reference
   to an agreed conversation plan.
2. Call `sprinter_phase` **alone** with `action: "enter"`, exact `phase`, `plan`
   and `handoff`. The result `queued` only confirms that OpenCode received the
   native request. Let the session loop compact and continue; do not submit a
   second request or ask the user to run `/compact`.
3. On continuation call `action: "status"`. Continue only when it confirms
   `ready` for the same phase and plan. This is a workflow gate, not a tool
   execution block. If a request is blocked or its outcome is unknown, stop and
   reconcile the saved ledger and native history before resuming; never retry
   automatically. If the plugin/tool is unavailable before any request, report
   the missing gate explicitly and continue only from the verified ledger.
4. During longer phases call `action: "note"` with the current `phase` and a
   compact `note` before large operations. Keep the authoritative state in the
   ledger, including the TODO snapshot, planned next action, original refs,
   coding attempts, and brief version/hash, review round, dispositions/readiness
   when applicable. A compaction summary is not authority to reset counters,
   reopen completed work or advance scope. On authorized continuation, verify
   the actual state and restore native TODOs as needed.
5. After verified delivery, cleanup and recording the phase result, call
   `action: "clear"` with that phase ID before entering the next approved phase.

The plugin correlates the request with a successful native summary in the same
session, and recovers tool receipts and notes from saved session history. It
adds recovery context to Sprinter compaction summaries, not to Plan/Build turns.
Switching agents is not permission to resume. There is no background resume or
retry scheduler; use a new session to get a clean conversation and carry over
only the verified ledger/handoff on an authorized resume.
