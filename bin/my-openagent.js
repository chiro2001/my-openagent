#!/usr/bin/env node
// Platform detection shim for my-openagent
// Currently Linux x64 only. Extend for other platforms as needed.
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const platform = os.platform()
const arch = os.arch()

// For now, run directly with bun
// In production, you'd ship platform-specific binaries
console.log("my-openagent CLI - use with OpenCode plugin")
