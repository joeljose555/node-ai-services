import { Request, Response } from 'express';
import { webhookServices } from '../services/webhookServices';
import { logger } from '../utils/logger';

export class WebhookController {
    async handleSummaryWebhook(req: Request, res: Response) {
        console.log("--------------------------------handleSummaryWebhook--------------------------------");
        try {
            const { summary, userId, summaryType, summaryTitle, batchId } = req.body;
            const newSummary = await webhookServices.saveSummary(summary, userId, summaryType, summaryTitle, batchId);
            res.status(200).json({ message: 'Summary webhook received', newSummary });
        } catch (error) {
            logger.error(`Error in handleSummaryWebhook: ${error}`);
            res.status(500).json({ message: 'Error in handleSummaryWebhook', error });
        }
    }

    async handleSaveAudioUrl(req: Request, res: Response) {
        try {
            const { audioUrl, userId, batchId, summaryId } = req.body;
            
            if (!audioUrl || !userId) {
                return res.status(400).json({ 
                    message: 'Missing required fields: audioUrl and userId are required' 
                });
            }

            // If summaryId is provided, handle individual summary audio generation
            if (summaryId) {
                const result = await webhookServices.handleSummaryAudioGenerationSuccess(audioUrl, userId, summaryId, batchId);
                res.status(200).json({ message: 'Summary audio generation completed successfully', result });
            } 
            // Fallback to batch-level handling for backward compatibility
            else if (batchId) {
                const audioMix = await webhookServices.handleAudioGenerationSuccess(audioUrl, userId, batchId);
                res.status(200).json({ message: 'Audio generation completed successfully', audioMix });
            } 
            else {
                return res.status(400).json({ 
                    message: 'Either summaryId or batchId must be provided' 
                });
            }
        } catch (error) {
            logger.error(`Error in handleSaveAudioUrl: ${error}`);
            res.status(500).json({ message: 'Error in handleSaveAudioUrl', error });
        }
    }

    /**
     * Handle audio generation failure webhook
     * Called by external service when audio generation fails permanently
     */
    async handleAudioGenerationFailure(req: Request, res: Response) {
        try {
            const { batchId, errorMessage, userId } = req.body;
            
            if (!batchId || !errorMessage || !userId) {
                return res.status(400).json({ 
                    message: 'Missing required fields: batchId, errorMessage, and userId are required' 
                });
            }

            await webhookServices.handleAudioGenerationFailure(batchId, errorMessage, userId);
            res.status(200).json({ 
                message: 'Audio generation failure processed successfully',
                batchId 
            });
        } catch (error) {
            logger.error(`Error in handleAudioGenerationFailure: ${error}`);
            res.status(500).json({ message: 'Error in handleAudioGenerationFailure', error });
        }
    }
}

export const webhookController = new WebhookController();