/**
 * Ambient Audio Routes for Agent Adventures
 *
 * REST API endpoints for ambient soundscape control and library queries
 */

import express from 'express';
import { updateAmbient } from '../controllers/audioController.js';

const router = express.Router();

// Ambient audio microservice URL
const AMBIENT_SERVICE_URL = process.env.AMBIENT_SERVICE_URL || 'http://localhost:8083';

// Main ambient update endpoint
// POST /api/audio/ambient
router.post('/', updateAmbient);

// Get all available ambient packs
// GET /api/audio/ambient/library/packs
router.get('/library/packs', async (req, res) => {
  try {
    const response = await fetch(`${AMBIENT_SERVICE_URL}/library/packs`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[AmbientRoutes] Error fetching packs:', error);
    res.status(503).json({
      success: false,
      error: 'Failed to fetch ambient packs from microservice'
    });
  }
});

// Get specific pack details
// GET /api/audio/ambient/library/packs/:pack_name
router.get('/library/packs/:pack_name', async (req, res) => {
  try {
    const { pack_name } = req.params;
    const response = await fetch(`${AMBIENT_SERVICE_URL}/library/packs/${pack_name}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[AmbientRoutes] Error fetching pack:', error);
    res.status(503).json({
      success: false,
      error: 'Failed to fetch ambient pack from microservice'
    });
  }
});

// Get pack categories
// GET /api/audio/ambient/library/packs/:pack_name/categories
router.get('/library/packs/:pack_name/categories', async (req, res) => {
  try {
    const { pack_name } = req.params;
    const response = await fetch(`${AMBIENT_SERVICE_URL}/library/packs/${pack_name}/categories`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[AmbientRoutes] Error fetching categories:', error);
    res.status(503).json({
      success: false,
      error: 'Failed to fetch pack categories from microservice'
    });
  }
});

// Get all available clips
// GET /api/audio/ambient/library/clips
router.get('/library/clips', async (req, res) => {
  try {
    const response = await fetch(`${AMBIENT_SERVICE_URL}/library/clips`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[AmbientRoutes] Error fetching clips:', error);
    res.status(503).json({
      success: false,
      error: 'Failed to fetch ambient clips from microservice'
    });
  }
});

export default router;
