import { ScrollViewStyleReset } from 'expo-router/html';
import { tokens } from '../theme/tokens';

// Root HTML document for the web export. Expo Router only renders this once
// per static build (not per-navigation), so it's the one place to put tags
// that have to exist before React ever mounts — the PWA manifest and the
// iOS-specific meta tags that let Safari treat this as an installable app
// instead of just another tab.
export default function Root({ children }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        {/* Disables the default iOS/Android tap highlight and native
            scrollbar so the RN-for-web app looks like an app, not a page. */}
        <ScrollViewStyleReset />

        {/* Expo's reset locks `body` (`height: 100%; overflow: hidden`) but
            leaves `html` alone, and an overflow-hidden box is still
            *programmatically* scrollable — which is exactly what iOS Safari does
            when it wants to reveal a focused field, dragging the whole app off
            the top of the screen with it. `overflow: hidden` on `html` gives it
            nothing to scroll; `overscroll-behavior` kills the rubber-band that
            otherwise makes an installed PWA feel like a web page. The matching
            JS half of this lives in services/pwa.js (pinAppToVisualViewport).

            The background colour is not decoration. Nothing else in the app
            paints the page itself: the dark background is on the
            GestureHandlerRootView *inside* #root, so any pixel outside the
            app's own box falls through to the browser's default white. On an
            iPhone with the keyboard open that was measured at 1305px of pure
            white — 52% of the screen — under a 409pt-tall app. Painting html
            and body the same colour means the worst a geometry glitch can now
            look like is a dark gap nobody notices.

            `color-scheme: dark` is what tells Safari this page is dark, which
            it uses for the on-screen keyboard, the form accessory bar and
            scrollbars. Without it a dark-only app gets a light keyboard. */}
        <style
          id="schedio-viewport-lock"
          dangerouslySetInnerHTML={{
            __html: [
              'html{overflow:hidden;color-scheme:dark}',
              `html,body{overscroll-behavior:none;background-color:${tokens.colors.background}}`,
            ].join(''),
          }}
        />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#191919" />
        <link rel="icon" href="/favicon.png" />

        {/* iOS ignores most of the Web App Manifest spec — Safari's home
            screen install still keys off these Apple-specific tags instead. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Schedio" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
