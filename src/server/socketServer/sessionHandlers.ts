import { logger as getLogger } from '../../shared/logger.js';
import { SessionStore } from '../sessions/SessionStore.js';
import { spawnSession } from '../spawnSession.js';
import type { Server, Socket } from 'socket.io';

const sessionStore = new SessionStore();

export function registerSessionHandlers(io: Server): void {
  const logger = getLogger();

  io.on('connection', (socket: Socket) => {
    logger.info('Socket connected for sessions');

    // Create new session
    socket.on('session:create', async ({ name, command, cols, rows }) => {
      try {
        logger.debug('Creating session via socket', { name, command });

        const cmd = command ? command.split(' ') : ['bash'];
        const session = await sessionStore.createSession(name, cmd, {
          cols: cols || 80,
          rows: rows || 24,
          command,
        });

        socket.emit('session:created', { session });
      } catch (err) {
        logger.error('Failed to create session', { err });
        socket.emit('session:error', { message: 'Failed to create session' });
      }
    });

    // Attach to existing session
    socket.on('session:attach', async ({ sessionId }) => {
      try {
        logger.debug('Attaching to session via socket', { sessionId });
        await spawnSession(socket, sessionId);
      } catch (err) {
        logger.error('Failed to attach to session', { err, sessionId });
        socket.emit('session:error', { message: 'Failed to attach to session' });
      }
    });

    // List sessions
    socket.on('session:list', async () => {
      try {
        const sessions = await sessionStore.listSessions();
        socket.emit('session:list', { sessions });
      } catch (err) {
        logger.error('Failed to list sessions', { err });
        socket.emit('session:error', { message: 'Failed to list sessions' });
      }
    });

    // Delete session
    socket.on('session:delete', async ({ sessionId }) => {
      try {
        logger.debug('Deleting session via socket', { sessionId });
        await sessionStore.deleteSession(sessionId);
        socket.emit('session:deleted', { sessionId });
      } catch (err) {
        logger.error('Failed to delete session', { err, sessionId });
        socket.emit('session:error', { message: 'Failed to delete session' });
      }
    });

    // Rename session
    socket.on('session:rename', async ({ sessionId, name }) => {
      try {
        logger.debug('Renaming session via socket', { sessionId, name });
        const session = await sessionStore.updateSession(sessionId, { name });
        socket.emit('session:renamed', { session });
      } catch (err) {
        logger.error('Failed to rename session', { err, sessionId });
        socket.emit('session:error', { message: 'Failed to rename session' });
      }
    });
  });
}
