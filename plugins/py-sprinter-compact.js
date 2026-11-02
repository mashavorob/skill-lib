import { tool } from "@opencode-ai/plugin";
import { createCompactionController } from "../skills/py-development-loop/lib/sprinter-compaction.mjs";

export default async ({ client }) => {
  const controller = createCompactionController(client);
  return {
    tool: {
      sprinter_compact: tool({
        description: "Request native OpenCode compaction of this SAME session before a Python or C++ Sprinter phase, or verify its completion. Save the journal checkpoint first. Call request alone, not in a parallel batch: queued is not completed. The native loop compacts and auto-continues; then call status with the same checkpoint and phase. Never await summarize inside the active tool or ask the user to type /compact.",
        args: {
          action: tool.schema.enum(["request", "status"]),
          checkpoint: tool.schema.string().min(1).describe("Absolute path of the existing run journal directory"),
          phase: tool.schema.string().min(1).describe("The next phase ID, including 0"),
        },
        execute: (args, context) => controller.execute(args, context),
      }),
    },
    "experimental.session.compacting": async ({ sessionID }, output) => {
      const context = controller.recoveryContext(sessionID);
      if (context) output.context.push(context);
    },
  };
};
