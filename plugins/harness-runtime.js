const workers = new Set([
  "coder", "code-reviewer", "code-reviewer-final", "sprint-planner", "plan-reviewer", "qa-run", "git-delivery",
]);
const harnessAgents = ["developer", "sprinter", ...workers];

function restrictBuiltins(config) {
  config.agent ??= {};
  for (const name of ["build", "plan"]) {
    const agent = config.agent[name] ??= {};
    const permission = agent.permission ??= {};
    permission.sprinter_phase = "deny";
    const { task } = permission;
    if (task === "deny") continue;
    const rules = typeof task === "string" ? { "*": task } : { ...task };
    for (const worker of harnessAgents) {
      // OpenCode uses the last matching rule, including when a wildcard is configured.
      delete rules[worker];
      rules[worker] = "deny";
    }
    permission.task = rules;
  }
}

export default async ({ client, directory }) => ({
  config: async (config) => { restrictBuiltins(config); },
  "tool.execute.after": async ({ tool, sessionID, args }, output) => {
    if (tool === "bash") {
      const exit = output.metadata?.exit;
      output.output += `\n\nOpenCode shell exit code: ${Number.isInteger(exit) ? exit : "unavailable"}`;
      return;
    }
    if (tool !== "task" || !workers.has(args?.subagent_type)) return;
    const childID = output.metadata?.sessionId;
    let identity = { status: "unavailable" };
    if (typeof childID === "string") {
      const request = { path: { id: childID }, query: { directory }, throwOnError: true };
      try {
        const { data: child } = await client.session.get(request);
        if (child?.parentID === sessionID) {
          const { data } = await client.session.messages(request);
          const last = data?.at(-1)?.info;
          if (last?.role === "assistant" && last.agent && last.providerID && last.modelID && !last.error) {
            identity = { status: "observed", agent: last.agent, model: `${last.providerID}/${last.modelID}`,
              variant: last.variant ?? null, sessionID: childID };
          }
        }
      } catch {
        // Leave the report intact; missing runtime identity is not verified identity.
      }
    }
    output.output += `\n\nOpenCode worker identity (session metadata): ${JSON.stringify(identity)}`;
  },
});
