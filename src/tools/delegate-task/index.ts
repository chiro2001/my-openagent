import { z } from "zod"
import type { BackgroundManager } from "../../features/background-manager/index"
import { log } from "../../shared/logger"

const delegateTaskSchema = z.object({
  category: z.string().optional(),
  subagent_type: z.string().optional(),
  load_skills: z.array(z.string()).optional().default([]),
  description: z.string(),
  prompt: z.string(),
  run_in_background: z.boolean().optional().default(false),
  task_id: z.string().optional(),
})

export function createDelegateTask(manager: BackgroundManager) {
  return {
    description:
      "Spawn a background subagent task to execute work independently. Use run_in_background=true for parallel execution. Use task_id to continue an existing task session. Provide either category or subagent_type.",
    parameters: delegateTaskSchema,
    async execute(args: z.infer<typeof delegateTaskSchema>) {
      if (!args.category && !args.subagent_type && !args.task_id) {
        return JSON.stringify({
          error: "Must provide at least one of: category, subagent_type, or task_id",
        })
      }

      if (args.task_id) {
        return JSON.stringify({
          status: "continuation_not_implemented",
          task_id: args.task_id,
          message: "Task continuation via task_id is not yet implemented in this version.",
        })
      }

      const label = args.category || args.subagent_type || "task"

      try {
        const task = await manager.launch(
          `${label}: ${args.description}`,
          args.prompt
        )

        log(`delegate-task launched: ${task.id}`, {
          category: args.category,
          subagent_type: args.subagent_type,
          status: task.status,
        })

        return JSON.stringify({
          task_id: task.id,
          status: task.status,
          description: task.description,
          session_id: task.sessionId,
        })
      } catch (err: unknown) {
        return JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  }
}
