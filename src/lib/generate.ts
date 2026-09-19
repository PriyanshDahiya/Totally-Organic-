import "server-only";
import { createAdminClient } from "./supabase/admin";
import { remixHook, type Format, type Remix } from "./hooks";
import { findBackgroundClip, findBackgroundPhoto, type StockClip } from "./stock";
import { memeById, memeMenu, pickPopularMeme, toMemeLayer } from "./memes";
import { pickMusic } from "./music";
import { generateScenes } from "./scenes";
import { suggestAudio } from "./audio";
import { findFaces, placeAroundFaces, type FaceBand } from "./faces";
import { productCutouts, type Cutout } from "./cutout";
import {
  DEFAULT_STYLE,
  clampProduct,
  wallOfTextFontSize,
  type CardStyle,
  type ProductLayer,
  type TextPosition,
} from "@/remotion/style";
import type { BrandProfile } from "./brand-profile";
import { voiceOf, type BrandVoice } from "./voice";
import { pickMoment } from "./moments";
import { loadPreferences, weightedPick } from "./preferences";

// One call = one Blitz card = one GenerationJob.

// Odds of a "story" card (first-person post that names the brand) versus a
// "meme" card (brand only in the caption). Stories read like a customer's
// recommendation, which is how brands show up in posts that perform.
const MENTION_ODDS = { rarely: 0.2, sometimes: 0.4, often: 0.65 } as const;
const TEXT_POSITIONS: TextPosition[] = ["top", "upper", "upper", "center"];
// How many customer phrases each card sees (a rotating sample keeps posts varied).
const PHRASES_PER_CARD = 6;
// Share of Wall of Text cards that show the product, for brands with a
// usable cutout: most, so posts sell, but not all, so the feed stays varied.
const PRODUCT_SHARE = 0.8;
const MEME_MENTION_ODDS = 0.6;
// Rough share of each format before learning from swipes shifts it. Memes
// need the meme library; slideshows need product photos.
const FORMAT_WEIGHT: Record<Format, number> = { wall_of_text: 0.45, slideshow: 0.3, green_screen: 0.3 };
// Slideshow needs enough photos to fill its slides.
const MIN_SLIDESHOW_IMAGES = 3;
// Don't reuse a hook this brand saw in its last N cards.
const RECENT_WINDOW = 10;

type Clip = { id: string; hook_text: string; format: Format; niche_tags: string[]; source_url: string; fetched_at: string };

// Imported trends go stale fast; the hand-written seed set ("seed:" ids) is
// the evergreen fallback.
const TREND_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FRESH_TREND_BOOST = 1.5;
const isSeed = (c: Clip) => c.source_url.startsWith("seed:");

export type Card = {
  jobId: string;
  format: Format;
  hook: string;
  angle: string;
  productId: string | null;
  mentionBrand: boolean;
  remix: Remix;
  background: StockClip | null;
  style: CardStyle;
  videoAssetId: string;
};

export type { CardStyle } from "@/remotion/style";

export type StoredCutout = Cutout & { productId: string; productName: string };

// Product cutouts are made once per brand and cached on its profile
// (`productCutouts`); an empty list means "tried, none usable".
export async function brandCutouts(
  brandId: string,
  profile: Record<string, unknown>,
  products: { id: string; name: string; image_urls: string[] }[],
): Promise<StoredCutout[]> {
  const cached = profile.productCutouts as StoredCutout[] | undefined;
  if (cached) return cached;
  const cutouts = await productCutouts(products.filter((p) => p.image_urls.length));
  await createAdminClient()
    .from("brands")
    .update({ profile: { ...profile, productCutouts: cutouts } })
    .eq("id", brandId);
  return cutouts;
}

// Where the product goes: lower middle of the frame, on whichever side is
// clear of faces, sized so it reads as the hero without covering the scene.
function placeProduct(cutout: StoredCutout, faces: FaceBand[]): ProductLayer {
  const aspect = cutout.width / cutout.height;
  // Tall products (bottles, tubes) narrower, wide ones (boxes, packs) wider.
  const width = aspect < 0.6 ? 0.28 : aspect > 1.2 ? 0.46 : 0.36;
  const height = (width * 1080) / aspect / 1920;
  const y = Math.min(0.78 - height / 2, 0.64);
  const overlap = (x: number) =>
    faces.reduce((sum, f) => {
      const w = Math.max(0, Math.min(x + width / 2, f.right) - Math.max(x - width / 2, f.left));
      const h = Math.max(0, Math.min(y + height / 2, f.bottom) - Math.max(y - height / 2, f.top));
      return sum + w * h;
    }, 0);
  const sides = [0.7, 0.3].sort((a, b) => overlap(a) - overlap(b) || Math.random() - 0.5);
  return clampProduct({ url: cutout.url, aspect, x: sides[0], y, width });
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Rotates through the brand's scenes (least recently used first) and skips
// clips used in recent cards, so backgrounds don't repeat. Scenes are written
// on first use for brands that don't have them yet.
async function pickBackground(
  brandId: string,
  profile: Pick<BrandProfile, "identity" | "segments"> & { scenes?: string[] },
  angles: BrandProfile["angles"],
  recent: (StockClip | null)[],
  emotion: string,
): Promise<StockClip | null> {
  let scenes = profile.scenes ?? [];
  if (scenes.length === 0) {
    scenes = await generateScenes(profile, angles);
    const { error } = await createAdminClient()
      .from("brands")
      .update({ profile: { ...profile, scenes } })
      .eq("id", brandId);
    if (error) throw error;
  }

  const uses = new Map(scenes.map((s) => [s, 0]));
  for (const bg of recent) if (bg?.query && uses.has(bg.query)) uses.set(bg.query, uses.get(bg.query)! + 1);
  // Least used first, random among ties.
  const order = [...scenes].sort((a, b) => uses.get(a)! - uses.get(b)! || Math.random() - 0.5);
  const avoid = new Set(recent.flatMap((bg) => (bg?.credit ? [bg.credit.pexelsUrl] : [])));

  // A scene can come back empty (too specific for Pexels); try the next.
  for (const scene of order.slice(0, 3)) {
    const clip = await findBackgroundClip(scene, avoid, emotion);
    if (clip) return clip;
  }
  return null;
}

// A still photo from one of the brand's scenes, for the Meme format.
async function pickBackdrop(
  brandId: string,
  profile: Pick<BrandProfile, "identity" | "segments"> & { scenes?: string[] },
  angles: BrandProfile["angles"],
) {
  let scenes = profile.scenes ?? [];
  if (scenes.length === 0) {
    scenes = await generateScenes(profile, angles);
    await createAdminClient().from("brands").update({ profile: { ...profile, scenes } }).eq("id", brandId);
  }
  for (const scene of [...scenes].sort(() => Math.random() - 0.5).slice(0, 3)) {
    // Brand scenes describe people ("tired man at desk"); keep the place.
    const place = scene.replace(/\b(a |an |the )?(man|woman|person|guy|girl|boy|people|couple|student|founder)s?\b/gi, "").trim();
    const photo = await findBackgroundPhoto(`${place} empty`);
    if (photo) return photo;
  }
  return null;
}

export async function generateCard(brandId: string, opts: { format?: Format } = {}): Promise<Card> {
  const supabase = createAdminClient();

  const [{ data: brand, error }, { data: clips }, { data: products }, { data: recent }, prefs] = await Promise.all([
    supabase.from("brands").select("profile, angles, tone_dos, tone_donts, mention_frequency").eq("id", brandId).single(),
    supabase.from("trending_clips").select("id, hook_text, format, niche_tags, source_url, fetched_at"),
    supabase.from("products").select("id, name, price, description, image_urls").eq("brand_id", brandId),
    supabase
      .from("generation_jobs")
      .select("trending_clip_id, angle, background, style")
      .eq("brand_id", brandId)
      .order("requested_at", { ascending: false })
      .limit(RECENT_WINDOW),
    loadPreferences(brandId),
  ]);
  if (error || !brand) throw new Error(`Brand ${brandId} not found.`);

  const profile = brand.profile as Pick<BrandProfile, "identity" | "niche_tags" | "segments"> & {
    scenes?: string[];
    voice?: Partial<BrandVoice>;
  };
  const voice = voiceOf(profile);
  const angles = brand.angles as BrandProfile["angles"];
  const tags = new Set((profile.niche_tags ?? []).map((t) => t.toLowerCase()));
  const slideshowProducts = (products ?? []).filter((p) => p.image_urls.length >= MIN_SLIDESHOW_IMAGES);

  // Format: slideshows only for brands with product photos, and the split
  // shifts toward whichever format this founder approves more.
  const formats: Format[] = [
    "wall_of_text",
    ...(slideshowProducts.length ? (["slideshow"] as const) : []),
    "green_screen",
  ];
  const format: Format = opts.format ?? weightedPick(formats, (f) => FORMAT_WEIGHT[f] * prefs.format(f));
  // Memes remix the same hooks as Wall of Text, cut down to a setup line.
  const hookFormat: Format = format === "green_screen" ? "wall_of_text" : format;

  // Hooks: niche matches first, "general" otherwise; skip hooks used
  // recently; favour hooks this founder has approved before.
  const usedClips = new Set((recent ?? []).map((r) => r.trending_clip_id));
  const now = Date.now();
  const usable = ((clips ?? []) as Clip[]).filter(
    (c) =>
      c.format === hookFormat &&
      !usedClips.has(c.id) &&
      (isSeed(c) || now - new Date(c.fetched_at).getTime() < TREND_MAX_AGE_MS),
  );
  const niche = usable.filter((c) => c.niche_tags.some((t) => tags.has(t)));
  const general = usable.filter((c) => c.niche_tags.includes("general"));
  // Roughly 1 in 3 cards uses a niche hook when there are any.
  const pool = niche.length > 0 && (Math.random() < 0.35 || general.length === 0) ? niche : general;
  if (pool.length === 0) throw new Error("No trending hooks available for this brand yet.");
  const clip = weightedPick(pool, (c) => prefs.hook(c.id) * (isSeed(c) ? 1 : FRESH_TREND_BOOST));

  // Angles: rotate so all get airtime, weighted toward approved ones.
  const angleUse = new Map(angles.map((a) => [a.title, 0]));
  for (const r of recent ?? []) if (angleUse.has(r.angle)) angleUse.set(r.angle, angleUse.get(r.angle)! + 1);
  const angle = weightedPick(angles, (a) => prefs.angle(a.title) / (1 + angleUse.get(a.title)!));

  // Voice for this card: language (a "mixed" brand alternates), a timely
  // moment now and then, and a rotating sample of real customer phrases.
  const language = voice.language === "mixed" ? (Math.random() < 0.5 ? "hinglish" : "english") : voice.language;
  const giftable = (products ?? []).some((p) => p.price);
  const moment = pickMoment(new Date(), voice.culture, giftable);
  const customerPhrases = [...voice.customerPhrases].sort(() => Math.random() - 0.5).slice(0, PHRASES_PER_CARD);

  // Product in the shot (Wall of Text): chosen before writing, so the text
  // is about the product the video actually shows.
  let shotCutout: StoredCutout | null = null;
  if ((format === "wall_of_text" || format === "green_screen") && Math.random() < PRODUCT_SHARE) {
    const cutouts = await brandCutouts(brandId, brand.profile as Record<string, unknown>, products ?? []).catch((err) => {
      console.error("product cutouts failed", err);
      return [] as StoredCutout[];
    });
    if (cutouts.length) shotCutout = pickRandom(cutouts);
  }
  const product =
    format === "slideshow"
      ? pickRandom(slideshowProducts)
      : (shotCutout && (products ?? []).find((p) => p.id === shotCutout!.productId)) || null;

  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .insert({
      brand_id: brandId,
      product_id: product?.id ?? null,
      trending_clip_id: clip.id,
      angle: angle.title,
      format: format,
      status: "generating",
    })
    .select("id")
    .single();
  if (jobError) throw jobError;

  try {
    // Meme cards name the brand in most setups ("when your team is [brand]"),
    // since a funny post nobody links to the brand doesn't sell.
    const mentionBrand = Math.random() < (format === "green_screen" ? MEME_MENTION_ODDS : MENTION_ODDS[brand.mention_frequency as keyof typeof MENTION_ODDS]);
    const remix = await remixHook({
      brand: {
        name: profile.identity.name,
        one_liner: profile.identity.one_liner,
        category: profile.identity.category,
        tone_dos: brand.tone_dos,
        tone_donts: brand.tone_donts,
      },
      angle,
      hook: { text: clip.hook_text, format },
      mentionBrand,
      product: product ?? undefined,
      language,
      culture: voice.culture,
      voiceExamples: voice.examples,
      customerPhrases,
      moment,
      // Memes used in recent cards are left out so the feed doesn't repeat.
      memeMenu:
        format === "green_screen"
          ? memeMenu(new Set((recent ?? []).flatMap((r) => ((r.style as CardStyle | null)?.meme ? [(r.style as CardStyle).meme!.id] : []))))
          : undefined,
    });

    // A missing background isn't fatal: the card still previews on a plain
    // backdrop and can be regenerated.
    const background =
      format === "wall_of_text"
        ? await pickBackground(
            brandId,
            profile,
            angles,
            (recent ?? []).map((r) => r.background as StockClip | null),
            remix.emotion,
          ).catch(
            (err) => {
              console.error("background lookup failed", err);
              return null;
            },
          )
        : null;
    const style: CardStyle = {
      ...DEFAULT_STYLE,
      // Slideshow text sits above the photo band, never over the product.
      textPosition: format === "wall_of_text" ? pickRandom(TEXT_POSITIONS) : "top",
      music: await pickMusic(),
    };
    // Faces in the footage, for keeping the text and product off them.
    // Best effort: a card is never failed over it.
    const faces: FaceBand[] = background?.frames?.length
      ? await findFaces(background.frames).catch((err) => {
          console.error("face detection failed", err);
          return [];
        })
      : [];

    if (format === "green_screen") {
      // The model's pick, or a random meme if it named one we don't have.
      style.meme = toMemeLayer(memeById(remix.meme_id) ?? pickPopularMeme());
      // The model's scene for this joke, else one of the brand's scenes.
      // "empty" nudges Pexels toward scenes without people; the alt-text
      // filter in findBackgroundPhoto drops any that still have them.
      style.backdrop = await (remix.scene.trim() ? findBackgroundPhoto(`${remix.scene} empty`) : Promise.resolve(null))
        .then((photo) => photo ?? (remix.scene.trim() ? findBackgroundPhoto(remix.scene) : null))
        .then((photo) => photo ?? pickBackdrop(brandId, profile, angles))
        .catch((err) => {
        console.error("backdrop lookup failed", err);
        return null;
      });
    }

    if (shotCutout) {
      style.product =
        format === "green_screen"
          ? // Beside the meme, which moves left to make room.
            clampProduct({ url: shotCutout.url, aspect: shotCutout.width / shotCutout.height, x: 0.76, y: 0.64, width: 0.3 })
          : placeProduct(shotCutout, faces);
    }

    // Smart positioning: keep the text off faces and off the product.
    const obstacles: FaceBand[] = [...faces];
    if (style.product) {
      const h = (style.product.width * 1080) / style.product.aspect / 1920;
      obstacles.push({ top: style.product.y - h / 2, bottom: style.product.y + h / 2, left: 0, right: 1 });
    }
    if (obstacles.length) {
      style.textBox = placeAroundFaces(obstacles, remix.lines, wallOfTextFontSize(remix.lines, style));
    }

    // The preview VideoAsset carries the caption; it's rendered for real
    // (render_status 'rendering' -> 'rendered') only when the card is approved.
    const { data: asset, error: assetError } = await supabase
      .from("video_assets")
      .insert({ generation_job_id: job.id, caption_text: remix.caption })
      .select("id")
      .single();
    if (assetError) throw assetError;

    const { error: doneError } = await supabase
      .from("generation_jobs")
      .update({
        status: "done",
        overlay_text: remix.lines.join("\n"),
        why: remix.why,
        background,
        style,
        suggested_audio: await suggestAudio(profile.niche_tags ?? [], remix.emotion).catch((err) => {
          console.error("audio suggestion failed", err);
          return null;
        }),
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (doneError) throw doneError;

    return {
      jobId: job.id,
      format: format,
      hook: clip.hook_text,
      angle: angle.title,
      productId: product?.id ?? null,
      mentionBrand,
      remix,
      background,
      style,
      videoAssetId: asset.id,
    };
  } catch (err) {
    // A failed job stays visible as a failed card; it's never dropped.
    await supabase
      .from("generation_jobs")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("id", job.id);
    throw err;
  }
}
