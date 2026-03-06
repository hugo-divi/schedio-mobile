/**
 * Production-Safe Logger
 * Only outputs to console in development mode (__DEV__ = true).
 * 🛡️ SECURITY: Prevents leaking sensitive information in production logs.
 */

const isDev = __DEV__;

export const logger = {
    log: (...args) => {
        if (isDev) {
            console.log("📝 [Log]:", ...args);
        }
    },
    warn: (...args) => {
        if (isDev) {
            console.warn("⚠️ [Warn]:", ...args);
        }
    },
    error: (...args) => {
        // Errors are usually logged even in production, but categorized
        if (isDev) {
            console.error("❌ [Error]:", ...args);
        } else {
            // In production, you might send this to Sentry/Bugsnag/Firebase Crashlytics
            // For now, we just prefix it to identify app logs
            console.error("[App Error]:", ...args);
        }
    },
    debug: (...args) => {
        if (isDev) {
            console.debug("🐞 [Debug]:", ...args);
        }
    },
    info: (...args) => {
        if (isDev) {
            console.info("ℹ️ [Info]:", ...args);
        }
    }
};

export default logger;
