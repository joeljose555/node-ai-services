import { Router } from 'express';
import { webhookController } from '../controller/webhookController';
const router = Router();


router.post('/summary', webhookController.handleSummaryWebhook);
router.post('/save-audio-url', webhookController.handleSaveAudioUrl);
router.post('/audio-generation-failure', webhookController.handleAudioGenerationFailure);

export default router;