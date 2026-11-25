import { tool } from "@opencode-ai/plugin";
import { createPhaseCompaction, PHASE_ARG_LIMITS } from "../lib/phase-compaction.mjs";

export default async ({ client, directory }) => {
  const phases = createPhaseCompaction(client, {
    // The plugin client uses the v1 SDK, which has no generated part.update method.
    // Keep its configured transport (including in-process OpenCode and auth).
    updatePart: async (part, context) => client._client.patch({
      url: "/session/{id}/message/{messageID}/part/{partID}",
      path: { id: part.sessionID, messageID: part.messageID, partID: part.id },
      query: { directory: context.directory },
      body: part,
      headers: { "Content-Type": "application/json" },
      throwOnError: true,
    }),
  });
  return {
    tool: {
      sprinter_phase: tool({
        description: "Sprinter's native phase checkpoint. Enter alone to queue compaction; call status in the next turn before starting work. Note records current progress; clear closes a completed phase.",
        args: {
          action: tool.schema.enum(["enter", "status", "note", "clear"]),
          phase: tool.schema.string().trim().min(1).max(PHASE_ARG_LIMITS.phase).optional(),
          plan: tool.schema.string().trim().min(1).max(PHASE_ARG_LIMITS.plan).describe("Approved plan path or conversation reference").optional(),
          handoff: tool.schema.string().trim().min(1).max(PHASE_ARG_LIMITS.handoff).optional(),
          note: tool.schema.string().trim().min(1).max(PHASE_ARG_LIMITS.note).optional(),
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
