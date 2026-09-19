import "server-only";

// Background clips for Wall of Text come from Pexels (free, 25k requests a
// month). Pexels asks apps to show a link back to Pexels and credit the
// videographer where possible, so the credit comes back with the clip.
// https://www.pexels.com/api/documentation/#videos-search

type PexelsFile = { link: string; width: number | null; height: number | null; file_type: string; quality: string | null };

type PexelsVideo = {
  id: number;
  url: string;
  duration: number;
  user: { name: string; url: string };
  video_pictures: { picture: string }[];
  video_files: PexelsFile[];
};

export type StockClip = {
  // Light file for the browser preview (~720 wide).
  videoUrl: string;
  // Full-HD file for the final render, so the MP4 isn't an upscaled 720p.
  // Missing on clips saved before this existed; fall back to videoUrl.
  renderUrl?: string;
  posterUrl: string | null;
  width: number;
  height: number;
  durationSeconds: number;
  // The scene search that found this clip; used to rotate scenes per brand.
  query?: string;
  // The feeling it was picked for, when the clip's title showed it.
  emotion?: string;
  // A few stills from across the clip (Pexels thumbnails), for smart text
  // positioning. Missing on uploads and older cards.
  frames?: string[];
  source?: "pexels" | "upload";
  // Pexels asks for attribution; null for the founder's own uploads.
  credit: { name: string; url: string; pexelsUrl: string } | null;
};

const PREVIEW_MIN_WIDTH = 720;
const RENDER_WIDTH = 1080;
const MIN_DURATION_SECONDS = 5;

// Pexels search is loose ("man stretching on rug" can return someone
// praying), so re-rank results by how well the clip's own title, which
// Pexels puts in the page URL slug, matches the scene.
const STOPWORDS = new Set(["a", "an", "the", "in", "on", "at", "of", "and", "with", "while", "to", "for", "up", "out", "his", "her", "their", "from"]);
const MEN = new Set(["man", "men", "guy", "boy", "male", "gentleman"]);
const WOMEN = new Set(["woman", "women", "girl", "lady", "female"]);
// Footage that's wrong to put under an ad no matter what the scene is.
const SENSITIVE =
  /\b(pray\w*|salah|namaz|mosque|church|temple|worship\w*|religio\w*|funeral|graves?|hospital|patients?|surgery|protest\w*|police|military|weapons?|guns?|blood|injur\w*|accident|nude|lingerie|child|children|kids?|baby|babies)\b/;

// Crude stemmer, enough to match "running"/"runs" to "run".
// Words Pexels titles use for each feeling, e.g. "tired-man-yawning-at-desk".
const EMOTION_WORDS: Record<string, string[]> = {
  frustrated: ["frustrated", "angry", "annoyed", "stressed", "upset", "mad", "irritated"],
  tired: ["tired", "exhausted", "sleepy", "yawning", "bored", "fatigue"],
  shocked: ["shocked", "surprised", "amazed", "astonished", "shock", "surprise"],
  smug: ["smug", "confident", "proud", "smirking", "cool", "posing"],
  happy: ["happy", "laughing", "smiling", "excited", "joy", "cheerful", "celebrating", "dancing"],
  confused: ["confused", "thinking", "puzzled", "wondering", "doubt"],
  determined: ["determined", "focused", "motivated", "intense", "serious", "training"],
  relaxed: ["relaxed", "calm", "chill", "resting", "peaceful", "lounging"],
  embarrassed: ["embarrassed", "awkward", "shy", "nervous", "facepalm"],
};

function showsEmotion(pexelsUrl: string, emotion: string) {
  const words = new Set(slugWords(pexelsUrl).map((w) => w.toLowerCase()));
  return (EMOTION_WORDS[emotion] ?? [emotion]).some((w) => words.has(w));
}

const stem = (w: string) =>
  w.toLowerCase().replace(/[^a-z]/g, "").replace(/(ing|es|s)$/, "").replace(/(.)\1$/, "$1").slice(0, 6);

function slugWords(pexelsUrl: string) {
  const slug = pexelsUrl.match(/\/video\/([^/]+?)-\d+\/?$/)?.[1] ?? "";
  return slug.split("-").filter(Boolean);
}

function relevance(query: string, pexelsUrl: string) {
  const words = slugWords(pexelsUrl);
  if (SENSITIVE.test(words.join(" "))) return -Infinity;
  const slug = new Set(words.map(stem));
  const q = query.toLowerCase().split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
  let score = q.filter((w) => !MEN.has(w) && !WOMEN.has(w) && slug.has(stem(w))).length;
  // Right person matters: a "man" scene showing a woman reads as random.
  const wantsMan = q.some((w) => MEN.has(w));
  const wantsWoman = q.some((w) => WOMEN.has(w));
  const hasMan = words.some((w) => MEN.has(w));
  const hasWoman = words.some((w) => WOMEN.has(w));
  if ((wantsMan && hasWoman && !hasMan) || (wantsWoman && hasMan && !hasWoman)) score -= 2;
  if ((wantsMan && hasMan) || (wantsWoman && hasWoman)) score += 1;
  return score;
}

function portraitMp4s(v: PexelsVideo) {
  return v.video_files
    .filter((f): f is PexelsFile & { width: number; height: number } =>
      f.file_type === "video/mp4" && !!f.width && !!f.height && f.height > f.width)
    .sort((a, b) => a.width - b.width);
}

type Candidate = { v: PexelsVideo; preview: PexelsFile & { width: number; height: number }; render: PexelsFile & { width: number; height: number }; score: number };

// `scene`: what relevance is scored against, when the search itself adds
// words (an emotion) that shouldn't count as matching the scene.
async function searchPexels(query: string, perPage: number, scene = query): Promise<Candidate[]> {
  const url = new URL("https://api.pexels.com/videos/search");
  url.search = new URLSearchParams({ query, orientation: "portrait", size: "medium", per_page: String(perPage) }).toString();

  const res = await fetch(url, {
    headers: { Authorization: process.env.PEXELS_API_KEY! },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Pexels search failed (${res.status}).`);
  const { videos } = (await res.json()) as { videos: PexelsVideo[] };

  const candidates = videos.flatMap((v) => {
    if (v.duration < MIN_DURATION_SECONDS) return [];
    const score = relevance(scene, v.url);
    if (score === -Infinity) return [];
    const files = portraitMp4s(v);
    const preview = files.find((f) => f.width >= PREVIEW_MIN_WIDTH);
    // Only clips that exist in full HD, so every render is sharp.
    const render = files.find((f) => f.width >= RENDER_WIDTH);
    return preview && render ? [{ v, preview, render, score }] : [];
  });
  // Best matches first; sort is stable, so Pexels' own ranking breaks ties.
  return candidates.sort((a, b) => b.score - a.score);
}

function toClip({ v, preview, render }: Candidate, query: string): StockClip {
  return {
    videoUrl: preview.link,
    renderUrl: render.link,
    posterUrl: v.video_pictures[0]?.picture ?? null,
    frames: [0, 0.5, 1]
      .map((f) => v.video_pictures[Math.round(f * (v.video_pictures.length - 1))]?.picture)
      .filter((u, i, all): u is string => !!u && all.indexOf(u) === i),
    width: preview.width,
    height: preview.height,
    durationSeconds: v.duration,
    query,
    source: "pexels",
    credit: { name: v.user.name, url: v.user.url, pexelsUrl: v.url },
  };
}

// For automatic picks. `avoid`: Pexels page URLs of clips this brand used
// recently, so the same clip doesn't come back card after card.
// `emotion`: first try the scene with that feeling ("frustrated man jogging
// park") and keep a clip only if its title shows the feeling; otherwise
// fall back to the plain scene, since a relevant clip beats no clip.
export async function findBackgroundClip(
  query: string,
  avoid: Set<string> = new Set(),
  emotion?: string,
): Promise<StockClip | null> {
  if (emotion) {
    const felt = (await searchPexels(`${emotion} ${query}`, 15, query)).filter(
      // Score 2+: the right person *and* part of the scene, not just "a woman".
      (c) => c.score >= 2 && !avoid.has(c.v.url) && showsEmotion(c.v.url, emotion),
    );
    if (felt.length) {
      const top = felt.filter((c) => c.score >= felt[0].score - 1).slice(0, 3);
      return { ...toClip(top[Math.floor(Math.random() * top.length)], query), emotion };
    }
  }
  // At least one real word of the scene has to show up in the clip's title.
  const candidates = (await searchPexels(query, 15)).filter((c) => c.score >= 1 && !avoid.has(c.v.url));
  if (candidates.length === 0) return null;
  // Vary among the top few so similar scenes don't always give the same clip.
  const top = candidates.filter((c) => c.score >= candidates[0].score - 1).slice(0, 4);
  return toClip(top[Math.floor(Math.random() * top.length)], query);
}

// For the editor's footage library: everything usable, best matches first.
// Looser than automatic picks, since a person is choosing.
export async function searchClips(query: string, limit = 12): Promise<StockClip[]> {
  return (await searchPexels(query, 30)).slice(0, limit).map((c) => toClip(c, query));
}

// Still photos for the Meme format's backdrop (Pexels photo search). Cropped
// by Pexels' image CDN to 9:16 at render size.
type PexelsPhoto = { id: number; url: string; alt: string; photographer: string; photographer_url: string; src: { original: string } };

// Meme backdrops set the scene; the meme is the only person in the frame.
const PEOPLE =
  /\b(person|people|man|men|woman|women|girl|boy|guy|lady|child|kid|couple|family|friends|crowd|worker|workers|businessman|businesswoman|student|model|portrait|selfie|face|hands?|someone|user|athlete|chef|doctor)\b/;

export type StockPhoto = { url: string; credit: { name: string; url: string; pexelsUrl: string } };

export async function findBackgroundPhoto(query: string, avoid: Set<string> = new Set()): Promise<StockPhoto | null> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.search = new URLSearchParams({ query, orientation: "portrait", per_page: "15" }).toString();
  const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY! }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Pexels photo search failed (${res.status}).`);
  const { photos } = (await res.json()) as { photos: PexelsPhoto[] };
  const usable = photos.filter((p) => {
    const text = `${p.alt} ${p.url}`.toLowerCase();
    return !avoid.has(p.url) && !SENSITIVE.test(text) && !PEOPLE.test(text);
  });
  if (usable.length === 0) return null;
  const p = usable[Math.floor(Math.random() * Math.min(5, usable.length))];
  return {
    url: `${p.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920`,
    credit: { name: p.photographer, url: p.photographer_url, pexelsUrl: p.url },
  };
}
