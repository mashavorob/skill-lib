// Real OpenCode loop + native compaction, using an entirely local mock LLM.
// No production session, journal, provider credentials or remote model is used.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";

const agent = "sprinter";
const root = await mkdtemp(path.join(tmpdir(), "compact-smoke-"));
const project = path.join(root, "project");
await mkdir(project);
assert.equal(spawnSync("git", ["init", "-q"], { cwd: project }).status, 0);
const handoff = "Phase 0 approved. Recover the phase ledger before work.";
const plan = "approved phase plan";
const requests = [];
let mainTurns = 0;
let summaries = 0;
let child;
let stdout = "";
let stderr = "";

function stream(response, { text, action, task, command }) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const tool = command ? { name: "bash", arguments: JSON.stringify({ command, description: "Check shell exit code", workdir: project }) }
    : task ? { name: "task", arguments: JSON.stringify(task) }
    : action ? { name: "sprinter_phase", arguments: JSON.stringify(action === "enter" ?
      { action, phase: "0", plan, handoff } : { action }) } : null;
  const delta = tool
    ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${action ?? command ?? "task"}`, type: "function", function: tool }] }
    : { role: "assistant", content: text };
  const chunk = (value, finish_reason = null) => ({ id: "chatcmpl-local", object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000), model: "test-model",
    choices: [{ index: 0, delta: value, finish_reason }] });
  response.write(`data: ${JSON.stringify(chunk(delta))}\n\n`);
  response.write(`data: ${JSON.stringify(chunk({}, tool ? "tool_calls" : "stop"))}\n\n`);
  response.end("data: [DONE]\n\n");
}

const server = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  try {
    const body = JSON.parse(raw);
    requests.push({ url: request.url, body });
    const conversation = JSON.stringify(body.messages);
    if (/Generate a title for this conversation/.test(conversation)) {
      stream(response, { text: "Compaction smoke" });
    } else if (/WORKER_IDENTITY_FIXTURE/.test(body.messages[0]?.content)) {
      stream(response, { text: "Worker finished." });
    } else if (!body.tools?.length) {
      summaries++;
      stream(response, { text: "Native compaction summary. Phase 0. Call sprinter_phase status, then finish." });
    } else {
      mainTurns++;
      if (mainTurns === 1) stream(response, { action: "enter" });
      else if (mainTurns === 2) stream(response, { action: "status" });
      else if (mainTurns === 3) stream(response, { task: { subagent_type: "sprint-planner", description: "Verify worker identity", prompt: "Return a short fixture result." } });
      else if (mainTurns === 4) stream(response, { command: "false" });
      else if (mainTurns === 5) stream(response, { command: "true" });
      else stream(response, { text: "NATIVE COMPACTION VERIFIED" });
    }
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: String(error) } }));
  }
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const installation = spawnSync("python3", [
    fileURLToPath(new URL("../install.py", import.meta.url)), "--target", project,
  ], { encoding: "utf8" });
  assert.equal(installation.status, 0, `Installation failed: ${installation.error ?? ""}\n${installation.stderr}`);
  const config = {
    model: "compact-test/test-model",
    small_model: "compact-test/test-model",
    enabled_providers: ["compact-test"],
    provider: { "compact-test": { npm: "@ai-sdk/openai-compatible", name: "Local compaction test",
      options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "local-test" },
      models: { "test-model": { name: "test-model", limit: { context: 200000, output: 8000 }, tool_call: true,
        variants: { fixture: {} } } } } },
    agent: { [agent]: { model: "compact-test/test-model", mode: "primary",
      prompt: "Test native compaction: enter the approved phase alone. After continuation call status, then exercise the planner and report NATIVE COMPACTION VERIFIED." },
    "sprint-planner": { model: "compact-test/test-model", variant: "fixture", prompt: "WORKER_IDENTITY_FIXTURE" } },
    compaction: { auto: false },
    share: "disabled", autoupdate: false, snapshot: false, lsp: false, formatter: false,
  };
  await mkdir(path.join(root, "home"));
  const userConfigDir = path.join(root, "config", "opencode");
  await mkdir(userConfigDir, { recursive: true });
  await writeFile(path.join(userConfigDir, "opencode.json"), JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    permission: { bash: "deny" },
    agent: { plan: { prompt: "User Plan prompt" }, build: { prompt: "User Build prompt", permission: { task: "ask" } } },
  }));
  const env = { ...process.env, PWD: project, HOME: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"), XDG_DATA_HOME: path.join(root, "data"),
    XDG_STATE_HOME: path.join(root, "state"), XDG_CACHE_HOME: path.join(root, "cache"),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1" };
  delete env.OPENCODE_CONFIG;
  delete env.OPENCODE_CONFIG_DIR;
  delete env.OPENCODE_PID;
  delete env.OPENCODE_PURE;
  delete env.OPENCODE_DISABLE_PROJECT_CONFIG;
  const check = (...command) => {
    const result = spawnSync("opencode", ["debug", ...command], { cwd: project, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, `debug ${command.join(" ")} failed: ${result.error ?? ""}\n${result.stderr}`);
    return JSON.parse(result.stdout);
  };
  // Both layouts are discovered; the harness installs only into the plural one.
  await mkdir(path.join(project, ".opencode", "agent"));
  await writeFile(path.join(project, ".opencode", "agent", "singular-smoke.md"),
    "---\nmode: subagent\n---\nNative singular-directory discovery check.\n");
  const configured = check("config").agent;
  for (const name of ["developer", "sprinter", "coder", "code-reviewer", "code-reviewer-final",
    "sprint-planner", "plan-reviewer", "qa-run", "git-delivery", "singular-smoke"]) assert.ok(configured[name], name);
  assert.equal(configured.coder.model, "openai/coder");
  assert.equal(configured.developer.permission.task.coder, "allow");
  assert.equal(configured["code-reviewer-final"].permission.edit, "deny");
  for (const name of ["plan", "build"]) {
    const builtin = check("agent", name);
    assert.equal(builtin.prompt, `User ${name === "plan" ? "Plan" : "Build"} prompt`);
    const rule = (permission, pattern, action) =>
      assert.equal(builtin.permission.findLast((entry) => entry.permission === permission &&
        (entry.pattern === pattern || entry.pattern === "*"))?.action, action);
    rule("bash", "*", "deny");
    rule("task", "git-delivery", "deny");
    rule("sprinter_phase", "*", "deny");
    if (name === "plan") rule("edit", ".opencode/plans/*.md", "allow");
    else rule("task", "general", "ask");
  }
  const skills = check("skill").map((skill) => skill.name);
  assert.ok(skills.includes("python-development") && skills.includes("python-memory"));
  child = spawn("opencode", ["run", "--dir", project, "--format", "json", "--agent", agent, "Verify the saved phase checkpoint through native compaction."],
    { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  }).finally(() => clearTimeout(timeout));
  assert.equal(code, 0, `OpenCode failed: ${stderr}\n${stdout}`);
  const events = stdout.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  const results = events.filter((event) => event.part?.type === "tool" && event.part.tool === "sprinter_phase" && event.part.state.status === "completed")
    .map((event) => JSON.parse(event.part.state.output));
  assert.equal(results.length, 2, `Expected request/status receipts.\n${stdout}\n${stderr}`);
  assert.equal(results[0].status, "queued");
  assert.equal(results[1].status, "ready");
  assert.equal(results[0].nativeRequestID, results[1].nativeRequestID);
  assert.ok(results[1].summaryMessageID);
  assert.equal(summaries, 1, "Exactly one real native compaction should run.");
  assert.ok(requests.some(({ body }) => !body.tools?.length &&
    JSON.stringify(body.messages).includes("Preserve this Sprinter checkpoint")), "Summary receives recovery context");
  const taskOutput = events.find((event) => event.part?.tool === "task" && event.part.state.status === "completed")?.part.state.output;
  assert.match(taskOutput ?? "", /OpenCode worker identity \(session metadata\): {"status":"observed","agent":"sprint-planner","model":"compact-test\/test-model","variant":"fixture"/);
  const modelInputs = requests.map(({ body }) => JSON.stringify(body.messages));
  for (const code of [0, 1]) {
    assert.ok(modelInputs.some((input) => input.includes(`(no output)\\n\\nOpenCode shell exit code: ${code}`)),
      `Model did not receive shell exit code ${code}`);
  }
  assert.equal(mainTurns, 6, "Request -> automatic continuation/status -> worker -> shell checks -> final answer.");
  assert.match(stdout, /NATIVE COMPACTION VERIFIED/);
  console.log(JSON.stringify({ result: "PASS", agent, opencode: "native session.summarize", compactions: summaries,
    installedPlugin: true, manualNpmInstall: false,
    manualContinuation: false, request: results[0], completion: results[1] }, null, 2));
  await rm(root, { recursive: true });
} catch (error) {
  await writeFile(path.join(root, "stdout.log"), stdout);
  await writeFile(path.join(root, "stderr.log"), stderr);
  await writeFile(path.join(root, "requests.json"), JSON.stringify(requests, null, 2));
  console.error(`Smoke evidence retained at ${root}`);
  throw error;
} finally {
  if (child && child.exitCode === null) child.kill("SIGKILL");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
