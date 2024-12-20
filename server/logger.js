import { createLogger, format, transports } from 'winston';
import { LoggingWinston } from '@google-cloud/logging-winston';

const isProduction = process.env.NODE_ENV === 'production';
const globalLogLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Creates a logger for a specific module with optional custom log level.
 * @param {string} moduleName - Name of the module.
 * @param {string} [level] - Log level for this module (optional, defaults to global level).
 */
export function getLogger(moduleName, level = globalLogLevel) {
  // Create a new logger instance
  
  const logger = createLogger({
    level,
    format: isProduction
      ? format.combine(
          format.timestamp(),
          format.json() // JSON structured logging for production
        )
      : format.combine(
          format.colorize(),    // Adds color to the console output,
          format.timestamp(),
          format.printf(({ level, message, timestamp, _expand, ...meta }) => {
            const metaString = meta && Object.keys(meta).length > 0
              ? _expand ? "\n" + JSON.stringify(meta, null, 2)
                        : " " + Object.keys(meta).map(d=>`${d}: ${meta[d]}`).join(" ")
              : '';
            return `[${timestamp}] [${moduleName}] ${message}${metaString}`;
          })
        ),
    transports:  isProduction
      ? [new LoggingWinston()] 
      : [new transports.Console()]
  });
  // Add Google Cloud Logging transport in production
  if (isProduction) {
    logger.add(new LoggingWinston());
  }

  return logger;
}