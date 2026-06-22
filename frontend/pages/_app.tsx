import '@styles/globals.css';
import { AppProps } from 'next/app';
import Router from 'next/router';

import { DefaultSeo } from 'next-seo';
import { Provider } from 'react-redux';

import progressBar from '@components/Progress';
import useAniListMangaSync from '@hooks/useAniListMangaSync';
import useAniListSync from '@hooks/useAniListSync';
import { useStore } from '@store/store';

// start progress bar when the route starts to change
Router.events.on('routeChangeStart', progressBar.start);

// finish the progress bar if there is an error while route change
Router.events.on('routeChangeError', progressBar.finish);

function MyApp({ Component, pageProps }: AppProps) {
  const reduxStore = useStore(pageProps.initialReduxState);

  // App-wide AniList sync (no-op when logged out / client id unset).
  useAniListSync();
  useAniListMangaSync();

  return (
    <>
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
            content: '#0B0B14',
          },
          {
            name: 'apple-mobile-web-app-capable',
            content: 'yes',
          },
          {
            name: 'apple-mobile-web-app-status-bar-style',
            content: '#0B0B14',
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
      </Provider>
    </>
  );
}

export default MyApp;
