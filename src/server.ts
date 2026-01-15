/**
 * Vibehub server
 * @module Vibehub
 */
import express from 'express';
import gc from 'gc-stats';
import { Gauge, collectDefaultMetrics } from 'prom-client';
import { gcMetrics } from './server/metrics.js';
import { server } from './server/socketServer.js';
import {
  sshDefault,
  serverDefault,
} from './shared/defaults.js';
import { logger as getLogger } from './shared/logger.js';
import type { SSH, SSL, Server } from './shared/interfaces.js';
import type { Express } from 'express';
import type SocketIO from 'socket.io';

export * from './shared/interfaces.js';
export { logger as getLogger } from './shared/logger.js';

const vibehubConnections = new Gauge({
  name: 'vibehub_connections',
  help: 'number of active socket connections to vibehub',
});

/**
 * Starts Vibehub Server
 * @name startServer
 * @returns Promise that resolves SocketIO server
 */
export const start = (
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  ssl: SSL | undefined = undefined,
): Promise<SocketIO.Server> =>
  decorateServerWithSsh(express(), ssh, serverConf, ssl);

export async function decorateServerWithSsh(
  app: Express,
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  ssl: SSL | undefined = undefined,
): Promise<SocketIO.Server> {
  const logger = getLogger();
  if (ssh.key) {
    logger.warn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
! Password-less auth enabled using private key from ${ssh.key}.
! This is dangerous, anything that reaches the vibehub server
! will be able to run remote operations without authentication.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
  }

  collectDefaultMetrics();
  gc().on('stats', gcMetrics);

  const io = await server(app, serverConf, ssl);
  /**
   * Connection metrics tracking
   * Session handlers are registered in server/socketServer.ts via registerSessionHandlers()
   */
  io.on('connection', async (socket: SocketIO.Socket) => {
    logger.info('Connection accepted.');
    vibehubConnections.inc();

    socket.on('disconnect', () => {
      vibehubConnections.dec();
    });
  });
  return io;
}
