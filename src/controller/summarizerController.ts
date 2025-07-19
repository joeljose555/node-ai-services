import { Request, Response } from 'express';
import { summaryService } from '../services/summaryService.js';
import { schedulerService } from '../schedulers/scheduler.js';
import { logger } from '../utils/logger.js';

export class SummarizerController {
    
    /**
     * Generate summaries for all users (manual trigger)
     */
    async generateSummaries(req: Request, res: Response): Promise<void> {
        try {
            logger.info('Manual summary generation triggered via API');
            
            const summaries = await summaryService.generateSummariesForAllUsers();
            
            if (summaries.length > 0) {
                await summaryService.sendSummariesToService(summaries);
            }
            
            res.status(200).json({
                success: true,
                message: 'Summary generation completed',
                data: {
                    summariesGenerated: summaries.length,
                    timestamp: new Date().toISOString()
                }
            });
            
        } catch (error) {
            logger.error('Error in manual summary generation:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate summaries',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    /**
     * Get scheduler status
     */
    async getSchedulerStatus(req: Request, res: Response): Promise<void> {
        try {
            const status = schedulerService.getStatus();
            
            res.status(200).json({
                success: true,
                data: {
                    scheduler: status,
                    environment: {
                        maxArticlesCount: process.env.MAX_ARTICLES_COUNT || '5',
                        cronSchedule: process.env.SUMMARY_CRON_SCHEDULE || '0 */6 * * *',
                        summaryServiceUrl: process.env.SUMMARY_SERVICE_URL || 'http://localhost:3001/api/summaries',
                        runOnStart: process.env.RUN_SUMMARY_ON_START || 'false'
                    }
                }
            });
            
        } catch (error) {
            logger.error('Error getting scheduler status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get scheduler status',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    /**
     * Trigger manual summary generation
     */
    async triggerManualSummary(req: Request, res: Response): Promise<void> {
        try {
            logger.info('Manual summary trigger requested via API');
            
            // Run the scheduled task manually
            await schedulerService.runManually();
            
            res.status(200).json({
                success: true,
                message: 'Manual summary generation triggered successfully',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error('Error triggering manual summary:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to trigger manual summary generation',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    /**
     * Get summary for a specific user
     */
    async getUserSummary(req: Request, res: Response): Promise<void> {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
                return;
            }
            
            const articles = await summaryService.getArticlesForUser(userId);
            
            res.status(200).json({
                success: true,
                data: {
                    userId,
                    articles,
                    articleCount: articles.length,
                    timestamp: new Date().toISOString()
                }
            });
            
        } catch (error) {
            logger.error(`Error getting user summary for ${req.params.userId}:`, error);
            res.status(500).json({
                success: false,
                message: 'Failed to get user summary',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    /**
     * Generate summary for a specific user
     */
    async generateUserSummary(req: Request, res: Response): Promise<void> {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
                return;
            }
            
            const summary = await summaryService.generateSummaryForUser(userId);
            
            if (!summary) {
                res.status(404).json({
                    success: false,
                    message: 'No articles found for user or user has no category preferences'
                });
                return;
            }
            
            await summaryService.sendSummariesToService([summary]);
            
            res.status(200).json({
                success: true,
                data: summary,
                sentToExternalService: true
            });
            
        } catch (error) {
            logger.error(`Error generating summary for user ${req.params.userId}:`, error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate user summary',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    /**
     * Get overall service status
     */
    async getServiceStatus(req: Request, res: Response): Promise<void> {
        try {
            const schedulerStatus = schedulerService.getStatus();
            
            res.status(200).json({
                success: true,
                data: {
                    service: {
                        name: 'Summary Service',
                        version: '1.0.0',
                        uptime: process.uptime(),
                        environment: process.env.NODE_ENV || 'development',
                        timestamp: new Date().toISOString()
                    },
                    scheduler: schedulerStatus,
                    configuration: {
                        maxArticlesCount: parseInt(process.env.MAX_ARTICLES_COUNT || '5'),
                        cronSchedule: process.env.SUMMARY_CRON_SCHEDULE || '0 */6 * * *',
                        summaryServiceUrl: process.env.SUMMARY_SERVICE_URL || 'http://localhost:3001/api/summaries',
                        runOnStart: process.env.RUN_SUMMARY_ON_START === 'true'
                    }
                }
            });
            
        } catch (error) {
            logger.error('Error getting service status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get service status',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}

// Export singleton instance
export const summarizerController = new SummarizerController();
