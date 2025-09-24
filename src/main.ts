import { ExporterService } from "./exporter.service";
import Fastify from "fastify";
import { envs } from "./utils/envs";

const fastify = Fastify();
const exporter = new ExporterService();

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

fastify.listen({ port: envs.PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Exporter running at ${address}/metrics`);
});
