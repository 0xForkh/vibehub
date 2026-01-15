import http from 'http';
import https from 'https';
import net from 'net';
import isUndefined from 'lodash/isUndefined.js';
import { Server } from 'socket.io';

import { logger } from '../../shared/logger.js';
import type { SSLBuffer } from '../../shared/interfaces.js';
import type express from 'express';

/**
 * Check if a port is available
 */
function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, host);
  });
}

/**
 * Find an available port starting from the given port
 */
async function findAvailablePort(
  startPort: number,
  host: string,
  maxAttempts = 100,
): Promise<number> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const port = startPort + i;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port, host)) {
      return port;
    }
    logger().debug(`Port ${port} is in use, trying next...`);
  }
  throw new Error(
    `Could not find available port after ${maxAttempts} attempts starting from ${startPort}`,
  );
}

export const listen = async (
  app: express.Express,
  host: string,
  port: number,
  path: string,
  { key, cert }: SSLBuffer,
): Promise<Server> => {
  // Find available port (auto-increment if in use)
  const availablePort = await findAvailablePort(port, host);
  if (availablePort !== port) {
    logger().info(`Port ${port} is in use, using port ${availablePort} instead`);
  }

  const server = !isUndefined(key) && !isUndefined(cert)
    ? https.createServer({ key, cert }, app)
    : http.createServer(app);

  return new Promise((resolve) => {
    server.listen(availablePort, host, () => {
      logger().info('Server started', {
        port: availablePort,
        connection: !isUndefined(key) && !isUndefined(cert) ? 'https' : 'http',
      });
      resolve(
        new Server(server, {
          path: `${path}/socket.io`,
          pingInterval: 25000,
          pingTimeout: 20000,
        }),
      );
    });
  });
};
