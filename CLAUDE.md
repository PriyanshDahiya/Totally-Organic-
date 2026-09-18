# Project: AI Short-Form Content Generator for D2C Brands (v1)

## What this is

A web app modeled on Fastlane (usefastlane.ai), aimed at D2C/Shopify brands instead of apps and SaaS.
A founder enters their website, we build a brand profile, and a "Blitz" swipe feed serves ready-made
short-form posts (text overlays that remix the hook structure of trending posts onto the brand's
angles). Swiping is free; approving a post renders it and spends a credit; approved posts get
scheduled to Instagram/Facebook.

No AI avatars, no synthetic video. Full strategic context (customer, Fastlane feature-by-feature
decisions, roadmap, budget) is in the build plan doc:
https://claude.ai/artifact/Tei8g3ize2FckKgjyVoyMk — read it first for the "why"; this file is the
"how". If the two disagree, the doc wins; flag the conflict instead of guessing.

## Product flow (v1)

1. User signs up and connects their Instagram business account (Meta OAuth) -> `SocialAccount`.
2. Brand profile: user pastes a website or Shopify product URL. One LLM call extracts identity,
   product, customer segments, competitors, 3 content angles (pain points) and tone do's/don'ts.
   Editable, with "refresh from website". Product photos are stored on `Product`.
3. Blitz feed. For each card the backend:
   a. Picks a `TrendingClip` (a stored trending hook + format, not a video to re-post) for the
      brand's niche, plus an angle and one of the two v1 formats.
   b. Calls the LLM to remix that hook structure onto the angle -> overlay text.
   c. Creates a `GenerationJob` (one job = one card). The card preview is composed IN THE BROWSER
      with the Remotion Player (text over a stock/brand clip, or over product photos for
      slideshows). No server render per card.
4. User swipes: approve / reject / edit text / regenerate. Each card shows the trending post it
   remixed and a one-line "why this should work".
5. On approve: create the `VideoAsset`, render the same Remotion composition server-side (or Lambda),
   deduct credits. Text and style edits are free; a credit is spent only when new media is rendered.
6. Approved assets go on a calendar: pick a time or "post now", published via the Meta Graph API.

## v1 formats (only these two)

- **Wall of Text** — big overlay text over a stock clip or the brand's own clip.
- **Slideshow** — carousel/slides from the brand's product photos with text per slide.

Green screen, hook + demo, talking heads, etc. are v2+.

## Data model

Implement the Data model table in the build plan doc 1:1: User, Brand, Product, SocialAccount,
TrendingClip, GenerationJob, VideoAsset, ScheduledPost, SubscriptionEvent. Don't add fields beyond
it without checking against v1 scope; scope creep is this project's biggest risk.

Key implementation notes:
- Failures must be visible: a failed `GenerationJob` shows as a failed card; a failed render shows
  as `VideoAsset.render_status = failed`, never silently dropped.
- `VideoAsset` has two independent statuses: `render_status` (preview/rendering/rendered/failed) and
  `review_status` (pending/approved/rejected).
- Credit balance is a single integer on `User` (`credits_remaining`); no ledger table in v1.
  Deduct with an atomic conditional update (`... WHERE credits_remaining >= cost`) so parallel
  approvals can't overspend. Refund on a failed render.
- `TrendingClip` stores hook_text, format, views and niche tags. We don't download or re-post other
  creators' videos; background visuals come from stock clips or the brand's own media.
- `SocialAccount.access_token` is stored encrypted; track `token_expires_at` and refresh before
  posting.
- `TrendingClip` rows come from a scheduled ingestion job (or a hand-seeded set), never from user
  requests.

## Integration notes (read before writing code against these)

- **Video: Remotion.** One composition per format, used by `@remotion/player` for the free preview
  and by server/Lambda rendering on approve, so the preview and the final render match. Creatomate
  or Shotstack only as a fallback if Remotion rendering proves impractical. Output must meet
  Instagram Reels specs (9:16, H.264/AAC MP4, faststart) and be at a public URL when publishing.
- **Trend-data source** (EnsembleData / Apify / Data365): paid, rate-limited, provider-specific
  shapes. Check current docs; don't guess the schema. Wrap it in `lib/trend-source.ts` so providers
  can be swapped. Start with a hand-picked seed set; don't let this block the pipeline.
- **Meta Graph API:** needs an IG Business/Creator account linked to a FB Page, plus Meta business
  verification and App Review for publish permissions before real users can post. Start these in
  weeks 1-2. Enforce the IG limit of 25 API-published posts per rolling 24h per account.
- **Scheduling** needs a worker (cron/queue, e.g. Supabase pg_cron or a scheduled function) that
  publishes due `ScheduledPost` rows and retries/marks failures.
- **LLM:** two fixed prompts, brand profile and hook remix. Keep them narrow and not user-configurable
  in v1. The only user knobs are angle weights and how often to mention the business.

## Environment variables

```
DATABASE_URL=              # Supabase or Convex
AUTH_SECRET=               # Clerk or Supabase Auth
LEMON_SQUEEZY_API_KEY=     # or PADDLE_API_KEY (merchant of record, India -> global)
ANTHROPIC_API_KEY=         # or OPENAI_API_KEY
TREND_SOURCE_API_KEY=      # EnsembleData / Apify / Data365
REMOTION_AWS_ACCESS_KEY_ID=      # only if rendering on Lambda
REMOTION_AWS_SECRET_ACCESS_KEY=
META_APP_ID=
META_APP_SECRET=
TOKEN_ENCRYPTION_KEY=      # encrypts SocialAccount.access_token
RESEND_API_KEY=
```

## Suggested project structure

```
/app                   # Next.js routes
  /onboarding          # website -> brand profile
  /blitz               # swipe feed
  /calendar            # scheduling
  /settings            # social accounts, billing
/remotion              # compositions: WallOfText, Slideshow
/lib
  /trend-source.ts     # adapter over the trend-data API
  /brand-profile.ts    # LLM call: website -> profile
  /hooks.ts            # LLM call: trending hook + angle -> overlay text
  /render.ts           # Remotion server/Lambda render
  /meta-graph.ts       # OAuth + publishing
  /credits.ts          # atomic deduct/refund
/db
  schema.ts            # entities from the build plan doc
```

## Build order (matches the doc's roadmap)

1. Weeks 1-2: auth + billing skeleton; start Meta business verification + App Review; brand profile
   from a website. Customer conversations run in parallel.
2. Weeks 3-4: hook remix + Remotion compositions for both formats, end to end for ONE hardcoded brand
   (seeded TrendingClips) before any feed UI. Measure cost per render.
3. Week 5: Blitz feed with browser previews, render on approve, credits.
4. Week 6: calendar + Instagram posting via the Graph API.
5. Week 7: closed beta with 10-15 founders; use Rippd as customer zero and compare against Fastlane.
6. Week 8: fix what beta breaks. Week 9+: paid signups.

## What "done" looks like for v1

A D2C founder can go from website URL to a published Instagram post in under 10 minutes without
touching another tool, with no developer help, on a real external account (not just a test account
you control).

## Explicit non-goals (do not implement without discussion)

- TikTok / YouTube Shorts / LinkedIn posting (apply for TikTok's Content Posting API audit early)
- AI avatars, AI influencers, or synthetic video of any kind
- Formats beyond Wall of Text and Slideshow
- Re-posting other creators' trending videos
- Managed or "warmed" accounts (platform ToS risk)
- Multi-user/team accounts
- Analytics beyond basic credit/usage display

@AGENTS.md
