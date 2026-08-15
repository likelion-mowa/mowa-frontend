import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Web-only HTML shell (expo-router renders this for `npm run web` and the
 * static export; it never runs on iOS).
 *
 * The design prototype types everything in Pretendard. On iOS the system
 * Korean font (Apple SD Gothic Neo) is what Pretendard was metrics-matched
 * against, so native ships the system font and only web loads the real face.
 *
 * The `!important` blanket is deliberate: react-native-web sets font-family on
 * every <Text> via generated classes, so inheritance alone never reaches them.
 */
const fontCss = `
  body, body * {
    font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont,
      system-ui, 'Apple SD Gothic Neo', sans-serif !important;
  }
`;

/**
 * Holds the app to a phone-sized column on the web.
 *
 * Every screen is laid out for a phone, and a browser window is not one — the
 * design has no desktop breakpoint and there is no time to build one, so the
 * honest move is to stop pretending the width is variable.
 *
 * `max-width`, not `width`: on a desktop this pins the column to 430 (the
 * complaint), while a teammate opening the same URL on a real phone still gets
 * a full-bleed layout instead of a horizontal scrollbar.
 *
 * `height: 100%` down the chain is load-bearing, not tidiness — the app's root
 * is `flex: 1`, which needs an ancestor with a definite height or every screen
 * collapses to its content.
 *
 * Nothing escapes this box: React Native has no `position: fixed`, so the
 * absolutely-positioned chrome (the glass bar, the delete sheet, the splash
 * overlay) resolves against its RN parent and stays inside the column.
 *
 * This file is the web-only HTML shell, so none of it reaches the iOS bundle.
 * The backdrop is `parchmentDark` from src/lib/palette.json — the app's own
 * darkest neutral, so the frame reads as deliberate rather than as a page that
 * failed to fill the window.
 */
const frameCss = `
  html, body { height: 100%; }
  body { background-color: #E8E5E2; }

  #root {
    max-width: 430px;
    height: 100%;
    margin: 0 auto;
    background-color: #FFFFFF;
    box-shadow: 0 0 0 1px rgba(17, 24, 39, 0.06), 0 8px 40px rgba(17, 24, 39, 0.08);
  }

  /*
    Phones overlay their scrollbars and desktop browsers reserve a gutter for
    them, which is the one remaining tell that this is a browser. Hiding the bar
    does not disable scrolling — wheel, trackpad, keyboard and touch all still
    work, and focus still scrolls elements into view.
  */
  * { scrollbar-width: none; -ms-overflow-style: none; }
  *::-webkit-scrollbar { width: 0; height: 0; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css"
        />
        <style dangerouslySetInnerHTML={{ __html: fontCss }} />
        {/* After ScrollViewStyleReset so the height chain below wins. */}
        <style dangerouslySetInnerHTML={{ __html: frameCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
