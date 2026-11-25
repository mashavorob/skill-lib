import { setTimeout as delay } from "node:timers/promises";

const TOOL = "sprinter_phase";
const REQUEST_FAILED = "Native summarize request failed.";
const SUBMISSION = "sprinterPhaseSubmission";
const ANCHOR = "sprinterPhaseHistoryAnchor";
const PREPARING = "preparing";
const SUBMITTING = "submitting";
const QUEUE_WINDOW = 16;
const MAX_POLL_INTERVAL = 500;
export const PHASE_ARG_LIMITS = Object.freeze({ phase: 120, plan: 1000, handoff: 4000, note: 4000 });
const trimIdentifier = (value) => typeof value === "string" ? value.trim() : undefined;
const isCompaction = (message) => message.parts.some((part) => part.type === "compaction");
const isSprinterAutoMarker = (message) => message?.info.role === "user" && message.info.agent === "sprinter" &&
  message.parts.some((part) => part.type === "compaction" && part.auto === true);

function permissionRefused({ status, error }) {
  // OpenCode stores the native permission error message, not its type, in tool history.
  return status === "error" && typeof error === "string" && (
    error === "The user rejected permission to use this specific tool call." ||
    error.startsWith("The user rejected permission to use this specific tool call with the following feedback: ") ||
    error.startsWith("The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules ")
  );
}

function invalidEnter({ input, status, metadata }) {
  if (status !== "error" || metadata?.[SUBMISSION] === SUBMITTING) return false;
  // OpenCode saves schema-invalid arguments in the tool history without executing them.
  return Object.entries(PHASE_ARG_LIMITS).some(([key, max]) => {
    if (input[key] === undefined) return false;
    const value = trimIdentifier(input[key]);
    return !value || value.length > max;
  });
}

function stoppedBeforeSubmission({ status, error, metadata }) {
  if (status === "completed") return false;
  if (metadata?.[SUBMISSION] === PREPARING) return true;
  // OpenCode can abort the running call before the plugin writes its preparation marker.
  return status === "error" && error === "Tool execution aborted" && metadata?.interrupted === true &&
    metadata[SUBMISSION] === undefined && metadata[ANCHOR] === undefined;
}

function requestsAfter(history, anchor) {
  const index = history.findIndex(({ info }) => info.id === anchor);
  if (index < 0) return [];
  const candidates = [];
  for (const message of history.slice(index + 1)) {
    if (message.info.role !== "user") continue;
    if (!isCompaction(message)) break;
    candidates.push(message);
  }
  return candidates;
}

function summaryFor(history, id) {
  return history.find(({ info }) => info.role === "assistant" && info.summary === true &&
    info.parentID === id && info.time?.completed);
}

function overlapMarker(history, index) {
  const next = history[index + 1];
  return isSprinterAutoMarker(history[index]) && isSprinterAutoMarker(next) ? next : undefined;
}

function checkpoint(history, context) {
  let state;
  for (const message of history) {
    if (message.info.role !== "assistant" || message.info.agent !== "sprinter") continue;
    for (const part of message.parts) {
      if (part.type !== "tool" || part.tool !== TOOL) continue;
      const { input, status, output } = part.state;
      if (context?.messageID === message.info.id &&
          (context.callID === part.callID || status === "pending" || status === "running")) continue;
      const phase = trimIdentifier(input?.phase);
      const plan = trimIdentifier(input?.plan);
      if (state && phase === state.phase && status === "completed") {
        if (input.action === "clear") state = undefined;
        if (input.action === "note") state.note = input.note;
      }
      if (state && status === "completed" && input?.action === "status") {
        let result;
        try { result = JSON.parse(output); } catch { /* No saved receipt. */ }
        if (result?.status === "blocked" && result.error === REQUEST_FAILED && trimIdentifier(result.phase) === state.phase &&
            trimIdentifier(result.plan) === state.plan && (result.nativeRequestID
              ? result.nativeRequestID === state.nativeRequestID
              : state.anchor && result[ANCHOR] === state.anchor)) state.error = result.error;
      }
      if (state) continue;
      if (input?.action !== "enter" || !phase || !plan || !input.handoff) continue;
      if (permissionRefused(part.state) || invalidEnter(part.state) || stoppedBeforeSubmission(part.state)) continue;
      let result;
      if (status === "completed") {
        try { result = JSON.parse(output); } catch { /* No saved receipt. */ }
        if (trimIdentifier(result?.phase) !== phase || trimIdentifier(result?.plan) !== plan) result = undefined;
        if (result?.status === "not_submitted") continue;
      }
      const anchor = result?.[ANCHOR] ?? part.state.metadata?.[ANCHOR];
      state = { phase, plan, handoff: input.handoff, anchor,
        nativeRequestID: result?.nativeRequestID, error: result?.status === "blocked" ? result.error : undefined };
    }
  }
  return state;
}

function receipt(state, history, failedAnchors) {
  if (!state) return { status: "unknown", error: "No active phase checkpoint in this session." };
  const { phase, plan, anchor, nativeRequestID } = state;
  const failure = state.error ?? (failedAnchors.has(anchor) ? REQUEST_FAILED : undefined);
  const base = { phase, plan, nativeRequestID };
  // An anchor alone cannot distinguish our request from a later automatic marker.
  if (!nativeRequestID) return failure ? { ...base, [ANCHOR]: anchor, status: "blocked", error: failure } :
    { ...base, [ANCHOR]: anchor, status: "unknown",
      error: "No confirmed native request. Reconcile session history and the ledger before continuing; do not submit again." };
  let summary = summaryFor(history, nativeRequestID);
  if (!summary) {
    const index = history.findIndex(({ info }) => info.id === nativeRequestID);
    // An overflow in the enter turn can append a second marker before any intervening turn.
    const replacement = overlapMarker(history, index);
    if (replacement) summary = summaryFor(history, replacement.info.id);
  }
  const observed = summary && summary.info.parentID !== nativeRequestID ? { ...base, summaryRequestID: summary.info.parentID } : base;
  // The summarize request also waits for continuation, which can fail after the summary is saved.
  if (summary && !summary.info.error && summary.info.finish === "stop" &&
      summary.parts.some((part) => part.type === "text" && part.text.trim())) {
    return { ...observed, status: "ready", summaryMessageID: summary.info.id };
  }
  if (failure) return { ...base, status: "blocked", error: failure };
  if (summary) {
    if (summary.info.error) return { ...observed, status: "blocked", error: "Native compaction failed." };
    return { ...observed, status: "blocked", error: `Native compaction did not produce a complete summary (${summary.info.finish ?? "no finish reason"}).` };
  }
  return { ...base, [ANCHOR]: anchor, status: "queued" };
}

export function createPhaseCompaction(client, { queueTimeout = 10_000, pollInterval = 25, updatePart } = {}) {
  const inFlight = new Set();
  const submittedTurns = new Map();
  const failedAnchors = new Set();
  const request = ({ sessionID, directory }) => ({ path: { id: sessionID }, query: { directory }, throwOnError: true });

  async function messages(context, { limit, signal } = {}) {
    const options = request(context);
    if (limit !== undefined) options.query.limit = limit;
    if (signal) options.signal = signal;
    const response = await client.session.messages(options);
    if (response.error || !Array.isArray(response.data)) throw new Error("Cannot read native session history.");
    return response.data;
  }

  async function markSubmission(context, stage, anchor) {
    const { messageID, callID, sessionID } = context;
    const deadline = Date.now() + queueTimeout;
    while (!context.abort.aborted) {
      const response = await client.session.message({ ...request(context), path: { id: sessionID, messageID } });
      const part = response.data?.parts.find((part) => part.type === "tool" && part.tool === TOOL && part.callID === callID);
      if (context.abort.aborted) return false;
      if (part?.state.status === "running") {
        const expected = stage === SUBMITTING ? PREPARING : undefined;
        if (part.state.metadata?.[SUBMISSION] !== expected) return false;
        const metadata = { ...part.state.metadata, [SUBMISSION]: stage, ...(anchor && { [ANCHOR]: anchor }) };
        await updatePart({ ...part, state: { ...part.state, metadata } }, context);
        return true;
      }
      // The model can start executing the tool before the processor saves its running state.
      if ((part && part.state.status !== "pending") || Date.now() >= deadline) return false;
      await delay(pollInterval);
    }
    return false;
  }

  async function execute(args, context) {
    if (context.agent !== "sprinter") throw new Error("Only sprinter can use sprinter_phase.");
    const { action, handoff, note } = args;
    const phase = trimIdentifier(args.phase);
    const plan = trimIdentifier(args.plan);
    const notSubmitted = (error) => JSON.stringify({ phase, plan, status: "not_submitted", error });
    if (action === "enter" && !(phase && plan && handoff)) throw new Error("Enter requires phase, plan and handoff.");
    if (action === "note" && !(phase && note)) throw new Error("Note requires phase and note.");
    const persistSubmission = action === "enter" && updatePart;
    if (persistSubmission) {
      try {
        if (!await markSubmission(context, PREPARING) || context.abort.aborted) {
          return notSubmitted("Compaction cancelled or the phase tool call is no longer running.");
        }
      } catch {
        return notSubmitted("Cannot record the phase compaction attempt before requesting permission.");
      }
    }
    await context.ask({ permission: TOOL, patterns: ["*"], always: [], metadata: { action, phase } });
    const { sessionID } = context;
    if (inFlight.has(sessionID)) {
      const error = "Call sprinter_phase alone, not in a parallel batch.";
      if (action === "enter") return notSubmitted(error);
      throw new Error(error);
    }
    inFlight.add(sessionID);
    try {
      let history;
      try {
        history = await messages(context);
      } catch (error) {
        if (action !== "enter") throw error;
        return notSubmitted("Cannot read native session history before submission.");
      }
      if (submittedTurns.get(sessionID) !== context.messageID) submittedTurns.delete(sessionID);
      const state = checkpoint(history, context);
      const current = receipt(state, history, failedAnchors);
      if (state?.anchor && (state.error || current.status === "ready")) failedAnchors.delete(state.anchor);
      if (action === "status") return JSON.stringify(current);
      if (action === "note" || action === "clear") {
        if (current.status !== "ready" || phase !== current.phase) throw new Error("Supply the current ready phase.");
        return JSON.stringify(action === "clear" ? { status: "cleared", phase } : current);
      }
      if (state?.phase === phase && state.plan === plan) {
        return JSON.stringify(current);
      }
      if (state) throw new Error("Resolve and clear the current phase before entering a different one.");
      if (context.messageID && submittedTurns.has(sessionID)) return notSubmitted("This turn already submitted a compaction request. Check its status in the next turn.");
      if (context.abort.aborted) return notSubmitted("Compaction cancelled before submission.");

      const model = [...history].reverse().find(({ info }) => info.role === "user" && info.model)?.info.model;
      if (!model) return notSubmitted("Cannot determine the session model for compaction.");
      const anchor = history[history.length - 1].info.id;
      if (persistSubmission) {
        try {
          if (!await markSubmission(context, SUBMITTING, anchor) || context.abort.aborted) {
            return notSubmitted("Compaction cancelled or the phase tool call is no longer running.");
          }
        } catch {
          return notSubmitted("Cannot record the phase compaction attempt before submission.");
        }
      }
      const next = { phase, plan, anchor };
      // A sibling call can execute before OpenCode persists the first call's receipt.
      if (context.messageID) submittedTurns.set(sessionID, context.messageID);
      const failRequest = () => {
        next.error = REQUEST_FAILED;
        failedAnchors.add(anchor);
      };

      // The endpoint awaits the same session loop. Detach it and wait only for the queue marker.
      void Promise.resolve().then(() => client.session.summarize({
        ...request(context), body: { providerID: model.providerID, modelID: model.modelID, auto: true },
      })).then((response) => {
        if (response.error || response.data !== true) failRequest();
      }).catch(failRequest);

      const deadline = Date.now() + queueTimeout;
      const signal = AbortSignal.any([context.abort, AbortSignal.timeout(queueTimeout)]);
      let interval = pollInterval;
      while (!signal.aborted && !next.error) {
        try {
          history = await messages(context, { limit: QUEUE_WINDOW, signal });
        } catch {
          // Keep the anchor in the receipt even if OpenCode replaces tool metadata.
          break;
        }
        if (signal.aborted || next.error || !history.some(({ info }) => info.id === anchor)) break;
        const candidates = requestsAfter(history, anchor);
        const [marker] = candidates;
        if (candidates.length === 1 && isSprinterAutoMarker(marker)) next.nativeRequestID = marker.info.id;
        if (next.nativeRequestID || candidates.length > 1 || Date.now() >= deadline) break;
        try {
          await delay(Math.min(interval, Math.max(0, deadline - Date.now())), undefined, { signal });
        } catch (error) {
          if (!signal.aborted) throw error;
        }
        interval = Math.min(interval * 2, MAX_POLL_INTERVAL);
      }
      return JSON.stringify(receipt(next, history, failedAnchors));
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
      const { phase, plan, handoff, note } = state;
      const { [ANCHOR]: _anchor, ...result } = receipt(state, history, failedAnchors);
      return ["Preserve this Sprinter checkpoint in the compaction summary:",
        JSON.stringify({ phase, plan, handoff, note, ...result }),
        "On continuation call sprinter_phase status and reconcile the saved project ledger and Git state before work. Do not reset counters or advance scope."].join("\n");
    } catch {
      // An unavailable history endpoint must not prevent native automatic compaction.
      return undefined;
    }
  }

  return { execute, recoveryContext };
}
