import "server-only";
import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ScrapedProduct = {
  name: string;
  url: string | null;
  description: string | null;
  imageUrls: string[];
  price: string | null;
};

export type ScrapedSite = {
  url: string;
  title: string;
  metaDescription: string;
  text: string;
  products: ScrapedProduct[];
};

// Page copy sent to the LLM. ~3k tokens: Groq's free tier caps a minute at
// 8k tokens (input + output), and the top of a homepage says the most anyway.
const MAX_TEXT_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 10_000;

function isPrivateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

// Users paste arbitrary URLs and the server fetches them, so refuse anything
// that resolves to an internal address.
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) URLs are supported.");
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new Error("Couldn't reach that website.");
  if (addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("That URL isn't publicly reachable.");
  return url;
}

async function get(url: string) {
  return fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 (compatible; BrandProfileBot/1.0)" },
  });
}

type ShopifyProduct = {
  title: string;
  handle: string;
  body_html: string | null;
  images: { src: string }[];
  variants: { price: string }[];
};

// Checkout add-ons (shipping protection, gift cards) show up in the catalog
// but aren't products anyone makes content about.
const ADD_ON = /\b(coverage|protection|insurance|gift card|shipping|warranty|returns)\b/i;

function isAddOn(p: ShopifyProduct) {
  return ADD_ON.test(p.title) || Number(p.variants[0]?.price ?? 0) < 1;
}

function fromShopify(origin: string, p: ShopifyProduct): ScrapedProduct {
  return {
    name: p.title,
    url: `${origin}/products/${p.handle}`,
    description: p.body_html ? cheerio.load(p.body_html).text().trim() : null,
    imageUrls: p.images.map((i) => i.src).slice(0, 8),
    price: p.variants[0]?.price ?? null,
  };
}

// Most Shopify stores expose public JSON: /products/<handle>.json for one
// product and /products.json for the catalog. Non-Shopify sites just 404.
async function scrapeShopify(url: URL): Promise<ScrapedProduct[]> {
  const productMatch = url.pathname.match(/\/products\/([^/?#]+)/);
  try {
    if (productMatch) {
      const res = await get(`${url.origin}/products/${productMatch[1]}.json`);
      if (res.ok) {
        const { product } = (await res.json()) as { product: ShopifyProduct };
        return [fromShopify(url.origin, product)];
      }
    }
    const res = await get(`${url.origin}/products.json?limit=10`);
    if (!res.ok) return [];
    const { products } = (await res.json()) as { products: ShopifyProduct[] };
    return products.filter((p) => !isAddOn(p)).map((p) => fromShopify(url.origin, p));
  } catch {
    return [];
  }
}

export async function scrapeSite(rawUrl: string): Promise<ScrapedSite> {
  const url = await assertPublicUrl(rawUrl);

  const res = await get(url.toString()).catch(() => null);
  if (!res?.ok) throw new Error(`Couldn't load ${url.hostname} (${res?.status ?? "no response"}).`);
  const $ = cheerio.load(await res.text());

  const ogImage = $('meta[property="og:image"]').attr("content") ?? null;
  const title = $("title").first().text().trim();
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";

  $("script, style, noscript, svg, iframe").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);

  let products = await scrapeShopify(url);
  if (products.length === 0) {
    products = [
      {
        name: $('meta[property="og:title"]').attr("content")?.trim() || title || url.hostname,
        url: url.toString(),
        description: metaDescription || null,
        imageUrls: ogImage ? [new URL(ogImage, url).toString()] : [],
        price: null,
      },
    ];
  }

  return { url: url.toString(), title, metaDescription, text, products };
}
