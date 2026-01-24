/**
 * Port Allocator
 *
 * Allocates random available ports for preview services.
 * Uses a port range and checks availability before allocation.
 */

import { createServer } from 'net';
import { logger as getLogger } from '../../shared/logger.js';

const logger = getLogger();

// Port range for preview services (avoid common ports)
const MIN_PORT = 20000;
const MAX_PORT = 60000;
const MAX_RETRIES = 10;

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Generate a random port in the valid range
 */
function randomPort(): number {
  return Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1)) + MIN_PORT;
}

/**
 * Find an available port, retrying if needed
 */
export async function allocatePort(): Promise<number> {
  for (let i = 0; i < MAX_RETRIES; i += 1) {
    const port = randomPort();
    if (await isPortAvailable(port)) {
      logger.debug('Allocated port', { port });
      return port;
    }
  }
  throw new Error(`Failed to find available port after ${MAX_RETRIES} attempts`);
}

/**
 * Allocate multiple ports at once
 */
export async function allocatePorts(count: number): Promise<number[]> {
  const ports: number[] = [];
  const usedPorts = new Set<number>();

  for (let i = 0; i < count; i += 1) {
    for (let retry = 0; retry < MAX_RETRIES; retry += 1) {
      const port = randomPort();
      if (!usedPorts.has(port) && await isPortAvailable(port)) {
        ports.push(port);
        usedPorts.add(port);
        break;
      }
      if (retry === MAX_RETRIES - 1) {
        throw new Error(`Failed to allocate port ${i + 1}/${count}`);
      }
    }
  }

  logger.debug('Allocated ports', { count, ports });
  return ports;
}
