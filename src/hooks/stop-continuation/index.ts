import type { BackgroundManager } from "../../features/background-manager/index"
import { log } from "../../shared/logger"

const HOOK_NAME = "stop-continuation-guard"

export interface StopContinuationGuard {
  isStopped: (sessionId: string) => boolean
  stop: (sessionId: string) => void
  clear: (sessionId: string) => void
  eventHandler: (input: { event: { type: string; properties?: unknown } }) => void
}

export function createStopContinuationGuard(options?: {
  backgroundManager?: BackgroundManager
}): StopContinuationGuard {
  const stoppedSessions = new Set<string>()

  const stop = (sessionId: string): void => {
    stoppedSessions.add(sessionId)
    log(`[${HOOK_NAME}] Continuation stopped`, { sessionId })

    if (options?.backgroundManager) {
      const tasks = options.backgroundManager.getAllTasks()
      for (const task of tasks) {
        if (task.status === "running" || task.status === "pending") {
          options.backgroundManager.cancel(task.id)
        }
      }
    }
  }

  const isStopped = (sessionId: string): boolean => {
    return stoppedSessions.has(sessionId)
  }

  const clear = (sessionId: string): void => {
    stoppedSessions.delete(sessionId)
    log(`[${HOOK_NAME}] Continuation guard cleared`, { sessionId })
  }

  const eventHandler = (input: {
    event: { type: string; properties?: unknown }
  }): void => {
    const props = input.event.properties as Record<string, unknown> | undefined
    if (input.event.type === "session.deleted") {
      const sessionId = props?.session?.id as string | undefined
      if (sessionId) {
        clear(sessionId)
      }
    }
  }

  return { isStopped, stop, clear, eventHandler }
}
