import winston from 'winston';
import { defaultLogLevel } from './defaults.js';
import { isDev } from './env.js';

const { combine, timestamp, label, colorize, printf } = winston.format;

// Custom concise format for development
const devFormat = printf(({ level, message, timestamp: ts, ...metadata }) => {
  const formattedTime = new Date(Number(ts)).toLocaleTimeString('en-US', { hour12: false });
  const meta = Object.keys(metadata).length ? ` ${  JSON.stringify(metadata)}` : '';
  return `${formattedTime} ${level}: ${message}${meta}`;
});

// Custom concise format for production (human-readable, single line)
const prodFormat = printf(({ level, message, timestamp: _ts, label: lbl, ...metadata }) => {
  // Extract common fields for cleaner display
  const { sessionId, claudeSessionId, type, ...rest } = metadata;

  // Build a concise metadata string
  const parts: string[] = [];
  if (sessionId) parts.push(`sid=${String(sessionId).slice(0, 8)}`);
  if (claudeSessionId) parts.push(`claude=${String(claudeSessionId).slice(0, 8)}`);
  if (type) parts.push(`type=${type}`);

  // Add remaining metadata if any
  const restKeys = Object.keys(rest);
  if (restKeys.length > 0) {
    const compactRest = restKeys.map(k => {
      const v = rest[k];
      return `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`;
    }).join(' ');
    parts.push(compactRest);
  }

  const meta = parts.length ? ` [${parts.join(' | ')}]` : '';
  return `[${lbl}] ${level.toUpperCase().padEnd(5)} ${message}${meta}`;
});

const dev = combine(
  colorize(),
  timestamp(),
  devFormat,
);

const prod = combine(label({ label: 'Vibehub' }), timestamp(), prodFormat);

let globalLogger = winston.createLogger({
  format: isDev ? dev : prod,
  transports: [
    new winston.transports.Console({
      level: defaultLogLevel,
      handleExceptions: true,
    }),
  ],
});

export function setLevel(level: typeof winston.level): void {
  globalLogger = winston.createLogger({
    format: isDev ? dev : prod,
    transports: [
      new winston.transports.Console({
        level,
        handleExceptions: true,
      }),
    ],
  });
}

export function logger(): winston.Logger {
  return globalLogger;
}
