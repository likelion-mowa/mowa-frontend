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
  // Only secure-store.native.ts may import this. The web adapter is
  // localStorage and never names the package, not even in prose.
  'expo-secure-store',
  // Only location.native.ts may import this. Unlike the others it is a real
  // temptation on web — navigator.geolocation exists — so the guard matters:
  // expo-location's reverse geocoding was removed in SDK 49 and resolves to an
  // empty array there, meaning a web import would compile, pass tsc, and
  // silently return no place at all.
  'expo-location',
];

/** Things whose absence means the bundle is broken or the split went too far. */
const MUST_BE_PRESENT = [
  ['web adapter fallback copy', 'HealthKit is only available on iOS.'],
  // Pairs with 'expo-location' above: absence alone would also be satisfied by
  // a web location adapter that failed to ship at all.
  ['web location fallback copy', 'Reading a place requires CoreLocation and is iOS-only.'],
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
  // Guards the option-picker extraction: the companion/emotion/situation UI now
  // lives in components/option-picker.tsx, and this is the only string unique to
  // the screen that consumes it. '생각에 잠긴' would NOT catch a regression here
  // — it comes from api/types.ts and ships even if this screen leaves the graph.
  ['diary context question', '함께였나요?'],
  ['diary generating headline', '산책 기억을 만들고 있어요'],
  ['diary failure headline', '산책 기억을 만들지 못했어요'],
  ['diary preview header', '산책 기억 미리보기'],
  ['home subtitle', '당신의 산책을 모와드릴까요?'],
  // The subtitle above is CharacterHero's tagline prop: deleting the detection
  // section leaves it untouched, so it proves the home MODULE shipped, not that
  // this section did. This string exists nowhere but the idle card, so it is
  // what fails when the section is gone — and the idle card is the branch web
  // always renders, having no detector.
  ['home detection idle', '아직 감지된 산책이 없어요'],
  ['archive subtitle', '산책 기억 모음'],
  ['archive empty state', '산책 기록이 없어요'],
  // 기능 7·8 on /experiences/[experienceId]. The detail screen never had a
  // control; the sheet's headline is unique to the new module. The EDITOR has
  // none on purpose — every string in it is reused from the diary flow, so no
  // grep can distinguish it. It is a static import of this route, which makes
  // Gate 1 and Gate 3 its real guards.
  ['experience detail not-found', '삭제되었거나 존재하지 않는 기록이에요.'],
  ['delete sheet headline', '이 기록을 삭제할까요?'],
  // Auth + settings screens. One unique headline each, so a screen whose
  // import graph broke is caught here rather than at runtime.
  ['onboarding signature', '기록이 쌓이면, 기억이 됩니다.'],
  ['login subtitle', '로그인하고 산책 기억을 확인해보세요'],
  ['settings section', '권한 및 개인정보'],
  ['settings 로그아웃', '로그아웃'],
  ['detection toggle', '자동 감지 사용'],
  ['permissions action', '기기 설정 열기'],
  // Positive control for the WEB secure-store adapter, the same trick as the
  // walks storage key: it proves the localStorage half shipped rather than
  // the whole module being split away.
  ['secure store key', 'mowa.auth.token.v1'],
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
