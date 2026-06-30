import { z } from "zod"
import type { BackgroundManager } from "../../features/background-manager/index"
import { loadConfig } from "../../config"
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

function resolveModel(category: string | undefined): { providerID: string; modelID: string } | undefined {
  const config = loadConfig()
  const cat = (category || "").toLowerCase()
  if (cat === "quick" && config.subagent.quick) return config.subagent.quick
  if ((cat === "deep" || cat === "general") && config.subagent.deep) return config.subagent.deep
  return undefined
}

export function createDelegateTask(manager: BackgroundManager) {
  return {
    description:
      "Spawn a background subagent task. Use category='quick' for fast/cheap tasks or category='deep' for complex reasoning. Each category can be configured with a different model via MYOA_QUICK_MODEL and MYOA_DEEP_MODEL env vars (format: providerID/modelID). Leave category unspecified to use the main model.",
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
      const model = resolveModel(args.category)

      try {
        const task = await manager.launch(
          `${label}: ${args.description}`,
          args.prompt,
          model
        )

        log(`delegate-task launched: ${task.id}`, {
          category: args.category,
          subagent_type: args.subagent_type,
          model: model ? `${model.providerID}/${model.modelID}` : "default",
          status: task.status,
        })

        return JSON.stringify({
          task_id: task.id,
          status: task.status,
          description: task.description,
          session_id: task.sessionId,
          model: model ? `${model.providerID}/${model.modelID}` : "default",
        })
      } catch (err: unknown) {
        return JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  }
}
