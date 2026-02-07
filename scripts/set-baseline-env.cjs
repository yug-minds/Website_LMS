// Load this with node -r so env is set before any other module (e.g. baseline-browser-mapping) loads.
// Fixes: [baseline-browser-mapping] The data in this module is over two months old.
process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA = 'true';
process.env.BROWSERSLIST_IGNORE_OLD_DATA = 'true';
