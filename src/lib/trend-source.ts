import "server-only";

// Adapter over the trend-data provider, so it can be swapped (Apify today;
// EnsembleData or Data365 later) without touching the ingestion job.
//
// Apify's Instagram Hashtag Scraper, run synchronously:
// https://apify.com/apify/instagram-hashtag-scraper (input: hashtags,
// resultsType "reels", resultsLimit; output fields per item include url,
// type, caption, timestamp, videoPlayCount / videoViewCount, likesCount,
// musicInfo { audio_id, song_name, artist_name, uses_original_audio }).
// Pay per result (~$1.90 per 1,000 at the time of writing).
// https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post

export type TrendAudio = {
  id: string;
  title: string;
  artist: string | null;
  // The creator's own sound rather than a song from Instagram's library.
  isOriginal: boolean;
};

export type TrendPost = {
  url: string;
  caption: string;
  views: number | null;
  likes: number | null;
  postedAt: string | null;
  // Null when the provider doesn't say, or Instagram muted the audio.
  audio: TrendAudio | null;
};

export interface TrendSource {
  name: string;
  // Top recent Reels for a hashtag.
  reelsForHashtag(hashtag: string, limit: number): Promise<TrendPost[]>;
}

type ApifyReel = {
  url?: string;
  type?: string;
  caption?: string;
  timestamp?: string;
  videoPlayCount?: number;
  videoViewCount?: number;
  likesCount?: number;
  musicInfo?: {
    audio_id?: string;
    song_name?: string;
    artist_name?: string;
    uses_original_audio?: boolean;
    should_mute_audio?: boolean;
  };
};

class ApifySource implements TrendSource {
  name = "apify";
  constructor(private token: string) {}

  async reelsForHashtag(hashtag: string, limit: number): Promise<TrendPost[]> {
    const res = await fetch(
      "https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ hashtags: [hashtag.replace(/^#/, "")], resultsType: "reels", resultsLimit: limit }),
        // The run-sync endpoint gives up at 300 s.
        signal: AbortSignal.timeout(310_000),
      },
    );
    if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const items = (await res.json()) as ApifyReel[];
    return items
      .filter((i) => i.url && i.caption)
      .map((i) => ({
        url: i.url!,
        caption: i.caption!,
        views: i.videoPlayCount ?? i.videoViewCount ?? null,
        likes: i.likesCount ?? null,
        postedAt: i.timestamp ?? null,
        audio:
          i.musicInfo?.audio_id && !i.musicInfo.should_mute_audio
            ? {
                id: i.musicInfo.audio_id,
                title: i.musicInfo.song_name || "Original audio",
                artist: i.musicInfo.artist_name || null,
                isOriginal: !!i.musicInfo.uses_original_audio,
              }
            : null,
      }));
  }
}

export function trendSource(): TrendSource | null {
  const key = process.env.TREND_SOURCE_API_KEY;
  return key ? new ApifySource(key) : null;
}
