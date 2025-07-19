import { Router } from 'express';
import { summarizerController } from '../controller/summarizerController.js';

const router = Router();

// Summary generation routes
router.post('/summaries/generate', summarizerController.generateSummaries);
router.get('/summaries/status', summarizerController.getSchedulerStatus);
router.post('/summaries/trigger', summarizerController.triggerManualSummary);

// User-specific summary routes
router.get('/summaries/user/:userId', summarizerController.getUserSummary);
router.post('/summaries/user/:userId/generate', summarizerController.generateUserSummary);

// Health and status routes
router.get('/status', summarizerController.getServiceStatus);

export default router;
