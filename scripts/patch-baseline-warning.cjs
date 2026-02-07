#!/usr/bin/env node
/**
 * Patches the baseline-browser-mapping "data over two months old" warning
 * so it does not appear during build. The warning comes from:
 * 1. Next.js compiled browserslist (node_modules/next/dist/compiled/browserslist/index.js)
 * 2. baseline-browser-mapping (dist/index.js and dist/index.cjs)
 * Run after npm install (postinstall) to re-apply patches.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const replacements = [
  // Next.js compiled browserslist bundle
  {
    file: path.join(root, 'node_modules/next/dist/compiled/browserslist/index.js'),
    from: 'console.warn("[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`")',
    to: '(function(){})("[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`")',
  },
  // baseline-browser-mapping (ESM)
  {
    file: path.join(root, 'node_modules/baseline-browser-mapping/dist/index.js'),
    from: 'console.warn("[baseline-browser-mapping] The data in this module is over two months old',
    to: '(function(){})("[baseline-browser-mapping] The data in this module is over two months old',
  },
  // baseline-browser-mapping (CJS)
  {
    file: path.join(root, 'node_modules/baseline-browser-mapping/dist/index.cjs'),
    from: 'console.warn("[baseline-browser-mapping] The data in this module is over two months old',
    to: '(function(){})("[baseline-browser-mapping] The data in this module is over two months old',
  },
];

let patched = 0;
for (const { file, from, to } of replacements) {
  try {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes(from)) {
      content = content.replace(from, to);
      fs.writeFileSync(file, content);
      patched++;
    }
  } catch (err) {
    console.warn('patch-baseline-warning: skip', file, err.message);
  }
}
if (patched > 0) {
  console.log('patch-baseline-warning: applied', patched, 'patch(es) to suppress baseline-browser-mapping warning.');
}
