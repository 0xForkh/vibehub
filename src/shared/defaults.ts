import type { Server } from './interfaces';

export const serverDefault: Server = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: '0.0.0.0',
  title: process.env.TITLE || 'Vibehub - IDE for Claude Sessions',
};

export const defaultLogLevel = process.env.LOG_LEVEL || 'debug';
