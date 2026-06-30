import type { MyOpenAgentConfig } from "../shared/types"

export const DEFAULT_CONFIG: MyOpenAgentConfig = {
  agent: {
    name: "assistant",
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    description: "Default assistant agent",
  },
  todo_continuation: {
    enabled: true,
    cooldown_ms: 30_000,
    max_consecutive_failures: 5,
    countdown_seconds: 2,
  },
  pty: {
    max_sessions: 20,
    max_buffer_lines: 50_000,
    default_timeout_seconds: 600,
  },
  interactive_bash: {
    enabled: true,
  },
  background_task: {
    max_concurrency: 5,
    poll_interval_ms: 3000,
  },
}

export function loadConfig(): MyOpenAgentConfig {
  return {
    ...DEFAULT_CONFIG,
    background_task: {
      ...DEFAULT_CONFIG.background_task,
      max_concurrency: Number(process.env.MYOA_BG_MAX_CONCURRENCY) || DEFAULT_CONFIG.background_task.max_concurrency,
    },
    todo_continuation: {
      ...DEFAULT_CONFIG.todo_continuation,
      enabled: process.env.MYOA_TODO_DISABLE !== "1",
    },
    pty: {
      ...DEFAULT_CONFIG.pty,
      max_sessions: Number(process.env.MYOA_PTY_MAX_SESSIONS) || DEFAULT_CONFIG.pty.max_sessions,
    },
  }
}
