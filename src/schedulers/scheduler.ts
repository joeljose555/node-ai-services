import * as cron from 'node-cron';
import { summaryService } from '../services/summaryService.js';
import { batchTimeoutService } from '../services/batchTimeoutService.js';
import { logger } from '../utils/logger.js';

export class SchedulerService {
    private summaryTask: cron.ScheduledTask | null = null;
    private batchMaintenanceTask: cron.ScheduledTask | null = null;
    private isRunning: boolean = false;
    private isBatchMaintenanceRunning: boolean = false;

    constructor() {
        // Get cron schedule from environment variable or default to every 6 hours
        this.scheduleSummaryGeneration();
        this.scheduleBatchMaintenance();
    }

    /**
     * Schedule the summary generation task
     */
    private scheduleSummaryGeneration(): void {
        try {
            // Default: Run every 6 hours at minute 0 (00:00, 06:00, 12:00, 18:00)
            // You can override this with SUMMARY_CRON_SCHEDULE environment variable
            const cronSchedule = process.env.SUMMARY_CRON_SCHEDULE || '0 */6 * * *';
            
            logger.info(`Setting up summary generation scheduler with cron pattern: ${cronSchedule}`);

            this.summaryTask = cron.schedule(cronSchedule, async () => {
                await this.executeSummaryTask();
            }, {
                timezone: process.env.TIMEZONE || 'UTC'
            });

            logger.info('Summary generation scheduler configured successfully');

        } catch (error) {
            logger.error('Error setting up summary generation scheduler:', error);
            throw error;
        }
    }

    /**
     * Schedule the batch maintenance task
     */
    private scheduleBatchMaintenance(): void {
        try {
            // Default: Run every 5 minutes to check for timeouts and partial completions
            // You can override this with BATCH_MAINTENANCE_CRON_SCHEDULE environment variable
            const cronSchedule = process.env.BATCH_MAINTENANCE_CRON_SCHEDULE || '*/5 * * * *';
            
            logger.info(`Setting up batch maintenance scheduler with cron pattern: ${cronSchedule}`);

            this.batchMaintenanceTask = cron.schedule(cronSchedule, async () => {
                await this.executeBatchMaintenanceTask();
            }, {
                timezone: process.env.TIMEZONE || 'UTC'
            });

            logger.info('Batch maintenance scheduler configured successfully');

        } catch (error) {
            logger.error('Error setting up batch maintenance scheduler:', error);
            throw error;
        }
    }

    /**
     * Execute the summary generation task with error handling and overlap prevention
     */
    private async executeSummaryTask(): Promise<void> {
        // Prevent overlapping executions
        if (this.isRunning) {
            logger.warn('Summary generation task is already running, skipping this execution');
            return;
        }

        this.isRunning = true;
        const startTime = new Date();

        try {
            logger.info('=== Starting scheduled summary generation ===');
            
            await summaryService.executeScheduledSummaryTask();
            
            const duration = Date.now() - startTime.getTime();
            logger.info(`=== Completed scheduled summary generation in ${duration}ms ===`);

        } catch (error) {
            logger.error('Error in scheduled summary generation task:', error);
            
            // Optionally send alert to monitoring service
            await this.sendErrorAlert(error);
            
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Execute the batch maintenance task with error handling and overlap prevention
     */
    private async executeBatchMaintenanceTask(): Promise<void> {
        // Prevent overlapping executions
        if (this.isBatchMaintenanceRunning) {
            logger.warn('Batch maintenance task is already running, skipping this execution');
            return;
        }

        this.isBatchMaintenanceRunning = true;
        const startTime = new Date();

        try {
            logger.info('=== Starting batch maintenance task ===');
            
            await batchTimeoutService.runPeriodicMaintenance();
            
            const duration = Date.now() - startTime.getTime();
            logger.info(`=== Completed batch maintenance task in ${duration}ms ===`);

        } catch (error) {
            logger.error('Error in batch maintenance task:', error);
            
            // Optionally send alert to monitoring service
            await this.sendErrorAlert(error);
            
        } finally {
            this.isBatchMaintenanceRunning = false;
        }
    }

    /**
     * Start the scheduler
     */
    public start(): void {
        try {
            if (!this.summaryTask) {
                throw new Error('Summary task not configured');
            }
            if (!this.batchMaintenanceTask) {
                throw new Error('Batch maintenance task not configured');
            }

            this.summaryTask.start();
            this.batchMaintenanceTask.start();
            logger.info('Summary generation and batch maintenance schedulers started');

            // Optionally run immediately on start (for testing/development)
            if (process.env.RUN_SUMMARY_ON_START == 'true') {
                logger.info('Running summary generation immediately on startup');
                setTimeout(() => {
                    this.executeSummaryTask();
                }, 5000); // Wait 5 seconds after startup
            }

        } catch (error) {
            logger.error('Error starting schedulers:', error);
            throw error;
        }
    }

    /**
     * Stop the scheduler
     */
    public stop(): void {
        try {
            if (this.summaryTask) {
                this.summaryTask.stop();
            }
            if (this.batchMaintenanceTask) {
                this.batchMaintenanceTask.stop();
            }
            logger.info('Summary generation and batch maintenance schedulers stopped');
        } catch (error) {
            logger.error('Error stopping schedulers:', error);
        }
    }

    /**
     * Run summary generation manually (for testing or manual triggers)
     */
    public async runManually(): Promise<void> {
        try {
            logger.info('Running summary generation manually');
            await this.executeSummaryTask();
        } catch (error) {
            logger.error('Error in manual summary generation:', error);
            throw error;
        }
    }

    /**
     * Get scheduler status
     */
    public getStatus(): { 
        summaryTask: {
            isScheduled: boolean; 
            isRunning: boolean; 
            cronPattern: string;
            nextRun: Date | null;
        };
        batchMaintenance: {
            isScheduled: boolean;
            isRunning: boolean;
            cronPattern: string;
        };
    } {
        return {
            summaryTask: {
                isScheduled: this.summaryTask ? this.summaryTask.getStatus() === 'scheduled' : false,
                isRunning: this.isRunning,
                cronPattern: process.env.SUMMARY_CRON_SCHEDULE || '0 */6 * * *',
                nextRun: this.summaryTask ? this.getNextRunTime() : null
            },
            batchMaintenance: {
                isScheduled: this.batchMaintenanceTask ? this.batchMaintenanceTask.getStatus() === 'scheduled' : false,
                isRunning: this.isBatchMaintenanceRunning,
                cronPattern: process.env.BATCH_MAINTENANCE_CRON_SCHEDULE || '*/5 * * * *'
            }
        };
    }

    /**
     * Get next scheduled run time (approximate)
     */
    private getNextRunTime(): Date | null {
        try {
            // This is a simplified calculation - for precise next run time,
            // you might want to use a more sophisticated cron parser
            const cronPattern = process.env.SUMMARY_CRON_SCHEDULE || '0 */6 * * *';
            
            // For the default pattern '0 */6 * * *', calculate next 6-hour boundary
            if (cronPattern === '0 */6 * * *') {
                const now = new Date();
                const nextHour = Math.ceil(now.getHours() / 6) * 6;
                const nextRun = new Date(now);
                nextRun.setHours(nextHour, 0, 0, 0);
                
                // If next run is in the past, add 6 hours
                if (nextRun <= now) {
                    nextRun.setHours(nextRun.getHours() + 6);
                }
                
                return nextRun;
            }
            
            return null; // For custom cron patterns, return null
            
        } catch (error) {
            logger.error('Error calculating next run time:', error);
            return null;
        }
    }

    /**
     * Send error alert (can be extended to integrate with monitoring services)
     */
    private async sendErrorAlert(error: any): Promise<void> {
        try {
            // This is a placeholder for error alerting
            // You can integrate with services like Slack, Discord, email, etc.
            
            const alertData = {
                service: 'summaryService',
                task: 'scheduled_summary_generation',
                error: error.message || 'Unknown error',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development'
            };

            logger.error('Summary generation task failed:', alertData);

            // Example: Send to external monitoring service
            const alertUrl = process.env.ALERT_WEBHOOK_URL;
            if (alertUrl) {
                const axios = await import('axios');
                await axios.default.post(alertUrl, alertData, {
                    timeout: 5000,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

        } catch (alertError) {
            logger.error('Error sending alert:', alertError);
        }
    }
}

// Export singleton instance
export const schedulerService = new SchedulerService();
