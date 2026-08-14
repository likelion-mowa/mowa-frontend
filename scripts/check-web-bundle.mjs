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
  // Only photo-picker.native.ts may import this; the web adapter is a DOM
  // file input precisely so this specifier never reaches the web graph.
  'expo-image-picker',
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
  // Screen copy as shipped-proof: a screen whose import graph broke would
  // still export an HTML file, so the proof a screen actually shipped is its
  // copy being in the JS bundle. The /walk labels are the prototype's
  // (저장할게요/괜찮아요 replaced the spec terms 남기기/건너뛰기 in the
  // 2026-08-14 restyle); the rest are one headline per diary-flow screen.
  ['/walk button 저장할게요', '저장할게요'],
  ['/walk button 괜찮아요', '괜찮아요'],
  ['diary photo headline', '사진이 있나요?'],
  ['diary generating headline', '산책 기억을 만들고 있어요'],
  ['diary failure headline', '산책 기억을 만들지 못했어요'],
  ['diary preview header', '산책 기억 미리보기'],
  ['home subtitle', '당신의 산책을 모와드릴까요?'],
  ['archive subtitle', '산책 기억 모음'],
  ['archive empty state', '산책 기록이 없어요'],
  ['settings placeholder', '설정 화면을 준비 중이에요'],
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
