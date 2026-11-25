import assert from "node:assert/strict";
import test from "node:test";
import { createPhaseCompaction } from "../lib/phase-compaction.mjs";

const enter = { action: "enter", phase: "0", plan: "plan.md", handoff: "Recover the ledger." };
const nativeRequest = { info: { id: "native", role: "user", agent: "sprinter" }, parts: [{ type: "compaction", auto: true }] };
const summary = { info: { id: "summary", role: "assistant", parentID: "native", summary: true,
  finish: "stop", time: { completed: 1 } }, parts: [{ type: "text", text: "Native summary" }] };

function fixture({ queue = true, failRead, recordSubmission = false, onSubmit } = {}) {
  const history = [{ info: { id: "user", role: "user", agent: "sprinter",
    model: { providerID: "provider", modelID: "model" } }, parts: [] }];
  const context = { agent: "sprinter", sessionID: "session", directory: "/project",
    abort: new AbortController().signal, ask: async () => {} };
  const requests = [];
  const historyQueries = [];
  let onDispatch;
  const dispatched = new Promise((resolve) => { onDispatch = resolve; });
  let rejectRequest;
  let reads = 0;
  const client = { session: {
    message: async ({ path }) => ({ data: structuredClone(history.find(({ info }) => info.id === path.messageID)) }),
    messages: async ({ query }) => {
      historyQueries.push(query);
      if (++reads === failRead) throw new Error("Cannot read native session history.");
      return { data: structuredClone(query.limit ? history.slice(-query.limit) : history) };
    },
    summarize: (input) => {
      requests.push(input);
      onDispatch();
      onSubmit?.(history);
      if (queue) history.push(nativeRequest);
      // OpenCode resolves summarize only after the active tool returns.
      return new Promise((_, reject) => { rejectRequest = reject; });
    },
  } };
  const restart = () => createPhaseCompaction(client, {
    queueTimeout: 15, pollInterval: 1,
    updatePart: recordSubmission ? async (part) => {
      const { parts } = history.find(({ info }) => info.id === part.messageID);
      parts[parts.findIndex(({ callID }) => callID === part.callID)] = structuredClone(part);
    } : undefined,
  });
  let controller = restart();
  const persist = (input, output, status = "completed") => history.push({
    info: { id: `tool-${history.length}`, role: "assistant", agent: "sprinter" },
    parts: [{ type: "tool", tool: "sprinter_phase", state: { input, status,
      ...(status === "error" ? { error: output } : { output }) } }],
  });
  const execute = async (input) => {
    const output = await controller.execute(input, context);
    persist(input, output);
    return JSON.parse(output);
  };
  const startEnter = (overrides, input = enter) => {
    const messageID = `tool-${history.length}`;
    const parts = [{ type: "tool", tool: "sprinter_phase", messageID, callID: "enter", state: { input, status: "running" } }];
    history.push({ info: { id: messageID, role: "assistant", agent: "sprinter" }, parts });
    return {
      execution: controller.execute(input, { ...context, ...overrides, messageID, callID: "enter" }),
      interrupt: () => {
        parts[0].state = { ...parts[0].state, status: "error", error: "Tool execution aborted",
          metadata: { ...parts[0].state.metadata, interrupted: true } };
      },
    };
  };
  return { history, context, requests, historyQueries, execute, persist, dispatched,
    startEnter,
    invoke: (input, overrides) => controller.execute(input, { ...context, ...overrides }),
    rejectRequest: () => rejectRequest(new Error("Compaction model unavailable")),
    recovery: () => controller.recoveryContext(context), restart: () => { controller = restart(); } };
}

test("an output-limited native summary blocks the phase", async () => {
  const f = fixture();
  await f.execute(enter);
  f.history.push({ ...summary, info: { ...summary.info, finish: "length" } });
  assert.equal((await f.execute({ action: "status" })).status, "blocked");
  await assert.rejects(f.execute({ action: "clear", phase: enter.phase }), /ready/);
});

test("separately approved enter calls in one turn share one native request", async () => {
  const f = fixture();
  const messageID = "same-turn";
  const parts = ["first", "second"].map((callID) => ({ type: "tool", tool: "sprinter_phase", callID,
    state: { input: enter, status: "running" } }));
  f.history.push({ info: { id: messageID, role: "assistant", agent: "sprinter" }, parts });
  let approve;
  const second = f.invoke(enter, { messageID, callID: "second", ask: () => new Promise((resolve) => { approve = resolve; }) });
  const output = await f.invoke(enter, { messageID, callID: "first" });
  assert.equal(JSON.parse(output).status, "queued");
  parts[0].state = { ...parts[0].state, status: "completed", output };
  approve();
  assert.deepEqual(JSON.parse(await second), JSON.parse(output));
  assert.equal(f.requests.length, 1);
});

test("only a matching native summary verifies the persisted queue receipt after reload", async () => {
  const f = fixture();
  assert.equal((await f.execute(enter)).status, "queued");
  assert.deepEqual(f.requests[0].body, { providerID: "provider", modelID: "model", auto: true });
  f.restart();
  assert.equal((await f.execute(enter)).nativeRequestID, "native");
  assert.equal(f.requests.length, 1);
  f.history.push({ ...summary, info: { ...summary.info, parentID: "unrelated" } });
  assert.equal((await f.execute({ action: "status" })).status, "queued");
  f.history.push(summary);
  assert.equal((await f.execute({ action: "status" })).status, "ready");
});

test("saved phase inputs and legacy receipts with padded IDs can be resumed and cleared", async () => {
  const f = fixture();
  const padded = { ...enter, phase: " 0 ", plan: " plan.md " };
  f.persist(padded, JSON.stringify({ status: "queued", phase: padded.phase, plan: padded.plan, nativeRequestID: "native" }));
  f.history.push(nativeRequest, summary);
  f.restart();
  const resumed = await f.execute(enter);
  assert.equal(resumed.status, "ready");
  assert.equal(resumed.plan, enter.plan);
  assert.equal(f.requests.length, 0);
  assert.deepEqual(await f.execute({ action: "clear", phase: "\t0 " }), { status: "cleared", phase: "0" });
  f.restart();
  assert.equal(await f.recovery(), undefined);
});

test("a later auto-compaction summary cannot verify an earlier phase request", async () => {
  const f = fixture();
  assert.equal((await f.execute(enter)).status, "queued");
  f.history.push({ info: { id: "new-turn", role: "user", agent: "sprinter" }, parts: [] });
  f.history.push({ ...nativeRequest, info: { ...nativeRequest.info, id: "later" } });
  f.history.push({ ...summary, info: { ...summary.info, parentID: "later" } });
  assert.equal((await f.execute({ action: "status" })).status, "queued");
});

test("recovery includes the last note, skips other agents, and stops after clear", async () => {
  const f = fixture();
  await f.execute(enter);
  f.history.push(summary);
  await f.execute({ action: "note", phase: "0", note: "Reconcile the latest review." });
  f.restart();
  assert.match(await f.recovery(), /Reconcile the latest review/);
  f.history.push({ info: { id: "switch", role: "user", agent: "plan" }, parts: [] });
  assert.equal(await f.recovery(), undefined);
  f.history.pop();
  await f.execute({ action: "clear", phase: "0" });
  assert.equal(await f.recovery(), undefined);
});

test("an interrupted request is not resubmitted or replaced by another phase", async () => {
  const f = fixture({ queue: false });
  assert.equal((await f.execute(enter)).status, "unknown");
  f.restart();
  assert.equal((await f.execute(enter)).status, "unknown");
  await assert.rejects(f.execute({ ...enter, phase: "1" }), /current phase/);
  await assert.rejects(f.execute({ action: "clear", phase: "0" }), /ready/);
  assert.equal(f.requests.length, 1);
});

test("a late summarize rejection is reported and recovered from the saved status receipt", async () => {
  const f = fixture();
  assert.equal((await f.execute(enter)).status, "queued");
  f.rejectRequest();
  await new Promise((resolve) => setImmediate(resolve));

  const blocked = { phase: "0", plan: "plan.md", nativeRequestID: "native",
    status: "blocked", error: "Native summarize request failed." };
  assert.deepEqual(await f.execute({ action: "status" }), blocked);
  f.restart();
  assert.deepEqual(await f.execute({ action: "status" }), blocked);
  await assert.rejects(f.execute({ action: "clear", phase: "0" }), /ready/);
  assert.equal(f.requests.length, 1);
});

test("a successful summary keeps the checkpoint ready after summarize rejects", async () => {
  const f = fixture();
  assert.equal((await f.execute(enter)).status, "queued");
  f.history.push(summary);
  const ready = await f.execute({ action: "status" });
  assert.equal(ready.status, "ready");
  assert.equal(ready.summaryMessageID, summary.info.id);

  f.rejectRequest();
  await new Promise(setImmediate);
  assert.deepEqual(await f.execute({ action: "status" }), ready);
  f.restart();
  assert.deepEqual(await f.execute({ action: "status" }), ready);
  assert.deepEqual(await f.execute({ action: "clear", phase: enter.phase }), { status: "cleared", phase: enter.phase });
});

test("a late summarize rejection without a queue marker survives a saved status receipt", async () => {
  const f = fixture({ queue: false });
  assert.equal((await f.execute(enter)).status, "unknown");
  f.rejectRequest();
  await new Promise((resolve) => setImmediate(resolve));

  const blocked = await f.execute({ action: "status" });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.error, "Native summarize request failed.");
  assert.equal(blocked.nativeRequestID, undefined);
  f.restart();
  assert.deepEqual(await f.execute({ action: "status" }), blocked);
  assert.deepEqual(await f.execute(enter), blocked);
  assert.equal(f.requests.length, 1);
});

test("automatic compaction cannot verify an unconfirmed request after summarize rejects", async () => {
  const f = fixture({ queue: false });
  assert.equal((await f.execute(enter)).status, "unknown");
  f.rejectRequest();
  await new Promise((resolve) => setImmediate(resolve));
  f.history.push(nativeRequest, summary);

  const blocked = await f.execute({ action: "status" });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.error, "Native summarize request failed.");
  assert.equal(blocked.nativeRequestID, undefined);
  assert.equal(blocked.summaryMessageID, undefined);
  f.restart();
  assert.deepEqual(await f.execute({ action: "status" }), blocked);
  await assert.rejects(f.execute({ action: "clear", phase: enter.phase }), /ready/);
});

test("a saved permission refusal does not reserve the phase after authorization", async () => {
  const f = fixture();
  const denial = "The user rejected permission to use this specific tool call.";
  f.context.ask = async () => { throw new Error(denial); };
  await assert.rejects(f.execute(enter), { message: denial });
  assert.equal(f.requests.length, 0);
  f.persist(enter, denial, "error");
  f.restart();
  assert.equal(await f.recovery(), undefined);
  f.context.ask = async () => {};
  assert.equal((await f.execute(enter)).status, "queued");
  assert.equal(f.requests.length, 1);
});

test("an enter rejected by argument validation does not reserve the phase", async () => {
  const f = fixture();
  f.persist({ ...enter, handoff: "x".repeat(4001) }, "Invalid tool arguments", "error");
  f.restart();
  assert.equal(await f.recovery(), undefined);
  assert.equal((await f.execute(enter)).status, "queued");
  assert.equal(f.requests.length, 1);
});

test("a cancellation while waiting for permission does not reserve the phase after reload", async () => {
  const f = fixture({ recordSubmission: true });
  const abort = new AbortController();
  let waiting;
  const permissionRequested = new Promise((resolve) => { waiting = resolve; });
  const { execution, interrupt } = f.startEnter({ abort: abort.signal, ask: () => new Promise((_, reject) => {
    abort.signal.addEventListener("abort", () => reject(abort.signal.reason), { once: true });
    waiting();
  }) });
  const rejected = assert.rejects(execution, { name: "AbortError" });
  await permissionRequested;
  abort.abort();
  interrupt();
  await rejected;
  assert.equal(f.requests.length, 0);
  f.restart();
  assert.equal(await f.recovery(), undefined);
  assert.equal(JSON.parse(await f.startEnter().execution).status, "queued");
  assert.equal(f.requests.length, 1);
});

test("an abort before recording preparation leaves the session available for another phase", async () => {
  const f = fixture({ recordSubmission: true });
  const abort = new AbortController();
  const { execution, interrupt } = f.startEnter({ abort: abort.signal });
  abort.abort();
  interrupt();
  assert.equal(JSON.parse(await execution).status, "not_submitted");
  assert.equal(f.requests.length, 0);

  f.restart();
  assert.equal(await f.recovery(), undefined);
  assert.equal((await f.execute({ action: "status" })).phase, undefined);
  const result = JSON.parse(await f.startEnter({}, { ...enter, phase: "1" }).execution);
  assert.equal(result.status, "queued");
  assert.equal(result.phase, "1");
  assert.equal(f.requests.length, 1);
});

test("cancellation after dispatch still reserves the phase after reload", async () => {
  const f = fixture({ queue: false, recordSubmission: true });
  const abort = new AbortController();
  const { execution, interrupt } = f.startEnter({ abort: abort.signal });
  await f.dispatched;
  assert.equal(f.requests.length, 1);
  abort.abort();
  interrupt();
  assert.equal(JSON.parse(await execution).status, "unknown");
  f.restart();
  assert.equal((await f.execute({ action: "status" })).phase, enter.phase);
  assert.equal(JSON.parse(await f.startEnter().execution).status, "unknown");
  assert.equal(f.requests.length, 1);
});

test("a failed initial history read allows a later enter after reload", async () => {
  const f = fixture({ failRead: 1 });
  assert.equal((await f.execute(enter)).status, "not_submitted");
  assert.equal(f.requests.length, 0);
  f.restart();
  assert.equal((await f.execute(enter)).status, "queued");
  assert.equal(f.requests.length, 1);
});

test("a history read failure after submission does not promote an unconfirmed marker after reload", async () => {
  const f = fixture({ failRead: 2 });
  assert.equal((await f.execute(enter)).status, "unknown");
  assert.equal(f.requests.length, 1);
  f.history.push(summary);
  f.restart();
  assert.equal((await f.execute({ action: "status" })).status, "unknown");
  await assert.rejects(f.execute({ action: "clear", phase: enter.phase }), /ready/);
  assert.equal(f.requests.length, 1);
});

test("a saved request ID verifies an overlapping auto-compaction after reload", async () => {
  const f = fixture({ recordSubmission: true });
  const { execution } = f.startEnter();
  const output = await execution;
  assert.equal(JSON.parse(output).status, "queued");
  const tool = f.history[1].parts[0];
  tool.state = { status: "completed", input: enter, output };
  f.history.push({ ...nativeRequest, info: { ...nativeRequest.info, id: "overflow" } });
  f.restart();
  assert.equal((await f.execute({ action: "status" })).status, "queued");
  f.history.push({ ...summary, info: { ...summary.info, parentID: "overflow" } });
  assert.deepEqual(await f.execute({ action: "status" }), {
    phase: "0", plan: "plan.md", status: "ready", nativeRequestID: "native",
    summaryRequestID: "overflow", summaryMessageID: "summary",
  });
  assert.equal((await f.execute({ action: "clear", phase: enter.phase })).status, "cleared");
  assert.equal(f.requests.length, 1);
});

test("a reload before the first status cannot turn a failed request into a ready checkpoint", async () => {
  const f = fixture({ queue: false });
  assert.equal((await f.execute(enter)).status, "unknown");
  f.rejectRequest();
  await new Promise(setImmediate);
  f.history.push(nativeRequest, summary);
  f.restart();

  const status = await f.execute({ action: "status" });
  assert.equal(status.status, "unknown");
  assert.equal(status.nativeRequestID, undefined);
  assert.equal((await f.execute(enter)).status, "unknown");
  assert.equal(f.requests.length, 1);
});

const assistantMessages = (count, prefix) => Array.from({ length: count }, (_, i) => ({
  info: { id: `${prefix}-${i}`, role: "assistant", agent: "sprinter" }, parts: [],
}));

test("queue observation only polls bounded pages in a long session", async () => {
  const f = fixture({ queue: false });
  f.history.push(...assistantMessages(1000, "old"));
  assert.equal((await f.execute(enter)).status, "unknown");
  const [initial, ...polls] = f.historyQueries;
  assert.equal(initial.limit, undefined);
  assert.ok(polls.length > 0);
  for (const { limit } of polls) assert.ok(Number.isInteger(limit) && limit > 0 && limit < 1000);
});

test("queue observation does not infer a match when the anchor is outside the page", async () => {
  const f = fixture({ onSubmit: (history) => history.push(...assistantMessages(100, "new")) });
  const result = await f.execute(enter);
  assert.equal(result.status, "unknown");
  assert.equal(result.nativeRequestID, undefined);
  f.history.push(summary);
  assert.equal((await f.execute({ action: "status" })).status, "unknown");
});

test("an unconfirmed request does not claim a compaction from a later user turn", async () => {
  const f = fixture({ queue: false });
  assert.equal((await f.execute(enter)).status, "unknown");
  f.history.push({ info: { id: "next-turn", role: "user", agent: "sprinter" }, parts: [] }, nativeRequest, summary);
  f.restart();
  assert.equal((await f.execute({ action: "status" })).status, "unknown");
  assert.equal(f.requests.length, 1);
});

test("never claims ready after a native failure, or submits on denied access", async () => {
  const f = fixture();
  f.context.agent = "developer";
  await assert.rejects(f.execute(enter), /Only sprinter/);
  assert.equal(f.requests.length, 0);
  f.context.agent = "sprinter";
  await f.execute(enter);
  f.history.push({ ...summary, info: { ...summary.info, error: { message: "Failed" } } });
  assert.equal((await f.execute({ action: "status" })).status, "blocked");
});
