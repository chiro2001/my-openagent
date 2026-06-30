import type { Plugin, PluginModule, Hooks, PluginInput } from "@opencode-ai/plugin"
import { loadConfig } from "./config"
import { log } from "./shared/logger"
import { todoManager } from "./features/todo-manager/index"

import { BackgroundManager } from "./features/background-manager/index"
import { createPtyTools } from "./tools/pty/index"
import { createDelegateTask } from "./tools/delegate-task/index"
import { createBackgroundTaskTools } from "./tools/background-task/index"
import { createInteractiveBash } from "./tools/interactive-bash/index"
import { createTodoContinuationEnforcer } from "./hooks/todo-continuation/index"
import { createStopContinuationGuard } from "./hooks/stop-continuation/index"

async function createAllTools(ctx: PluginInput) {
  const config = loadConfig()
  const bgManager = new BackgroundManager(
    ctx,
    config.background_task.max_concurrency
  )
  const { ptyManager } = await import("./features/tmux-manager/index")

  return {
    bgManager,
    tools: {
      ...createPtyTools(ptyManager),
      task: createDelegateTask(bgManager),
      ...createBackgroundTaskTools(bgManager),
      interactive_bash: createInteractiveBash(),
    },
  }
}

const serverPlugin: Plugin = async (input: PluginInput): Promise<Hooks> => {
  log("Plugin loading", { directory: input.directory })

  const config = loadConfig()
  log("Config loaded", { agent: config.agent.name })

  const { bgManager, tools } = await createAllTools(input)

  const continuationGuard = createStopContinuationGuard({
    backgroundManager: bgManager,
  })

  const todoEnforcer = createTodoContinuationEnforcer(input, {
    config: config.todo_continuation,
    backgroundManager: bgManager,
    isContinuationStopped: (sid) => continuationGuard.isStopped(sid),
  })

  return {
    tool: tools,

    event: async (eventInput: { event: { type: string; properties?: unknown } }) => {
      await todoEnforcer.handler(eventInput)
      continuationGuard.eventHandler(eventInput)
    },

    "tool.execute.after": async (toolInput: Record<string, unknown>) => {
      if (toolInput.tool === "todowrite" && toolInput.args && toolInput.sessionID) {
        todoManager.updateFromToolCall(
          String(toolInput.sessionID),
          toolInput.args as string | Record<string, unknown>
        )
      }
    },

    "chat.message": async (msgInput: Record<string, unknown>) => {
      const sid = msgInput.sessionID as string | undefined
      if (sid) {
        bgManager.setParentSessionId(sid)
      }
      const text = String(msgInput.message && typeof msgInput.message === "object"
        ? ((msgInput.message as Record<string, unknown>).text || "")
        : "")
      if (text.includes("/stop-continuation") && sid) {
        continuationGuard.stop(sid)
      }
    },

    "command.execute.before": async (cmdInput: Record<string, unknown>) => {
      const cmd = cmdInput.command as Record<string, unknown> | undefined
      if (cmd?.name === "stop-continuation") {
        const sid = cmdInput.sessionID as string | undefined
        if (sid) continuationGuard.stop(sid)
      }
    },

    dispose: async (): Promise<void> => {
      todoEnforcer.dispose()
      bgManager.shutdown()
      log("Plugin disposed")
    },
  }
}

const pluginModule: PluginModule = {
  id: "my-openagent",
  server: serverPlugin,
}

export const myOpenAgentPlugin = pluginModule.server
export default pluginModule
