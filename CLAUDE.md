# Vibehub

IDE for Claude sessions.

## Commands

- `pnpm build` - Build frontend and backend (includes TypeScript checking)
- `PORT=4000 pnpm dev` - Run dev server (auto-increments port if in use)

Note: `pnpm build` is sufficient for checking both frontend and backend
compilation errors. No need to run `npx tsc` separately.

## Architecture

- `src/server/` - Express + Socket.io backend
  - `claude/` - Claude SDK integration, session management
  - `claude/tools/` - MCP tools (session orchestration)
  - `sessions/` - Session storage (SQLite)
  - `api/` - REST endpoints
- `src/client/` - React frontend
  - `components/claude/` - Claude chat UI
  - `components/workspace/` - Sidebar, tabs, layout
  - `hooks/` - Session management hooks

## Key Patterns

- MCP tools: `mcp__{server}__{tool}` naming convention
- Socket events: `claude:message`, `claude:permission_request`, etc.
- Sessions stored in `~/.vibehub/sessions/`
- Worktrees: `{project}/.worktrees/{branch}`

## Stack

TypeScript, React, Express, Socket.io, Claude Agent SDK, SQLite, xterm.js

## UI Guidelines

- **Dark mode support**: Always use both light and dark variants for colors
  (e.g., `text-gray-700 dark:text-gray-300`, `bg-gray-50 dark:bg-gray-800`)
