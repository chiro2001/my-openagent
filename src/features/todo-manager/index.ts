import type { TodoItem } from "../../shared/types"
import { log } from "../../shared/logger"

export interface TodoStore {
  todos: TodoItem[]
  getIncompleteCount(): number
  hasIncomplete(): boolean
}

export function createTodoStore(): TodoStore {
  const todos: TodoItem[] = []

  return {
    todos,

    getIncompleteCount(): number {
      return todos.filter(
        (t) => t.status === "pending" || t.status === "in_progress"
      ).length
    },

    hasIncomplete(): boolean {
      return this.getIncompleteCount() > 0
    },
  }
}

function parseTodosFromObject(obj: Record<string, unknown>): TodoItem[] {
  const todosArray = obj.todos
  if (!Array.isArray(todosArray)) return []

  return todosArray.map(
    (t: Record<string, unknown>, i: number): TodoItem => ({
      id: `todo_${Date.now()}_${i}`,
      content: String(t.content || ""),
      status: (t.status as TodoItem["status"]) || "pending",
      priority: (t.priority as TodoItem["priority"]) || "medium",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  )
}

export function parseTodosFromToolCall(args: string | Record<string, unknown>): TodoItem[] {
  if (typeof args === "string") {
    try {
      return parseTodosFromObject(JSON.parse(args))
    } catch {
      return []
    }
  }
  if (typeof args === "object" && args !== null) {
    return parseTodosFromObject(args)
  }
  return []
}

class TodoManagerImpl {
  private sessions: Map<string, TodoStore> = new Map()

  getOrCreate(sessionId: string): TodoStore {
    let store = this.sessions.get(sessionId)
    if (!store) {
      store = createTodoStore()
      this.sessions.set(sessionId, store)
    }
    return store
  }

  updateFromToolCall(sessionId: string, args: string | Record<string, unknown>): void {
    const items = parseTodosFromToolCall(args)
    if (items.length === 0) return

    const store = this.getOrCreate(sessionId)
    store.todos.length = 0
    store.todos.push(...items)
    log(`Updated todos for session ${sessionId}`, {
      count: items.length,
      incomplete: store.getIncompleteCount(),
    })
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}

export const todoManager = new TodoManagerImpl()
