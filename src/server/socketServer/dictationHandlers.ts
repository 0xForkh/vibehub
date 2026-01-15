import { logger as getLogger } from '../../shared/logger.js';
import { CloudDictationService } from '../dictation/CloudDictationService.js';
import type { Server, Socket } from 'socket.io';

// Session keyed by dictationId for proper isolation
interface DictationSession {
  service: CloudDictationService;
  socketId: string;
  cleanupTimeout?: NodeJS.Timeout;
  stopped: boolean; // Whether user has stopped recording
  lastFinalText: string; // Last finalized transcript text
}

// Map by dictationId instead of socketId to properly isolate sessions
const sessions = new Map<string, DictationSession>();
// Track active dictationId per socket for chunk routing
const socketToSession = new Map<string, string>();

const CLEANUP_DELAY_MS = 2000;

export function registerDictationHandlers(io: Server): void {
  const logger = getLogger();

  io.on('connection', (socket: Socket) => {
    socket.on('dictation:start', async ({ dictationId }: { dictationId?: string } = {}) => {
      if (!dictationId) {
        socket.emit('dictation:error', { message: 'Missing dictationId' });
        return;
      }

      logger.debug('Dictation started', { socketId: socket.id, dictationId });

      // Clean up any existing session for this socket
      const existingDictationId = socketToSession.get(socket.id);
      if (existingDictationId) {
        const existingSession = sessions.get(existingDictationId);
        if (existingSession) {
          if (existingSession.cleanupTimeout) {
            clearTimeout(existingSession.cleanupTimeout);
          }
          existingSession.service.disconnect();
          sessions.delete(existingDictationId);
        }
      }

      const cloudService = new CloudDictationService();

      if (!cloudService.isAvailable()) {
        socket.emit('dictation:error', { message: 'ELEVENLABS_API_KEY not configured', dictationId });
        return;
      }

      // Create session early so callbacks can access it
      const session: DictationSession = {
        service: cloudService,
        socketId: socket.id,
        stopped: false,
        lastFinalText: '',
      };

      try {
        await cloudService.connect(
          (text, isFinal) => {
            // Always send partial results for UI feedback
            socket.emit('dictation:partial', { text, isFinal, dictationId });

            // Accumulate finalized text (ElevenLabs sends separate commits for pauses)
            if (isFinal && text) {
              session.lastFinalText = session.lastFinalText
                ? `${session.lastFinalText} ${text}`
                : text;

              // If user has already stopped, this is the final result after commit
              if (session.stopped) {
                logger.debug('Final transcript after stop', { dictationId, text: session.lastFinalText });
                socket.emit('dictation:result', { text: session.lastFinalText, duration: 0, dictationId });
              }
            }
          },
          (error) => {
            socket.emit('dictation:error', { message: error, dictationId });
          },
        );

        sessions.set(dictationId, session);
        socketToSession.set(socket.id, dictationId);

        socket.emit('dictation:started', { mode: 'streaming', dictationId });
      } catch (err) {
        logger.error('Cloud service connection failed', { err });
        socket.emit('dictation:error', { message: 'Failed to connect to transcription service', dictationId });
      }
    });

    socket.on('dictation:chunk', (chunk: ArrayBuffer) => {
      // Route chunk to the active session for this socket
      const dictationId = socketToSession.get(socket.id);
      if (!dictationId) return;

      const session = sessions.get(dictationId);
      if (session && session.socketId === socket.id && !session.stopped) {
        session.service.sendAudio(Buffer.from(chunk));
      }
    });

    socket.on('dictation:stop', ({ dictationId }: { dictationId?: string } = {}) => {
      if (!dictationId) return;

      logger.debug('Dictation stopped', { socketId: socket.id, dictationId });

      const session = sessions.get(dictationId);
      if (session && session.socketId === socket.id) {
        // Mark as stopped - the next isFinal callback will trigger the result
        session.stopped = true;

        // Commit to force final transcription
        session.service.commit();

        // Clear socket mapping immediately so new sessions can start
        if (socketToSession.get(socket.id) === dictationId) {
          socketToSession.delete(socket.id);
        }

        // Delayed cleanup to allow final transcription to complete
        // Also send result if no final callback came (e.g., very short recording)
        session.cleanupTimeout = setTimeout(() => {
          // If we haven't sent a result yet and have accumulated text, send it now
          if (session.lastFinalText) {
            // Result may have already been sent in the callback, but client handles duplicates
          } else {
            // No finalized text - send empty result to close the session
            socket.emit('dictation:result', { text: '', duration: 0, dictationId });
          }
          session.service.disconnect();
          sessions.delete(dictationId);
        }, CLEANUP_DELAY_MS);
      }
    });

    socket.on('dictation:cancel', ({ dictationId }: { dictationId?: string } = {}) => {
      if (!dictationId) return;

      const session = sessions.get(dictationId);
      if (session && session.socketId === socket.id) {
        if (session.cleanupTimeout) {
          clearTimeout(session.cleanupTimeout);
        }
        session.service.disconnect();
        sessions.delete(dictationId);

        if (socketToSession.get(socket.id) === dictationId) {
          socketToSession.delete(socket.id);
        }
      }
      socket.emit('dictation:cancelled', { dictationId });
    });

    socket.on('disconnect', () => {
      // Clean up any active session for this socket
      const dictationId = socketToSession.get(socket.id);
      if (dictationId) {
        const session = sessions.get(dictationId);
        if (session) {
          if (session.cleanupTimeout) {
            clearTimeout(session.cleanupTimeout);
          }
          session.service.disconnect();
          sessions.delete(dictationId);
        }
        socketToSession.delete(socket.id);
      }
    });
  });
}
