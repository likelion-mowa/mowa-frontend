#!/usr/bin/env node
/**
 * Increment expo.ios.buildNumber in app.json.
 *
 * Why this exists
 * ---------------
 * `npm run prebuild` regenerates ios/ from scratch on every run, so the build
 * number cannot live in the Xcode project — app.json is the only value that
 * survives. App Store Connect rejects an upload whose buildNumber does not
 * exceed every build previously uploaded for the same version, so it has to
 * go up before every TestFlight archive, not just once.
 *
 * When it runs
 * ------------
 * Run manually right before archiving for TestFlight:
 *   npm run bump:build && npm run prebuild
 * Not wired into the regular `prebuild`/`ios` chain — local device builds
 * during development should not burn build numbers.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APP_JSON = join(process.cwd(), 'app.json')

const raw = readFileSync(APP_JSON, 'utf8')
const parsed = JSON.parse(raw)

const current = parsed.expo?.ios?.buildNumber
if (current === undefined) {
  console.error('[bump:build] expo.ios.buildNumber is not set in app.json — add it first.')
  process.exit(1)
}
if (!/^\d+$/.test(current)) {
  console.error(`[bump:build] buildNumber "${current}" is not a plain integer string — bump it by hand.`)
  process.exit(1)
}

const next = String(Number(current) + 1)

// Edit the raw text instead of round-tripping through JSON.stringify, which
// would reformat every array in the file (e.g. one-line "platforms") and
// bury the real change in formatting noise.
const pattern = /("buildNumber"\s*:\s*")\d+(")/
if (!pattern.test(raw)) {
  console.error('[bump:build] could not find a "buildNumber": "N" line to replace.')
  process.exit(1)
}
writeFileSync(APP_JSON, raw.replace(pattern, `$1${next}$2`))

console.log(`[bump:build] ios.buildNumber ${current} -> ${next}`)
