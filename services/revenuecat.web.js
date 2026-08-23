// Web fallback for RevenueCat (react-native-purchases doesn't support web)
export const configureRevenueCat = async () => {
  console.log('[RevenueCat] Web environment detected, skipping configuration.');
};

export const checkEntitlements = async () => {
  console.log('[RevenueCat] Web environment detected, assuming no entitlements.');
  return false;
};

// The three below were missing while the code importing them wasn't: Metro
// prefers this file over revenuecat.js on web, so `identifyUser` resolved to
// `undefined` and store/authStore.js called it on every auth change. That
// throws inside the auth listener — the login would hang rather than fail
// with anything readable. Only Android ships today, but the planned iOS route
// is a PWA, which is this build.
export const identifyUser = async () => {
  console.log('[RevenueCat] Web environment detected, skipping identify.');
};

export const resetUser = async () => {
  console.log('[RevenueCat] Web environment detected, skipping reset.');
};

export const restorePurchases = async () => {
  console.log('[RevenueCat] Web environment detected, nothing to restore.');
  return false;
};

export const getPrimeStatus = async () => {
  console.log('[RevenueCat] Web environment detected, no Prime status available.');
  return { active: false, since: null, willRenew: null, managementURL: null };
};

export const getOfferings = async () => {
  console.log('[RevenueCat] Web environment detected, returning null offerings.');
  return null;
};

export const purchasePackage = async (rcPackage) => {
  console.log('[RevenueCat] Web environment detected, purchases not supported.');
  return false;
};
