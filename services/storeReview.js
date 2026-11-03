import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activeDaysIn, reviewDecision } from './reviewPolicy';

/**
 * The side-effecting half of the review prompt: reads and writes this
 * device's history of asks, and calls the native sheet. The rules themselves
 * live in services/reviewPolicy.js.
 *
 * Guarded require, same as app/settings.js always did: a dev client built
 * before expo-store-review shipped throws at import time, and nothing about
 * rating the app is worth taking a screen down for.
 */
let StoreReview = null;
try {
  StoreReview = require('expo-store-review');
} catch {
  StoreReview = null;
}

const HISTORY_KEY = 'schedio:reviewPrompts';
const PACKAGE = 'com.schedio.mobile';
const PLAY_URL = `https://play.google.com/store/apps/details?id=${PACKAGE}`;

/** One ask per app run, whatever the history says. */
let askedThisRun = false;

const readHistory = async () => {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Asks for a rating if, and only if, the policy says so.
 *
 * The attempt is recorded before the sheet is requested, not after: Google
 * never says whether the sheet actually appeared or whether the student
 * rated, so an attempt is the only thing there is to count — and counting it
 * first means a crash halfway can't turn into asking again tomorrow.
 *
 * Never throws. A rating is the last thing allowed to break anything.
 */
export async function maybeAskForReview({ moment, totalSessions, sessions, accountCreatedAt }) {
  try {
    if (!StoreReview || Platform.OS === 'web') return false;

    const history = await readHistory();
    const decision = reviewDecision({
      platform: Platform.OS,
      moment,
      totalSessions,
      activeDays: activeDaysIn(sessions),
      accountCreatedAt,
      history,
      askedThisRun,
    });
    if (!decision.ask) return false;
    if (!(await StoreReview.isAvailableAsync())) return false;

    askedThisRun = true;
    await AsyncStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ count: (Number(history.count) || 0) + 1, lastAskedAt: Date.now(), moment })
    );
    await StoreReview.requestReview();
    return true;
  } catch (error) {
    console.warn('[Review] Could not ask for a review:', error?.message);
    return false;
  }
}

/**
 * The store listing, for the "Valorar Schedio" row in Ajustes.
 *
 * That row used to call the in-app review API. Google advises against putting
 * it behind a button: past its quota the API shows nothing, and the student is
 * left with a button that does nothing. The listing always opens. `market://`
 * goes straight into the Play Store app; the web URL is for devices without
 * it.
 */
export async function openStoreListing() {
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(`market://details?id=${PACKAGE}`);
      return;
    } catch {
      // No Play Store app on this device: the web listing still works.
    }
    try {
      await Linking.openURL(PLAY_URL);
    } catch (error) {
      console.error('Error opening the store listing:', error);
    }
    return;
  }

  // iOS ships as a PWA today, and Ajustes hides the row on web. If it goes
  // native, `storeUrl()` reads `ios.appStoreUrl` from app.json — never send an
  // iPhone to the Play Store.
  const url = StoreReview?.storeUrl?.();
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.error('Error opening the store listing:', error);
  }
}
