import { z } from "zod"
import type { PtyManager } from "../../features/tmux-manager/index"
import { log } from "../../shared/logger"

const ptySpawnSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
  title: z.string().optional(),
  description: z.string().optional(),
  notifyOnExit: z.boolean().optional().default(false),
  timeoutSeconds: z.number().optional(),
  workdir: z.string().optional(),
  env: z.record(z.string()).optional(),
})

const ptyReadSchema = z.object({
  id: z.string(),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(500),
  pattern: z.string().optional(),
  ignoreCase: z.boolean().optional().default(false),
})

const ptyWriteSchema = z.object({
  id: z.string(),
  data: z.string(),
})

const ptyKillSchema = z.object({
  id: z.string(),
  cleanup: z.boolean().optional().default(false),
})

const ptyListSchema = z.object({})

export function createPtyTools(manager: PtyManager) {
  return {
    pty_spawn: {
      description:
        "Spawns a new PTY session that runs in the background. The command must be a bare executable name (e.g. 'echo', 'bash', 'ls'). Use args array to pass arguments (e.g. command='echo', args=['hello']). Persists for long-running processes, interactive input, and output reading.",
      parameters: ptySpawnSchema,
      async execute(args: z.infer<typeof ptySpawnSchema>) {
        try {
          const cmdArgs = Array.isArray(args.args) ? args.args : []
          const session = manager.spawn(args.command, cmdArgs, {
            title: args.title,
            timeoutMs: args.timeoutSeconds ? args.timeoutSeconds * 1000 : undefined,
          })
          log(`pty_spawn: ${session.id}`, { command: args.command, pid: session.pid })
          return JSON.stringify({
            id: session.id,
            pid: session.pid,
            status: session.status,
            title: session.title,
            command: session.command,
            createdAt: new Date(session.createdAt).toISOString(),
          })
        } catch (err: unknown) {
          return JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          })
        }
      },
    },

    pty_read: {
      description:
        "Reads output from a PTY session buffer. Use offset and limit to paginate. The PTY maintains a rolling buffer of output lines. Use pattern to filter lines by regex.",
      parameters: ptyReadSchema,
      async execute(args: z.infer<typeof ptyReadSchema>) {
        const { lines, totalLines, session } = manager.read(args.id, args.offset, args.limit)
        if (!session) {
          return JSON.stringify({ error: `PTY session ${args.id} not found` })
        }

        let filtered = lines
        if (args.pattern) {
          try {
            const regex = new RegExp(args.pattern, args.ignoreCase ? "i" : "")
            filtered = lines.filter((line) => regex.test(line))
          } catch {
            return JSON.stringify({ error: `Invalid regex pattern: ${args.pattern}` })
          }
        }

        return JSON.stringify({
          sessionId: session.id,
          status: session.status,
          totalLines,
          offset: args.offset,
          limit: args.limit,
          returnedLines: filtered.length,
          lines: filtered,
          hasMore: args.offset + args.limit < totalLines,
        })
      },
    },

    pty_write: {
      description:
        "Sends input data to an active PTY session. Use for typing commands, responding to prompts, or sending control sequences like Ctrl+C (\\x03), Enter (\\n).",
      parameters: ptyWriteSchema,
      async execute(args: z.infer<typeof ptyWriteSchema>) {
        const ok = manager.write(args.id, args.data)
        return ok ? "success" : JSON.stringify({ error: `Cannot write to PTY ${args.id}` })
      },
    },

    pty_kill: {
      description:
        "Terminates a PTY session and optionally cleans up its buffer. Use cleanup=true to free memory.",
      parameters: ptyKillSchema,
      async execute(args: z.infer<typeof ptyKillSchema>) {
        const ok = manager.kill(args.id)
        if (!ok) return JSON.stringify({ error: `PTY session ${args.id} not found` })
        if (args.cleanup) manager.cleanup(args.id)
        log(`pty_kill: ${args.id}`)
        return `PTY session ${args.id} killed`
      },
    },

    pty_list: {
      description:
        "Lists all PTY sessions (active and exited) with status and output line count.",
      parameters: ptyListSchema,
      async execute(_args: z.infer<typeof ptyListSchema>) {
        const sessions = manager.list()
        const result = sessions.map((s) => ({
          id: s.id,
          title: s.title,
          command: s.command,
          status: s.status,
          exitCode: s.exitCode,
          pid: s.pid,
          lineCount: s.output.length,
          createdAt: new Date(s.createdAt).toISOString(),
        }))
        return JSON.stringify(result)
      },
    },
  }
}
