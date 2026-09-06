module.exports = function (api) {
  api.cache(true);
  return {
    // Expo's own web runtime (expo/src/winter/ImportMetaRegistry) uses
    // `import.meta` — Metro can't leave that as real ESM syntax, so
    // babel-preset-expo ships a plugin that rewrites it to
    // `globalThis.__ExpoImportMetaRegistry`, but only when this flag is on.
    // Without it, the plugin silently no-ops on web (it only throws on
    // native, where the same syntax would crash Hermes) and the raw
    // `import.meta` reaches the browser as a syntax error — this never
    // surfaced before because native builds never bundle `.web.ts` files.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    env: {
      production: {
        plugins: [['transform-remove-console', { exclude: ['error'] }]],
      },
    },
  };
};
