import { logger as getLogger } from '../../shared/logger.js';
import { SessionStore } from '../sessions/SessionStore.js';
import { ClaudeAgentService } from './ClaudeAgentService.js';
import { createSessionToolsServer } from './tools/sessionTools.js';
import type { PermissionResult, SDKMessage, SDKAssistantMessage, SDKUserMessage, SDKResultMessage, SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Server as SocketIOServer } from 'socket.io';

interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: Record<string, unknown>;
  toolUseId: string;
}

interface StoredMessage {
  role: 'user' | 'assistant';
  content: unknown;
  timestamp: number;
}

type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

interface ActiveClaudeSession {
  sessionId: string;
  service: ClaudeAgentService;
  socketId: string;
  claudeSessionId?: string; // Set when Claude sends init message
  thinking: boolean; // Track if Claude is currently thinking/generating
  pendingPermissions: Map<string, PendingPermission>;
  messageHistory: StoredMessage[]; // Store messages for UI replay
  slashCommands: string[]; // Available slash commands from SDK
  allowedTools: Set<string>; // Session-specific tool allowlist (e.g., "Bash(pnpm build)")
  permissionMode: PermissionMode; // Current permission mode
  contextUsage?: {
    totalTokensUsed: number;
    contextWindow: number;
    totalCostUsd: number;
  };
}

/**
 * Manages active Claude Code sessions and their lifecycle using the Agent SDK
 */
export class ClaudeSessionManager {
  private sessions = new Map<string, ActiveClaudeSession>();
  private logger = getLogger();
  private io: SocketIOServer;
  private sessionStore = new SessionStore();
  private globalAllowedTools: Set<string> = new Set(); // Cached global allowlist

  private globalToolsLoaded: Promise<void>;

  constructor(io: SocketIOServer) {
    this.io = io;
    // Load global allowed tools on startup
    this.globalToolsLoaded = this.loadGlobalAllowedTools();
  }

  /**
   * Load global allowed tools from storage
   */
  private async loadGlobalAllowedTools(): Promise<void> {
    try {
      const settings = await this.sessionStore.getGlobalClaudeSettings();
      this.globalAllowedTools = new Set(settings?.allowedTools || []);
      this.logger.info('Loaded global allowed tools', {
        count: this.globalAllowedTools.size,
        tools: Array.from(this.globalAllowedTools),
      });
    } catch (err) {
      this.logger.error('Failed to load global allowed tools', { err });
    }
  }

  /**
   * Start a new Claude session
   * @param clientMessageCount - Number of messages client already has (to skip redundant replay)
   */
  async startSession(
    sessionId: string,
    socketId: string,
    workingDir: string,
    resumeSessionId?: string,
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan',
    forkSession?: boolean,
    clientMessageCount?: number,
  ): Promise<void> {
    // If session is already active, just reconnect the socket and replay history
    if (this.sessions.has(sessionId)) {
      const existingSession = this.sessions.get(sessionId);
      if (!existingSession) {
        throw new Error(`Session ${sessionId} not found in map`);
      }
      this.logger.info('Reconnecting to existing Claude session', {
        sessionId,
        oldSocketId: existingSession.socketId,
        newSocketId: socketId,
        clientMessageCount,
        serverMessageCount: existingSession.messageHistory.length,
      });
      existingSession.socketId = socketId;
      this.io.to(socketId).emit('claude:session_ready', { sessionId, permissionMode: existingSession.permissionMode });

      // Only replay history if client has fewer messages than server
      // This prevents duplicate messages on socket reconnects
      const shouldReplayHistory = clientMessageCount === undefined || clientMessageCount < existingSession.messageHistory.length;
      if (shouldReplayHistory) {
        // If client has some messages, only send the ones they're missing
        const startIndex = clientMessageCount || 0;
        const messagesToReplay = existingSession.messageHistory.slice(startIndex);
        this.logger.info('Replaying message history', {
          sessionId,
          totalMessages: existingSession.messageHistory.length,
          replayingFrom: startIndex,
          replayCount: messagesToReplay.length,
        });
        for (const msg of messagesToReplay) {
          this.io.to(socketId).emit('claude:message', {
            sessionId,
            message: {
              type: msg.role,
              message: { role: msg.role, content: msg.content },
            },
          });
        }
      } else {
        this.logger.debug('Skipping history replay - client already has all messages', {
          sessionId,
          clientMessageCount,
          serverMessageCount: existingSession.messageHistory.length,
        });
      }

      // Send context usage if available
      if (existingSession.contextUsage) {
        this.io.to(socketId).emit('claude:result', {
          sessionId,
          totalTokensUsed: existingSession.contextUsage.totalTokensUsed,
          contextWindow: existingSession.contextUsage.contextWindow,
          totalCostUsd: existingSession.contextUsage.totalCostUsd,
        });
      }

      // Restore pending permission request if any
      if (existingSession.pendingPermissions.size > 0) {
        for (const [toolUseId, pending] of existingSession.pendingPermissions.entries()) {
          this.io.to(socketId).emit('claude:permission_request', {
            sessionId,
            requestId: toolUseId,
            toolName: pending.toolName,
            input: pending.input,
            toolUseId,
          });
        }
      }

      // Emit slash commands if available
      if (existingSession.slashCommands.length > 0) {
        this.io.to(socketId).emit('claude:slash_commands', {
          sessionId,
          commands: existingSession.slashCommands,
        });
      }

      return;
    }

    this.logger.info('Starting Claude session', {
      sessionId,
      workingDir,
      resuming: !!resumeSessionId,
      resumeSessionId,
    });

    const pendingPermissions = new Map<string, PendingPermission>();

    // Load message history, context usage, and allowed tools from database if resuming
    // Only keep last 50 messages to prevent UI from becoming sluggish
    const MAX_MESSAGES = 50;
    let messageHistory: StoredMessage[] = [];
    let storedContextUsage: { totalTokensUsed: number; contextWindow: number; totalCostUsd: number } | undefined;
    let storedAllowedTools: string[] = [];
    if (resumeSessionId) {
      try {
        const storedSession = await this.sessionStore.getSession(sessionId);
        if (storedSession?.claudeMetadata?.messages) {
          const allMessages = storedSession.claudeMetadata.messages as StoredMessage[];
          messageHistory = allMessages.slice(-MAX_MESSAGES);
          this.logger.info('Loaded message history from database', {
            sessionId,
            totalMessages: allMessages.length,
            loadedMessages: messageHistory.length,
            truncated: allMessages.length > MAX_MESSAGES,
          });
        }
        if (storedSession?.claudeMetadata?.contextUsage) {
          storedContextUsage = storedSession.claudeMetadata.contextUsage;
          this.logger.info('Loaded context usage from database', {
            sessionId,
            contextUsage: storedContextUsage,
          });
        }
        if (storedSession?.claudeMetadata?.allowedTools) {
          storedAllowedTools = storedSession.claudeMetadata.allowedTools as string[];
          this.logger.info('Loaded allowed tools from database', {
            sessionId,
            toolCount: storedAllowedTools.length,
          });
        }
      } catch (err) {
        this.logger.error('Failed to load session data', { sessionId, err });
      }
    }

    // Create session tools MCP server for this session
    const sessionToolsServer = createSessionToolsServer({
      sessionManager: this,
      sessionStore: this.sessionStore,
      currentSessionId: sessionId,
    });

    const service = new ClaudeAgentService({
      workingDir,
      sessionId: resumeSessionId,
      forkSession,
      permissionMode,
      mcpServers: {
        'session-tools': sessionToolsServer,
      },
      onMessage: (message) => this.handleMessage(sessionId, message),
      onPermissionRequest: async (toolName, input, toolUseId) => this.handlePermissionRequest(sessionId, toolName, input, toolUseId),
      onError: (error) => this.handleError(sessionId, error),
      onComplete: () => this.handleComplete(sessionId),
    });

    const effectivePermissionMode = permissionMode || 'default';
    const activeSession: ActiveClaudeSession = {
      sessionId,
      service,
      socketId,
      thinking: false,
      pendingPermissions,
      messageHistory,
      slashCommands: [],
      allowedTools: new Set(storedAllowedTools),
      permissionMode: effectivePermissionMode,
      contextUsage: storedContextUsage,
    };

    this.sessions.set(sessionId, activeSession);
    this.io.to(socketId).emit('claude:session_ready', { sessionId, permissionMode: effectivePermissionMode });

    // Replay history to client if resuming
    if (messageHistory.length > 0) {
      for (const msg of messageHistory) {
        this.io.to(socketId).emit('claude:message', {
          sessionId,
          message: {
            type: msg.role,
            message: { role: msg.role, content: msg.content },
          },
        });
      }
    }

    // Send context usage to client if available
    if (storedContextUsage) {
      this.io.to(socketId).emit('claude:result', {
        sessionId,
        totalTokensUsed: storedContextUsage.totalTokensUsed,
        contextWindow: storedContextUsage.contextWindow,
        totalCostUsd: storedContextUsage.totalCostUsd,
      });
    }

    // Process any pending messages (e.g., from create_session with initialMessage)
    await this.processPendingMessages(sessionId);
  }

  /**
   * Send a message to Claude
   * @param emitToClient - If true, emit the user message to the client (for programmatic messages)
   */
  async sendMessage(sessionId: string, content: string, emitToClient = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Claude session ${sessionId} not found`);
    }

    this.logger.info('User message received', {
      sessionId,
      socketId: session.socketId,
      contentPreview: content.slice(0, 100),
      contentLength: content.length,
    });

    // Emit user message to client if requested (for programmatic messages like pending messages)
    if (emitToClient) {
      this.io.to(session.socketId).emit('claude:message', {
        sessionId,
        message: {
          type: 'user',
          message: { role: 'user', content },
        },
      });
    }

    // Emit thinking started
    this.updateThinking(sessionId, true);

    // Start or continue the session with the new prompt
    if (session.service.isActive()) {
      // Session is already running, can't send new message
      this.logger.warn('Cannot send message while Claude is processing', { sessionId });
      return;
    }

    // Store user message in history
    session.messageHistory.push({
      role: 'user',
      content,
      timestamp: Date.now(),
    });

    // Start a new query with the prompt
    try {
      await session.service.start(content);
    } catch (error) {
      this.logger.error('Failed to send message to Claude', { sessionId, error });
      throw error;
    }
  }

  /**
   * Send a permission decision to Claude
   */
  async sendPermissionDecision(
    sessionId: string,
    toolUseId: string,
    decision: { behavior: 'allow'; updatedInput?: Record<string, unknown>; remember?: boolean; global?: boolean } | { behavior: 'deny'; message?: string }
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.error('Permission decision failed: session not found', { sessionId, toolUseId });
      throw new Error(`Claude session ${sessionId} not found`);
    }

    this.logger.info('Permission decision received', {
      sessionId,
      toolUseId,
      behavior: decision.behavior,
      remember: decision.behavior === 'allow' ? decision.remember : undefined,
      message: decision.behavior === 'deny' ? decision.message : undefined,
      pendingCount: session.pendingPermissions.size,
      pendingIds: Array.from(session.pendingPermissions.keys()),
    });

    const pending = session.pendingPermissions.get(toolUseId);
    if (!pending) {
      this.logger.warn('No pending permission request for toolUseId', {
        sessionId,
        toolUseId,
        availableIds: Array.from(session.pendingPermissions.keys()),
      });
      return;
    }

    // Resolve the pending promise with the decision
    if (decision.behavior === 'allow') {
      // If remember flag is set, add to allowlist (global or session)
      if (decision.remember) {
        const pattern = this.generatePermissionPattern(pending.toolName, pending.input);

        if (decision.global) {
          // Add to global allowlist
          await this.addGlobalAllowedTool(pattern);
          this.logger.info('Added tool to global allowlist', {
            sessionId,
            pattern,
            globalAllowlistSize: this.globalAllowedTools.size,
          });
          // Notify client of updated global allowlist
          this.io.to(session.socketId).emit('claude:global_allowed_tools', {
            tools: Array.from(this.globalAllowedTools),
          });
        } else {
          // Add to session-specific allowlist
          session.allowedTools.add(pattern);
          this.logger.info('Added tool to session allowlist', {
            sessionId,
            pattern,
            allowlistSize: session.allowedTools.size,
          });
          // Persist to database
          this.persistAllowedTools(sessionId, session.allowedTools);
          // Notify client of updated allowlist
          this.io.to(session.socketId).emit('claude:allowed_tools', {
            sessionId,
            tools: Array.from(session.allowedTools),
          });
        }
      }

      this.logger.info('Resolving permission as ALLOW', { sessionId, toolUseId, toolName: pending.toolName });
      pending.resolve({
        behavior: 'allow',
        updatedInput: decision.updatedInput || pending.input,
      });
    } else {
      this.logger.info('Resolving permission as DENY', { sessionId, toolUseId, toolName: pending.toolName, message: decision.message });
      pending.resolve({
        behavior: 'deny',
        message: `[USER FEEDBACK] ${decision.message || 'Permission denied by user'}. Respect this decision and do not attempt this action again.`,
      });
    }

    session.pendingPermissions.delete(toolUseId);

    // Always emit thinking state after permission response
    // Claude will continue processing regardless of allow/deny
    // Force emit even if state hasn't changed (client may have set it differently)
    this.forceEmitThinking(sessionId, true);
  }

  /**
   * Generate a permission pattern for a tool use (e.g., "Bash(pnpm build 2>&1)")
   * For Bash, we use the full command - matching uses prefix matching per SDK docs
   */
  // eslint-disable-next-line class-methods-use-this
  private generatePermissionPattern(toolName: string, input: Record<string, unknown>): string {
    if (toolName === 'Bash' && input.command) {
      // Use the full command - prefix matching handles variations
      return `Bash(${String(input.command)})`;
    }
    if (toolName === 'Read' && input.file_path) {
      return `Read(${input.file_path})`;
    }
    if (toolName === 'Write' && input.file_path) {
      return `Write(${input.file_path})`;
    }
    if (toolName === 'Edit' && input.file_path) {
      return `Edit(${input.file_path})`;
    }
    // For other tools, just use the tool name
    return toolName;
  }

  /**
   * Check if a pattern matches an allowlist
   * For Bash: uses prefix matching (per SDK docs) - "Bash(pnpm build)" matches "Bash(pnpm build 2>&1)"
   * For other tools: exact match or wildcard with *
   */
  // eslint-disable-next-line class-methods-use-this
  private matchesAllowlist(pattern: string, allowlist: Set<string>): boolean {
    // Check exact match first
    if (allowlist.has(pattern)) {
      return true;
    }

    for (const allowed of allowlist) {
      // Bash uses prefix matching: stored "Bash(pnpm build)" matches actual "Bash(pnpm build 2>&1)"
      if (allowed.startsWith('Bash(') && pattern.startsWith('Bash(')) {
        // Extract commands from both patterns
        const allowedCmd = allowed.slice(5, -1); // Remove "Bash(" and ")"
        const patternCmd = pattern.slice(5, -1);
        // Check if actual command starts with allowed command
        if (patternCmd.startsWith(allowedCmd)) {
          return true;
        }
      }

      // Wildcard matches (e.g., "Bash(pnpm *)" matches "Bash(pnpm build)")
      if (allowed.endsWith('*)')) {
        const prefix = allowed.slice(0, -2); // Remove "*)"
        const patternWithoutClose = pattern.slice(0, -1); // Remove ")"
        if (patternWithoutClose.startsWith(prefix)) {
          return true;
        }
      } else if (allowed.endsWith('*')) {
        const prefix = allowed.slice(0, -1);
        if (pattern.startsWith(prefix)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Split a bash command into individual commands (handles &&, ||, ;)
   * Returns array of individual command strings
   */
  // eslint-disable-next-line class-methods-use-this
  private splitBashCommands(command: string): string[] {
    // Split on &&, ||, or ; while preserving the command structure
    // This is a simple split - doesn't handle quoted strings perfectly but good enough for most cases
    const commands: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let i = 0;

    while (i < command.length) {
      const char = command[i];

      // Track quotes to avoid splitting inside them
      if ((char === '"' || char === "'") && (i === 0 || command[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
        }
      }

      // Check for command separators outside quotes
      if (!inQuotes) {
        if (char === ';' || (char === '&' && command[i + 1] === '&') || (char === '|' && command[i + 1] === '|')) {
          if (current.trim()) {
            commands.push(current.trim());
          }
          current = '';
          // Skip the second character of && or ||
          if (char !== ';') {
            i += 2;
          } else {
            i += 1;
          }
        } else {
          current += char;
          i += 1;
        }
      } else {
        current += char;
        i += 1;
      }
    }

    if (current.trim()) {
      commands.push(current.trim());
    }

    return commands;
  }

  /**
   * Check if a tool use matches any pattern in session or global allowlist
   */
  private async isToolAllowed(session: ActiveClaudeSession, toolName: string, input: Record<string, unknown>): Promise<boolean> {
    // Ensure global tools are loaded
    await this.globalToolsLoaded;

    // For Bash commands, check each sub-command in combined commands
    if (toolName === 'Bash' && input.command) {
      const fullCommand = String(input.command);
      const subCommands = this.splitBashCommands(fullCommand);

      this.logger.info('Checking bash command allowlist', {
        fullCommand,
        subCommandCount: subCommands.length,
        subCommands,
        sessionToolsCount: session.allowedTools.size,
        globalToolsCount: this.globalAllowedTools.size,
      });

      // ALL sub-commands must be allowed for the combined command to be auto-allowed
      for (const subCmd of subCommands) {
        const pattern = `Bash(${subCmd})`;
        const sessionMatch = this.matchesAllowlist(pattern, session.allowedTools);
        const globalMatch = this.matchesAllowlist(pattern, this.globalAllowedTools);

        if (!sessionMatch && !globalMatch) {
          this.logger.info('Sub-command not allowed', { subCmd, pattern });
          return false;
        }
      }

      this.logger.info('All sub-commands allowed', { fullCommand });
      return true;
    }

    // For non-Bash tools, use simple pattern matching
    const pattern = this.generatePermissionPattern(toolName, input);

    this.logger.info('Checking tool allowlist', {
      pattern,
      toolName,
      sessionToolsCount: session.allowedTools.size,
      sessionTools: Array.from(session.allowedTools),
      globalToolsCount: this.globalAllowedTools.size,
      globalTools: Array.from(this.globalAllowedTools),
    });

    // Check session-specific allowlist first
    const sessionMatch = this.matchesAllowlist(pattern, session.allowedTools);
    this.logger.info('Session allowlist check', { pattern, sessionMatch });
    if (sessionMatch) {
      return true;
    }

    // Check global allowlist
    const globalMatch = this.matchesAllowlist(pattern, this.globalAllowedTools);
    this.logger.info('Global allowlist check', { pattern, globalMatch });
    if (globalMatch) {
      return true;
    }

    return false;
  }

  /**
   * Handle permission request from the SDK's canUseTool callback
   */
  private async handlePermissionRequest(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    toolUseId: string
  ): Promise<PermissionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.error('Permission request failed: session not found', { sessionId, toolName, toolUseId });
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check allowlists (session + global)
    if (await this.isToolAllowed(session, toolName, input)) {
      const pattern = this.generatePermissionPattern(toolName, input);
      this.logger.info('Tool auto-allowed by allowlist', {
        sessionId,
        toolName,
        pattern,
        toolUseId,
      });
      return {
        behavior: 'allow',
        updatedInput: input,
      };
    }

    this.logger.info('Permission request from SDK', {
      sessionId,
      socketId: session.socketId,
      toolName,
      toolUseId,
      inputPreview: JSON.stringify(input).slice(0, 200),
      currentPendingCount: session.pendingPermissions.size,
    });

    return new Promise((resolve, reject) => {
      // Store the pending permission
      session.pendingPermissions.set(toolUseId, {
        resolve,
        reject,
        toolName,
        input,
        toolUseId,
      });

      // Emit permission request to client
      this.io.to(session.socketId).emit('claude:permission_request', {
        sessionId,
        requestId: toolUseId,
        toolName,
        input,
        toolUseId,
      });

      this.logger.info('Permission request emitted to client', {
        sessionId,
        socketId: session.socketId,
        toolName,
        toolUseId,
        pendingCount: session.pendingPermissions.size,
      });
    });
  }

  /**
   * Abort a Claude session's current operation (but keep session alive for new messages)
   */
  abortSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn('Attempted to abort non-existent session', { sessionId });
      return;
    }

    this.logger.info('Aborting Claude session operation', { sessionId });
    session.service.abort();

    // Reset thinking state so next message will properly emit thinking:true
    this.updateThinking(sessionId, false);

    // Reject any pending permissions
    for (const [, pending] of session.pendingPermissions.entries()) {
      pending.reject(new Error('Session aborted'));
    }
    session.pendingPermissions.clear();

    // Don't delete the session - keep it alive for future messages
    // The service will be ready for new queries after abort completes
  }

  /**
   * Handle messages from Claude SDK
   */
  private async handleMessage(sessionId: string, message: SDKMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn('Received message for unknown session', { sessionId });
      return;
    }

    this.logger.debug('Received SDK message', { sessionId, type: message.type });

    // Handle different message types
    switch (message.type) {
      case 'system':
        await this.handleSystemMessage(sessionId, session, message as SDKSystemMessage);
        break;

      case 'assistant':
        await this.handleAssistantMessage(sessionId, session, message as SDKAssistantMessage);
        break;

      case 'user':
        await this.handleUserMessage(sessionId, session, message as SDKUserMessage);
        break;

      case 'result':
        await this.handleResultMessage(sessionId, session, message as SDKResultMessage);
        break;

      default:
        // Log other message types but don't forward them
        this.logger.debug('Unhandled SDK message type', { sessionId, type: message.type });
    }
  }

  /**
   * Handle system messages (init, status, etc.)
   */
  private async handleSystemMessage(
    sessionId: string,
    session: ActiveClaudeSession,
    message: SDKSystemMessage
  ): Promise<void> {
    if (message.subtype === 'init') {
      session.claudeSessionId = message.session_id;

      // Capture slash commands from init message
      const slashCommands = (message as unknown as { slash_commands?: string[] }).slash_commands || [];
      session.slashCommands = slashCommands;

      this.logger.info('Claude session initialized', {
        sessionId,
        claudeSessionId: message.session_id,
        slashCommandCount: slashCommands.length,
      });

      // Emit slash commands to client
      if (slashCommands.length > 0) {
        this.io.to(session.socketId).emit('claude:slash_commands', {
          sessionId,
          commands: slashCommands,
        });
      }

      // Start thinking when session initializes
      this.updateThinking(sessionId, true);

      // Persist Claude session ID to database for resume capability
      try {
        const existingSession = await this.sessionStore.getSession(sessionId);
        if (existingSession && existingSession.claudeMetadata) {
          await this.sessionStore.updateSession(sessionId, {
            claudeMetadata: {
              ...existingSession.claudeMetadata,
              claudeSessionId: message.session_id,
            },
          });
          this.logger.debug('Persisted Claude session ID to database', { sessionId });
        }
      } catch (err) {
        this.logger.error('Failed to persist Claude session ID', { sessionId, err });
      }
    }
  }

  /**
   * Handle assistant messages
   */
  private async handleAssistantMessage(
    sessionId: string,
    session: ActiveClaudeSession,
    message: SDKAssistantMessage
  ): Promise<void> {
    // Log the assistant message content
    const {content} = message.message;
    const contentSummary = Array.isArray(content)
      ? content.map((block: { type: string; text?: string; name?: string; id?: string }) => {
          if (block.type === 'text') return `text(${(block.text || '').slice(0, 50)}...)`;
          if (block.type === 'tool_use') return `tool_use(${block.name}, id=${block.id})`;
          return block.type;
        }).join(', ')
      : String(content).slice(0, 100);

    this.logger.info('Claude assistant message', {
      sessionId,
      contentSummary,
      blockCount: Array.isArray(content) ? content.length : 1,
    });

    // Convert SDK format to our existing format for the client
    const clientMessage = {
      type: 'assistant' as const,
      message: {
        role: 'assistant' as const,
        content: message.message.content,
      },
    };

    // Store assistant message in history
    session.messageHistory.push({
      role: 'assistant',
      content: message.message.content,
      timestamp: Date.now(),
    });

    // Persist to database
    this.persistMessageHistory(sessionId, session);

    this.io.to(session.socketId).emit('claude:message', {
      sessionId,
      message: clientMessage,
    });
  }

  /**
   * Persist message history to database
   */
  private async persistMessageHistory(sessionId: string, session: ActiveClaudeSession): Promise<void> {
    try {
      const existingSession = await this.sessionStore.getSession(sessionId);
      if (existingSession && existingSession.claudeMetadata) {
        await this.sessionStore.updateSession(sessionId, {
          claudeMetadata: {
            ...existingSession.claudeMetadata,
            claudeSessionId: session.claudeSessionId,
            messages: session.messageHistory,
          },
        });
      }
    } catch (err) {
      this.logger.error('Failed to persist message history', { sessionId, err });
    }
  }

  /**
   * Handle user messages (includes tool results)
   */
  private async handleUserMessage(
    sessionId: string,
    session: ActiveClaudeSession,
    message: SDKUserMessage
  ): Promise<void> {
    // Log all user messages to debug tool result capture
    this.logger.info('SDK user message received', {
      sessionId,
      hasToolUseResult: 'tool_use_result' in message,
      parentToolUseId: message.parent_tool_use_id,
      messageKeys: Object.keys(message),
    });

    // Check if this message contains a tool result
    if ('tool_use_result' in message && message.tool_use_result !== undefined) {
      // Try to get toolUseId from parent_tool_use_id first, then from message content
      let toolUseId = message.parent_tool_use_id;

      // If parent_tool_use_id is null, try to extract from message content
      // The message.message.content may contain tool_result blocks with tool_use_id
      if (!toolUseId && message.message && Array.isArray(message.message.content)) {
        const toolResultBlock = message.message.content.find(
          (block: { type: string; tool_use_id?: string }) => block.type === 'tool_result'
        );
        if (toolResultBlock && 'tool_use_id' in toolResultBlock) {
          toolUseId = (toolResultBlock as { tool_use_id: string }).tool_use_id;
        }
      }

      this.logger.info('Tool result found', {
        sessionId,
        toolUseId,
        parentToolUseId: message.parent_tool_use_id,
        resultPreview: JSON.stringify(message.tool_use_result).slice(0, 200),
      });

      if (toolUseId) {
        this.logger.info('Emitting tool result to client', {
          sessionId,
          toolUseId,
        });

        // Emit tool result to client
        this.io.to(session.socketId).emit('claude:tool_result', {
          sessionId,
          toolUseId,
          result: message.tool_use_result,
        });
      }
    }

    // Forward replayed user messages (history)
    if ('isReplay' in message && message.isReplay) {
      const clientMessage = {
        type: 'user' as const,
        message: message.message,
      };

      this.io.to(session.socketId).emit('claude:message', {
        sessionId,
        message: clientMessage,
      });
    }
  }

  /**
   * Handle result messages
   */
  private async handleResultMessage(
    sessionId: string,
    session: ActiveClaudeSession,
    message: SDKResultMessage
  ): Promise<void> {
    // Stop thinking when result is received
    this.updateThinking(sessionId, false);

    // Get context usage from per-call usage - this represents actual context sent in the most recent API call
    // modelUsage.inputTokens is cumulative across all calls (for billing), not current context
    // The per-call usage.input_tokens + cache tokens = actual context window usage
    let totalTokensUsed = 0;
    let contextWindow = 200000; // Default fallback

    // Get context window size from modelUsage
    if (message.modelUsage) {
      const firstModelUsage = Object.values(message.modelUsage)[0];
      if (firstModelUsage) {
        contextWindow = firstModelUsage.contextWindow || contextWindow;
      }
    }

    // Calculate current context usage from per-call tokens
    // input_tokens = tokens sent to model (may be reduced if using cache)
    // cache_read_input_tokens = tokens read from cache (still count toward context)
    totalTokensUsed = (message.usage.input_tokens || 0) +
                      (message.usage.cache_read_input_tokens || 0);

    // Store context usage in session for resume
    session.contextUsage = {
      totalTokensUsed,
      contextWindow,
      totalCostUsd: message.total_cost_usd,
    };

    // Log all available usage data to understand the structure
    const firstModelUsage = message.modelUsage ? Object.values(message.modelUsage)[0] : null;
    this.logger.info('Claude result received', {
      sessionId,
      contextUsedPercent: Math.round((totalTokensUsed / contextWindow) * 100),
      totalTokensUsed,
      contextWindow,
      // Per-result cumulative usage
      resultUsage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        cache_read_input_tokens: message.usage.cache_read_input_tokens,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
      },
      // Per-model cumulative usage
      modelUsage: firstModelUsage ? {
        inputTokens: firstModelUsage.inputTokens,
        outputTokens: firstModelUsage.outputTokens,
        cacheReadInputTokens: firstModelUsage.cacheReadInputTokens,
        cacheCreationInputTokens: firstModelUsage.cacheCreationInputTokens,
        contextWindow: firstModelUsage.contextWindow,
      } : null,
      totalCostUsd: message.total_cost_usd,
      numTurns: 'num_turns' in message ? message.num_turns : undefined,
    });

    this.io.to(session.socketId).emit('claude:result', {
      sessionId,
      usage: message.usage,
      modelUsage: message.modelUsage,
      totalCostUsd: message.total_cost_usd,
      contextWindow,
      totalTokensUsed,
    });

    // Persist context usage to database
    this.persistContextUsage(sessionId, session.contextUsage);
  }

  /**
   * Persist context usage to database
   */
  private async persistContextUsage(
    sessionId: string,
    contextUsage: { totalTokensUsed: number; contextWindow: number; totalCostUsd: number }
  ): Promise<void> {
    try {
      const existingSession = await this.sessionStore.getSession(sessionId);
      if (existingSession?.claudeMetadata) {
        await this.sessionStore.updateSession(sessionId, {
          claudeMetadata: {
            ...existingSession.claudeMetadata,
            contextUsage,
          },
        });
        this.logger.debug('Context usage persisted', { sessionId, contextUsage });
      }
    } catch (err) {
      this.logger.error('Failed to persist context usage', { sessionId, err });
    }
  }

  /**
   * Persist allowed tools to database
   */
  private async persistAllowedTools(sessionId: string, allowedTools: Set<string>): Promise<void> {
    try {
      const existingSession = await this.sessionStore.getSession(sessionId);
      if (existingSession?.claudeMetadata) {
        await this.sessionStore.updateSession(sessionId, {
          claudeMetadata: {
            ...existingSession.claudeMetadata,
            allowedTools: Array.from(allowedTools),
          },
        });
        this.logger.debug('Allowed tools persisted', { sessionId, toolCount: allowedTools.size });
      }
    } catch (err) {
      this.logger.error('Failed to persist allowed tools', { sessionId, err });
    }
  }

  /**
   * Handle completion
   */
  private async handleComplete(sessionId: string): Promise<void> {
    this.updateThinking(sessionId, false);
    this.logger.info('Claude session completed', { sessionId });

    // Check for pending messages from other sessions
    await this.processPendingMessages(sessionId);
  }

  /**
   * Update thinking state and emit to client (only if state changed)
   */
  private updateThinking(sessionId: string, thinking: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Only emit if state changed
    if (session.thinking !== thinking) {
      session.thinking = thinking;
      this.logger.debug('Thinking state changed', { sessionId, thinking });
      this.io.to(session.socketId).emit('claude:thinking', {
        sessionId,
        thinking,
      });
    }
  }

  /**
   * Force emit thinking state to client regardless of current state
   * Used after permission responses when client state may be out of sync
   */
  private forceEmitThinking(sessionId: string, thinking: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.thinking = thinking;
    this.logger.debug('Force emitting thinking state', { sessionId, thinking });
    this.io.to(session.socketId).emit('claude:thinking', {
      sessionId,
      thinking,
    });
  }

  /**
   * Handle errors from Claude
   */
  private handleError(sessionId: string, error: Error): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.logger.error('Claude session error', { sessionId, error: error.message });
    this.io.to(session.socketId).emit('claude:error', {
      sessionId,
      error: error.message,
    });
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get Claude session ID for a vibehub session
   */
  getClaudeSessionId(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.claudeSessionId;
  }

  /**
   * Check if session is active
   */
  isSessionActive(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get the current allowlist for a session
   */
  getAllowedTools(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }
    return Array.from(session.allowedTools);
  }

  /**
   * Update the allowlist for a session
   */
  setAllowedTools(sessionId: string, tools: string[]): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn('Cannot set allowed tools: session not found', { sessionId });
      return;
    }
    session.allowedTools = new Set(tools);
    this.logger.info('Allowed tools updated', {
      sessionId,
      toolCount: tools.length,
      tools,
    });
    // Persist to database
    this.persistAllowedTools(sessionId, session.allowedTools);
  }

  /**
   * Update the permission mode for an active session
   * This calls setPermissionMode on the SDK query instance for immediate effect
   */
  async setPermissionMode(
    sessionId: string,
    mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn('Cannot set permission mode: session not found', { sessionId });
      return;
    }

    this.logger.info('Setting permission mode on active session', { sessionId, mode });
    // Update stored value
    session.permissionMode = mode;
    // Update SDK session
    await session.service.setPermissionMode(mode);
  }

  /**
   * Get the global allowlist
   */
  getGlobalAllowedTools(): string[] {
    return Array.from(this.globalAllowedTools);
  }

  /**
   * Update the global allowlist
   */
  async setGlobalAllowedTools(tools: string[]): Promise<void> {
    this.globalAllowedTools = new Set(tools);
    this.logger.info('Global allowed tools updated', {
      toolCount: tools.length,
      tools,
    });
    // Persist to storage
    const settings = await this.sessionStore.getGlobalClaudeSettings() || {};
    settings.allowedTools = tools;
    await this.sessionStore.setGlobalClaudeSettings(settings);
  }

  /**
   * Add a tool to the global allowlist
   */
  async addGlobalAllowedTool(pattern: string): Promise<void> {
    this.globalAllowedTools.add(pattern);
    this.logger.info('Tool added to global allowlist', { pattern });
    await this.setGlobalAllowedTools(Array.from(this.globalAllowedTools));
  }

  /**
   * Get session status for the session tools
   */
  getSessionStatus(sessionId: string): {
    exists: boolean;
    active: boolean;
    thinking: boolean;
    hasPendingPermission: boolean;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        exists: false,
        active: false,
        thinking: false,
        hasPendingPermission: false,
      };
    }

    return {
      exists: true,
      active: true,
      thinking: session.thinking,
      hasPendingPermission: session.pendingPermissions.size > 0,
    };
  }

  /**
   * Send a message to a session (if active, sends directly; otherwise queues)
   */
  async sendMessageToSession(sessionId: string, message: string): Promise<{
    success: boolean;
    delivered: boolean;
    queued: boolean;
    error?: string;
  }> {
    const session = this.sessions.get(sessionId);

    if (session) {
      // Session is active, check if it's busy
      if (session.thinking || session.pendingPermissions.size > 0) {
        // Queue for later
        await this.sessionStore.queueMessage(sessionId, message);
        this.logger.info('Message queued (session busy)', { sessionId });
        return { success: true, delivered: false, queued: true };
      }

      // Session is idle, send directly
      try {
        await this.sendMessage(sessionId, message);
        this.logger.info('Message sent directly to session', { sessionId });
        return { success: true, delivered: true, queued: false };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.logger.error('Failed to send message to session', { sessionId, error });
        return { success: false, delivered: false, queued: false, error };
      }
    }

    // Session not active, queue for when it starts
    const queued = await this.sessionStore.queueMessage(sessionId, message);
    if (!queued) {
      return { success: false, delivered: false, queued: false, error: 'Session not found' };
    }

    this.logger.info('Message queued (session not active)', { sessionId });
    return { success: true, delivered: false, queued: true };
  }

  /**
   * Process pending messages for a session when it becomes active
   */
  async processPendingMessages(sessionId: string): Promise<void> {
    const messages = await this.sessionStore.getPendingMessages(sessionId);
    if (messages.length === 0) {
      return;
    }

    this.logger.info('Processing pending messages', { sessionId, count: messages.length });

    // Send each pending message sequentially
    for (const message of messages) {
      try {
        // Pass true to emit user message to client since it originated from another session
        await this.sendMessage(sessionId, message, true);
        this.logger.info('Pending message sent', { sessionId });
      } catch (err) {
        this.logger.error('Failed to send pending message', { sessionId, error: err });
        // Re-queue failed message
        await this.sessionStore.queueMessage(sessionId, message);
      }
    }
  }

  /**
   * Cleanup all sessions (for shutdown)
   */
  shutdown(): void {
    this.logger.info('Shutting down all Claude sessions', {
      count: this.sessions.size
    });

    for (const [, session] of this.sessions.entries()) {
      session.service.abort();
      // Reject pending permissions
      for (const [, pending] of session.pendingPermissions.entries()) {
        pending.reject(new Error('Server shutdown'));
      }
    }

    this.sessions.clear();
  }
}
