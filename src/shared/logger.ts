import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendFileSync, renameSync, statSync } from "node:fs"

const LOG_FILE = join(tmpdir(), "my-openagent.log")
const MAX_SIZE = 50 * 1024 * 1024
const MAX_BACKUPS = 2

let logBuffer: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function getSize(): number {
  try { return statSync(LOG_FILE).size } catch { return 0 }
}

function rotateIfNeeded(): void {
  if (getSize() < MAX_SIZE) return
  for (let i = MAX_BACKUPS; i >= 1; i--) {
    try { renameSync(`${LOG_FILE}.${i}`, `${LOG_FILE}.${i + 1}`) } catch { /* ignore */ }
  }
  try { renameSync(LOG_FILE, `${LOG_FILE}.1`) } catch { /* ignore */ }
}

function flush(): void {
  if (logBuffer.length === 0) return
  rotateIfNeeded()
  try { appendFileSync(LOG_FILE, logBuffer.join("") + "\n") } catch { /* ignore */ }
  logBuffer = []
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => { flush(); flushTimer = null }, 1000)
}

export function log(message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString()
  const extra = data ? ` ${JSON.stringify(data)}` : ""
  const line = `[my-openagent][${timestamp}] ${message}${extra}`
  logBuffer.push(line)
  scheduleFlush()
  if (logBuffer.length >= 100) flush()
}

export function getLogFilePath(): string {
  return LOG_FILE
}
