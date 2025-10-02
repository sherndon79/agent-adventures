import express from 'express';
import { startStream, stopStream, getStreamStatus } from '../controllers/streamController.js';

const router = express.Router();

// Define API routes for stream control
router.post('/stream/start', startStream);
router.post('/stream/stop', stopStream);
router.get('/stream/status', getStreamStatus);

export default router;

