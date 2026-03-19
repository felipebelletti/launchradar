import path from 'node:path';
import fs from 'node:fs';
import winston from 'winston';
import { config } from './config.js';

const isDev = config.NODE_ENV === 'development';
const logsDir = path.join(process.cwd(), 'logs');

try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch {
}

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true })
);

const devFormat = winston.format.combine(
  baseFormat,
  winston.format.colorize({ all: true }),
  winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const svc = service ? `[${service}] ` : '';
    return `${timestamp} ${level} ${svc}${message}${metaStr}`;
  })
);

const prodFormat = winston.format.combine(
  baseFormat,
  winston.format.json()
);

const fileFormat = winston.format.combine(
  baseFormat,
  winston.format.json()
);

const transports: winston.transport[] = [
  new winston.transports.Console(),
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: fileFormat,
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileFormat,
  }),
];

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  format: isDev ? devFormat : prodFormat,
  defaultMeta: { service: 'launchradar' },
  transports,
});

export function createChildLogger(service: string): winston.Logger {
  return logger.child({ service });
}

export const log = logger;
export default logger;
