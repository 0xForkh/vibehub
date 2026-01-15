// Re-export SDK types
export type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemMessage,
  PermissionResult,
  Options as ClaudeAgentOptions,
  PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';

// Client-facing message types (simplified format sent to browser)
export interface ClientAssistantMessage {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{
      type: 'text' | 'tool_use';
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
  };
}

export interface ClientUserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string | Array<{ type: string; text?: string }>;
  };
}

export type ClientMessage = ClientAssistantMessage | ClientUserMessage;

// Permission decision type (used by socket handlers)
export type PermissionDecision =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message?: string };
