import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

const API_KEYS = {
    apple: process.env.EXPO_PUBLIC__REVENUECAT_APPLE_KEY || "goog_placeholder", // User should provide real keys
    google: process.env.EXPO_PUBLIC__REVENUECAT_GOOGLE_KEY || "goog_placeholder"
};

export const configureRevenueCat = async () => {
    try {
        if (Platform.OS === 'ios') {
            await Purchases.configure({ apiKey: API_KEYS.apple });
        } else if (Platform.OS === 'android') {
            await Purchases.configure({ apiKey: API_KEYS.google });
        }
        console.log("[RevenueCat] SDK Configured Successfully");
    } catch (e) {
        console.error("[RevenueCat] Configuration Error:", e);
    }
};

export const checkEntitlements = async () => {
    try {
        const customerInfo = await Purchases.getCustomerInfo();
        // Assume the entitlement identifier is "premium" or "Prime"
        return customerInfo.entitlements.active['Premium'] !== undefined ||
            customerInfo.entitlements.active['Prime'] !== undefined;
    } catch (e) {
        console.error("[RevenueCat] Error checking entitlements:", e);
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
        console.error("[RevenueCat] Error getting offerings:", e);
        return null;
    }
};

export const purchasePackage = async (rcPackage) => {
    try {
        const { customerInfo } = await Purchases.purchasePackage(rcPackage);
        return customerInfo.entitlements.active['Premium'] !== undefined ||
            customerInfo.entitlements.active['Prime'] !== undefined;
    } catch (e) {
        if (!e.userCancelled) {
            console.error("[RevenueCat] Purchase Error:", e);
        }
        return false;
    }
};
