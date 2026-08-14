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
      </head>
      <body>{children}</body>
    </html>
  );
}
