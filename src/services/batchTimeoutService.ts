import { logger } from '../utils/logger';
import BatchTracker from '../models/batchTracker';
import AiSummaries from '../models/aiSummarries';
import { audioGenerationService } from './audioGenerationService';

export class BatchTimeoutService {

    /**
     * Process all batches that have timed out (30 minutes)
     */
    async processTimeoutBatches(): Promise<void> {
        try {
            const now = new Date();
            
            // Find batches that have timed out and are still pending or partial_complete
            const timedOutBatches = await BatchTracker.find({
                timeoutAt: { $lte: now },
                status: { $in: ['pending', 'partial_complete'] }
            });

            logger.info(`Found ${timedOutBatches.length} timed-out batches to process`);

            for (const batch of timedOutBatches) {
                await this.handleTimeoutBatch(batch);
            }

        } catch (error) {
            logger.error('Error processing timeout batches:', error);
        }
    }

    /**
     * Check for orphaned summaries that belong to failed batches
     * This handles cases where summaries arrived after the batch timed out
     */
    async processOrphanedSummaries(): Promise<void> {
        try {
            // Find failed batches
            const failedBatches = await BatchTracker.find({
                status: 'failed',
                receivedCount: 0
            });

            logger.info(`Checking ${failedBatches.length} failed batches for orphaned summaries`);

            for (const batch of failedBatches) {
                // Check if there are summaries for this batch that arrived after it failed
                const summaryCount = await AiSummaries.countDocuments({ batchId: batch.batchId });
                
                if (summaryCount > 0) {
                    logger.info(`Found ${summaryCount} orphaned summaries for failed batch ${batch.batchId}, recovering...`);
                    await this.recoverFailedBatch(batch, summaryCount);
                }
            }

        } catch (error) {
            logger.error('Error processing orphaned summaries:', error);
        }
    }

    /**
     * Recover a failed batch that now has summaries
     */
    private async recoverFailedBatch(batch: any, summaryCount: number): Promise<void> {
        try {
            // Only recover if the batch is still in failed status
            if (batch.status !== 'failed') {
                logger.info(`Batch ${batch.batchId} is no longer in failed status (${batch.status}), skipping recovery`);
                return;
            }

            // Check how many summaries already have audio generated
            const summariesWithAudio = await AiSummaries.countDocuments({ 
                batchId: batch.batchId, 
                isAudioGenerated: true 
            });
            const summariesNeedingAudio = summaryCount - summariesWithAudio;

            logger.info(`Recovering batch ${batch.batchId}: ${summaryCount} total summaries, ${summariesWithAudio} already have audio, ${summariesNeedingAudio} need audio`);

            // Update batch with actual received count and mark as complete
            const updatedBatch = await BatchTracker.findOneAndUpdate(
                { batchId: batch.batchId, status: 'failed' }, // Add status condition to prevent race conditions
                { 
                    receivedCount: summaryCount,
                    status: 'complete',
                    completedAt: new Date()
                },
                { new: true }
            );

            if (!updatedBatch) {
                logger.info(`Batch ${batch.batchId} was already updated by another process, skipping recovery`);
                return;
            }

            // Only trigger audio generation if there are summaries that need audio
            if (summariesNeedingAudio > 0) {
                // Trigger audio generation for the recovered summaries (will filter out those with audio)
                await audioGenerationService.triggerAudioGeneration(batch.batchId);

                // Update status to audio_requested
                await BatchTracker.findOneAndUpdate(
                    { batchId: batch.batchId },
                    { 
                        status: 'audio_requested',
                        audioRequestedAt: new Date()
                    }
                );

                logger.info(`Recovered failed batch ${batch.batchId} and triggered audio generation for ${summariesNeedingAudio} summaries`);
            } else {
                // All summaries already have audio, mark as audio_complete
                await BatchTracker.findOneAndUpdate(
                    { batchId: batch.batchId },
                    { 
                        status: 'audio_complete',
                        audioCompletedAt: new Date()
                    }
                );
                logger.info(`Recovered failed batch ${batch.batchId} - all summaries already have audio, marked as audio_complete`);
            }

        } catch (error) {
            logger.error(`Error recovering failed batch ${batch.batchId}:`, error);
        }
    }

    /**
     * Check for batches that have reached 50% completion but haven't triggered audio generation
     */
    async checkPartialCompletionBatches(): Promise<void> {
        try {
            // Find batches that are still pending but might have reached 50% completion
            const pendingBatches = await BatchTracker.find({
                status: 'pending',
                receivedCount: { $gt: 0 } // Has received at least one response
            });

            logger.info(`Checking ${pendingBatches.length} pending batches for partial completion`);

            for (const batch of pendingBatches) {
                const completionPercentage = (batch.receivedCount / batch.expectedCount) * 100;
                
                if (completionPercentage >= 50) {
                    logger.info(`Batch ${batch.batchId} has reached ${completionPercentage.toFixed(1)}% completion, triggering audio generation`);
                    await this.triggerPartialCompletion(batch);
                }
            }

        } catch (error) {
            logger.error('Error checking partial completion batches:', error);
        }
    }

    /**
     * Handle a specific timed-out batch
     */
    private async handleTimeoutBatch(batch: any): Promise<void> {
        try {
            // Skip if batch is already processed or in progress
            if (!['pending', 'partial_complete'].includes(batch.status)) {
                logger.info(`Batch ${batch.batchId} already processed (status: ${batch.status}), skipping`);
                return;
            }

            // Check if summaries exist for this batch (they might have arrived late)
            const actualSummaryCount = await AiSummaries.countDocuments({ batchId: batch.batchId });
            const summariesWithAudio = await AiSummaries.countDocuments({ 
                batchId: batch.batchId, 
                isAudioGenerated: true 
            });
            const completionPercentage = (actualSummaryCount / batch.expectedCount) * 100;
            
            logger.warn(`Batch ${batch.batchId} timed out after 30 minutes. Expected ${batch.expectedCount}, found ${actualSummaryCount} summaries (${completionPercentage.toFixed(1)}%), ${summariesWithAudio} already have audio`);

            // Update the receivedCount with actual summaries found
            if (actualSummaryCount !== batch.receivedCount) {
                await BatchTracker.findOneAndUpdate(
                    { batchId: batch.batchId },
                    { receivedCount: actualSummaryCount }
                );
            }

            // If we have at least some summaries, trigger audio generation for those without audio
            if (actualSummaryCount > 0) {
                const summariesNeedingAudio = actualSummaryCount - summariesWithAudio;
                
                if (batch.status === 'pending') {
                    // Use atomic update to prevent race conditions
                    const updatedBatch = await BatchTracker.findOneAndUpdate(
                        { batchId: batch.batchId, status: 'pending' },
                        { 
                            status: 'complete',
                            completedAt: new Date()
                        },
                        { new: true }
                    );

                    if (!updatedBatch) {
                        logger.info(`Batch ${batch.batchId} was already updated by another process, skipping audio trigger`);
                        return;
                    }

                    // Only trigger audio generation if there are summaries without audio
                    if (summariesNeedingAudio > 0) {
                        // Trigger audio generation with available summaries (will filter out those with audio)
                        await audioGenerationService.triggerAudioGeneration(batch.batchId);

                        // Update status to audio_requested
                        await BatchTracker.findOneAndUpdate(
                            { batchId: batch.batchId },
                            { 
                                status: 'audio_requested',
                                audioRequestedAt: new Date()
                            }
                        );

                        logger.info(`Triggered audio generation for timed-out batch ${batch.batchId} with ${summariesNeedingAudio} summaries needing audio`);
                    } else {
                        // All summaries already have audio, mark as audio_complete
                        await BatchTracker.findOneAndUpdate(
                            { batchId: batch.batchId },
                            { 
                                status: 'audio_complete',
                                audioCompletedAt: new Date()
                            }
                        );
                        logger.info(`All summaries in timed-out batch ${batch.batchId} already have audio, marked as audio_complete`);
                    }
                } else if (batch.status === 'partial_complete') {
                    // Just mark as complete, audio was already triggered
                    await BatchTracker.findOneAndUpdate(
                        { batchId: batch.batchId, status: 'partial_complete' },
                        { 
                            status: 'complete',
                            completedAt: new Date()
                        }
                    );
                    logger.info(`Batch ${batch.batchId} was already partially processed, marked as complete`);
                }
            } else {
                // No summaries found, mark as failed only if still pending
                const updatedBatch = await BatchTracker.findOneAndUpdate(
                    { batchId: batch.batchId, status: { $in: ['pending', 'partial_complete'] } },
                    { 
                        status: 'failed',
                        completedAt: new Date()
                    },
                    { new: true }
                );
                
                if (updatedBatch) {
                    logger.error(`Batch ${batch.batchId} failed - no summaries found within timeout period`);
                }
            }

        } catch (error) {
            logger.error(`Error handling timeout for batch ${batch.batchId}:`, error);
        }
    }

    /**
     * Trigger partial completion logic
     */
    private async triggerPartialCompletion(batch: any): Promise<void> {
        try {
            // Only trigger if batch is still pending
            if (batch.status !== 'pending') {
                logger.info(`Batch ${batch.batchId} is no longer pending (status: ${batch.status}), skipping partial completion`);
                return;
            }

            // Use atomic update to prevent race conditions
            const updatedBatch = await BatchTracker.findOneAndUpdate(
                { batchId: batch.batchId, status: 'pending' },
                { 
                    status: 'partial_complete',
                    partialCompletedAt: new Date()
                },
                { new: true }
            );

            if (!updatedBatch) {
                logger.info(`Batch ${batch.batchId} was already updated by another process, skipping partial completion`);
                return;
            }

            // Trigger audio generation with available summaries
            await audioGenerationService.triggerAudioGeneration(batch.batchId);

            // Update status to audio_requested
            await BatchTracker.findOneAndUpdate(
                { batchId: batch.batchId },
                { 
                    status: 'audio_requested',
                    audioRequestedAt: new Date()
                }
            );

            logger.info(`Triggered audio generation for partial completion of batch ${batch.batchId}`);

        } catch (error) {
            logger.error(`Error triggering partial completion for batch ${batch.batchId}:`, error);
        }
    }

    /**
     * Clean up old completed batches (optional maintenance)
     */
    async cleanupOldBatches(daysOld: number = 7): Promise<void> {
        try {
            const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
            
            const result = await BatchTracker.deleteMany({
                status: { $in: ['complete', 'audio_complete', 'audio_failed', 'failed'] },
                createdAt: { $lt: cutoffDate }
            });

            if (result.deletedCount > 0) {
                logger.info(`Cleaned up ${result.deletedCount} old batch records older than ${daysOld} days`);
            }

        } catch (error) {
            logger.error('Error cleaning up old batches:', error);
        }
    }

    /**
     * Get batch statistics for monitoring
     */
    async getBatchStatistics(): Promise<any> {
        try {
            const stats = await BatchTracker.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        avgCompletionRate: {
                            $avg: {
                                $cond: {
                                    if: { $eq: ['$expectedCount', 0] },
                                    then: 0,
                                    else: { $divide: ['$receivedCount', '$expectedCount'] }
                                }
                            }
                        }
                    }
                },
                {
                    $sort: { _id: 1 }
                }
            ]);

            return stats;

        } catch (error) {
            logger.error('Error getting batch statistics:', error);
            return [];
        }
    }

    /**
     * Main periodic task to run batch maintenance
     */
    async runPeriodicMaintenance(): Promise<void> {
        try {
            logger.info('Starting batch timeout maintenance task');

            // Process timed-out batches
            await this.processTimeoutBatches();

            // Process orphaned summaries (summaries that arrived after batch timeout)
            await this.processOrphanedSummaries();

            // Check for partial completion
            await this.checkPartialCompletionBatches();

            // Get and log statistics
            const stats = await this.getBatchStatistics();
            logger.info('Batch statistics:', JSON.stringify(stats, null, 2));

            logger.info('Completed batch timeout maintenance task');

        } catch (error) {
            logger.error('Error in periodic maintenance:', error);
        }
    }
}

// Export singleton instance
export const batchTimeoutService = new BatchTimeoutService(); 