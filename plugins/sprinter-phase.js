import { tool } from "@opencode-ai/plugin";
import { createPhaseCompaction } from "../lib/phase-compaction.mjs";

export default async ({ client, directory }) => {
  const phases = createPhaseCompaction(client);
  return {
    tool: {
      sprinter_phase: tool({
        description: "Sprinter's native phase checkpoint. Enter alone to queue compaction; call status in the next turn before starting work. Note records current progress; clear closes a completed phase.",
        args: {
          action: tool.schema.enum(["enter", "status", "note", "clear"]),
          phase: tool.schema.string().trim().min(1).max(120).optional(),
          plan: tool.schema.string().trim().min(1).max(1000).describe("Approved plan path or conversation reference").optional(),
          handoff: tool.schema.string().trim().min(1).max(4000).optional(),
          note: tool.schema.string().trim().min(1).max(4000).optional(),
        },
        execute: phases.execute,
      }),
    },
    "experimental.session.compacting": async ({ sessionID }, output) => {
      const context = await phases.recoveryContext({ sessionID, directory });
      if (context) output.context.push(context);
    },
  };
};
