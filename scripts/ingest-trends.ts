// Pulls this week's trending Reels hooks into trending_clips.
// Run: npm run trends:ingest   (weekly; needs TREND_SOURCE_API_KEY = an Apify token)
import { ingestTrends } from "../src/lib/trend-ingest";

ingestTrends()
  .then(({ inserted, tags }) => {
    console.log(`Stored ${inserted} trending hooks across: ${tags.join(", ")}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
