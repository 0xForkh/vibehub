import { existsSync } from 'fs';
import http from 'http';
import { join } from 'path';
import compression from 'compression';
import express from 'express';
import winston from 'express-winston';
import { Server } from 'socket.io';
import { logger } from '../shared/logger.js';
import { filesRouter } from './api/files.js';
import { gitRouter } from './api/git.js';
import { sessionsRouter } from './api/sessions.js';
import { tasksRouter } from './api/tasks.js';
import { SessionStore } from './sessions/SessionStore.js';
import { serveStatic } from './socketServer/assets.js';
import { registerClaudeHandlers } from './socketServer/claudeHandlers.js';
import { registerDictationHandlers } from './socketServer/dictationHandlers.js';
import { html } from './socketServer/html.js';
import { metricMiddleware, metricRoute } from './socketServer/metrics.js';
import { favicon, redirect } from './socketServer/middleware.js';
import { policies } from './socketServer/security.js';
import { registerSessionHandlers } from './socketServer/sessionHandlers.js';
import { setSocketIO } from './socketServer/socketRegistry.js';
import type { Server as ServerConf } from '../shared/interfaces.js';
import type { Express } from 'express';
import type SocketIO from 'socket.io';

export async function server(
  app: Express,
  { port, host, title }: ServerConf,
): Promise<SocketIO.Server> {
  logger().info('Starting server', { port, title });

  const client = html(title);
  app
    .disable('x-powered-by')
    .use(express.json({ limit: '50mb' }))
    .use(metricMiddleware())
    .use('/metrics', metricRoute)
    .use('/client', serveStatic('client'))
    .use(
      winston.logger({
        winstonInstance: logger(),
        level: 'http',
        meta: false,
        msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
        colorize: false,
      }),
    )
    .use(compression({
      // Don't compress SSE responses - they need to stream immediately
      filter: (req, res) => {
        if (req.headers.accept === 'text/event-stream') {
          return false;
        }
        return compression.filter(req, res);
      },
    }))
    .use(await favicon())
    .use(redirect)
    .use(policies())
    .use('/api/sessions', sessionsRouter)
    .use('/api/files', filesRouter)
    .use('/api/git', gitRouter)
    .use('/api/tasks', tasksRouter)
    .get('/api/uploads/:sessionId/:filename', async (req, res) => {
      try {
        const { sessionId, filename } = req.params;
        const store = new SessionStore();
        const session = await store.getSession(sessionId);

        if (!session?.claudeMetadata?.workingDir) {
          res.status(404).send('Session not found');
          return;
        }

        const filePath = join(session.claudeMetadata.workingDir, 'uploads', filename);

        if (!filePath.startsWith(join(session.claudeMetadata.workingDir, 'uploads'))) {
          res.status(403).send('Access denied');
          return;
        }

        if (!existsSync(filePath)) {
          res.status(404).send('File not found');
          return;
        }

        res.sendFile(filePath);
      } catch (err) {
        logger().error('Failed to serve uploaded file', { err });
        res.status(500).send('Internal server error');
      }
    })
    .get('/dashboard', client)
    .get('/session/:sessionId', client)
    .get('/', client);

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    path: '/socket.io',
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      logger().info('Server started', { port, host });
      resolve();
    });
  });

  // Store io instance for API routes to broadcast updates
  setSocketIO(io);

  // Register session socket handlers
  registerSessionHandlers(io);

  // Register Claude session handlers
  registerClaudeHandlers(io);

  // Register dictation handlers
  registerDictationHandlers(io);

  // Clean up orphaned Claude sessions from previous server run
  // Claude processes don't persist across server restarts (unlike tmux sessions)
  const sessionStore = new SessionStore();
  await sessionStore.cleanupClaudeSessions();

  return io;
}
