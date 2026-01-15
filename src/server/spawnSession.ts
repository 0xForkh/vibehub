import isUndefined from 'lodash/isUndefined.js';
import { logger as getLogger } from '../shared/logger.js';
import { tinybuffer, FlowControlServer } from './flowcontrol.js';
import { SessionStore } from './sessions/SessionStore.js';
import { TmuxManager } from './sessions/TmuxManager.js';
import type { IPty } from 'node-pty';
import type SocketIO from 'socket.io';

const sessionStore = new SessionStore();
const tmuxManager = new TmuxManager();

/**
 * Get or create tmux session for a Claude session's terminal
 */
async function getOrCreateTerminalTmux(
  sessionId: string,
  workingDir: string,
  cols: number,
  rows: number,
): Promise<string> {
  const logger = getLogger();
  const session = await sessionStore.getSession(sessionId);

  if (session?.claudeMetadata?.terminalTmuxSession) {
    // Check if tmux session still exists
    const exists = await tmuxManager.sessionExists(session.claudeMetadata.terminalTmuxSession);
    if (exists) {
      return session.claudeMetadata.terminalTmuxSession;
    }
    logger.warn('Terminal tmux session no longer exists, recreating', { sessionId });
  }

  // Create new tmux session
  const tmuxSessionName = `claude_term_${sessionId.slice(0, 8)}`;
  logger.info('Creating terminal tmux session for Claude session', { sessionId, tmuxSessionName, workingDir });

  await tmuxManager.createSession(tmuxSessionName, ['bash'], cols, rows, workingDir);

  // Store the tmux session name in claudeMetadata
  await sessionStore.updateSession(sessionId, {
    claudeMetadata: {
      ...session?.claudeMetadata,
      workingDir: session?.claudeMetadata?.workingDir || workingDir,
      terminalTmuxSession: tmuxSessionName,
    },
  });

  return tmuxSessionName;
}

/**
 * Spawn a session - attach to Claude session's terminal (lazily creates tmux)
 */
export async function spawnSession(
  socket: SocketIO.Socket,
  sessionId: string,
): Promise<void> {
  const logger = getLogger();

  // Get session
  const session = await sessionStore.getSession(sessionId);
  if (!session) {
    socket.emit('error', { message: 'Session not found' });
    return;
  }

  // Only Claude sessions are supported now
  if (session.type !== 'claude') {
    socket.emit('error', { message: 'Only Claude sessions support terminal attachment' });
    return;
  }

  logger.info('Attaching terminal to Claude session', { sessionId, name: session.name });

  const workingDir = session.claudeMetadata?.workingDir || process.cwd();
  const cols = session.metadata?.cols || 80;
  const rows = session.metadata?.rows || 24;

  // Get or create tmux session for this Claude session
  let tmuxSessionName: string;
  try {
    tmuxSessionName = await getOrCreateTerminalTmux(sessionId, workingDir, cols, rows);
  } catch (err) {
    logger.error('Failed to create terminal tmux session', { err, sessionId });
    socket.emit('error', { message: 'Failed to create terminal session' });
    return;
  }

  // Attach to tmux session
  let term: IPty;
  try {
    term = await tmuxManager.attachSession(tmuxSessionName);
  } catch (err) {
    logger.error('Failed to attach to terminal session', { err, sessionId, tmuxSessionName });
    socket.emit('error', { message: 'Failed to attach to terminal session' });
    return;
  }

  const { pid } = term;
  logger.info('Attached to tmux session', { sessionId, pid });

  // Update last accessed time
  await sessionStore.touchSession(sessionId);

  // Emit login event
  socket.emit('login', { session });

  // Handle tmux exit (session was killed)
  term.onExit(({ exitCode }) => {
    logger.info('Tmux session exited', { exitCode, sessionId, pid });
    socket.emit('logout');
    socket
      .removeAllListeners('disconnect')
      .removeAllListeners('resize')
      .removeAllListeners('input')
      .removeAllListeners('detach');
  });

  // Setup data flow
  const send = tinybuffer(socket, 2, 524288);
  const fcServer = new FlowControlServer();

  term.onData((data: string) => {
    // Only log PTY data in very verbose debugging scenarios
    // Uncomment below line if you need to debug terminal data flow
    // logger.debug('PTY data received:', { length: data.length });
    send(data);
    if (fcServer.account(data.length)) {
      term.pause();
    }
  });

  // Socket event handlers
  socket
    .on('resize', ({ cols, rows }) => {
      term.resize(cols, rows);
      // Also update session metadata
      sessionStore.updateSession(sessionId, {
        metadata: { ...session.metadata, cols, rows },
      });
    })
    .on('input', (input) => {
      // Only log socket input in very verbose debugging scenarios
      // Uncomment below line if you need to debug terminal input flow
      // logger.debug('Input received from socket:', { length: input.length });
      if (!isUndefined(term)) term.write(input);
    })
    .on('detach', async () => {
      // Detach from session (don't kill it)
      logger.info('Detaching from session', { sessionId });
      term.kill(); // This just kills the attach process, not the tmux session
      await sessionStore.updateSession(sessionId, { status: 'detached' });
      socket.emit('detached', { sessionId });
    })
    .on('disconnect', () => {
      // On disconnect, detach from tmux (don't kill the session)
      logger.info('Socket disconnected, detaching from session', { sessionId });
      term.kill(); // Just kills the attach, tmux session continues
      sessionStore.updateSession(sessionId, { status: 'detached' });
    })
    .on('commit', (size) => {
      if (fcServer.commit(size)) {
        term.resume();
      }
    });
}
