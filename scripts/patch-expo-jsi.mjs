#!/usr/bin/env node
/**
 * Workaround for an Expo SDK 57 / Xcode incompatibility.
 *
 * `expo-modules-jsi@57.0.4` (still the latest release as of 2026-08) fails to
 * compile under Xcode 26.2 / Swift 6.2:
 *
 *   JavaScriptCodable+Date.swift:53:50:
 *   error: type of expression is ambiguous without a type annotation
 *
 *   guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds else {
 *                                                     ^
 *
 * Annotating the result type of `abs(...)` makes it compile. This is an
 * upstream Expo bug — once it is fixed the script can be deleted, and until
 * then it silently no-ops when the target code is absent.
 *
 * This IS registered in `postinstall` (see package.json), because the bug
 * reproduces on the pinned Xcode 26.2 toolchain and `npm install` would
 * otherwise revert the patch and break the next build.
 *
 * To retire it: upgrade to Xcode 26.4+, delete
 * node_modules/expo-modules-jsi/apple/.DerivedData (a stale cache hides the
 * result), rebuild, and if it is green remove the postinstall entry.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(
  ROOT,
  'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Coding/JavaScriptCodable+Date.swift',
)

const BEFORE = '  guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds else {'
const AFTER = [
  '  // [local patch · scripts/patch-expo-jsi.mjs] Xcode 26.2 / Swift 6.2 rejects',
  '  // the original expression as "ambiguous without a type annotation".',
  '  let magnitude: Double = Swift.abs(milliseconds)',
  '  guard milliseconds.isFinite, magnitude <= maxJavaScriptDateMilliseconds else {',
].join('\n')

if (!existsSync(TARGET)) {
  console.log('[patch-expo-jsi] target file not found — skipping.')
  process.exit(0)
}

const source = readFileSync(TARGET, 'utf8')

if (source.includes('scripts/patch-expo-jsi.mjs')) {
  console.log('[patch-expo-jsi] already applied.')
} else if (source.includes(BEFORE)) {
  writeFileSync(TARGET, source.replace(BEFORE, AFTER))
  console.log('[patch-expo-jsi] applied.')
} else {
  console.log(
    '[patch-expo-jsi] target code not found — upstream may have fixed it. Skipping.',
  )
}
