// Client-side Claude Code types

export interface FileAttachment {
  name: string;
  type: string; // MIME type
  size: number;
  data: string; // base64 encoded
  preview?: string; // object URL for local preview (input bar)
  dataUrl?: string; // data URL for conversation display
}

export interface ClaudeMessageContent {
  type: 'text' | 'tool_use' | 'image' | 'document';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  // For file attachments in user messages
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  preview?: string; // data URL or server URL for preview
  serverUrl?: string; // server URL for persistent preview
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeMessageContent[];
  timestamp: number;
  permissionRequest?: {
    requestId: string;
    toolName: string;
    input: unknown;
    toolUseId?: string;
    decision?: 'approved' | 'rejected';
  };
}

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: unknown;
  timestamp: number;
}

export interface ClaudeSession {
  id: string;
  name: string;
  type: 'claude';
  workingDir: string;
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  createdAt: string;
  lastAccessedAt: string;
  status: 'active' | 'detached';
  claudeSessionId?: string;
}

export interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ToolResult {
  toolUseId: string;
  result: unknown;
}

export interface SlashCommand {
  name: string;
  description?: string;
}

export interface ClaudeConversationState {
  messages: ClaudeMessage[];
  pendingRequest: PermissionRequest | null;
  thinking: boolean;
  error: string | null;
  todos: TodoItem[];
  toolResults: Map<string, unknown>; // toolUseId -> result
  slashCommands: string[]; // Available slash commands
}
