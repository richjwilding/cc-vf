import { createLogger, format, transports } from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';
import { inspect } from 'node:util';

const isProduction = process.env.NODE_ENV === 'production';
const globalLogLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Creates a logger for a specific module with optional custom log level.
 * @param {string} moduleName - Name of the module.
 * @param {string} [level] - Log level for this module (optional, defaults to global level).
 */
export function getLogger(moduleName, level = globalLogLevel, depth = 0) {
  // Create a new logger instance
  
  const logger = createLogger({
    level,
    format: isProduction
      ? format.combine(
          format.timestamp(),
          format.json()
        )
      : format.combine(
          format.colorize(),
          format.timestamp(),
          format.printf(info => {
            const { level, message, timestamp, _expand, ...meta } = info;
            let metaString = '';
            if (Object.keys(meta).length > 0) {
              if (_expand) {
                // print with controlled depth:
                metaString = '\n' + inspect(meta, {
                  depth: objectDepth,
                  colors: true,
                  breakLength: 80
                });
              } else {
                // summary on one line:
                metaString = ' ' + Object.entries(meta)
                  .map(([k, v]) => `${k}=${inspect(v, { depth: depth, colors: true })}`)
                  .join(' ');
              }
            }
            return `[${timestamp}] [${moduleName}] ${message}${metaString}`;
          })
        ),
    transports: isProduction
      ? [ new LoggingWinston() ]
      : [ new transports.Console() ]
  });
  // Add Google Cloud Logging transport in production
  if (isProduction) {
    logger.add(new LoggingWinston());
  }

  return logger;
}