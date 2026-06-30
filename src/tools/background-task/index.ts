import { z } from "zod"
import type { BackgroundManager } from "../../features/background-manager/index"
import { log } from "../../shared/logger"

const bgOutputSchema = z.object({
  task_id: z.string().optional(),
  taskId: z.string().optional(),
  full_session: z.boolean().optional().default(false),
  block: z.boolean().optional().default(false),
  timeout: z.number().optional(),
  include_thinking: z.boolean().optional(),
  message_limit: z.number().optional(),
})

const bgCancelSchema = z.object({
  taskId: z.string(),
  all: z.boolean().optional().default(false),
})

export function createBackgroundTaskTools(manager: BackgroundManager) {
  return {
    background_output: {
      description:
        "Get output from a background task. Only call AFTER receiving a system notification for the task completion. Use full_session=true to retrieve the full session messages.",
      parameters: bgOutputSchema,
      async execute(args: z.infer<typeof bgOutputSchema>) {
        const taskId = args.task_id || args.taskId
        if (!taskId) {
          return JSON.stringify({ error: "task_id or taskId is required" })
        }
        const result = await manager.getOutput(taskId)
        return JSON.stringify({
          task_id: taskId,
          status: result.status,
          ...(result.output ? { output: result.output } : {}),
        })
      },
    },

    background_cancel: {
      description:
        "Cancel a running background task. Use taskId for a specific task. Set all=true to cancel all tasks. Never use all=true in normal workflow.",
      parameters: bgCancelSchema,
      async execute(args: z.infer<typeof bgCancelSchema>) {
        if (args.all) {
          manager.shutdown()
          log("background_cancel: all tasks cancelled")
          return "All background tasks cancelled"
        }

        const ok = manager.cancel(args.taskId)
        log(`background_cancel: ${args.taskId}`, { success: ok })
        return ok
          ? `Task ${args.taskId} cancelled`
          : JSON.stringify({ error: `Task ${args.taskId} not found` })
      },
    },
  }
}
