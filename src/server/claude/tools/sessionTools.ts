import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { logger as getLogger } from '../../../shared/logger.js';
import { getPreviewManager } from '../../preview/index.js';
import { SessionStore } from '../../sessions/SessionStore.js';
import { broadcastSessionsUpdate } from '../../socketServer/socketRegistry.js';
import { createWorktree } from '../../utils/gitWorktree.js';
import type { ClaudeSessionManager } from '../ClaudeSessionManager.js';

const logger = getLogger();

/**
 * Context required for session tools to operate
 */
export interface SessionToolsContext {
  sessionManager: ClaudeSessionManager;
  sessionStore: SessionStore;
  currentSessionId: string;
}

/**
 * Creates an MCP server with session management tools
 */
export function createSessionToolsServer(context: SessionToolsContext): McpSdkServerConfigWithInstance {
  const { sessionManager, sessionStore, currentSessionId } = context;

  return createSdkMcpServer({
    name: 'session-tools',
    version: '1.0.0',
    tools: [
      // Tool 1: create_session
      tool(
        'create_session',
        'Create a new Claude session, optionally with a git worktree for isolated development. Returns the new session ID and working directory.',
        {
          name: z.string().describe('Name for the new session'),
          workingDir: z.string().describe('Base working directory for the session'),
          worktree: z.object({
            branch: z.string().describe('Git branch name (created if it does not exist)'),
            path: z.string().optional().describe('Relative path for worktree, defaults to .worktrees/<branch>'),
          }).optional().describe('Optional: create a git worktree for isolated development'),
          initialMessage: z.string().optional().describe('Optional: send this message to the new session after creation'),
          permissionMode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan']).optional()
            .describe('Permission mode for the new session'),
        },
        async (args) => {
          logger.info('create_session tool called', { args });

          let finalWorkingDir = args.workingDir;

          // Create worktree if requested
          if (args.worktree) {
            const worktreeResult = await createWorktree({
              baseDir: args.workingDir,
              branch: args.worktree.branch,
              path: args.worktree.path,
            });

            if (!worktreeResult.success) {
              return {
                content: [{
                  type: 'text' as const,
                  text: JSON.stringify({
                    success: false,
                    error: worktreeResult.error || 'Failed to create worktree',
                  }),
                }],
              };
            }

            finalWorkingDir = worktreeResult.worktreePath;
            logger.info('Worktree created for new session', {
              branch: args.worktree.branch,
              path: worktreeResult.worktreePath,
            });
          }

          // Create the session in the database first (we need the ID for preview)
          const session = await sessionStore.createClaudeSession(
            args.name,
            {
              workingDir: finalWorkingDir,
              permissionMode: args.permissionMode || 'default',
              worktreePath: args.worktree ? finalWorkingDir : undefined,
            },
            { cols: 120, rows: 40 }, // Default terminal dimensions
          );

          logger.info('Session created via tool', { sessionId: session.id, name: args.name });

          // Start preview environment if worktree has docker-compose.preview.yml
          let previewUrl: string | undefined;
          if (args.worktree) {
            try {
              const previewManager = getPreviewManager();
              const hasPreview = await previewManager.hasPreviewSupport(args.workingDir);

              if (hasPreview) {
                logger.info('Starting preview environment', {
                  sessionId: session.id,
                });

                const previewState = await previewManager.startPreview(
                  finalWorkingDir,
                  args.worktree.branch,
                  session.id,
                );

                previewUrl = previewState.previewUrl;

                // Update session with preview metadata
                const existingMetadata = session.claudeMetadata || { workingDir: finalWorkingDir };
                await sessionStore.updateSession(session.id, {
                  claudeMetadata: {
                    ...existingMetadata,
                    previewUrl: previewState.previewUrl,
                    previewProjectName: previewState.projectName,
                    previewPort: previewState.port,
                    previewCaddyRouteId: previewState.caddyRouteId,
                    previewStartedAt: previewState.startedAt,
                  },
                });

                logger.info('Preview environment started', {
                  sessionId: session.id,
                  previewUrl: previewState.previewUrl,
                });
              }
            } catch (err) {
              const error = err instanceof Error ? err.message : String(err);
              logger.error('Failed to start preview environment', { error, sessionId: session.id });
              // Don't fail session creation, just log the error
            }
          }

          // Broadcast to connected clients
          broadcastSessionsUpdate();

          // Queue initial message if provided
          if (args.initialMessage) {
            await sessionStore.queueMessage(session.id, args.initialMessage);
            logger.info('Initial message queued', { sessionId: session.id });
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                sessionId: session.id,
                name: session.name,
                workingDir: finalWorkingDir,
                hasWorktree: !!args.worktree,
                hasInitialMessage: !!args.initialMessage,
                previewUrl,
              }),
            }],
          };
        }
      ),

      // Tool 2: send_to_session
      tool(
        'send_to_session',
        'Send a message to another session. If the session is busy, the message will be queued and delivered when it becomes idle.',
        {
          sessionId: z.string().describe('Target session ID'),
          message: z.string().describe('Message to send to the session'),
        },
        async (args) => {
          logger.info('send_to_session tool called', { targetSessionId: args.sessionId });

          const result = await sessionManager.sendMessageToSession(args.sessionId, args.message);

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(result),
            }],
          };
        }
      ),

      // Tool 3: get_session_status
      tool(
        'get_session_status',
        'Get the current status of a session including whether it is active, thinking, or waiting for permission.',
        {
          sessionId: z.string().describe('Session ID to check'),
        },
        async (args) => {
          logger.info('get_session_status tool called', { sessionId: args.sessionId });

          // Get status from session manager (live state)
          const liveStatus = sessionManager.getSessionStatus(args.sessionId);

          // Get stored session data for additional info
          const session = await sessionStore.getSession(args.sessionId);

          if (!session) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  exists: false,
                  error: 'Session not found',
                }),
              }],
            };
          }

          // Determine overall status
          let status: 'idle' | 'thinking' | 'waiting_permission' | 'not_started';
          if (!liveStatus.active) {
            status = 'not_started';
          } else if (liveStatus.hasPendingPermission) {
            status = 'waiting_permission';
          } else if (liveStatus.thinking) {
            status = 'thinking';
          } else {
            status = 'idle';
          }

          const pendingMessages = session.claudeMetadata?.pendingMessages?.length || 0;

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                exists: true,
                sessionId: session.id,
                name: session.name,
                status,
                workingDir: session.claudeMetadata?.workingDir,
                hasWorktree: !!session.claudeMetadata?.worktreePath,
                lastActivity: session.lastAccessedAt,
                pendingMessages,
              }),
            }],
          };
        }
      ),

      // Tool 4: list_sessions
      tool(
        'list_sessions',
        'List all available sessions with their basic information.',
        {},
        async () => {
          logger.info('list_sessions tool called');

          const sessions = await sessionStore.listSessions();

          const sessionList = sessions.map((session) => {
            const liveStatus = sessionManager.getSessionStatus(session.id);

            return {
              id: session.id,
              name: session.name,
              type: session.type,
              workingDir: session.claudeMetadata?.workingDir,
              status: liveStatus.active ? 'active' : 'idle',
              hasWorktree: !!session.claudeMetadata?.worktreePath,
            };
          });

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                sessions: sessionList,
                count: sessionList.length,
              }),
            }],
          };
        }
      ),

      // Tool 5: get_current_session_id
      tool(
        'get_current_session_id',
        'Get the ID of the current session. Useful for passing to child sessions for callbacks.',
        {},
        async () => {
          logger.info('get_current_session_id tool called');

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                sessionId: currentSessionId,
              }),
            }],
          };
        }
      ),
    ],
  });
}
