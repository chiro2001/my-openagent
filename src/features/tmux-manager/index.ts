import { log } from "../../shared/logger"
import type { PtySession } from "../../shared/types"
import type { MyOpenAgentConfig } from "../../config"

const PTY_MAX_BUFFER = 50000

export interface PtyManager {
  spawn(command: string, args: string[], options?: { title?: string; timeoutMs?: number }): PtySession
  read(id: string, offset?: number, limit?: number): { lines: string[]; totalLines: number; session: PtySession | undefined }
  write(id: string, data: string): boolean
  kill(id: string): boolean
  list(): PtySession[]
  cleanup(id: string): boolean
}

interface PtyEntry {
  session: PtySession
  proc: { stdin: { write(data: string): void }; kill(): void }
}

export function createPtyManager(config: MyOpenAgentConfig["pty"]): PtyManager {
  const sessions: Map<string, PtyEntry> = new Map()

  return {
    spawn(command: string, args: string[], options = {}): PtySession {
      if (sessions.size >= config.max_sessions) {
        throw new Error(`Max PTY sessions (${config.max_sessions}) reached`)
      }

      const id = `pty_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      const timeoutMs = options.timeoutMs ?? config.default_timeout_seconds * 1000

      const safeArgs = Array.isArray(args) ? args : []
      const proc = Bun.spawn([command, ...safeArgs], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      })

      const session: PtySession = {
        id,
        title: options.title || command,
        command,
        args,
        status: "running",
        pid: proc.pid,
        createdAt: Date.now(),
        output: [],
        maxLines: PTY_MAX_BUFFER,
      }

      sessions.set(id, { session, proc })

      const append = (text: string) => {
        const lines = text.split("\n")
        for (const line of lines) {
          session.output.push(line)
          if (session.output.length > session.maxLines) {
            session.output.shift()
          }
        }
      }

      const reader = proc.stdout.getReader()
      void (async () => {
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          append(decoder.decode(value, { stream: true }))
        }
      })()

      void proc.exited.then((exitCode) => {
        session.status = "exited"
        session.exitCode = exitCode
        log(`PTY session ${id} exited`, { exitCode })
      })

      if (timeoutMs > 0) {
        setTimeout(() => {
          if (session.status === "running") {
            proc.kill()
            session.status = "killed"
            log(`PTY session ${id} timed out`, { timeoutMs })
          }
        }, timeoutMs)
      }

      return session
    },

    read(
      id: string,
      offset = 0,
      limit = 500
    ): { lines: string[]; totalLines: number; session: PtySession | undefined } {
      const entry = sessions.get(id)
      if (!entry) {
        return { lines: [], totalLines: 0, session: undefined }
      }
      const lines = entry.session.output.slice(offset, offset + limit)
      return { lines, totalLines: entry.session.output.length, session: entry.session }
    },

    write(id: string, data: string): boolean {
      const entry = sessions.get(id)
      if (!entry || entry.session.status !== "running") return false
      entry.proc.stdin.write(data)
      return true
    },

    kill(id: string): boolean {
      const entry = sessions.get(id)
      if (!entry) return false
      if (entry.session.status === "running") {
        entry.proc.kill()
        entry.session.status = "killed"
      }
      return true
    },

    list(): PtySession[] {
      return Array.from(sessions.values()).map((e) => e.session)
    },

    cleanup(id: string): boolean {
      return sessions.delete(id)
    },
  }
}

export const ptyManager = createPtyManager({
  max_sessions: 20,
  max_buffer_lines: 50000,
  default_timeout_seconds: 600,
})
