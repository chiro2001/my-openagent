import type { PluginInput } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-manager/index"
import { todoManager } from "../../features/todo-manager/index"
import { log } from "../../shared/logger"
import type { MyOpenAgentConfig } from "../../config"

const HOOK_NAME = "todo-continuation-enforcer"

const CONTINUATION_PROMPT = `\
You have incomplete tasks remaining in your todo list.
Review your progress and continue working on pending tasks.

Your todo list has {count} incomplete item(s).
Please mark completed items and continue with the next pending task.`

interface SessionState {
  failureCount: number
  lastInjectedAt: number
  cooldownUntil: number
  countdownTimer?: ReturnType<typeof setTimeout>
  isRecovering: boolean
  wasCancelled: boolean
}

export interface TodoContinuationEnforcer {
  handler: (input: { event: { type: string; properties?: unknown } }) => Promise<void>
  dispose: () => void
}

export function createTodoContinuationEnforcer(
  ctx: PluginInput,
  options: {
    config: MyOpenAgentConfig["todo_continuation"]
    backgroundManager?: BackgroundManager
    isContinuationStopped?: (sessionId: string) => boolean
  }
): TodoContinuationEnforcer {
  const { config, backgroundManager, isContinuationStopped } = options
  const sessions = new Map<string, SessionState>()

  function getState(sessionId: string): SessionState {
    let state = sessions.get(sessionId)
    if (!state) {
      state = {
        failureCount: 0,
        lastInjectedAt: 0,
        cooldownUntil: 0,
        isRecovering: false,
        wasCancelled: false,
      }
      sessions.set(sessionId, state)
    }
    return state
  }

  const handler = async ({
    event,
  }: {
    event: { type: string; properties?: unknown }
  }): Promise<void> => {
    if (!config.enabled) return

    const props = event.properties as Record<string, unknown> | undefined
    if (event.type === "session.idle") {
      const sessionId = props?.session?.id as string | undefined
      if (!sessionId) return

      if (isContinuationStopped?.(sessionId)) {
        log(`[${HOOK_NAME}] Continuation stopped for session`, { sessionId })
        return
      }

      const store = todoManager.getOrCreate(sessionId)
      if (!store.hasIncomplete()) return

      const state = getState(sessionId)
      const now = Date.now()

      if (now < state.cooldownUntil) return
      if (state.isRecovering) return

      const bgCount = backgroundManager?.activeCount ?? 0
      if (bgCount > 0) return

      if (state.failureCount >= config.max_consecutive_failures) return

      state.countdownTimer = setTimeout(async () => {
        try {
          const prompt = CONTINUATION_PROMPT.replace(
            "{count}",
            String(store.getIncompleteCount())
          )
          await ctx.client.session.prompt(sessionId, prompt)
          state.lastInjectedAt = now
          state.cooldownUntil = now + config.cooldown_ms
          log(`[${HOOK_NAME}] Continuation prompt injected`, { sessionId })
        } catch (err: unknown) {
          state.failureCount++
          state.cooldownUntil = now + config.cooldown_ms * (state.failureCount + 1)
          log(`[${HOOK_NAME}] Continuation failed`, {
            sessionId,
            failureCount: state.failureCount,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }, config.countdown_seconds * 1000)
    }

    if (event.type === "session.deleted") {
      const sessionId = props?.session?.id as string | undefined
      if (sessionId) {
        const state = sessions.get(sessionId)
        if (state?.countdownTimer) {
          clearTimeout(state.countdownTimer)
        }
        sessions.delete(sessionId)
        todoManager.clear(sessionId)
      }
    }
  }

  return {
    handler,
    dispose: () => {
      for (const [id, state] of sessions) {
        if (state.countdownTimer) clearTimeout(state.countdownTimer)
        sessions.delete(id)
      }
    },
  }
}
