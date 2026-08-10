import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const API_KEYS = {
  apple: process.env.EXPO_PUBLIC__REVENUECAT_APPLE_KEY || 'appl_placeholder',
  google: process.env.EXPO_PUBLIC__REVENUECAT_GOOGLE_KEY || 'goog_placeholder',
};

// Whatever the entitlement ends up being called in the RevenueCat dashboard,
// checking here rather than trusting a single hardcoded string means a naming
// mismatch (the exact bug that silently breaks "isPrime") can't happen.
const ENTITLEMENT_IDS = ['Schedio Prime', 'Prime', 'Premium'];

const hasActiveEntitlement = (customerInfo) =>
  ENTITLEMENT_IDS.some((id) => customerInfo.entitlements.active[id] !== undefined);

export const configureRevenueCat = async () => {
  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.ERROR);

    if (Platform.OS === 'ios') {
      await Purchases.configure({ apiKey: API_KEYS.apple });
    } else if (Platform.OS === 'android') {
      await Purchases.configure({ apiKey: API_KEYS.google });
    }
    console.log('[RevenueCat] SDK Configured Successfully');
  } catch (e) {
    console.error('[RevenueCat] Configuration Error:', e);
  }
};

/**
 * Ties RevenueCat's identity to the Firebase account instead of the SDK's own
 * anonymous device ID — otherwise a reinstall or a second device starts a
 * fresh anonymous identity with no memory of the purchase.
 */
export const identifyUser = async (uid) => {
  try {
    await Purchases.logIn(uid);
  } catch (e) {
    console.error('[RevenueCat] Error identifying user:', e);
  }
};

/** Drops back to an anonymous identity on sign-out, so the next login (possibly
 * a different account on a shared device) doesn't inherit this one's entitlement. */
export const resetUser = async () => {
  try {
    await Purchases.logOut();
  } catch (e) {
    // Expected (and harmless) whenever the SDK is already anonymous —
    // e.g. every cold start where nobody has ever logged in yet.
    console.log('[RevenueCat] logOut skipped:', e.message);
  }
};

export const checkEntitlements = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return hasActiveEntitlement(customerInfo);
  } catch (e) {
    console.error('[RevenueCat] Error checking entitlements:', e);
    return false;
  }
};

export const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    if (offerings.current !== null) {
      return offerings.current;
    }
    return null;
  } catch (e) {
    console.error('[RevenueCat] Error getting offerings:', e);
    return null;
  }
};

/** Reinstall / new device: pulls whatever entitlement Google Play already
 * has on file for this account, no new payment involved. */
export const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return hasActiveEntitlement(customerInfo);
  } catch (e) {
    console.error('[RevenueCat] Error restoring purchases:', e);
    return false;
  }
};

/**
 * Returns `true` on a successful purchase, `null` when the student closed the
 * native purchase sheet themselves (nothing to tell them), and `false` on a
 * real failure (declined card, network error, billing unavailable) — the
 * caller needs to tell those two apart, since only the last one should show
 * an error.
 */
export const purchasePackage = async (rcPackage) => {
  try {
    const { customerInfo } = await Purchases.purchasePackage(rcPackage);
    return hasActiveEntitlement(customerInfo);
  } catch (e) {
    if (e.userCancelled) {
      return null;
    }
    console.error('[RevenueCat] Purchase Error:', e);
    return false;
  }
};
