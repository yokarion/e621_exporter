import "dotenv/config";

export const envs = {
  PORT: Number.parseInt(process.env.PORT || "8000"),
  ITEMS_PER_PAGE: Number.parseInt(process.env.ITEMS_PER_PAGE || "10"),
  PAGES_TO_SCAN: Number.parseInt(process.env.PAGES_TO_SCAN || "3"),
  SCRAPE_INTERVAL_SECONDS: Number.parseInt(
    process.env.SCRAPE_INTERVAL_SECONDS || "60",
  ),
  SCRAPE_USER_AGENT: String(
    process.env.SCRAPE_USER_AGENT || "prometheus-e621-exporter/1.0",
  ),
  CONSIDER_TAGS_THRESHOLD: Number.parseInt(process.env.CONSIDER_TAGS_THRESHOLD),
  CONSIDER_SOURCE_THRESHOLD: Number.parseInt(
    process.env.CONSIDER_SOURCE_THRESHOLD,
  ),
  MONITORED_ARTISTS:
    process.env.MONITORED_ARTISTS?.split(",").map((a) => a.trim()) || [],
};
