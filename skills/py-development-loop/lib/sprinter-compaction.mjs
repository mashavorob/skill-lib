import { setTimeout as delay } from "node:timers/promises";

// The native summarize endpoint queues a compaction and then awaits the session
// loop. Awaiting that response from a tool in the same loop would deadlock.
export function createCompactionController(client, { queueTimeout = 10_000, pollInterval = 25 } = {}) {
  const pending = new Map();
  const key = (args) => JSON.stringify([args.checkpoint, args.phase]);
  const receipt = (record, status, extra = {}) => ({
    status,
    sessionID: record.sessionID,
    checkpoint: record.checkpoint,
    phase: record.phase,
    nativeRequestID: record.nativeRequestID ?? null,
    ...extra,
  });

  async function messages(context) {
    const response = await client.session.messages({
      path: { id: context.sessionID },
      query: { directory: context.directory },
      throwOnError: true,
    });
    if (response.error || !Array.isArray(response.data)) {
      throw new Error("Cannot read native session history; compaction is not confirmed.");
    }
    return response.data;
  }

  function restore(history, args, context) {
    for (const message of [...history].reverse()) {
      if (message.info.id === context.messageID) continue;
      for (const part of [...message.parts].reverse()) {
        if (part.type !== "tool" || part.tool !== "sprinter_compact") continue;
        const input = part.state?.input;
        if (input?.action !== "request" || key(input) !== key(args)) continue;
        let saved = part.state?.metadata?.sprinterCompaction;
        if (!saved && part.state?.output) {
          try { saved = JSON.parse(part.state.output); } catch { /* Not a receipt. */ }
        }
        if (saved?.sessionID === context.sessionID && saved.nativeRequestID) {
          return { ...saved, key: key(args) };
        }
        // An interrupted/unknown previous request may already have reached the
        // server. A plugin reload is not permission to submit it a second time.
        return { sessionID: context.sessionID, checkpoint: args.checkpoint, phase: args.phase,
          key: key(args), uncertain: true };
      }
    }
  }

  function inspect(record, history) {
    const summary = history.find((message) =>
      message.info.role === "assistant" && message.info.summary === true &&
      message.info.parentID === record.nativeRequestID && message.info.time?.completed,
    );
    if (summary?.info.error) {
      return receipt(record, "failed", { summaryMessageID: summary.info.id });
    }
    if (summary?.info.finish && summary.parts.some((part) => part.type === "text" && part.text.trim())) {
      record.completed = true;
      return receipt(record, "completed", { summaryMessageID: summary.info.id });
    }
    if (record.uncertain) return receipt(record, "unknown", { error: "An earlier request has no confirmed receipt. Inspect native session history; do not resubmit." });
    if (record.error) return receipt(record, "failed", { error: record.error });
    return receipt(record, record.nativeRequestID ? "queued" : "unknown");
  }

  async function execute(args, context) {
    if (!["py-sprinter", "cpp-sprinter"].includes(context.agent)) {
      throw new Error("sprinter_compact is restricted to the py-sprinter and cpp-sprinter agents.");
    }
    if (!args.checkpoint.startsWith("/") || !args.phase.trim()) {
      throw new Error("Supply the absolute run journal path and the phase ID.");
    }
    await context.ask({
      permission: "sprinter_compact",
      patterns: [`${args.checkpoint}#${args.phase}`],
      always: [],
      metadata: { phase: args.phase },
    });
    let history = await messages(context);
    let record = pending.get(context.sessionID);
    const restored = restore(history, args, context);
    if (record?.key !== key(args)) {
      if (record && inspect(record, history).status !== "completed") {
        throw new Error("Another phase compaction is unresolved in this session. Check its status first.");
      }
      record = restored;
    }
    if (record) {
      pending.set(context.sessionID, record);
      return JSON.stringify(inspect(record, history));
    }
    if (args.action === "status") {
      return JSON.stringify({ status: "unknown", checkpoint: args.checkpoint, phase: args.phase,
        sessionID: context.sessionID, error: "No matching native compaction receipt. Do not mark the gate complete." });
    }
    if (context.abort.aborted) throw new Error("Compaction request cancelled before submission.");

    const user = [...history].reverse().find((message) => message.info.role === "user" && message.info.model);
    if (!user) throw new Error("Cannot determine this session's selected model.");
    const existing = new Set(history.map((message) => message.info.id));
    record = { sessionID: context.sessionID, checkpoint: args.checkpoint, phase: args.phase, key: key(args) };
    pending.set(context.sessionID, record);

    // Intentionally detached. The host loop must regain control to process the
    // native compaction. Observe the queued message instead of awaiting this API.
    void Promise.resolve().then(() => client.session.summarize({
      path: { id: context.sessionID },
      query: { directory: context.directory },
      body: { providerID: user.info.model.providerID, modelID: user.info.model.modelID, auto: true },
      throwOnError: true,
    })).then((response) => {
      if (response.error || response.data !== true) record.error = "Native summarize request failed.";
    }).catch(() => { record.error = "Native summarize request failed."; });

    const deadline = Date.now() + queueTimeout;
    do {
      history = await messages(context);
      const queued = history.filter((message) => !existing.has(message.info.id) &&
        message.info.role === "user" && message.parts.some((part) => part.type === "compaction"));
      if (queued.length > 1) {
        record.error = "Ambiguous compaction requests; cannot confirm which belongs to this phase.";
        break;
      }
      if (queued.length === 1) {
        record.nativeRequestID = queued[0].info.id;
        const result = inspect(record, history);
        context.metadata({ metadata: { sprinterCompaction: result } });
        return JSON.stringify(result);
      }
      if (record.error || context.abort.aborted || Date.now() >= deadline) break;
      await delay(pollInterval);
    } while (true);
    return JSON.stringify(inspect(record, history));
  }

  function recoveryContext(sessionID) {
    const record = pending.get(sessionID);
    if (!record || record.completed) return undefined;
    return [
      "Preserve this Sprinter recovery checkpoint in the summary:",
      JSON.stringify({ checkpoint: record.checkpoint, phase: record.phase, nativeRequestID: record.nativeRequestID }),
      "This phase's native compaction has been requested, not yet journaled as completed.",
      "After auto-continuation call sprinter_compact(action=status) for this checkpoint/phase.",
      "Only a completed native summary receipt confirms compaction; then recover the journal/Git state.",
      "Do not request compaction again, reset counters, start a new run, or ask the user to type /compact.",
    ].join("\n");
  }

  return { execute, recoveryContext };
}
