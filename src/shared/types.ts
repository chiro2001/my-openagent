import type { PluginInput } from "@opencode-ai/plugin"

export type PluginContext = PluginInput

export interface TodoItem {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority: "high" | "medium" | "low"
  createdAt: number
  updatedAt: number
}

export interface BackgroundTask {
  id: string
  sessionId: string
  status: "pending" | "running" | "completed" | "error" | "cancelled"
  description: string
  createdAt: number
}

export interface PtySession {
  id: string
  title: string
  command: string
  args: string[]
  status: "running" | "exited" | "killed"
  exitCode?: number
  pid: number
  createdAt: number
  output: string[]
  maxLines: number
}

export interface AgentConfig {
  name: string
  model: string
  provider: string
  description: string
}

export interface MyOpenAgentConfig {
  agent: AgentConfig
  subagent: {
    quick?: { providerID: string; modelID: string }
    deep?: { providerID: string; modelID: string }
  }
  todo_continuation: {
    enabled: boolean
    cooldown_ms: number
    max_consecutive_failures: number
    countdown_seconds: number
  }
  pty: {
    max_sessions: number
    max_buffer_lines: number
    default_timeout_seconds: number
  }
  interactive_bash: {
    enabled: boolean
  }
  background_task: {
    max_concurrency: number
    poll_interval_ms: number
  }
}
