// Path aliases (`@/*`) are resolved by Metro from tsconfig.json — Expo enables
// `tsconfigPaths` by default, so no module-resolver plugin is needed here.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
