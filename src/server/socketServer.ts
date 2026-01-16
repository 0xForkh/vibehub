import { existsSync } from 'fs';
import { join } from 'path';
import compression from 'compression';
import express from 'express';
import winston from 'express-winston';
import { logger } from '../shared/logger.js';
import { gitRouter } from './api/git.js';
import { sessionsRouter } from './api/sessions.js';
import { SessionStore } from './sessions/SessionStore.js';
import { serveStatic, trim } from './socketServer/assets.js';
import { registerClaudeHandlers } from './socketServer/claudeHandlers.js';
import { registerDictationHandlers } from './socketServer/dictationHandlers.js';
import { html } from './socketServer/html.js';
import { metricMiddleware, metricRoute } from './socketServer/metrics.js';
import { favicon, redirect } from './socketServer/middleware.js';
import { policies } from './socketServer/security.js';
import { registerSessionHandlers } from './socketServer/sessionHandlers.js';
import { listen } from './socketServer/socket.js';
import { setSocketIO } from './socketServer/socketRegistry.js';
import { loadSSL } from './socketServer/ssl.js';
import type { SSL, SSLBuffer, Server } from '../shared/interfaces.js';
import type { Express } from 'express';
import type SocketIO from 'socket.io';

export async function server(
  app: Express,
  { base, port, host, title, allowIframe }: Server,
  ssl?: SSL,
): Promise<SocketIO.Server> {
  const basePath = trim(base);
  logger().info('Starting server', {
    ssl,
    port,
    base,
    title,
  });

  const client = html(basePath, title);
  app
    .disable('x-powered-by')
    .use(express.json()) // Parse JSON bodies for API routes
    .use(metricMiddleware(basePath))
    .use(`${basePath}/metrics`, metricRoute)
    .use(`${basePath}/client`, serveStatic('client'))
    .use('/client', serveStatic('client')) // Also serve at root
    .use(
      winston.logger({
        winstonInstance: logger(),
        level: 'http',
        meta: false, // Don't include verbose request/response metadata
        msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
        colorize: false,
      }),
    )
    .use(compression())
    .use(await favicon(basePath))
    .use(redirect)
    .use(policies(allowIframe))
    // API routes for session management
    .use(`${basePath}/api/sessions`, sessionsRouter)
    .use('/api/sessions', sessionsRouter) // Also serve at root
    // API routes for git operations
    .use(`${basePath}/api/git`, gitRouter)
    .use('/api/git', gitRouter) // Also serve at root
    // Serve uploaded files from session working directories
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

        // Security: ensure the file is within the uploads directory
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
    // Serve React app for dashboard routes
    .get('/dashboard', client)
    .get('/session/:sessionId', client)
    .get('/', client)
    // Serve React app at base path
    .get(basePath, client);

  const sslBuffer: SSLBuffer = await loadSSL(ssl);
  // Use root path for socket.io since we're serving at root level now
  const io = await listen(app, host, port, '', sslBuffer);

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
