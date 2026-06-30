/**
 * Simple logger utility.
 */
const LOG_TO_FILE = process.env.MYOA_LOG_FILE
const LOG_TO_STDERR = process.env.MYOA_LOG_STDERR === "1"
export const LOGGER_ENABLED = Boolean(LOG_TO_FILE || LOG_TO_STDERR)

export function log(message: string, data?: Record<string, unknown>): void {
  if (!LOGGER_ENABLED) return
  const timestamp = new Date().toISOString()
  const extra = data ? ` ${JSON.stringify(data)}` : ""
  const line = `[my-openagent][${timestamp}] ${message}${extra}`
  if (LOG_TO_FILE) {
    Bun.write(LOG_TO_FILE, line + "\n", { createPath: true })
  }
  if (LOG_TO_STDERR) {
    console.error(line)
  }
}
