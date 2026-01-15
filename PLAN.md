# Session Orchestration Tools

## Overview

Add MCP tools that allow Claude to create and interact with other sessions. This
enables workflows like:

- Create worktree + spawn session for a feature
- Send implementation instructions to child session
- Query child session status/results

## Tools to Implement

### 1. `create_session`

Creates a new Claude session, optionally with a git worktree.

```typescript
create_session({
  name: string;                    // Session name
  workingDir: string;              // Base working directory
  worktree?: {                     // Optional: create git worktree
    branch: string;                // Branch name (created if doesn't exist)
    path?: string;                 // Relative path, defaults to .worktrees/<branch>
  };
  initialMessage?: string;         // Optional: send message after creation
  permissionMode?: PermissionMode; // Optional: defaults to 'default'
}) → { sessionId: string; workingDir: string }
```

**Behavior:**

1. If `worktree` specified:
   - Run `git worktree add <path> -b <branch>` (or without -b if branch exists)
   - Set session workingDir to the worktree path
2. Create session in database via SessionStore
3. If `initialMessage` provided, queue it for the new session
4. Return sessionId and final workingDir

### 2. `send_to_session`

Sends a message to another session.

```typescript
send_to_session({
  sessionId: string;
  message: string;
}) → { success: boolean; error?: string }
```

**Behavior:**

1. Verify session exists
2. If session is active (has socket connection), send message directly
3. If session is idle, queue message for next activation
4. Return success status

### 3. `get_session_status`

Gets the current status of a session.

```typescript
get_session_status({
  sessionId: string;
}) → {
  exists: boolean;
  status: 'idle' | 'thinking' | 'waiting_permission' | 'error' | 'not_started';
  workingDir: string;
  lastActivity?: string;           // ISO timestamp
  pendingMessages?: number;        // Queued messages waiting
}
```

### 4. `list_sessions`

Lists all available sessions.

```typescript
list_sessions() → {
  sessions: Array<{
    id: string;
    name: string;
    workingDir: string;
    type: 'claude' | 'terminal';
    status: 'active' | 'idle';
  }>
}
```

### 5. `get_current_session_id`

Returns the current session's ID (so it can be passed to child sessions for
callbacks).

```typescript
get_current_session_id() → { sessionId: string }
```

## Implementation Plan

### Phase 1: Backend Infrastructure

**1.1 Message Queue System** (in `SessionStore.ts`)

- Simple addition to existing session metadata
- Store pending messages in `claudeMetadata.pendingMessages: string[]`
- On session resume, check for pending messages and send them
- No new files needed, just extend existing SessionStore

**1.2 Extend ClaudeSessionManager**

- Add `getSessionStatus(sessionId)` method
- Add `sendMessageToSession(sessionId, message)` method
- On session start, check for queued messages and send them

**1.3 Worktree Helper** (`src/server/utils/gitWorktree.ts`)

- `createWorktree(baseDir, branch, path?)` - creates worktree
- `removeWorktree(path)` - removes worktree
- `listWorktrees(baseDir)` - lists existing worktrees
- Handle errors (branch exists, path exists, not a git repo)

### Phase 2: MCP Tool Registration

**2.1 Tool Definitions** (`src/server/claude/tools/sessionTools.ts`)

- Define tool schemas for all 5 tools
- Input validation
- Permission requirements (all require user approval)

**2.2 Tool Handlers**

- Implement handler for each tool
- Connect to ClaudeSessionManager and SessionStore
- Return structured responses

**2.3 Register with SDK**

- Add tools to ClaudeAgentService options
- Handle tool calls in the message flow

### Phase 3: UI Updates

**3.1 Session Creation with Worktree**

- Add worktree option to "New Session" form in sidebar
- Branch name input (optional)
- Show worktree path preview

**3.2 Delete Session Dialog**

- If session is in a worktree, show checkbox: "Also delete worktree"
- Warn about uncommitted changes
- Call `git worktree remove` if checked

**3.3 Session Status Indicators** (optional enhancement)

- Show if session has queued messages
- Visual indicator for worktree-based sessions

## File Changes

### New Files

- `src/server/claude/tools/sessionTools.ts` - MCP tool definitions and handlers
- `src/server/utils/gitWorktree.ts` - Git worktree helper functions

### Modified Files

- `src/server/claude/ClaudeAgentService.ts` - Register MCP tools
- `src/server/claude/ClaudeSessionManager.ts` - Add session interaction methods
- `src/server/sessions/SessionStore.ts` - Add pendingMessages to claudeMetadata
- `src/client/components/workspace/SessionSidebar.tsx` - Worktree option in
  create form
- `src/client/components/workspace/DeleteSessionDialog.tsx` (new) - Confirmation
  with worktree option
- `src/server/api/sessions.ts` - Add worktree creation endpoint

## Permission Flow

All session tools require user approval:

1. Claude calls `create_session`
2. Permission prompt shows: "Create session 'feature-auth' in
   .worktrees/feature-auth?"
3. User approves/denies
4. If approved, session is created

## Edge Cases

1. **Worktree branch already exists**: Use existing branch (no -b flag)
2. **Worktree path already exists**: Return error, don't overwrite
3. **Not a git repository**: Return error for worktree creation, allow normal
   session
4. **Session doesn't exist**: Return clear error for send/status operations
5. **Message queue overflow**: Limit to N messages per session, reject if full
6. **Circular messaging**: Not prevented, but not problematic (just messages)

## Out of Scope (Future)

- Callback mechanism (session B notifies session A when done)
- Parent-child relationship tracking
- Session groups in UI
- Automatic worktree cleanup on session delete (we'll prompt user)
