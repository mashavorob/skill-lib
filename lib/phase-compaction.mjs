import { setTimeout as delay } from "node:timers/promises";

const TOOL = "sprinter_phase";
const isCompaction = (message) => message.parts.some((part) => part.type === "compaction");

function checkpoint(history, skipMessage) {
  let state;
  for (const message of history) {
    if (message.info.id === skipMessage || message.info.role !== "assistant" || message.info.agent !== "sprinter") continue;
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== TOOL) continue;
      const { input, status, output } = part.state;
      if (state && input?.phase === state.phase && status === "completed") {
        if (input.action === "clear") state = undefined;
        if (input.action === "note") state.note = input.note;
      }
      if (state) continue;
      if (input?.action !== "enter" || !input.phase || !input.plan || !input.handoff) continue;
      let result;
      if (status === "completed") {
        try { result = JSON.parse(output); } catch { /* No saved receipt. */ }
        if (result?.phase !== input.phase || result?.plan !== input.plan) result = undefined;
      }
      state = { phase: input.phase, plan: input.plan, handoff: input.handoff,
        nativeRequestID: result?.nativeRequestID, error: result?.status === "blocked" ? result.error : undefined };
    }
  }
  return state;
}

function receipt(state, history) {
  if (!state) return { status: "unknown", error: "No active phase checkpoint in this session." };
  const { phase, plan, nativeRequestID, error } = state;
  const base = { phase, plan, nativeRequestID };
  if (error) return { ...base, status: "blocked", error };
  if (!nativeRequestID) return { ...base, status: "unknown", error: "No confirmed native request. Reconcile session history and the ledger before continuing; do not submit again." };
  const summary = history.find(({ info }) => info.role === "assistant" && info.summary === true &&
    info.parentID === nativeRequestID && info.time?.completed);
  if (summary?.info.error) return { ...base, status: "blocked", error: "Native compaction failed." };
  if (summary?.info.finish && summary.parts.some((part) => part.type === "text" && part.text.trim())) {
    return { ...base, status: "ready", summaryMessageID: summary.info.id };
  }
  return { ...base, status: "queued" };
}

export function createPhaseCompaction(client, { queueTimeout = 10_000, pollInterval = 25 } = {}) {
  const inFlight = new Set();
  const request = ({ sessionID, directory }) => ({ path: { id: sessionID }, query: { directory }, throwOnError: true });

  async function messages(context) {
    const response = await client.session.messages(request(context));
    if (response.error || !Array.isArray(response.data)) throw new Error("Cannot read native session history.");
    return response.data;
  }

  async function execute(args, context) {
    if (context.agent !== "sprinter") throw new Error("Only sprinter can use sprinter_phase.");
    const { action, phase, plan, handoff, note } = args;
    if (action === "enter" && !(phase && plan && handoff)) throw new Error("Enter requires phase, plan and handoff.");
    if (action === "note" && !(phase && note)) throw new Error("Note requires phase and note.");
    await context.ask({ permission: TOOL, patterns: ["*"], always: [], metadata: { action, phase } });
    const { sessionID } = context;
    if (inFlight.has(sessionID)) throw new Error("Call sprinter_phase alone, not in a parallel batch.");
    inFlight.add(sessionID);
    try {
      let history = await messages(context);
      const state = checkpoint(history, context.messageID);
      const current = receipt(state, history);
      if (action === "status") return JSON.stringify(current);
      if (action === "note" || action === "clear") {
        if (current.status !== "ready" || phase !== current.phase) throw new Error("Supply the current ready phase.");
        return JSON.stringify(action === "clear" ? { status: "cleared", phase } : current);
      }
      if (state?.phase === phase && state.plan === plan) {
        return JSON.stringify(current);
      }
      if (state) throw new Error("Resolve and clear the current phase before entering a different one.");
      if (context.abort.aborted) throw new Error("Compaction cancelled before submission.");

      const model = [...history].reverse().find(({ info }) => info.role === "user" && info.model)?.info.model;
      if (!model) throw new Error("Cannot determine the session model for compaction.");
      const existing = new Set(history.map(({ info }) => info.id));
      const next = { phase, plan };

      // The endpoint awaits the same session loop. Detach it and wait only for the queue marker.
      void Promise.resolve().then(() => client.session.summarize({
        ...request(context), body: { providerID: model.providerID, modelID: model.modelID, auto: true },
      })).then((response) => {
        if (response.error || response.data !== true) next.error = "Native summarize request failed.";
      }).catch(() => { next.error = "Native summarize request failed."; });

      const deadline = Date.now() + queueTimeout;
      while (true) {
        history = await messages(context);
        const queued = history.filter((message) => !existing.has(message.info.id) &&
          message.info.role === "user" && isCompaction(message));
        if (queued.length > 1) next.error = "Ambiguous native compaction requests.";
        else if (queued.length === 1) next.nativeRequestID = queued[0].info.id;
        if (next.nativeRequestID || next.error || context.abort.aborted || Date.now() >= deadline) break;
        await delay(pollInterval);
      }
      return JSON.stringify(receipt(next, history));
    } finally {
      inFlight.delete(sessionID);
    }
  }

  async function recoveryContext(context) {
    try {
      const history = await messages(context);
      const activeUser = [...history].reverse().find((message) => message.info.role === "user" && !isCompaction(message));
      if (activeUser?.info.agent !== "sprinter") return;
      const state = checkpoint(history);
      if (!state) return;
      return ["Preserve this Sprinter checkpoint in the compaction summary:",
        JSON.stringify({ ...state, status: receipt(state, history).status }),
        "On continuation call sprinter_phase status and reconcile the saved project ledger and Git state before work. Do not reset counters or advance scope."].join("\n");
    } catch {
      // An unavailable history endpoint must not prevent native automatic compaction.
      return undefined;
    }
  }

  return { execute, recoveryContext };
}
