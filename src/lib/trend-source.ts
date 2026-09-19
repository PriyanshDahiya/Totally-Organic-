import "server-only";

// Adapter over the trend-data provider, so it can be swapped (Apify today;
// EnsembleData or Data365 later) without touching the ingestion job.
//
// Apify's Instagram Hashtag Scraper, run synchronously:
// https://apify.com/apify/instagram-hashtag-scraper (input: hashtags,
// resultsType "reels", resultsLimit; output fields per item include url,
// type, caption, timestamp, videoPlayCount / videoViewCount, likesCount).
// Pay per result (~$1.90 per 1,000 at the time of writing).
// https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post

export type TrendPost = {
  url: string;
  caption: string;
  views: number | null;
  likes: number | null;
  postedAt: string | null;
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
      }));
  }
}

export function trendSource(): TrendSource | null {
  const key = process.env.TREND_SOURCE_API_KEY;
  return key ? new ApifySource(key) : null;
}
