import axios from '../utils/axiosIntercepter';
import { logger } from '../utils/logger';
import AiSummaries from '../models/aiSummarries';
import BatchTracker from '../models/batchTracker';

export class AudioGenerationService {

    /**
     * Trigger audio generation for a completed batch - sends each summary individually
     */
    async triggerAudioGeneration(batchId: string): Promise<void> {
        try {
            logger.info(`Triggering audio generation for batch: ${batchId}`);

            // Check if audio has already been requested for this batch
            const batchStatus = await BatchTracker.findOne({ batchId }).select('status');
            if (batchStatus && ['audio_requested', 'audio_complete', 'audio_failed'].includes(batchStatus.status)) {
                logger.warn(`Audio already processed for batch ${batchId} (status: ${batchStatus.status}), skipping`);
                return;
            }

            // Fetch all AI summaries for this batch that don't already have audio generated
            const summaries = await AiSummaries.find({ 
                batchId, 
                isAudioGenerated: { $ne: true } 
            }).lean();
            
            if (!summaries.length) {
                logger.warn(`No summaries without audio found for batch: ${batchId}`);
                return;
            }

            // Check if there are any summaries that already have audio
            const totalSummaries = await AiSummaries.countDocuments({ batchId });
            const summariesWithAudio = totalSummaries - summaries.length;
            
            if (summariesWithAudio > 0) {
                logger.info(`Batch ${batchId}: ${summariesWithAudio} summaries already have audio, processing ${summaries.length} remaining summaries`);
            }

            logger.info(`Found ${summaries.length} summaries without audio for batch ${batchId}. Sending individually with delays.`);

            // Send each summary individually with sequential delays
            for (let i = 0; i < summaries.length; i++) {
                const summary = summaries[i];
                
                // Send individual summary (fire-and-forget)
                this.sendIndividualSummaryForAudio(summary, batchId);
                
                // Wait 1 second before sending the next one (except for the last one)
                if (i < summaries.length - 1) {
                    await this.delay(1000);
                }
            }

            logger.info(`All ${summaries.length} audio generation requests sent for batch: ${batchId}`);

        } catch (error) {
            logger.error(`Error triggering audio generation for batch ${batchId}:`, error);
            throw error;
        }
    }

    /**
     * Send individual summary for audio generation (fire-and-forget)
     */
    private sendIndividualSummaryForAudio(summary: any, batchId: string): void {
        // Prepare individual summary data
        const summaryData = {
            summaryId: summary._id,
            userId: summary.userId,
            summary: summary.summary,
            summaryType: summary.summaryType,
            summaryTitle: summary.summaryTitle,
            batchId: batchId,
            timestamp: new Date()
        };

        // Fire-and-forget request
        axios.post('/generate-audio', {
            batchId,
            summaryId: summary._id, // Include summaryId at top level for easy access
            data: summaryData
        }).then(() => {
            logger.info(`Audio generation request sent for summary ${summary._id}, user ${summary.userId} in batch ${batchId}`);
        }).catch((error) => {
            logger.error(`Error sending audio generation request for summary ${summary._id} in batch ${batchId}:`, error.message);
            // Note: Individual failures don't stop the process - webhooks will handle batch completion logic
        });
    }

    /**
     * Utility function to create delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
export const audioGenerationService = new AudioGenerationService(); 