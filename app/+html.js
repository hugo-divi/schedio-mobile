import { ScrollViewStyleReset } from 'expo-router/html';

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
