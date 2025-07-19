import AiSummaries from '../models/aiSummarries';
import { logger } from '../utils/logger';
import BatchTracker from '../models/batchTracker';
import { audioGenerationService } from './audioGenerationService';
import userMixes from '../models/userMixes';

export class WebhookServices {
    
    /**
     * Determine mix name and type based on current time of day
     */
    private getMixInfoByTimeOfDay(): { mixName: string; mixType: string } {
        const now = new Date();
        const hours = now.getHours(); // 0-23

        if (hours >= 5 && hours < 12) {
            return {
                mixName: 'Your Morning Mix',
                mixType: 'morning'
            };
        } else if (hours >= 12 && hours < 18) {
            return {
                mixName: 'Your Afternoon Mix',
                mixType: 'afternoon'
            };
        } else if (hours >= 18 && hours < 23) {
            return {
                mixName: 'Your Evening Mix',
                mixType: 'evening'
            };
        } else {
            return {
                mixName: 'Your Night Mix',
                mixType: 'night'
            };
        }
    }

    async saveSummary(summary: string, userId: string, summaryType: string, summaryTitle: string, batchId?: string) {
        try {
            const newSummary = await AiSummaries.create({
                summary,
                userId,
                summaryType,
                summaryTitle,
                batchId
            });

            // If batchId is provided, check batch completion
            if (batchId) {
                await this.checkBatchCompletion(batchId);
            }

            return newSummary;
        } catch (error) {
            logger.error('Error in handleSummaryWebhook:', error);
            throw error;
        }
    }

    /**
     * Check if batch is complete and trigger audio generation if needed
     */
    private async checkBatchCompletion(batchId: string): Promise<void> {
        try {
            // Update batch tracker received count
            const batchTracker = await BatchTracker.findOneAndUpdate(
                { batchId },
                { $inc: { receivedCount: 1 } },
                { new: true }
            );

            if (!batchTracker) {
                logger.warn(`Batch tracker not found for batchId: ${batchId}`);
                return;
            }

            const completionPercentage = (batchTracker.receivedCount / batchTracker.expectedCount) * 100;
            
            logger.info(`Batch ${batchId}: ${batchTracker.receivedCount}/${batchTracker.expectedCount} received (${completionPercentage.toFixed(1)}%)`);

            // Check how many summaries already have audio generated
            const summariesWithAudio = await AiSummaries.countDocuments({ 
                batchId, 
                isAudioGenerated: true 
            });

            // Check for 50% completion (partial completion)
            if (completionPercentage >= 50 && batchTracker.status === 'pending') {
                await this.handlePartialCompletion(batchId, batchTracker);
            }

            // Check for 100% completion
            if (batchTracker.receivedCount >= batchTracker.expectedCount && 
                ['pending', 'partial_complete'].includes(batchTracker.status)) {
                await this.handleFullCompletion(batchId, batchTracker);
            }

            // Check if all summaries have audio (even if batch isn't 100% complete)
            if (summariesWithAudio >= batchTracker.receivedCount && batchTracker.receivedCount > 0) {
                await this.checkBatchAudioCompletion(batchId);
            }

        } catch (error) {
            logger.error(`Error checking batch completion for ${batchId}:`, error);
        }
    }

    /**
     * Handle partial completion (50% threshold reached)
     */
    private async handlePartialCompletion(batchId: string, batchTracker: any): Promise<void> {
        try {
            logger.info(`Batch ${batchId} reached 50% completion, triggering partial audio generation`);

            // Use atomic update to prevent race conditions
            const updatedBatch = await BatchTracker.findOneAndUpdate(
                { batchId, status: 'pending' },
                { 
                    status: 'partial_complete',
                    partialCompletedAt: new Date()
                },
                { new: true }
            );

            if (!updatedBatch) {
                logger.info(`Batch ${batchId} was already updated by another process, skipping partial completion`);
                return;
            }

            // Trigger audio generation with current summaries
            await audioGenerationService.triggerAudioGeneration(batchId);

            // Update status to audio_requested
            await BatchTracker.findOneAndUpdate(
                { batchId },
                { 
                    status: 'audio_requested',
                    audioRequestedAt: new Date()
                }
            );

        } catch (error) {
            logger.error(`Error handling partial completion for batch ${batchId}:`, error);
        }
    }

    /**
     * Handle full completion (100% of expected summaries received)
     */
    private async handleFullCompletion(batchId: string, batchTracker: any): Promise<void> {
        try {
            logger.info(`Batch ${batchId} fully completed, checking if audio generation is needed`);

            // If audio was already requested for partial completion, don't trigger again
            if (batchTracker.status === 'partial_complete') {
                // Just update to complete status
                await BatchTracker.findOneAndUpdate(
                    { batchId, status: 'partial_complete' },
                    { 
                        status: 'complete',
                        completedAt: new Date()
                    }
                );
                logger.info(`Audio already requested for batch ${batchId} at 50% completion, batch now fully complete`);
            } else {
                // This is full completion without partial trigger, so trigger audio generation
                // Use atomic update to prevent race conditions
                const updatedBatch = await BatchTracker.findOneAndUpdate(
                    { batchId, status: 'pending' },
                    { 
                        status: 'complete',
                        completedAt: new Date()
                    },
                    { new: true }
                );

                if (!updatedBatch) {
                    logger.info(`Batch ${batchId} was already updated by another process, skipping full completion`);
                    return;
                }

                await audioGenerationService.triggerAudioGeneration(batchId);

                // Update status to audio_requested
                await BatchTracker.findOneAndUpdate(
                    { batchId },
                    { 
                        status: 'audio_requested',
                        audioRequestedAt: new Date()
                    }
                );
            }

        } catch (error) {
            logger.error(`Error handling full completion for batch ${batchId}:`, error);
        }
    }

    /**
     * Handle successful audio generation for individual summary
     * Called by external service when audio generation is complete for a specific summary
     */
    async handleSummaryAudioGenerationSuccess(audioUrl: string, userId: string, summaryId: string, batchId?: string) {
        try {
            logger.info(`Audio generation successful for summary ${summaryId}, user ${userId}`);

            // Update the specific summary with audio information
            const updatedSummary = await AiSummaries.findOneAndUpdate(
                { _id: summaryId, userId },
                { 
                    isAudioGenerated: true,
                    audioUrl: audioUrl
                },
                { new: true }
            );

            if (!updatedSummary) {
                throw new Error(`Summary not found: ${summaryId} for user ${userId}`);
            }

            // Get mix info based on current time
            const { mixName, mixType } = this.getMixInfoByTimeOfDay();
            
            // Save the audio URL to userMixes
            const audioMix = await userMixes.create({
                audioUrl,
                userId,
                mixName,
                mixIcon: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
                mixType
            });

            // If batchId is provided, check if all summaries in the batch have audio generated
            if (batchId) {
                await this.checkBatchAudioCompletion(batchId);
            }

            logger.info(`Audio generation completed successfully for summary ${summaryId}`);
            return { audioMix, summary: updatedSummary };

        } catch (error) {
            logger.error(`Error handling successful audio generation for summary ${summaryId}:`, error);
            throw error;
        }
    }

    /**
     * Check if all summaries in a batch have audio generated and update batch status accordingly
     */
    private async checkBatchAudioCompletion(batchId: string): Promise<void> {
        try {
            // Get batch info
            const batch = await BatchTracker.findOne({ batchId });
            if (!batch) {
                logger.warn(`Batch not found: ${batchId}`);
                return;
            }

            // Count total summaries and summaries with audio generated
            const totalSummaries = await AiSummaries.countDocuments({ batchId });
            const summariesWithAudio = await AiSummaries.countDocuments({ 
                batchId, 
                isAudioGenerated: true 
            });

            logger.info(`Batch ${batchId} audio progress: ${summariesWithAudio}/${totalSummaries} summaries have audio generated`);

            // If all summaries have audio generated, update batch status
            if (summariesWithAudio >= totalSummaries && totalSummaries > 0) {
                await BatchTracker.findOneAndUpdate(
                    { batchId, status: { $ne: 'audio_complete' } },
                    { 
                        status: 'audio_complete',
                        audioCompletedAt: new Date()
                    }
                );
                logger.info(`All summaries in batch ${batchId} have audio generated, marked batch as audio_complete`);
            }

        } catch (error) {
            logger.error(`Error checking batch audio completion for ${batchId}:`, error);
        }
    }

    /**
     * Handle successful audio generation
     * Called by external service when audio generation is complete
     * @deprecated Use handleSummaryAudioGenerationSuccess for individual summary handling
     */
    async handleAudioGenerationSuccess(audioUrl: string, userId: string, batchId: string) {
        try {
            logger.info(`Audio generation successful for batch ${batchId}, saving audio URL`);

            // Get mix info based on current time
            const { mixName, mixType } = this.getMixInfoByTimeOfDay();
            
            // Save the audio URL
            const audioMix = await userMixes.create({
                audioUrl,
                userId,
                mixName,
                mixIcon: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
                mixType
            });

            // Update batch tracker status to indicate audio was successfully generated and saved
            await BatchTracker.findOneAndUpdate(
                { batchId },
                { 
                    status: 'audio_complete',
                    audioCompletedAt: new Date(),
                    audioUrl: audioUrl
                }
            );

            logger.info(`Audio generation completed successfully for batch ${batchId}`);
            return audioMix;

        } catch (error) {
            logger.error(`Error handling successful audio generation for batch ${batchId}:`, error);
            throw error;
        }
    }

    /**
     * Handle failed audio generation
     * Called by external service when audio generation fails permanently
     */
    async handleAudioGenerationFailure(batchId: string, errorMessage: string, userId: string) {
        try {
            logger.error(`Audio generation failed permanently for batch ${batchId}: ${errorMessage}`);

            // Update batch tracker status to indicate audio generation failed
            await BatchTracker.findOneAndUpdate(
                { batchId },
                { 
                    status: 'audio_failed',
                    audioFailedAt: new Date(),
                    failureReason: errorMessage
                }
            );

            logger.info(`Batch ${batchId} marked as audio_failed in database`);

        } catch (error) {
            logger.error(`Error handling audio generation failure for batch ${batchId}:`, error);
            throw error;
        }
    }
}

export const webhookServices = new WebhookServices();