import { ExporterService } from "./exporter.service";
import Fastify from "fastify";
import { envs } from "./utils/envs";
import { E621DbExportService } from "./e621-db-export.service";
import { FastifyLogger } from "./utils/fastifyLogger";

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname,time",
        translateTime: true,
      },
    },
  },
  disableRequestLogging: true,
});
const mainLogger = new FastifyLogger("main.ts", fastify);

const e621DbExport = new E621DbExportService(
  new FastifyLogger(E621DbExportService.name, fastify),
);
const exporter = new ExporterService(
  e621DbExport,
  new FastifyLogger(ExporterService.name, fastify),
);

const SCRAPE_INTERVAL = envs.SCRAPE_INTERVAL_SECONDS * 1000;

// Scrape once immediately
let isScrapeInProgress = true;
exporter
  .performScrape()
  .finally(() => (isScrapeInProgress = false))
  .catch((err) => fastify.log.error(`Initial scrape failed. ${err?.message}`));

// Background scrape loop
setInterval(async () => {
  if (isScrapeInProgress) {
    mainLogger.warn("Scrape not called because previous call not ended");
    return;
  }

  isScrapeInProgress = true;
  try {
    await exporter.performScrape();
  } catch (err) {
    mainLogger.error(`Scrape failed: ${err?.message}`);
  }
  isScrapeInProgress = false;
}, SCRAPE_INTERVAL);

fastify.get("/metrics", async (request, reply) => {
  reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return exporter.getMetrics();
});

fastify.listen({ port: envs.PORT, host: "::" }, (err, address) => {
  if (err) {
    mainLogger.error(err?.toString());
    process.exit(1);
  }
  mainLogger.log(`Exporter running at ${address}/metrics`);
});
