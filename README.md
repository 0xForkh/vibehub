# Vibehub

IDE for Claude sessions. Manage multiple Claude Code agents from a single web
interface.

## Features

- **Multi-session management**: Multiple Claude sessions in one browser window
- **Session persistence**: Sessions survive disconnects/restarts
- **Claude Code integration**: AI-powered coding sessions via Claude Agent SDK
- **Flexible layouts**: Horizontal, vertical, or grid arrangements with
  resizable panes

## Requirements

- Node.js >= 18
- tmux
- make, python, build-essential (for node-pty)
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

## Install

```sh
pnpm install
pnpm build
pnpm start
```

## Usage

```sh
# Start server
pnpm start --port 3000

# Development mode
pnpm dev
```

Open `http://localhost:3000` in your browser.

## CLI Options

```
--port, -p      Listen port (default: 3000)
--host          Listen host (default: 0.0.0.0)
--log-level     Log level (error, warn, info, debug)
```

## Architecture

- **Frontend**: React 19, xterm.js, Socket.IO, Tailwind CSS
- **Backend**: Node.js, Express, Socket.IO, node-pty, tmux
- **Storage**: Redis (with persistence) or in-memory
- **Build**: esbuild, TypeScript, PostCSS

## Claude Code Sessions

Requires Claude Code CLI installed and authenticated:

```sh
npm install -g @anthropic-ai/claude-code
claude login
```

Create Claude sessions from the dashboard. Permission modes:

- **Default**: Ask for each tool use
- **Accept Edits**: Auto-approve file operations
- **Bypass All**: Auto-approve everything
- **Plan Mode**: No execution

## Dictation

Voice dictation uses ElevenLabs for real-time speech-to-text. Set
`ELEVENLABS_API_KEY` environment variable to enable.

### Microphone Access on Local Network

Browsers require HTTPS for microphone access on non-localhost origins. For
development on local network IPs (e.g., accessing via Tailscale), enable
Chrome's insecure origins flag:

1. Open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Add your server URL (e.g., `http://192.168.1.100:3000`)
3. Restart Chrome

This allows microphone access over HTTP for the specified origins.

## Docker

```sh
docker run --rm -p 3000:3000 vibehub/vibehub
```

## License

MIT
