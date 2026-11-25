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
    second request or ask the user to run `/compact`. A `not_submitted` result
    means this call stopped before sending a request. Resolve the reported error
    and reconcile the ledger before reattempting `enter`.
3. On continuation call `action: "status"`. Continue only when it confirms
   `ready` for the same phase and plan. This is a workflow gate, not a tool
   execution block. If a request is blocked or its outcome is unknown, stop and
   reconcile the saved ledger and native history before resuming; never retry
   automatically. If OpenCode refused permission or the saved call confirms
   cancellation before submission, reconcile the ledger and wait for user
   authorization before calling `enter` again. If the plugin/tool
   is unavailable before any request, report the missing gate explicitly and
   continue only from the verified ledger.
4. During longer phases call `action: "note"` with the current `phase` and a
   compact `note` before large operations. Keep the authoritative state in the
   ledger, including the TODO snapshot, planned next action, original refs,
   coding attempts, and brief version/hash, review round, dispositions/readiness
   when applicable. A compaction summary is not authority to reset counters,
   reopen completed work or advance scope. On authorized continuation, verify
   the actual state and restore native TODOs as needed.
5. After verified delivery, cleanup and recording the phase result, call
   `action: "clear"` with that phase ID before entering the next approved phase.

The plugin polls a limited window of recent messages for the native request
marker. `ready` requires a saved request ID and a successful summary. If OpenCode
queues a second Sprinter auto-compaction marker immediately after the confirmed
phase marker, the summary may refer to that second marker; the receipt then
reports both IDs. A nearby marker cannot confirm an unrecorded request after a
reload. A late request failure blocks `status` if there is no matching successful
summary, and the saved failure receipt survives reloads. The plugin recovers receipts
and notes from session history and adds recovery context to Sprinter summaries.
In OpenCode 1.19.6, `session.summarize` accepts the provider and model IDs but
not the selected variant. Automatic continuation from that marker uses the
model alias defaults; configure Sprinter's reasoning on the alias itself.
Switching agents is not permission to resume. There is no background resume or
retry scheduler; use a new session to get a clean conversation and carry over
only the verified ledger/handoff on an authorized resume.
