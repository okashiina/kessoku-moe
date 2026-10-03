import { Html, Head, Main, NextScript } from 'next/document';

const Document = () => (
  <Html lang="en">
    <Head>
      {/* Self-host the existing brand fonts so production and offline renders agree. */}
      <link
        rel="preload"
        href="/fonts/nunito-latin.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        href="/fonts/comfortaa-latin.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />

      <link rel="manifest" href="/manifest.webmanifest" />
      <meta name="theme-color" content="#17141c" />
      <link rel="icon" href="/kessoku-moe-appicon.svg" type="image/svg+xml" />
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href="/icons/favicon-32x32.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="16x16"
        href="/icons/favicon-16x16.png"
      />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/icons/apple-touch-icon.png"
      />
      <link
        rel="mask-icon"
        href="/icons/safari-pinned-tab.svg"
        color="#FF4D8D"
      />
    </Head>
    <body>
      <Main />
      <NextScript />
    </body>
  </Html>
);

export default Document;
