import type { ClaudeMessage, PermissionRequest, TodoItem } from './claude';
import type { Socket } from 'socket.io-client';

export interface FileAttachmentData {
  name: string;
  type: string;
  size: number;
  data: string;
}

/**
 * State for a single Claude session managed by the centralized session manager
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export interface SessionState {
  sessionId: string;
  isConnected: boolean;
  messages: ClaudeMessage[];
  todos: TodoItem[];
  thinking: boolean;
  pendingRequest: PermissionRequest | null;
  error: string | null;
  toolResults: Map<string, unknown>;
  contextUsage: {
    totalTokensUsed: number;
    contextWindow: number;
    totalCostUsd: number;
  } | null;
  slashCommands: string[];
  allowedTools: string[];
  permissionMode: PermissionMode;
  isDone: boolean; // Claude finished and is waiting for user input
}

/**
 * Actions that can be performed on a session
 */
export interface SessionActions {
  sendMessage: (content: string, attachments?: FileAttachmentData[]) => void;
  respondToPermission: (requestId: string, behavior: 'allow' | 'deny', options?: {
    message?: string;
    remember?: boolean;
    global?: boolean;
  }) => void;
  abort: () => void;
  fork: (name: string) => void;
  updateAllowedTools: (tools: string[]) => void;
  updateGlobalAllowedTools: (tools: string[]) => void;
  updatePermissionMode: (mode: PermissionMode) => void;
  clearDone: () => void;
}

/**
 * Global state shared across all sessions
 */
export interface GlobalSessionState {
  globalAllowedTools: string[];
}

/**
 * Notification info for tabs
 */
export interface SessionNotification {
  sessionId: string;
  hasPendingPermission: boolean;
  isThinking: boolean;
  hasError: boolean;
  isDone: boolean; // Claude finished and is waiting for user input
}

/**
 * Options for the useSessionManager hook
 */
export interface SessionManagerOptions {
  onFork?: (newSessionId: string) => void;
}

/**
 * Return type of the useSessionManager hook
 */
export interface SessionManagerResult {
  // State
  sessionStates: Map<string, SessionState>;
  globalState: GlobalSessionState;
  isConnected: boolean;

  // Session management
  subscribeToSession: (sessionId: string) => void;
  unsubscribeFromSession: (sessionId: string) => void;

  // Get actions for a specific session
  getSessionActions: (sessionId: string) => SessionActions | null;

  // Get notification info for all subscribed sessions
  getNotifications: () => SessionNotification[];

  // Socket reference for components that need it (FileBrowser, CommandPalette)
  socket: Socket | null;
}
