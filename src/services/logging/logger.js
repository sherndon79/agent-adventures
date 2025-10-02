/**
 * Simple logger for Agent Adventures
 * Consistent logging interface across all services
 */

class Logger {
    static info(message, meta = {}) {
        console.log(`ℹ️  [INFO] ${message}`, meta);
    }

    static warn(message, meta = {}) {
        console.warn(`⚠️  [WARN] ${message}`, meta);
    }

    static error(message, meta = {}) {
        console.error(`❌ [ERROR] ${message}`, meta);
    }

    static debug(message, meta = {}) {
        if (process.env.LOG_LEVEL === 'debug' || process.env.ENABLE_DEBUG_LOGGING === 'true') {
            console.debug(`🐛 [DEBUG] ${message}`, meta);
        }
    }
}

export default Logger;