import { ExporterService } from "./exporter.service";
import Fastify from "fastify";
import { envs } from "./utils/envs";
import { E621DbExportService } from "./e621-db-export.service";

const fastify = Fastify();
const e621DbExport = new E621DbExportService();
const exporter = new ExporterService(e621DbExport);

const SCRAPE_INTERVAL = envs.SCRAPE_INTERVAL_SECONDS * 1000;

// Scrape once immediately
let isScrapeInProgress = true;
exporter
  .performScrape()
  .finally(() => (isScrapeInProgress = false))
  .catch((err) => console.error("Initial scrape failed:", err));

// Background scrape loop
setInterval(async () => {
  if (isScrapeInProgress) {
    console.warn("Scrape not called because previous call not ended");
    return;
  }

  isScrapeInProgress = true;
  try {
    await exporter.performScrape();
  } catch (err) {
    console.error("Scrape failed:", err);
  }
  isScrapeInProgress = false;
}, SCRAPE_INTERVAL);

fastify.get("/metrics", async (request, reply) => {
  reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return exporter.getMetrics();
});

fastify.listen({ port: envs.PORT, host: "::" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Exporter running at ${address}/metrics`);
});
