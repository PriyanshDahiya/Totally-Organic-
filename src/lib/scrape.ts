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
  // Too little readable copy to profile from (e.g. a JavaScript-only site).
  thin: boolean;
};

// Page copy sent to the LLM. ~3k tokens: Groq's free tier caps a minute at
// 8k tokens (input + output), and the top of a homepage says the most anyway.
const MAX_TEXT_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 10_000;
// Below this much readable copy the LLM is mostly guessing from the title.
const THIN_TEXT_CHARS = 400;

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

function formatPrice(amount: string | undefined, currency: string | null) {
  if (!amount) return null;
  if (!currency) return amount;
  const n = Number(amount);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    return `${amount} ${currency}`;
  }
}

function fromShopify(origin: string, p: ShopifyProduct, currency: string | null): ScrapedProduct {
  return {
    name: p.title,
    url: `${origin}/products/${p.handle}`,
    description: p.body_html ? cheerio.load(p.body_html).text().trim() : null,
    imageUrls: p.images.map((i) => i.src).slice(0, 8),
    price: formatPrice(p.variants[0]?.price, currency),
  };
}

// Most Shopify stores expose public JSON: /products/<handle>.json for one
// product and /products.json for the catalog. Non-Shopify sites just 404.
async function scrapeShopify(url: URL): Promise<ScrapedProduct[]> {
  const productMatch = url.pathname.match(/\/products\/([^/?#]+)/);
  // Catalog prices are bare numbers; the store currency lives in /meta.json.
  const currency = await get(`${url.origin}/meta.json`)
    .then((r) => (r.ok ? (r.json() as Promise<{ currency?: string }>) : null))
    .then((m) => m?.currency ?? null)
    .catch(() => null);
  try {
    if (productMatch) {
      const res = await get(`${url.origin}/products/${productMatch[1]}.json`);
      if (res.ok) {
        const { product } = (await res.json()) as { product: ShopifyProduct };
        return [fromShopify(url.origin, product, currency)];
      }
    }
    const res = await get(`${url.origin}/products.json?limit=10`);
    if (!res.ok) return [];
    const { products } = (await res.json()) as { products: ShopifyProduct[] };
    return products.filter((p) => !isAddOn(p)).map((p) => fromShopify(url.origin, p, currency));
  } catch {
    return [];
  }
}

async function loadPage(url: URL) {
  const res = await get(url.toString()).catch(() => null);
  if (!res?.ok) throw new Error(`Couldn't load ${url.hostname} (${res?.status ?? "no response"}).`);
  const $ = cheerio.load(await res.text());
  const bodyText = () => clean($("body").clone().find("script, style, noscript").remove().end().text());
  return { $, bodyText };
}

export async function scrapeSite(rawUrl: string): Promise<ScrapedSite> {
  const entered = await assertPublicUrl(rawUrl);
  let url = entered;
  let page = await loadPage(url);

  // Some stores serve a JavaScript redirect on the bare domain (gymshark.com
  // -> www.gymshark.com), which a plain fetch can't follow.
  if (page.bodyText().length < THIN_TEXT_CHARS && !url.hostname.startsWith("www.")) {
    const www = await assertPublicUrl(`${url.protocol}//www.${url.hostname}${url.pathname}${url.search}`).catch(() => null);
    const alt = www && (await loadPage(www).catch(() => null));
    if (www && alt && alt.bodyText().length > page.bodyText().length) [url, page] = [www, alt];
  }
  const { $ } = page;

  const ogImage = $('meta[property="og:image"]').attr("content") ?? null;
  const title = clean($("title").first().text());
  const metaDescription = clean(
    $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "",
  );
  const structured = structuredDescriptions($);
  const productLinks = findProductLinks($, url);

  // Nav, footer and announcement bars repeat on every page and crowd out the
  // copy that says what the brand is.
  $("script, style, noscript, svg, iframe, header, nav, footer, [class*='announcement']").remove();
  const body = clean($("body").text());
  const text = [...structured, body].filter(Boolean).join("\n").slice(0, MAX_TEXT_CHARS);

  let products = await scrapeShopify(url);
  // Headless stores keep the Shopify catalog on the domain we were redirected away from.
  if (products.length === 0 && url !== entered) products = await scrapeShopify(entered);
  // Not Shopify: read schema.org Product data from this page or the product pages it links to.
  if (products.length === 0) {
    const here = productFromPage($, url);
    products = here ? [here] : await scrapeLinkedProducts(productLinks);
  }
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

  return { url: url.toString(), title, metaDescription, text, products, thin: body.length < THIN_TEXT_CHARS };
}

const MAX_LINKED_PRODUCTS = 6;

function findProductLinks($: cheerio.CheerioAPI, base: URL): URL[] {
  const seen = new Map<string, URL>();
  $("a[href]").each((_, el) => {
    try {
      const link = new URL($(el).attr("href")!, base);
      if (link.hostname === base.hostname && /\/products?\/[^/]+/.test(link.pathname)) {
        link.search = "";
        link.hash = "";
        seen.set(link.pathname, link);
      }
    } catch {
      // Unparseable href.
    }
  });
  return [...seen.values()].slice(0, MAX_LINKED_PRODUCTS);
}

async function scrapeLinkedProducts(links: URL[]): Promise<ScrapedProduct[]> {
  const pages = await Promise.all(
    links.map(async (link) => {
      try {
        const res = await get((await assertPublicUrl(link.toString())).toString());
        return res.ok ? productFromPage(cheerio.load(await res.text()), link) : null;
      } catch {
        return null;
      }
    }),
  );
  return pages.filter((p): p is ScrapedProduct => p !== null);
}

type LdProduct = {
  "@type"?: string | string[];
  name?: string;
  description?: string;
  image?: unknown;
  offers?: unknown;
};

// schema.org Product from JSON-LD, the one product format most non-Shopify
// stores share (it drives Google Shopping results).
function productFromPage($: cheerio.CheerioAPI, url: URL): ScrapedProduct | null {
  let found: LdProduct | null = null;
  const visit = (node: unknown) => {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const type = (node as LdProduct)["@type"];
    if ((Array.isArray(type) ? type : [type]).includes("Product") && (node as LdProduct).name) {
      found = node as LdProduct;
      return;
    }
    Object.values(node).forEach(visit);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      // Malformed JSON-LD is common; skip it.
    }
  });
  const product = found as LdProduct | null;
  if (!product?.name) return null;

  const images = (Array.isArray(product.image) ? product.image : [product.image])
    .map((i) => (typeof i === "string" ? i : (i as { url?: string } | null)?.url))
    .filter((i): i is string => Boolean(i))
    .map((i) => new URL(i, url).toString());
  const offer = (Array.isArray(product.offers) ? product.offers[0] : product.offers) as
    | { price?: string | number; lowPrice?: string | number; priceCurrency?: string }
    | undefined;
  const amount = offer?.price ?? offer?.lowPrice;

  return {
    name: clean(product.name),
    url: url.toString(),
    description: product.description ? clean(product.description) : null,
    imageUrls: images.slice(0, 8),
    price: formatPrice(amount === undefined ? undefined : String(amount), offer?.priceCurrency ?? null),
  };
}

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

// JavaScript-rendered sites often have an empty <body> in the raw HTML but
// still ship schema.org JSON-LD for search engines; its descriptions are the
// best copy we can get without a headless browser.
function structuredDescriptions($: cheerio.CheerioAPI): string[] {
  const found = new Set<string>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const { name, description } = node as { name?: unknown; description?: unknown };
    if (typeof description === "string" && description.trim()) {
      found.add(clean(typeof name === "string" ? `${name}: ${description}` : description));
    }
    Object.values(node).forEach(visit);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      // Malformed JSON-LD is common; skip it.
    }
  });
  return [...found].slice(0, 10);
}
