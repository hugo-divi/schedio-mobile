// Web fallback for RevenueCat (react-native-purchases doesn't support web)
export const configureRevenueCat = async () => {
    console.log("[RevenueCat] Web environment detected, skipping configuration.");
};

export const checkEntitlements = async () => {
    console.log("[RevenueCat] Web environment detected, assuming no entitlements.");
    return false;
};

export const getOfferings = async () => {
    console.log("[RevenueCat] Web environment detected, returning null offerings.");
    return null;
};

export const purchasePackage = async (rcPackage) => {
    console.log("[RevenueCat] Web environment detected, purchases not supported.");
    return false;
};
