/**
 * Vibehub server
 * @module Vibehub
 */
import express from 'express';
import gc from 'gc-stats';
import { Gauge, collectDefaultMetrics } from 'prom-client';
import { gcMetrics } from './server/metrics.js';
import { server } from './server/socketServer.js';
import { serverDefault } from './shared/defaults.js';
import { logger as getLogger } from './shared/logger.js';
import type { Server } from './shared/interfaces.js';
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
export async function start(
  serverConf: Server = serverDefault,
): Promise<SocketIO.Server> {
  const logger = getLogger();

  collectDefaultMetrics();
  gc().on('stats', gcMetrics);

  const io = await server(express(), serverConf);

  io.on('connection', async (socket: SocketIO.Socket) => {
    logger.info('Connection accepted.');
    vibehubConnections.inc();

    socket.on('disconnect', () => {
      vibehubConnections.dec();
    });
  });

  return io;
}
