import '@styles/globals.css';
import '@styles/fonts.css';
import { AppProps } from 'next/app';
import Head from 'next/head';
import Router from 'next/router';

import { DefaultSeo } from 'next-seo';
import { Provider } from 'react-redux';

import MobileDock from '@components/MobileDock';
import progressBar from '@components/Progress';
import useAniListMangaSync from '@hooks/useAniListMangaSync';
import useAniListSync from '@hooks/useAniListSync';
import { useStore } from '@store/store';

// The reader owns the pink top bar: it reflects scroll position, not route/data
// loading. Keep the app-wide loader off reader routes so chapter changes cannot
// compete with the reading-progress indicator.
const isReaderRoute = (url: string) =>
  url.split(/[?#]/, 1)[0].startsWith('/read/');

Router.events.on('routeChangeStart', (url) => {
  if (!isReaderRoute(url)) progressBar.start();
});

// Always clear the app-wide loader when navigation settles. This also removes
// any loader that was active before entering the reader.
Router.events.on('routeChangeComplete', progressBar.finish);
Router.events.on('routeChangeError', progressBar.finish);

function MyApp({ Component, pageProps }: AppProps) {
  const reduxStore = useStore(pageProps.initialReduxState);

  // App-wide AniList sync (no-op when logged out / client id unset).
  useAniListSync();
  useAniListMangaSync();

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
          key="viewport"
        />
      </Head>
      <DefaultSeo
        title="kessoku moe — watch anime free"
        description="kessoku moe — stream anime shows, movies, and series free, ad-light, on your phone, tablet, or desktop. dark, cute, a little rock."
        additionalMetaTags={[
          {
            name: 'keywords',
            content:
              'kessoku moe, watch anime free, anime streaming, anime online, ad-free anime, stream anime',
          },
          {
            name: 'theme-color',
            content: '#17141c',
          },
          {
            name: 'apple-mobile-web-app-capable',
            content: 'yes',
          },
          {
            name: 'apple-mobile-web-app-status-bar-style',
            content: 'black-translucent',
          },
        ]}
        twitter={{
          cardType: 'summary_large_image',
        }}
        openGraph={{
          site_name: 'kessoku moe',
          images: [
            {
              url: '/kessoku-moe-appicon.svg',
              alt: 'kessoku moe',
              type: 'large',
            },
          ],
        }}
      />
      <Provider store={reduxStore}>
        <Component {...pageProps} />
        <MobileDock />
      </Provider>
    </>
  );
}

export default MyApp;
