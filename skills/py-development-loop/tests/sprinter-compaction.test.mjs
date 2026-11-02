import assert from "node:assert/strict";
import test from "node:test";
import { createCompactionController } from "../lib/sprinter-compaction.mjs";

const args = { action: "request", checkpoint: "/tmp/opencode/run", phase: "0" };
const user = { info: { id: "user", role: "user", model: { providerID: "selected-provider", modelID: "selected-model" } }, parts: [] };
const nativeRequest = { info: { id: "compact-user", role: "user" }, parts: [{ type: "compaction", auto: true }] };
const summary = { info: { id: "summary", role: "assistant", parentID: "compact-user", summary: true,
  finish: "stop", time: { completed: 1 } }, parts: [{ type: "text", text: "Native summary" }] };

function fixture({ reject = false, queue = true } = {}) {
  const history = [structuredClone(user)];
  const calls = [];
  let metadata;
  const context = { sessionID: "session", directory: "/project", agent: "py-sprinter", abort: new AbortController().signal,
    ask: async () => {}, metadata: (value) => { metadata = value.metadata; } };
  const client = { session: {
    messages: async () => ({ data: structuredClone(history) }),
    summarize: (input) => {
      calls.push(input);
      if (reject) return Promise.reject(new Error("server rejected"));
      if (queue) history.push(structuredClone(nativeRequest));
      // Deliberately never settles until the host loop regains control.
      return new Promise(() => {});
    },
  } };
  const controller = createCompactionController(client, { queueTimeout: 20, pollInterval: 1 });
  return { controller, client, context, history, calls, metadata: () => metadata };
}

test("queues the real native request without awaiting its response and inherits the model", async () => {
  const f = fixture();
  const result = JSON.parse(await f.controller.execute(args, f.context));
  assert.equal(result.status, "queued");
  assert.equal(result.nativeRequestID, "compact-user");
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].path, { id: "session" });
  assert.deepEqual(f.calls[0].body, { providerID: "selected-provider", modelID: "selected-model", auto: true });
  assert.equal(f.metadata().sprinterCompaction.status, "queued");
  assert.match(f.controller.recoveryContext("session"), /\/tmp\/opencode\/run/);
});

test("queued is not completed; only a matching successful native summary confirms it", async () => {
  const f = fixture();
  await f.controller.execute(args, f.context);
  assert.equal(JSON.parse(await f.controller.execute({ ...args, action: "status" }, f.context)).status, "queued");
  f.history.push({ ...summary, info: { ...summary.info, parentID: "unrelated" } });
  assert.equal(JSON.parse(await f.controller.execute({ ...args, action: "status" }, f.context)).status, "queued");
  f.history.push(structuredClone(summary));
  const result = JSON.parse(await f.controller.execute({ ...args, action: "status" }, f.context));
  assert.equal(result.status, "completed");
  assert.equal(result.summaryMessageID, "summary");
});

test("repeated request does not queue again; another phase cannot bypass the pending one", async () => {
  const f = fixture();
  await f.controller.execute(args, f.context);
  await f.controller.execute(args, f.context);
  assert.equal(f.calls.length, 1);
  await assert.rejects(f.controller.execute({ ...args, phase: "1" }, f.context), /unresolved/);
  f.history.push(structuredClone(summary));
  // Use a new native ID for the next request, as the real API does.
  f.client.session.summarize = () => {
    f.calls.push({});
    f.history.push({ ...nativeRequest, info: { ...nativeRequest.info, id: "compact-next" } });
    return new Promise(() => {});
  };
  assert.equal(JSON.parse(await f.controller.execute({ ...args, phase: "1" }, f.context)).nativeRequestID, "compact-next");
  assert.equal(f.calls.length, 2);
});

test("restores the receipt from persisted tool metadata after plugin reload", async () => {
  const f = fixture();
  const result = await f.controller.execute(args, f.context);
  f.history.push({ info: { id: "tool-message", role: "assistant" }, parts: [{ type: "tool", tool: "sprinter_compact",
    state: { status: "completed", input: args, output: result, metadata: f.metadata() } }] });
  f.history.push(structuredClone(summary));
  const restarted = createCompactionController(f.client);
  assert.equal(JSON.parse(await restarted.execute({ ...args, action: "status" }, f.context)).status, "completed");
  assert.equal(JSON.parse(await restarted.execute(args, f.context)).status, "completed");
  assert.equal(f.calls.length, 1);
});

test("missing receipt or API rejection never claims completion or retries automatically", async () => {
  const f = fixture({ reject: true });
  assert.equal(JSON.parse(await f.controller.execute({ ...args, action: "status" }, f.context)).status, "unknown");
  assert.equal(f.calls.length, 0);
  assert.equal(JSON.parse(await f.controller.execute(args, f.context)).status, "failed");
  await f.controller.execute(args, f.context);
  assert.equal(f.calls.length, 1);
});

test("plugin reload does not resubmit a persisted request with an unknown outcome", async () => {
  const f = fixture();
  f.history.push({ info: { id: "old-tool", role: "assistant" }, parts: [{ type: "tool", tool: "sprinter_compact",
    state: { status: "error", input: args, error: "Interrupted" } }] });
  const restarted = createCompactionController(f.client);
  assert.equal(JSON.parse(await restarted.execute(args, f.context)).status, "unknown");
  assert.equal(f.calls.length, 0);
});

test("the current running tool call is not mistaken for a previously submitted request", async () => {
  const f = fixture();
  f.history.push({ info: { id: "current", role: "assistant" }, parts: [{ type: "tool", tool: "sprinter_compact",
    state: { status: "running", input: args } }] });
  assert.equal(JSON.parse(await f.controller.execute(args, { ...f.context, messageID: "current" })).status, "queued");
  assert.equal(f.calls.length, 1);
});

test("queue timeout is unknown, preserves the request and does not submit a duplicate", async () => {
  const f = fixture({ queue: false });
  assert.equal(JSON.parse(await f.controller.execute(args, f.context)).status, "unknown");
  await f.controller.execute(args, f.context);
  assert.equal(f.calls.length, 1);
});

test("failed native summaries do not complete the gate", async () => {
  const f = fixture();
  await f.controller.execute(args, f.context);
  f.history.push({ ...summary, info: { ...summary.info, error: { message: "provider failed" } } });
  assert.equal(JSON.parse(await f.controller.execute({ ...args, action: "status" }, f.context)).status, "failed");
});

test("cannot compact a different session via supplied arguments or call as a subagent", async () => {
  const f = fixture();
  for (const agent of ["py-coder", "cpp-coder", "cpp-reviewer", "cpp-qa", "sprinter"]) {
    await assert.rejects(f.controller.execute(args, { ...f.context, agent }), /restricted/);
  }
  await assert.rejects(f.controller.execute({ ...args, checkpoint: "relative" }, f.context), /absolute/);
  assert.equal(f.calls.length, 0);
});

test("C++ Sprinter queues and recovers a confirmed receipt through the shared controller", async () => {
  const f = fixture();
  const context = { ...f.context, agent: "cpp-sprinter" };
  const result = await f.controller.execute(args, context);
  assert.equal(JSON.parse(result).status, "queued");
  f.history.push({ info: { id: "cpp-tool", role: "assistant" }, parts: [{ type: "tool", tool: "sprinter_compact",
    state: { status: "completed", input: args, output: result, metadata: f.metadata() } }] });
  f.history.push(structuredClone(summary));
  const restarted = createCompactionController(f.client);
  const receipt = JSON.parse(await restarted.execute({ ...args, action: "status" }, context));
  assert.equal(receipt.status, "completed");
  assert.equal(receipt.summaryMessageID, "summary");
  assert.equal(f.calls.length, 1);
});

test("respects the explicit tool permission before any API access", async () => {
  const f = fixture();
  await assert.rejects(f.controller.execute(args, { ...f.context, ask: async () => { throw new Error("denied"); } }), /denied/);
  assert.equal(f.calls.length, 0);
});
