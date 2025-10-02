/**
 * Environment configuration loader for Agent Adventures
 * Handles environment variables, validation, and defaults
 */

// Load environment variables from .env file
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

/**
 * Validate required environment variables
 */
function validateEnvironment() {
  const errors = [];

  // In production, require actual API keys
  if (process.env.NODE_ENV === 'production') {
    const requiredKeys = [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'ISAAC_SIM_HOST',
      'WORLDBUILDER_MCP_URL',
      'WORLDVIEWER_MCP_URL'
    ];

    for (const key of requiredKeys) {
      if (!process.env[key] || process.env[key].includes('placeholder')) {
        errors.push(`Missing or placeholder value for ${key}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Environment validation errors:');
    errors.forEach(error => console.error(`  - ${error}`));

    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('Continuing in development mode with placeholder values...');
    }
  }
}

/**
 * Parse boolean environment variable
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Parse integer environment variable
 */
function parseInteger(value, defaultValue = 0) {
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Validate environment
validateEnvironment();

/**
 * Application configuration object
 */
export const config = {
  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // LLM API Configuration - Tiered by task complexity and cost
  llm: {
    // Fast, cost-effective models for agent proposals
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514', // Current Sonnet 4 - balanced performance/cost
      maxTokens: 1000
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-5-mini', // Cost-effective GPT-5 tier
      maxTokens: 1000
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1',
      model: 'gemini-2.5-pro', // Current Gemini model
      maxTokens: 1000
    },

    // Mid-tier models for judge panel decisions - balance cost and quality
    judge: {
      anthropic: {
        model: 'claude-sonnet-4-20250514', // Same as agents - good reasoning at reasonable cost
        maxTokens: 1500
      },
      openai: {
        model: 'gpt-5-mini', // Use mini for cost efficiency
        maxTokens: 1500
      },
      google: {
        model: 'gemini-2.5-pro', // Gemini's current model
        maxTokens: 1500
      }
    }
  },

  // Platform Integration
  platforms: {
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      accessToken: process.env.TWITCH_ACCESS_TOKEN,
      streamKey: process.env.TWITCH_STREAM_KEY,
      rtmpUrl: process.env.RTMP_TWITCH_URL || 'rtmp://live.twitch.tv/live/'
    },
    youtube: {
      apiKey: process.env.YOUTUBE_API_KEY,
      streamKey: process.env.YOUTUBE_STREAM_KEY,
      rtmpUrl: process.env.RTMP_YOUTUBE_URL || 'rtmp://a.rtmp.youtube.com/live2/'
    }
  },

  // Isaac Sim MCP Configuration
  mcp: {
    host: process.env.ISAAC_SIM_HOST || 'localhost',
    port: parseInteger(process.env.ISAAC_SIM_PORT, 8765),
    mockMode: parseBoolean(process.env.MOCK_MCP_MODE, true),
    services: {
      worldBuilder: process.env.WORLDBUILDER_MCP_URL || 'http://localhost:8700/mcp',
      worldViewer: process.env.WORLDVIEWER_MCP_URL || 'http://localhost:8701/mcp',
      worldSurveyor: process.env.WORLDSURVEYOR_MCP_URL || 'http://localhost:8703/mcp',
      worldStreamer: process.env.WORLDSTREAMER_MCP_URL || 'http://localhost:8702/mcp',
      worldRecorder: process.env.WORLDRECORDER_MCP_URL || 'http://localhost:8704/mcp'
    },
    timeout: parseInteger(process.env.MCP_TIMEOUT_MS, 10000),
    retries: parseInteger(process.env.MCP_RETRIES, 3)
  },

  // Streaming Configuration
  streaming: {
    mediaBridge: {
      enabled: parseBoolean(process.env.MEDIA_BRIDGE_ENABLED ?? 'true', true),
      directory: process.env.MEDIA_BRIDGE_DIR,
      composeFile: process.env.MEDIA_BRIDGE_COMPOSE_FILE,
      audioSource: process.env.MEDIA_BRIDGE_AUDIO_SOURCE || process.env.AUDIO_SOURCE,
      audioToken: process.env.MEDIA_BRIDGE_AUDIO_TOKEN || process.env.AUDIO_TOKEN,
      srtUrl: process.env.MEDIA_BRIDGE_SRT_URL || process.env.SRT_URL,
      videoBitrateK: process.env.MEDIA_BRIDGE_VIDEO_BITRATE_K || process.env.VIDEO_BITRATE_K,
      audioBitrateK: process.env.MEDIA_BRIDGE_AUDIO_BITRATE_K || process.env.AUDIO_BITRATE_K,
      fps: process.env.MEDIA_BRIDGE_FPS || process.env.FPS,
      webrtc: {
        host: process.env.WEBRTC_PREVIEW_HOST || 'localhost',
        port: parseInteger(process.env.WEBRTC_PORT, 8081),
        path: process.env.WEBRTC_PREVIEW_PATH || '/'
      }
    },
    ome: {
      host: process.env.OME_HOST || 'localhost',
      port: parseInteger(process.env.OME_PORT, 1935),
      appName: process.env.OME_APP_NAME || 'agent_adventures',
      api: {
        host: process.env.OME_API_HOST || 'localhost',
        port: parseInteger(process.env.OME_API_PORT, 8088),
        token: process.env.OME_API_TOKEN,
        useHttps: parseBoolean(process.env.OME_API_USE_HTTPS, false)
      }
    },
    mockMode: parseBoolean(process.env.MOCK_STREAMING_MODE, true)
  },

  // Application Performance
  app: {
    maxConcurrentAgents: parseInteger(process.env.MAX_CONCURRENT_AGENTS, 10),
    proposalTimeoutMs: parseInteger(process.env.PROPOSAL_TIMEOUT_MS, 10000),
    judgePanelTimeoutMs: parseInteger(process.env.JUDGE_PANEL_TIMEOUT_MS, 15000),
    gracefulShutdownMs: parseInteger(process.env.GRACEFUL_SHUTDOWN_MS, 10000)
  },

  // Token Optimization
  tokens: {
    maxPerProposal: parseInteger(process.env.MAX_TOKENS_PER_PROPOSAL, 100),
    maxPerDecision: parseInteger(process.env.MAX_TOKENS_PER_DECISION, 50),
    enableTracking: parseBoolean(process.env.ENABLE_TOKEN_TRACKING, true),
    mockLLMMode: parseBoolean(process.env.MOCK_LLM_MODE, true)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableDebug: parseBoolean(process.env.ENABLE_DEBUG_LOGGING, true),
    enableMetrics: parseBoolean(process.env.ENABLE_METRICS_LOGGING, true)
  },

  // Database
  database: {
    url: process.env.DATABASE_URL || 'sqlite:./data/agent_adventures.db',
    redis: process.env.REDIS_URL
  },

  // Security
  security: {
    rateLimitWindowMs: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMaxRequests: parseInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 1000),
    corsOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  },

  // Development/Testing
  development: {
    runIntegrationTests: parseBoolean(process.env.RUN_INTEGRATION_TESTS, false),
    testTimeoutMs: parseInteger(process.env.TEST_TIMEOUT_MS, 30000),
    enableHotReload: parseBoolean(process.env.ENABLE_HOT_RELOAD, true)
  }
};

/**
 * Get configuration for specific service
 */
export function getServiceConfig(serviceName) {
  return config[serviceName] || {};
}

/**
 * Check if running in mock mode for specific service
 */
export function isMockMode(serviceName = null) {
  if (serviceName === 'mcp') return config.mcp.mockMode;
  if (serviceName === 'llm') return config.tokens.mockLLMMode;
  if (serviceName === 'streaming') return config.streaming.mockMode;

  // Return true if any critical service is in mock mode
  return config.mcp.mockMode || config.tokens.mockLLMMode;
}

/**
 * Get environment summary for logging
 */
export function getEnvironmentSummary() {
  return {
    environment: config.nodeEnv,
    mockModes: {
      mcp: config.mcp.mockMode,
      llm: config.tokens.mockLLMMode,
      streaming: config.streaming.mockMode
    },
    performance: {
      maxAgents: config.app.maxConcurrentAgents,
      timeouts: {
        proposal: config.app.proposalTimeoutMs,
        judgePanel: config.app.judgePanelTimeoutMs
      }
    },
    tokens: {
      tracking: config.tokens.enableTracking,
      limits: {
        proposal: config.tokens.maxPerProposal,
        decision: config.tokens.maxPerDecision
      }
    }
  };
}

export default config;
