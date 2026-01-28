import Push from 'push.js';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import type { ClaudeMessage, ClaudeMessageContent, PermissionRequest, TodoItem } from '../types/claude';
import type {
  SessionState,
  SessionActions,
  GlobalSessionState,
  SessionNotification,
  SessionManagerResult,
  SessionManagerOptions,
  FileAttachmentData,
  PermissionMode,
} from '../types/sessionState';

const createInitialSessionState = (sessionId: string): SessionState => ({
  sessionId,
  isConnected: false,
  messages: [],
  todos: [],
  thinking: false,
  pendingRequest: null,
  error: null,
  toolResults: new Map(),
  contextUsage: null,
  slashCommands: [],
  allowedTools: [],
  allowedDirectories: [],
  permissionMode: 'default',
  isDone: false,
});

/**
 * Process message to extract todos and filter out TodoWrite tool uses
 */
function processMessage(
  message: ClaudeMessage,
  setTodos: (todos: TodoItem[]) => void
): ClaudeMessage {
  if (typeof message.content === 'string') {
    return message;
  }

  // Extract todos from TodoWrite tool uses
  const todoBlocks = message.content.filter(
    (block): block is ClaudeMessageContent & { name: string; input: { todos: TodoItem[] } } =>
      block.type === 'tool_use' &&
      block.name === 'TodoWrite' &&
      typeof block.input === 'object' &&
      block.input !== null &&
      'todos' in block.input
  );

  // Update todos state if we found any
  if (todoBlocks.length > 0) {
    const latestTodos = todoBlocks[todoBlocks.length - 1];
    setTodos(latestTodos.input.todos);
  }

  // Filter out TodoWrite and permission-related tool uses
  const filteredContent = message.content.filter((block) => {
    if (block.type === 'tool_use') {
      if (block.name === 'TodoWrite') return false;
      if (message.permissionRequest && block.name === message.permissionRequest.toolName) {
        return false;
      }
    }
    return true;
  });

  return { ...message, content: filteredContent };
}

export function useSessionManager(options: SessionManagerOptions = {}): SessionManagerResult {
  const { onFork } = options;
  const { socket, isConnected } = useSocket();
  const [sessionStates, setSessionStates] = useState<Map<string, SessionState>>(new Map());
  const [globalState, setGlobalState] = useState<GlobalSessionState>({ globalAllowedTools: [] });
  const subscribedSessionsRef = useRef<Set<string>>(new Set());
  const sessionStatesRef = useRef<Map<string, SessionState>>(sessionStates);
  const onForkRef = useRef(onFork);

  // Keep onFork ref updated
  useEffect(() => {
    onForkRef.current = onFork;
  }, [onFork]);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    sessionStatesRef.current = sessionStates;
  }, [sessionStates]);

  // Helper to update a specific session's state
  const updateSessionState = useCallback(
    (sessionId: string, updater: (prev: SessionState) => SessionState) => {
      setSessionStates((prev) => {
        const current = prev.get(sessionId);
        if (!current) return prev;
        const next = new Map(prev);
        next.set(sessionId, updater(current));
        return next;
      });
    },
    []
  );

  // Set up socket event listeners
  useEffect(() => {
    if (!socket) return undefined;

    const handleConnect = () => {
      // Request notification permission for permission alerts
      if (!Push.Permission.has()) {
        Push.Permission.request();
      }

      // Re-subscribe to all sessions on reconnect (clone set to avoid mutation issues)
      const sessions = new Set(subscribedSessionsRef.current);
      sessions.forEach((sessionId) => {
        // Send actual message count so server only replays missing messages
        const state = sessionStatesRef.current.get(sessionId);
        const messageCount = state?.messages.length ?? 0;
        socket.emit('claude:resume', { sessionId, messageCount });
      });
      // Request global allowed tools
      socket.emit('claude:get_global_allowed_tools');
    };

    const handleDisconnect = () => {
      // Mark all sessions as disconnected
      setSessionStates((prev) => {
        const next = new Map(prev);
        next.forEach((state, id) => {
          next.set(id, { ...state, isConnected: false });
        });
        return next;
      });
    };

    const handlePermissionRequest = (data: {
      sessionId: string;
      requestId: string;
      toolName: string;
      input: unknown;
      toolUseId?: string;
    }) => {
      const request: PermissionRequest = {
        requestId: data.requestId,
        toolName: data.toolName,
        input: data.input,
        timestamp: Date.now(),
      };

      // Show browser notification if tab is not focused
      if (document.hidden && Push.Permission.has()) {
        Push.create('Permission Required', {
          body: `Claude wants to use: ${data.toolName}`,
          tag: `permission-${data.requestId}`,
          requireInteraction: true,
          onClick: () => {
            window.focus();
            Push.close(`permission-${data.requestId}`);
          },
        });
      }

      updateSessionState(data.sessionId, (state) => {
        let newMessages = state.messages;

        // Try to add permission request to the last message if it has a matching tool_use
        if (newMessages.length > 0 && data.toolUseId) {
          const lastMessage = newMessages[newMessages.length - 1];
          if (
            lastMessage.role === 'assistant' &&
            Array.isArray(lastMessage.content) &&
            lastMessage.content.some(
              (block: ClaudeMessageContent) => block.type === 'tool_use' && block.id === data.toolUseId
            )
          ) {
            newMessages = [...newMessages];
            newMessages[newMessages.length - 1] = {
              ...lastMessage,
              permissionRequest: {
                requestId: data.requestId,
                toolName: data.toolName,
                input: data.input,
              },
            };
          } else {
            newMessages = [
              ...newMessages,
              {
                role: 'assistant',
                content: [],
                timestamp: Date.now(),
                permissionRequest: {
                  requestId: data.requestId,
                  toolName: data.toolName,
                  input: data.input,
                },
              } as ClaudeMessage,
            ];
          }
        } else {
          newMessages = [
            ...newMessages,
            {
              role: 'assistant',
              content: [],
              timestamp: Date.now(),
              permissionRequest: {
                requestId: data.requestId,
                toolName: data.toolName,
                input: data.input,
              },
            } as ClaudeMessage,
          ];
        }

        return {
          ...state,
          pendingRequest: request,
          messages: newMessages,
        };
      });
    };

    const handleMessage = ({
      sessionId,
      message,
    }: {
      sessionId: string;
      message: { message: { role: 'user' | 'assistant'; content: unknown } };
    }) => {
      const claudeMessage: ClaudeMessage = {
        role: message.message.role,
        content: message.message.content as ClaudeMessage['content'],
        timestamp: Date.now(),
      };

      updateSessionState(sessionId, (state) => {
        const processedMessage = processMessage(claudeMessage, (todos) => {
          setSessionStates((prev) => {
            const current = prev.get(sessionId);
            if (!current) return prev;
            const next = new Map(prev);
            next.set(sessionId, { ...current, todos });
            return next;
          });
        });

        const hasContent =
          typeof processedMessage.content === 'string'
            ? processedMessage.content.trim().length > 0
            : Array.isArray(processedMessage.content) && processedMessage.content.length > 0;

        if (!hasContent) return state;

        return {
          ...state,
          messages: [...state.messages, processedMessage],
        };
      });
    };

    const handleSessionReady = ({ sessionId, permissionMode }: { sessionId: string; permissionMode?: PermissionMode }) => {
      updateSessionState(sessionId, (state) => ({
        ...state,
        isConnected: true,
        error: null,
        permissionMode: permissionMode || state.permissionMode,
      }));
      socket.emit('claude:get_allowed_tools', { sessionId });
    };

    const handleError = ({ sessionId, message }: { sessionId: string; message: string }) => {
      updateSessionState(sessionId, (state) => ({
        ...state,
        error: message,
        thinking: false,
      }));
    };

    const handleResult = (data: {
      sessionId: string;
      totalCostUsd?: number;
      contextWindow?: number;
      totalTokensUsed?: number;
      isReplay?: boolean;
    }) => {
      // Notify when Claude finishes (tab not focused) - skip for replays
      if (!data.isReplay && document.hidden && Push.Permission.has()) {
        Push.create('Claude finished', {
          body: 'Response complete - awaiting your input',
          tag: `result-${data.sessionId}`,
          onClick: () => {
            window.focus();
            Push.close(`result-${data.sessionId}`);
          },
        });
      }

      updateSessionState(data.sessionId, (s) => ({
        ...s,
        // Only set isDone for fresh results, not replays on reconnect
        isDone: data.isReplay ? s.isDone : true,
        ...(data.totalTokensUsed !== undefined && data.contextWindow !== undefined
          ? {
              contextUsage: {
                totalTokensUsed: data.totalTokensUsed as number,
                contextWindow: data.contextWindow as number,
                totalCostUsd: data.totalCostUsd || 0,
              },
            }
          : {}),
      }));
    };

    const handleThinking = ({ sessionId, thinking }: { sessionId: string; thinking: boolean }) => {
      updateSessionState(sessionId, (state) => ({
        ...state,
        thinking,
        // Clear isDone when Claude starts thinking again
        isDone: thinking ? false : state.isDone,
      }));
    };

    const handleToolResult = ({ sessionId, toolUseId, result }: { sessionId: string; toolUseId: string; result: unknown }) => {
      updateSessionState(sessionId, (state) => {
        const newToolResults = new Map(state.toolResults);
        newToolResults.set(toolUseId, result);
        return { ...state, toolResults: newToolResults };
      });
    };

    const handleSlashCommands = ({ sessionId, commands }: { sessionId: string; commands: string[] }) => {
      updateSessionState(sessionId, (state) => ({ ...state, slashCommands: commands }));
    };

    const handleAllowedTools = ({ sessionId, tools }: { sessionId: string; tools: string[] }) => {
      updateSessionState(sessionId, (state) => ({ ...state, allowedTools: tools }));
    };

    const handleAllowedDirectories = ({ sessionId, directories }: { sessionId: string; directories: string[] }) => {
      updateSessionState(sessionId, (state) => ({ ...state, allowedDirectories: directories }));
    };

    const handleGlobalAllowedTools = ({ tools }: { tools: string[] }) => {
      setGlobalState((prev) => ({ ...prev, globalAllowedTools: tools }));
    };

    const handlePermissionModeUpdated = ({ sessionId, permissionMode }: { sessionId: string; permissionMode: PermissionMode }) => {
      updateSessionState(sessionId, (state) => ({ ...state, permissionMode }));
    };

    const handleFilesUploaded = ({
      sessionId,
      files,
    }: {
      sessionId: string;
      files: { name: string; url: string; isImage: boolean; index: number }[];
    }) => {
      updateSessionState(sessionId, (state) => {
        let lastUserMsgIndex = -1;
        for (let i = state.messages.length - 1; i >= 0; i -= 1) {
          if (state.messages[i].role === 'user') {
            lastUserMsgIndex = i;
            break;
          }
        }
        if (lastUserMsgIndex === -1) return state;

        const lastUserMsg = state.messages[lastUserMsgIndex];
        if (typeof lastUserMsg.content === 'string') return state;

        // Track which attachment index we're at (only count image/document blocks)
        let attachmentIndex = 0;
        const updatedContent = lastUserMsg.content.map((block) => {
          if (block.type === 'image' || block.type === 'document') {
            // Match by index instead of name to handle duplicate filenames
            const matchingFile = files.find((f) => f.index === attachmentIndex);
            attachmentIndex += 1;
            if (matchingFile) {
              return { ...block, serverUrl: matchingFile.url, preview: matchingFile.url };
            }
          }
          return block;
        });

        const newMessages = [...state.messages];
        newMessages[lastUserMsgIndex] = { ...lastUserMsg, content: updatedContent };
        return { ...state, messages: newMessages };
      });
    };

    const handleForked = (data: { sessionId: string; session: { id: string; name: string } }) => {
      // Call the onFork callback to open the new session tab
      if (onForkRef.current && data.session?.id) {
        onForkRef.current(data.session.id);
      }
    };

    // If already connected, run connect handler
    if (socket.connected) {
      handleConnect();
    }

    // Register all handlers
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('claude:permission_request', handlePermissionRequest);
    socket.on('claude:message', handleMessage);
    socket.on('claude:session_ready', handleSessionReady);
    socket.on('claude:error', handleError);
    socket.on('claude:result', handleResult);
    socket.on('claude:thinking', handleThinking);
    socket.on('claude:tool_result', handleToolResult);
    socket.on('claude:slash_commands', handleSlashCommands);
    socket.on('claude:allowed_tools', handleAllowedTools);
    socket.on('claude:allowed_directories', handleAllowedDirectories);
    socket.on('claude:global_allowed_tools', handleGlobalAllowedTools);
    socket.on('claude:permission_mode_updated', handlePermissionModeUpdated);
    socket.on('claude:files_uploaded', handleFilesUploaded);
    socket.on('claude:forked', handleForked);

    // Cleanup with exact handler references
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('claude:permission_request', handlePermissionRequest);
      socket.off('claude:message', handleMessage);
      socket.off('claude:session_ready', handleSessionReady);
      socket.off('claude:error', handleError);
      socket.off('claude:result', handleResult);
      socket.off('claude:thinking', handleThinking);
      socket.off('claude:tool_result', handleToolResult);
      socket.off('claude:slash_commands', handleSlashCommands);
      socket.off('claude:allowed_tools', handleAllowedTools);
      socket.off('claude:allowed_directories', handleAllowedDirectories);
      socket.off('claude:global_allowed_tools', handleGlobalAllowedTools);
      socket.off('claude:permission_mode_updated', handlePermissionModeUpdated);
      socket.off('claude:files_uploaded', handleFilesUploaded);
      socket.off('claude:forked', handleForked);
    };
  }, [socket, updateSessionState]);

  // Subscribe to a session
  const subscribeToSession = useCallback((sessionId: string) => {
    if (subscribedSessionsRef.current.has(sessionId)) return;

    subscribedSessionsRef.current.add(sessionId);

    // Initialize state for this session
    setSessionStates((prev) => {
      if (prev.has(sessionId)) return prev;
      const next = new Map(prev);
      next.set(sessionId, createInitialSessionState(sessionId));
      return next;
    });

    // Resume session if socket is connected
    if (socket?.connected) {
      // Send current message count so server only replays missing messages
      const state = sessionStatesRef.current.get(sessionId);
      const messageCount = state?.messages.length ?? 0;
      socket.emit('claude:resume', { sessionId, messageCount });
    }
  }, [socket]);

  // Unsubscribe from a session
  const unsubscribeFromSession = useCallback((sessionId: string) => {
    subscribedSessionsRef.current.delete(sessionId);
    // Optionally keep state for quick re-subscribe, or clear it:
    // setSessionStates(prev => {
    //   const next = new Map(prev);
    //   next.delete(sessionId);
    //   return next;
    // });
  }, []);

  // Get actions for a specific session
  const getSessionActions = useCallback(
    (sessionId: string): SessionActions | null => {
      if (!socket) return null;

      return {
        sendMessage: (content: string, attachments?: FileAttachmentData[]) => {
          console.log('[useSessionManager] sendMessage called', {
            sessionId,
            contentLength: content?.length || 0,
            attachmentCount: attachments?.length || 0,
            attachmentNames: attachments?.map(a => a.name),
            attachmentSizes: attachments?.map(a => a.size),
            hasAttachmentData: attachments?.map(a => !!a.data && a.data.length > 0),
          });
          // Add user message to state immediately
          const messageContent: ClaudeMessage['content'] =
            attachments && attachments.length > 0
              ? [
                  ...(content ? [{ type: 'text' as const, text: content }] : []),
                  ...attachments.map((a) => ({
                    type: (a.type.startsWith('image/') ? 'image' : 'document') as 'image' | 'document',
                    fileName: a.name,
                    mimeType: a.type,
                  })),
                ]
              : content;

          const userMessage: ClaudeMessage = {
            role: 'user',
            content: messageContent,
            timestamp: Date.now(),
          };

          updateSessionState(sessionId, (state) => ({
            ...state,
            messages: [...state.messages, userMessage],
            error: null,
            isDone: false,
          }));

          socket.emit('claude:message', {
            sessionId,
            content,
            attachments: attachments?.map((a) => ({
              name: a.name,
              type: a.type,
              size: a.size,
              data: a.data,
            })),
          });
        },

        respondToPermission: (
          requestId: string,
          behavior: 'allow' | 'deny',
          permissionOpts?: { message?: string; remember?: boolean; global?: boolean; allowDirectory?: string }
        ) => {
          const currentState = sessionStates.get(sessionId);
          const request = currentState?.messages.find(
            (msg) => msg.permissionRequest?.requestId === requestId
          )?.permissionRequest;

          if (!request) return;

          // Update message with decision
          // Set thinking to true for both allow and deny - Claude continues processing either way
          // Server will emit the authoritative thinking state after processing
          updateSessionState(sessionId, (s) => ({
            ...s,
            messages: s.messages.map((msg) =>
              msg.permissionRequest?.requestId === requestId
                ? {
                    ...msg,
                    permissionRequest: {
                      ...msg.permissionRequest,
                      decision: behavior === 'allow' ? ('approved' as const) : ('rejected' as const),
                    },
                  }
                : msg
            ),
            pendingRequest:
              s.pendingRequest?.requestId === requestId ? null : s.pendingRequest,
            thinking: true,
          }));

          // Add user message if denying with message
          if (behavior === 'deny' && permissionOpts?.message) {
            const denyMessage = permissionOpts.message;
            updateSessionState(sessionId, (s) => ({
              ...s,
              messages: [
                ...s.messages,
                { role: 'user', content: denyMessage, timestamp: Date.now() },
              ],
            }));
          }

          socket.emit('claude:permission_response', {
            sessionId,
            requestId,
            behavior,
            input: request.input,
            message: permissionOpts?.message,
            remember: permissionOpts?.remember,
            global: permissionOpts?.global,
            allowDirectory: permissionOpts?.allowDirectory,
          });
        },

        abort: () => {
          socket.emit('claude:abort', { sessionId });
          updateSessionState(sessionId, (state) => ({ ...state, thinking: false }));
        },

        fork: (name: string) => {
          socket.emit('claude:fork', { sessionId, name });
        },

        updateAllowedTools: (tools: string[]) => {
          socket.emit('claude:set_allowed_tools', { sessionId, tools });
        },

        updateGlobalAllowedTools: (tools: string[]) => {
          socket.emit('claude:set_global_allowed_tools', { tools });
        },

        updateAllowedDirectories: (directories: string[]) => {
          socket.emit('claude:set_allowed_directories', { sessionId, directories });
        },

        updatePermissionMode: (mode: PermissionMode) => {
          socket.emit('claude:update_permission_mode', { sessionId, permissionMode: mode });
          // Optimistically update local state
          updateSessionState(sessionId, (state) => ({ ...state, permissionMode: mode }));
        },

        clearDone: () => {
          updateSessionState(sessionId, (state) => ({ ...state, isDone: false }));
        },
      };
    },
    [socket, sessionStates, updateSessionState]
  );

  // Get notification info for tabs
  const getNotifications = useCallback((): SessionNotification[] => {
    const notifications: SessionNotification[] = [];
    sessionStates.forEach((state, sessionId) => {
      notifications.push({
        sessionId,
        hasPendingPermission: state.pendingRequest !== null,
        isThinking: state.thinking,
        hasError: state.error !== null,
        isDone: state.isDone,
      });
    });
    return notifications;
  }, [sessionStates]);

  return {
    sessionStates,
    globalState,
    isConnected,
    subscribeToSession,
    unsubscribeFromSession,
    getSessionActions,
    getNotifications,
    socket,
  };
}
