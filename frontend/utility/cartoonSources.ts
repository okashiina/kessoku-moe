export interface CartoonVideo {
  season: number;
  videoId: string;
  label: string;
  provider: string;
}

// Official, full-season uploads. Keep this keyed by TVMaze show ID so an
// identically named reboot never inherits the Classic series' videos.
const OFFICIAL_VIDEOS: Record<number, CartoonVideo[]> = {
  951: [
    {
      season: 1,
      videoId: 'YE-pFTEgsjI',
      label: 'Season 1',
      provider: 'Cartoon Network UK',
    },
    {
      season: 2,
      videoId: 'iuvxuzqIKOY',
      label: 'Season 2',
      provider: 'Ben 10',
    },
    {
      season: 3,
      videoId: 'l7i-Tn2LgRs',
      label: 'Season 3',
      provider: 'Ben 10',
    },
    {
      season: 4,
      videoId: 'u7bT00gl6pE',
      label: 'Season 4',
      provider: 'Ben 10',
    },
  ],
};

export const getCartoonVideos = (tvmazeId: number): CartoonVideo[] =>
  OFFICIAL_VIDEOS[tvmazeId] || [];
