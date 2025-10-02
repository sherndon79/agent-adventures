/**
 * Audio Routes for Agent Adventures
 *
 * REST API endpoints for audio generation control
 */

import express from 'express';
import {
  triggerNarration,
  updateAmbient,
  updateMusic,
  sendCommentary,
  getStatus,
  controlAudio
} from '../controllers/audioController.js';

const router = express.Router();

// Narration endpoint
router.post('/narration', triggerNarration);

// Ambient audio endpoint
router.post('/ambient', updateAmbient);

// Music endpoint
router.post('/music', updateMusic);

// Commentary endpoint
router.post('/commentary', sendCommentary);

// Status endpoint
router.get('/status', getStatus);

// Control endpoint (pause/resume/clear_queue)
router.post('/control', controlAudio);

export default router;
