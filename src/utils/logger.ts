import winston from 'winston';
import morgan from 'morgan';
import chalk from 'chalk';

// Custom colors for different log levels
const colors = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.blue,
  debug: chalk.gray,
  success: chalk.green,
  http: chalk.magenta,
};

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const color = colors[level as keyof typeof colors] || chalk.white;
    const levelUpper = level.toUpperCase().padEnd(5);
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${chalk.gray(stack)}` : '';
    
    return `${chalk.gray(timestamp)} ${color(levelUpper)} ${message}${metaStr}${stackStr}`;
  })
);

// Create Winston logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console transport with custom format
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
    }),
  ],
});

// Custom Morgan token for response time with color
morgan.token('response-time-colored', (req: any, res: any) => {
  const time = (morgan as any)['response-time'](req, res);
  if (!time) return '';
  
  const numTime = parseInt(time);
  if (numTime < 100) return chalk.green(`${time}ms`);
  if (numTime < 500) return chalk.yellow(`${time}ms`);
  return chalk.red(`${time}ms`);
});

// Custom Morgan token for status with color
morgan.token('status-colored', (req: any, res: any) => {
  const status = res.statusCode;
  if (status >= 500) return chalk.red(status);
  if (status >= 400) return chalk.yellow(status);
  if (status >= 300) return chalk.cyan(status);
  if (status >= 200) return chalk.green(status);
  return chalk.gray(status);
});

// Custom Morgan token for method with color
morgan.token('method-colored', (req: any) => {
  const method = req.method;
  switch (method) {
    case 'GET': return chalk.green(method);
    case 'POST': return chalk.blue(method);
    case 'PUT': return chalk.yellow(method);
    case 'DELETE': return chalk.red(method);
    case 'PATCH': return chalk.magenta(method);
    default: return chalk.gray(method);
  }
});

// Custom Morgan format for beautiful console output
const morganFormat = ':method-colored :url :status-colored :response-time-colored - :res[content-length] bytes';

// Create Morgan middleware for HTTP request logging
export const morganMiddleware = morgan(morganFormat, {
  stream: {
    write: (message: string) => {
      // Remove the newline character and log with HTTP level
      logger.http(message.trim());
    },
  },
});

// Convenience methods for different log levels
export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta);
};

export const logError = (message: string, error?: Error | any, meta?: any) => {
  if (error instanceof Error) {
    logger.error(message, { error: error.message, stack: error.stack, ...meta });
  } else {
    logger.error(message, { error, ...meta });
  }
};

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta);
};

export const logSuccess = (message: string, meta?: any) => {
  logger.info(message, { level: 'success', ...meta });
};

export const logHttp = (message: string, meta?: any) => {
  logger.http(message, meta);
};

// Database logging utility
export const logDb = (operation: string, collection: string, details?: any) => {
  logger.info(`Database ${operation} on ${collection}`, {
    level: 'db',
    operation,
    collection,
    ...details,
  });
};

// API request logging utility
export const logApiRequest = (method: string, url: string, statusCode: number, responseTime: number, userAgent?: string) => {
  logger.info(`API Request: ${method} ${url}`, {
    level: 'api',
    method,
    url,
    statusCode,
    responseTime: `${responseTime}ms`,
    userAgent,
  });
};

// Error logging utility with stack trace
export const logErrorWithStack = (message: string, error: Error, context?: any) => {
  logger.error(message, {
    error: error.message,
    stack: error.stack,
    context,
  });
};

// Performance logging utility
export const logPerformance = (operation: string, duration: number, details?: any) => {
  const color = duration < 100 ? chalk.green : duration < 500 ? chalk.yellow : chalk.red;
  logger.info(`Performance: ${operation} took ${color(`${duration}ms`)}`, {
    level: 'performance',
    operation,
    duration,
    ...details,
  });
};

// Export default logger instance
export default logger;
