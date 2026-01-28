export interface SessionMetadata {
  cols: number;
  rows: number;
}

export interface ClaudeMetadata {
  workingDir: string;
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  claudeSessionId?: string; // Set after Claude spawns
  terminalTmuxSession?: string; // Lazily created when terminal is opened
  messages?: Array<{
    role: 'user' | 'assistant';
    content: unknown;
    timestamp: number;
    permissionRequest?: {
      requestId: string;
      toolName: string;
      input: unknown;
      decision?: 'approved' | 'rejected';
    };
  }>; // Persisted message history (includes permission requests)
  contextUsage?: {
    totalTokensUsed: number;
    contextWindow: number;
    totalCostUsd: number;
  };
  allowedTools?: string[]; // Session-specific tool allowlist (e.g., "Bash(pnpm build)")
  allowedDirectories?: string[]; // External directories allowed for file operations
  pendingMessages?: string[]; // Messages queued by other sessions (send_to_session)
  worktreePath?: string; // If session was created with a worktree, path to worktree
  currentBranch?: string; // Current git branch of workingDir (fetched dynamically)

  // Preview system state (for worktrees with docker-compose.preview.yml)
  previewStatus?: 'starting' | 'running' | 'error'; // Overall preview status
  previewError?: string; // Error message if previewStatus is 'error'
  previewUrl?: string; // Full preview URL (e.g., https://feature-auth-ats-preview.leetlabs.ai)
  previewProjectName?: string; // Docker compose project name (preview-{sessionId})
  previewPort?: number; // Allocated external port
  previewCaddyRouteId?: string; // Caddy route ID for cleanup
  previewStartedAt?: string; // ISO timestamp
}

export interface Session {
  id: string;
  name: string;
  type: 'terminal' | 'claude';
  tmuxSessionName: string; // Only for terminal sessions
  createdAt: string;
  lastAccessedAt: string;
  metadata: SessionMetadata;
  claudeMetadata?: ClaudeMetadata; // Only for claude sessions
  status: 'active' | 'detached';
}

export interface TmuxSession {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

/**
 * Global Claude settings that apply across all sessions
 */
export interface GlobalClaudeSettings {
  allowedTools?: string[]; // Global tool allowlist (e.g., "Bash(pnpm build)", "Bash(git *)")
  // Future extensibility: add more global settings here
}

/**
 * Kanban task for project-level task management
 */
export interface TaskAttachment {
  name: string;
  type: string; // MIME type
  size: number;
  data: string; // base64 encoded
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  column: 'backlog' | 'todo' | 'review';
  projectPath: string; // Normalized working directory
  sessionId?: string; // Reference to created session
  attachments?: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}
