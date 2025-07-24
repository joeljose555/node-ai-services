import express from 'express';
import dotenv from 'dotenv';
import { connectDb } from './db/initDb.js';
import { logger, morganMiddleware } from './utils/logger.js';
import { schedulerService } from './schedulers/scheduler.js';
import routes from './routes/routes.js';
import webhooks from './routes/webhooks.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morganMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// API routes
app.use('/api', routes);
app.use('/webhooks', webhooks);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500,
      timestamp: new Date().toISOString(),
      path: req.path
    }
  });
});

// 404 handler
app.use('*splat', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404,
      timestamp: new Date().toISOString(),
      path: req.path
    }
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop the scheduler
    schedulerService.stop();
    logger.info('Scheduler stopped');
    
    // Close database connection
    await import('mongoose').then(mongoose => mongoose.default.connection.close());
    logger.info('Database connection closed');
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the application
async function startApp() {
  try {
    // Connect to database
    await connectDb();
    
    // Start the scheduler
    //schedulerService.start();
    logger.info('Summary generation scheduler initialized');
    
    // Start the server
    app.listen(PORT, () => {
      logger.info(`🚀 Summary Service running on port ${PORT}`);
      logger.info(`📱 Health check: http://localhost:${PORT}/health`);
      logger.info(`📊 API base: http://localhost:${PORT}/api`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Log scheduler status
      const schedulerStatus = schedulerService.getStatus();
      logger.info(`📅 Scheduler status:`, schedulerStatus);
    });
    
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
startApp();

export default app;
