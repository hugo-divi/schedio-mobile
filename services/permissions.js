/**
 * Permissions Service
 * Centralized logic for validating user plans and feature access.
 * 🛡️ SECURITY NOTE: While validated here, critical features should also check 
 * entitlement status on the backend (e.g., via Cloud Functions).
 */

/**
 * Feature Flags and Plan Levels
 */
export const PLANS = {
    FREE: 'free',
    PRIME: 'prime', // "Prime" is the name used in the app
};

/**
 * Validates if the user has a specific plan level
 * @param {Object} userData - The user object from the store (including isPrime)
 * @returns {boolean}
 */
export const hasPrimeAccess = (userData) => {
    if (!userData) return false;
    // Support both direct isPrime flag and potentially more complex plan structures
    return userData.isPrime === true || userData.plan === PLANS.PRIME;
};

/**
 * Specific Feature Access Checks
 */
export const canAccessAIRecommendations = (userData) => {
    // Currently AI features might be Prime-only
    return hasPrimeAccess(userData);
};

export const canUploadLargeFiles = (userData) => {
    // Example: Prime users can upload more/larger files
    return hasPrimeAccess(userData);
};

export const getStorageLimit = (userData) => {
    return hasPrimeAccess(userData) ? 1024 * 1024 * 50 : 1024 * 1024 * 5; // 50MB vs 5MB
};
