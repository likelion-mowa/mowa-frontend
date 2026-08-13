/**
 * Gate 4 — proves the platform split actually held in the exported web bundle.
 *
 * Run after `npm run export:web`. Two halves, and both matter:
 *
 * 1. Negative — no iOS-only module specifier reached the web graph. A native
 *    import inside a screen passes `tsc` and fails only here.
 * 2. Positive — code that SHOULD be in the bundle is in it. Without this a
 *    silently empty bundle would pass the negative check trivially.
 *
 * Measured trap: the minifier emits non-ASCII as `\uXXXX`, so grepping the raw
 * file for Korean copy is a false negative. The check decodes first.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BUNDLE_DIR = 'dist/_expo/static/js/web';

/** iOS-only specifiers. Match on the module specifier, never on prose. */
const MUST_BE_ABSENT = [
  '@kingstinct/react-native-healthkit',
  'react-native-nitro-modules',
  'CMPedometer',
  'expo-sqlite/',
];

/** Things whose absence means the bundle is broken or the split went too far. */
const MUST_BE_PRESENT = [
  ['web adapter fallback copy', 'HealthKit is only available on iOS.'],
  ['storage key', 'mowa.walks.v2'],
  ['Companion code', 'WITH_SOMEONE'],
  ['Emotion code', 'PENSIVE'],
  ['Situation code', 'IN_TRANSIT'],
  ['endpoint /walk-experiences', '/walk-experiences'],
  ['endpoint /experience-drafts', '/experience-drafts'],
  ['Korean label 생각에 잠긴', '생각에 잠긴'],
  // The suggestion screen's two spec-mandated button labels. A screen whose
  // import graph broke would still export an HTML file, so the proof that
  // /walk actually shipped is its copy being in the JS bundle.
  ['/walk button 남기기', '남기기'],
  ['/walk button 건너뛰기', '건너뛰기'],
];

let bundles;
try {
  bundles = readdirSync(BUNDLE_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(BUNDLE_DIR, f));
} catch {
  console.error(`FAIL — ${BUNDLE_DIR} not found. Run \`npm run export:web\` first.`);
  process.exit(1);
}

if (bundles.length === 0) {
  console.error(`FAIL — no .js bundle in ${BUNDLE_DIR}.`);
  process.exit(1);
}

const raw = bundles.map((f) => readFileSync(f, 'utf8')).join('\n');
const decoded = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
  String.fromCharCode(parseInt(hex, 16)),
);

let failures = 0;

console.log(`bundle(s): ${bundles.join(', ')}\n`);
console.log('native specifiers that must be absent:');
for (const needle of MUST_BE_ABSENT) {
  if (raw.includes(needle)) {
    console.log(`  LEAKED   ${needle}`);
    failures++;
  } else {
    console.log(`  absent   ${needle}`);
  }
}

console.log('\ncode that must be present:');
for (const [label, needle] of MUST_BE_PRESENT) {
  if (decoded.includes(needle)) {
    console.log(`  present  ${label}`);
  } else {
    console.log(`  MISSING  ${label}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\nGATE 4: FAIL — ${failures} problem(s).`);
  process.exit(1);
}
console.log('\nGATE 4: PASS');
