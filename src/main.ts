#!/usr/bin/env node

/**
 * Vibehub server
 * @module Vibehub
 *
 * CLI interface for Vibehub.
 */
import { createRequire } from 'module';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { shutdownClaudeManager } from './server/socketServer/claudeHandlers.js';
import { start } from './server.js';
import { serverDefault, defaultLogLevel } from './shared/defaults.js';
import { setLevel, logger } from './shared/logger.js';

/* eslint-disable @typescript-eslint/no-var-requires */
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const opts = yargs(hideBin(process.argv))
  .scriptName(packageJson.name)
  .version(packageJson.version)
  .option('port', {
    alias: 'p',
    description: 'vibehub listen port',
    type: 'number',
  })
  .option('host', {
    description: 'vibehub listen host',
    type: 'string',
  })
  .option('log-level', {
    description: 'set log level of vibehub server',
    type: 'string',
  })
  .option('help', {
    alias: 'h',
    type: 'boolean',
    description: 'Print help message',
  })
  .parseSync();

if (!opts.help) {
  const logLevel = opts['log-level'] || defaultLogLevel;
  setLevel(logLevel);

  const serverConf = {
    ...serverDefault,
    ...(opts.port && { port: opts.port }),
    ...(opts.host && { host: opts.host }),
  };

  start(serverConf).catch((err: Error) => {
    logger().error('error in server', { err });
    process.exitCode = 1;
  });

  // Graceful shutdown on SIGTERM/SIGINT/SIGHUP
  const gracefulShutdown = (signal: string) => {
    logger().info(`Received ${signal}, shutting down gracefully`);
    shutdownClaudeManager();
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP')); // Nodemon uses this

  // Cleanup before exit (catches other exit scenarios)
  process.on('beforeExit', () => {
    shutdownClaudeManager();
  });
} else {
  yargs.showHelp();
  process.exitCode = 0;
}
