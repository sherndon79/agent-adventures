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
  controlAudio,
  listVoices
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

// Voices endpoint
router.get('/voices', listVoices);

// Control endpoint (pause/resume/clear_queue)
router.post('/control', controlAudio);

export default router;
