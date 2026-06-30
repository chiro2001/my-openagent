import type { BackgroundTask } from "../../shared/types"
import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared/logger"

interface TaskEntry {
  task: BackgroundTask
  abortController: AbortController
  pollTimer?: ReturnType<typeof setInterval>
}

export class BackgroundManager {
  private tasks: Map<string, TaskEntry> = new Map()
  private client: PluginInput["client"]
  private directory: string
  private parentSessionId: string
  private maxConcurrency: number

  constructor(ctx: PluginInput, maxConcurrency = 5, parentSessionId = "") {
    this.client = ctx.client
    this.directory = ctx.directory
    this.parentSessionId = parentSessionId
    this.maxConcurrency = maxConcurrency
  }

  get activeCount(): number {
    let count = 0
    for (const [, entry] of this.tasks) {
      if (entry.task.status === "running" || entry.task.status === "pending") {
        count++
      }
    }
    return count
  }

  get availableSlots(): number {
    return Math.max(0, this.maxConcurrency - this.activeCount)
  }

  setParentSessionId(id: string): void {
    this.parentSessionId = id
  }

  async launch(
    description: string,
    prompt: string,
    model?: { providerID: string; modelID: string }
  ): Promise<BackgroundTask> {
    const id = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const task: BackgroundTask = {
      id,
      sessionId: "",
      status: "pending",
      description,
      createdAt: Date.now(),
    }

    const abortController = new AbortController()
    this.tasks.set(id, { task, abortController })

    try {
      const createResult = await this.client.session.create({
        body: {
          parentID: this.parentSessionId || undefined,
          title: description.slice(0, 100),
        } as Record<string, unknown>,
        query: { directory: this.directory },
      })

      if (createResult.error) {
        task.status = "error"
        log(`Background task session create failed: ${id}`, {
          error: String(createResult.error),
        })
        return task
      }

      const sessionId = (createResult.data as { id: string }).id
      task.sessionId = sessionId
      task.status = "running"
      log(`Background task session created: ${id}`, { sessionId })

      const parts: Array<{ type: string; text: string }> = [
        { type: "text", text: prompt },
      ]

      const body: Record<string, unknown> = { parts }
      if (model) {
        body.model = { providerID: model.providerID, modelID: model.modelID }
      }

      this.client.session.prompt({
        path: { id: sessionId },
        body,
        query: { directory: this.directory },
      } as Parameters<typeof this.client.session.prompt>[0])
        .then(() => {
          task.status = "completed"
          log(`Background task completed: ${id}`, { sessionId })
          this.stopPolling(id)
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") {
            task.status = "cancelled"
          } else {
            task.status = "error"
            log(`Background task error: ${id}`, {
              error: err instanceof Error ? err.message : String(err),
            })
          }
          this.stopPolling(id)
        })

      task.status = "running"
    } catch (err: unknown) {
      task.status = "error"
      log(`Background task launch error: ${id}`, {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return task
  }

  private stopPolling(taskId: string): void {
    const entry = this.tasks.get(taskId)
    if (entry?.pollTimer) {
      clearInterval(entry.pollTimer)
      entry.pollTimer = undefined
    }
  }

  cancel(id: string): boolean {
    const entry = this.tasks.get(id)
    if (!entry) return false

    entry.abortController.abort()
    if (entry.task.status === "running" || entry.task.status === "pending") {
      entry.task.status = "cancelled"
    }
    this.stopPolling(id)
    return true
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.tasks.get(id)?.task
  }

  async getOutput(id: string): Promise<{ status: string; output?: string }> {
    const task = this.getTask(id)
    if (!task) {
      return { status: "not_found" }
    }

    if (!task.sessionId) {
      return { status: task.status }
    }

    try {
      const result = await this.client.session.messages({
        path: { id: task.sessionId },
      })

      if (result.error) {
        return { status: task.status, output: `(fetch error: ${String(result.error)})` }
      }

      const messages = result.data as Array<{
        info?: { role?: string }
        parts?: Array<{ type?: string; text?: string }>
      }> | undefined

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return { status: task.status, output: "(no messages)" }
      }

      const assistantMessages = messages.filter(
        (m) => m.info?.role === "assistant"
      )

      if (assistantMessages.length === 0) {
        return { status: task.status, output: "(no assistant response)" }
      }

      const output = assistantMessages
        .flatMap((m) => (m.parts || []).filter((p) => p.type === "text"))
        .map((p) => p.text || "")
        .filter(Boolean)
        .join("\n")

      return { status: task.status, output }
    } catch (err: unknown) {
      return {
        status: task.status,
        output: `(fetch error: ${err instanceof Error ? err.message : String(err)})`,
      }
    }
  }

  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).map((e) => e.task)
  }

  getAllDescendantTasks(_sessionId: string): BackgroundTask[] {
    return this.getAllTasks()
  }

  cancelTask(taskId: string, _options?: unknown): Promise<void> {
    this.cancel(taskId)
    return Promise.resolve()
  }

  shutdown(): void {
    for (const [id, entry] of this.tasks) {
      entry.abortController.abort()
      this.stopPolling(id)
      this.tasks.delete(id)
    }
  }
}
