import assert from "node:assert/strict";
import test from "node:test";
import { createPhaseCompaction } from "../lib/phase-compaction.mjs";

const enter = { action: "enter", phase: "0", plan: "plan.md", handoff: "Recover the ledger." };
const nativeRequest = { info: { id: "native", role: "user" }, parts: [{ type: "compaction" }] };
const summary = { info: { id: "summary", role: "assistant", parentID: "native", summary: true,
  finish: "stop", time: { completed: 1 } }, parts: [{ type: "text", text: "Native summary" }] };

function fixture({ queue = true } = {}) {
  const history = [{ info: { id: "user", role: "user", agent: "sprinter",
    model: { providerID: "provider", modelID: "model" } }, parts: [] }];
  const context = { agent: "sprinter", sessionID: "session", directory: "/project",
    abort: new AbortController().signal, ask: async () => {} };
  const requests = [];
  const client = { session: {
    messages: async () => ({ data: structuredClone(history) }),
    summarize: (input) => {
      requests.push(input);
      if (queue) history.push(nativeRequest);
      // OpenCode resolves summarize only after the active tool returns.
      return new Promise(() => {});
    },
  } };
  const restart = () => createPhaseCompaction(client, { queueTimeout: 15, pollInterval: 1 });
  let controller = restart();
  const persist = (input, output, status = "completed") => history.push({
    info: { id: `tool-${history.length}`, role: "assistant", agent: "sprinter" },
    parts: [{ type: "tool", tool: "sprinter_phase", state: { input, output, status } }],
  });
  const execute = async (input) => {
    const output = await controller.execute(input, context);
    persist(input, output);
    return JSON.parse(output);
  };
  return { history, context, requests, execute, persist,
    recovery: () => controller.recoveryContext(context), restart: () => { controller = restart(); } };
}

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
