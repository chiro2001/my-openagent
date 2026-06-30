import { z } from "zod"
import { log } from "../../shared/logger"

const interactiveBashSchema = z.object({
  command: z.string(),
  workdir: z.string().optional(),
  timeoutMs: z.number().optional(),
})

function generateSessionName(): string {
  return `myoa_${Date.now().toString(36)}`
}

export function createInteractiveBash() {
  return {
    description:
      "Execute a command in an interactive tmux session. Use for commands requiring user interaction, long-running processes, or interactive REPLs. The session persists in tmux and can be attached manually.",
    parameters: interactiveBashSchema,
    async execute(args: z.infer<typeof interactiveBashSchema>) {
      const sessionName = generateSessionName()
      const workdir = args.workdir || process.cwd()

      try {
        const fullCommand = `cd "${workdir}" && ${args.command}`

        const proc = Bun.spawn(
          ["tmux", "new-session", "-d", "-s", sessionName, fullCommand],
          { stdout: "pipe", stderr: "pipe" }
        )

        await proc.exited

        if (proc.exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text()
          return JSON.stringify({
            error: `Failed to create tmux session: ${stderr}`,
          })
        }

        if (args.timeoutMs && args.timeoutMs > 0) {
          setTimeout(() => {
            Bun.spawn(["tmux", "kill-session", "-t", sessionName])
          }, args.timeoutMs)
        }

        log(`interactive_bash: tmux session ${sessionName} created`, {
          command: args.command,
          workdir,
        })

        return JSON.stringify({
          sessionName,
          status: "running",
          command: args.command,
          workdir,
          attach: `tmux attach-session -t ${sessionName}`,
        })
      } catch (err: unknown) {
        return JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
  }
}
