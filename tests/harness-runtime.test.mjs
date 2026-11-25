import assert from "node:assert/strict";
import test from "node:test";
import runtime from "../plugins/harness-runtime.js";

test("a failed subtask can leave the after hook without output", async () => {
  const hooks = await runtime({});
  await hooks["tool.execute.after"]({ tool: "task", sessionID: "parent", args: { subagent_type: "coder" } }, undefined);
});

test("worker identity uses only the latest child message", async () => {
  const hooks = await runtime({ client: { session: {
    get: async () => ({ data: { parentID: "parent" } }),
    messages: async ({ query }) => {
      assert.equal(query.limit, 1);
      return { data: [{ info: { role: "assistant", agent: "coder", providerID: "local", modelID: "worker" } }] };
    },
  } } });
  const output = { output: "Child report", metadata: { sessionId: "child" } };
  await hooks["tool.execute.after"]({ tool: "task", sessionID: "parent", args: { subagent_type: "coder" } }, output);
  assert.match(output.output, /"status":"observed","agent":"coder","model":"local\/worker"/);
});
