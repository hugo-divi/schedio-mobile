import { Platform } from 'react-native';

/**
 * Whether this web session is running as an installed PWA (added to the
 * home screen) rather than a normal browser tab. `display-mode: standalone`
 * is the standard signal; `navigator.standalone` is Safari's older,
 * iOS-specific flag, kept as a fallback for engines that don't report the
 * media feature.
 */
export const isStandalonePWA = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator?.standalone === true
  );
};

/**
 * Whether this web session can actually be asked for notification
 * permission right now. Desktop and Android browsers support the
 * Notification API from a normal tab; iOS Safari only allows requesting
 * permission from a PWA already added to the home screen — asking from a
 * regular tab either silently fails or the API isn't even exposed,
 * depending on iOS version. There's no reliable feature-detection for that
 * iOS-specific restriction, so this checks the user agent for it.
 */
export const canRequestWebPush = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator?.userAgent ?? '');
  return isIOS ? isStandalonePWA() : true;
};

/**
 * Text-entry elements are the only ones iOS scrolls the page for, and the only
 * ones worth re-revealing after the viewport changes size.
 */
const isTextEntry = (element) => {
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || element.isContentEditable === true;
};

/**
 * Brings the focused field back into view *after* the keyboard has finished
 * resizing the viewport. Safari's own scroll-into-view runs on focus, i.e.
 * before it knows how tall the keyboard will be, so a field near the bottom of
 * a form ends up under it anyway. `block: 'center'` also reveals whatever sits
 * right below the field — usually the submit button.
 *
 * A field that is already fully visible is left alone: this runs several times
 * while the keyboard animates, and there is no reason to keep re-scrolling to
 * the same place.
 *
 * `behavior: 'auto'`, not `'smooth'`, and that is not a style preference.
 * React Native Web puts `-webkit-overflow-scrolling: touch` on every
 * ScrollView, and inside such a container a smooth `scrollIntoView` is a silent
 * no-op — verified in the browser: `'smooth'` left scrollTop at 0, `'auto'`
 * moved it to where the field belongs. An instant jump is also the right look
 * here, since the keyboard is sliding up over the top of it anyway.
 */
const revealFocusedField = (viewport) => {
  const focused = document.activeElement;
  if (!isTextEntry(focused) || typeof focused.getBoundingClientRect !== 'function') return;

  // `body` is translated down by `offsetTop` (see pinAppToVisualViewport), and
  // getBoundingClientRect reports that translation, so the visible band in the
  // same coordinates runs from offsetTop to offsetTop + height.
  const rect = focused.getBoundingClientRect();
  const top = viewport.offsetTop;
  const bottom = top + viewport.height;
  if (rect.top >= top && rect.bottom <= bottom) return;

  focused.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
};

// Latest known height of the visible area, and whoever wants to be told when it
// changes. Only the web path ever writes this; `null` means "no visual viewport
// in play", which is what tells useVisibleViewportHeight to fall back to
// Dimensions.
let visibleHeight = null;
const visibleHeightListeners = new Set();

/** The height actually visible right now, or `null` off the web path. */
export const getVisibleViewportHeight = () => visibleHeight;

/**
 * Subscribe to changes of the visible height. Returns an unsubscribe function,
 * and is a no-op (returning one anyway) on native.
 */
export const subscribeVisibleViewportHeight = (listener) => {
  if (Platform.OS !== 'web') return () => {};
  visibleHeightListeners.add(listener);
  return () => visibleHeightListeners.delete(listener);
};

/**
 * Pins the whole app to iOS Safari's *visual* viewport — the part of the page
 * the keyboard isn't covering — instead of to the layout viewport the CSS
 * `height: 100%` of Expo's web template refers to.
 *
 * This replaces an earlier version that only set `#root`'s height, which fixed
 * half the problem and left the worse half behind. Two things happen when a
 * field is focused on iOS, and the height is only the first of them:
 *
 *   1. `visualViewport.height` shrinks by the keyboard's height. The layout
 *      viewport does not, so `height: 100%` keeps laying the app out at full
 *      pre-keyboard height and the bottom of it (footers, sheet buttons, the
 *      field itself) sits under the keyboard.
 *   2. Safari then *moves* what's visible to reveal the focused field: it pans
 *      the visual viewport down (`visualViewport.offsetTop` becomes non-zero)
 *      and scrolls the document — which it will do even though `body` is
 *      `overflow: hidden`, because overflow-hidden boxes are still
 *      programmatically scrollable.
 *
 * Correcting (1) without (2) is what made the app look like it jumped off the
 * top of the screen the moment you tapped any field: the app was still drawn in
 * the first `visualViewport.height` pixels of the layout viewport, while the
 * band the user could actually see had moved down past it. Nothing ever undid
 * that, so the field being typed into — and the entire app with it — was
 * off-screen.
 *
 * So: size and offset `body`, and force the document scroll back to zero.
 *
 * `body` rather than `#root` on purpose. React Native Web's `<Modal>` (every
 * `BottomSheet` in the app) renders through a portal appended to `body`, styled
 * `position: fixed; inset: 0` — outside `#root`, so resizing `#root` never
 * reached it. A transform on `body` makes `body` the containing block for its
 * fixed-position descendants, so that `inset: 0` resolves to the visible band
 * too and every sheet lands above the keyboard for free. The transform is set
 * unconditionally, even at `translateY(0px)`, so the containing block doesn't
 * change out from under an open sheet the instant the keyboard appears.
 *
 * Native ignores all of this: `window.visualViewport` doesn't exist there, and
 * KeyboardAvoidingView / KeyboardAwareScrollView already handle the keyboard.
 */
export const pinAppToVisualViewport = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  const viewport = window.visualViewport;
  const body = document.body;
  if (!viewport || !body) return () => {};

  // Left over from the previous approach; harmless, but it would fight the
  // height now being set one level up.
  const root = document.getElementById('root');
  if (root) root.style.height = '';

  let frame = 0;
  const timers = new Set();

  const resetDocumentScroll = () => {
    if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    if (body.scrollTop !== 0) body.scrollTop = 0;
  };

  const apply = (reveal) => {
    const height = Math.round(viewport.height);
    const offsetTop = Math.round(viewport.offsetTop);

    body.style.height = `${height}px`;
    body.style.transform = `translateY(${offsetTop}px)`;

    // Undo Safari's scroll-to-reveal. The translate above also counts as
    // scrollable overflow on <html>, so this is what keeps the app from being
    // draggable off the top of the screen as well.
    resetDocumentScroll();

    if (height !== visibleHeight) {
      visibleHeight = height;
      visibleHeightListeners.forEach((listener) => listener(height));
    }

    if (reveal) revealFocusedField(viewport);
  };

  const schedule = (reveal) => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      apply(reveal);
    });
  };

  // The keyboard animates in over ~250ms and iOS reports the resize part-way
  // through, sometimes more than once. Re-running the correction on a couple of
  // trailing timers is what stops the app settling half-scrolled — cheaper and
  // steadier than watching for the animation to end, which Safari never says.
  const scheduleSettling = (reveal) => {
    schedule(false);
    [120, 320, 520].forEach((delay) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        apply(reveal);
      }, delay);
      timers.add(timer);
    });
  };

  const onViewportResize = () => scheduleSettling(true);
  const onViewportScroll = () => schedule(false);
  // Belt and braces for the case where the keyboard is already open and focus
  // moves between fields: no resize fires, so nothing above would run.
  const onFocusIn = () => scheduleSettling(true);
  // ...and for the keyboard going away, which can leave the viewport panned.
  const onFocusOut = () => scheduleSettling(false);
  // The one that doesn't try to predict Safari. Everything above corrects the
  // document scroll at moments we expect Safari to have moved it — this catches
  // it *whenever* it moves, which is the difference between "usually fine" and
  // "cannot end up scrolled". Element scrolls (every ScrollView in the app)
  // don't bubble, so this only ever sees the document's own, which should
  // always be zero: nothing here is supposed to scroll the page itself.
  const onDocumentScroll = () => resetDocumentScroll();

  apply(false);

  viewport.addEventListener('resize', onViewportResize);
  viewport.addEventListener('scroll', onViewportScroll);
  window.addEventListener('orientationchange', onViewportResize);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('scroll', onDocumentScroll);

  return () => {
    viewport.removeEventListener('resize', onViewportResize);
    viewport.removeEventListener('scroll', onViewportScroll);
    window.removeEventListener('orientationchange', onViewportResize);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('scroll', onDocumentScroll);
    if (frame) cancelAnimationFrame(frame);
    timers.forEach(clearTimeout);
    timers.clear();
    body.style.height = '';
    body.style.transform = '';
    visibleHeight = null;
  };
};
