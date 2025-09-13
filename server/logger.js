// logger.js
import { createLogger, format, transports } from 'winston';
import { inspect } from 'node:util';
import { isMainThread } from 'node:worker_threads';

const isProduction = process.env.NODE_ENV === 'production';
const globalLogLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

let LoggingWinston; // lazy

export function getLogger(moduleName, level = globalLogLevel, depth = 0) {
  const useGcp = false//isProduction && isMainThread && process.env.ENABLE_GCP_LOGS !== 'false';

  const fmt = isProduction && useGcp
    ? format.combine(format.timestamp(), format.json())
    : format.combine(
        format.colorize(),
        format.timestamp(),
        format.printf(info => {
          const { message, timestamp, _expand, ...meta } = info;
          let metaString = '';
          if (Object.keys(meta).length > 0) {
            metaString = _expand
              ? '\n' + inspect(meta, { depth, colors: true, breakLength: 80 })
              : ' ' + Object.entries(meta)
                  .map(([k, v]) => `${k}=${inspect(v, { depth, colors: true })}`)
                  .join(' ');
          }
          return `[${timestamp}] [${moduleName}] ${message}${metaString}`;
        })
      );

  const t = [];

  if (useGcp) {
    try {
      if (!LoggingWinston) {
        // lazy import so workers don’t touch it
        ({ LoggingWinston } = require('@google-cloud/logging-winston'));
      }
      t.push(new LoggingWinston());
    } catch (e) {
      // fall back to console if GCP transport can’t init
      t.push(new transports.Console());
    }
  } else {
    t.push(new transports.Console());
  }

  return createLogger({ level, format: fmt, transports: t });
}