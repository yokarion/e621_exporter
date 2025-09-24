import E621, { Post, Tag } from "e621";
import client from "prom-client";
import { envs } from "./utils/envs";
import { sleep } from "./utils/sleep";
import { E621DbExportService } from "./e621-db-export.service";
import { getMemoryUsage } from "./utils/getMemoryUsage";
import { parseFileExtension } from "./utils/file-extensions";
import { parse as parseTldts } from "tldts";

const resolutionBucket = (width: number, height: number) => {
  const maxDim = Math.max(width, height);
  if (maxDim >= 4000) return ">4K+";
  if (maxDim >= 3840) return "4K";
  if (maxDim >= 2000) return "2K";
  if (maxDim >= 1920) return "1080p";
  if (maxDim >= 1280) return "720p";
  if (maxDim >= 854) return "480p";
  if (maxDim >= 640) return "360p";
  if (maxDim >= 426) return "240p";
  if (maxDim >= 256) return "144p";
  return "<144p";
};

export class ExporterService {
  private e621: E621;
  private tagCounter: client.Gauge<string>;
  private artistTotalPostsCounter: client.Gauge<string>;
  private artistPostsScoreCounter: client.Gauge<string>;
  private artistLatestPostScoreCounter: client.Gauge<string>;
  private artistPostsFavCounter: client.Gauge<string>;
  private artistLatestPostFavCounter: client.Gauge<string>;

  private postRatingCounter: client.Gauge<string>;
  private poolsCount: client.Gauge<string>;
  private tagPostCount: client.Gauge<string>;
  private tagAliasCount: client.Gauge<string>;
  private tagImplicationCount: client.Gauge<string>;
  private wikiPageCount: client.Gauge<string>;
  private wikiLockedPages: client.Gauge<string>;

  private postResolutionCounter: client.Gauge<string>;

  private postFileExtensionCounter: client.Gauge<string>;

  private postSourceDomainCounter: client.Gauge<string>;

  constructor(private readonly e621DbExportService: E621DbExportService) {
    this.e621 = new E621({ userAgent: envs.SCRAPE_USER_AGENT });

    this.tagCounter = new client.Gauge({
      name: "e621_post_count_tags",
      help: "Total number of posts tagged with a specific tag",
      labelNames: ["tag"],
    });

    this.artistTotalPostsCounter = new client.Gauge({
      name: "e621_posts_by_artist_total",
      help: "Total number of posts made by a specific artist",
      labelNames: ["artist"],
    });

    this.artistPostsScoreCounter = new client.Gauge({
      name: "e621_artist_posts_score",
      help: "Score of an individual post by an artist",
      labelNames: ["artist", "post_id"],
    });

    this.artistLatestPostScoreCounter = new client.Gauge({
      name: "e621_latest_post_score",
      help: "Score of the most recent post by an artist",
      labelNames: ["artist", "post_id"],
    });

    this.artistPostsFavCounter = new client.Gauge({
      name: "e621_artist_posts_fav",
      help: "Favorite count of an individual post by an artist",
      labelNames: ["artist", "post_id"],
    });

    this.artistLatestPostFavCounter = new client.Gauge({
      name: "e621_latest_post_fav",
      help: "Favorite count of the most recent post by an artist",
      labelNames: ["artist", "post_id"],
    });

    this.postRatingCounter = new client.Gauge({
      name: "e621_posts_by_rating_total",
      help: "Total posts by rating",
      labelNames: ["rating"],
    });

    this.poolsCount = new client.Gauge({
      name: "e621_pools_total",
      help: "Total number of pools",
    });
    this.tagPostCount = new client.Gauge({
      name: "e621_tag_post_count",
      help: "Post count per tag",
      labelNames: ["tag"],
    });
    this.tagAliasCount = new client.Gauge({
      name: "e621_tag_alias_count",
      help: "Number of active tag aliases",
    });
    this.tagImplicationCount = new client.Gauge({
      name: "e621_tag_implication_count",
      help: "Number of active tag implications",
    });
    this.wikiPageCount = new client.Gauge({
      name: "e621_wiki_pages_total",
      help: "Total number of wiki pages",
    });
    this.wikiLockedPages = new client.Gauge({
      name: "e621_wiki_locked_pages_total",
      help: "Number of locked wiki pages",
    });

    this.postResolutionCounter = new client.Gauge({
      name: "e621_post_resolution_total",
      help: "Number of posts by resolution bucket and type",
      labelNames: ["resolution", "isGif", "isVideo", "isImage", "isFlash"],
    });

    this.postFileExtensionCounter = new client.Gauge({
      name: "e621_posts_by_file_extension_total",
      help: "Number of posts per file extension",
      labelNames: ["extension"],
    });

    this.postSourceDomainCounter = new client.Gauge({
      name: "e621_posts_by_source_domain_total",
      help: "Number of posts per source domain",
      labelNames: ["domain"],
    });
  }

  async performScrape(): Promise<void> {
    const tasks: { fn: () => Promise<void>; name: string }[] = [
      {
        fn: () => this.extractDataFromDbExport(),
        name: "extractDataFromDbExport",
      },
      { fn: () => this.scrapePopularTags(), name: "scrapePopularTags" },
      {
        fn: () => this.scrapeMonitoredArtists(),
        name: "scrapeMonitoredArtists",
      },
    ];

    for (const task of tasks) {
      try {
        console.log(`Running task ${task.name}`);
        await task.fn();
      } catch (err) {
        console.error(`Failed to run ${task.name}:`, err);
      }
      await sleep(1000);
    }

    const memoryUsage = getMemoryUsage();
    console.log("Current memory usage:", memoryUsage.rss);
    console.log("Scrape tasks performed!");
  }

  async extractDataFromDbExport(): Promise<void> {
    await this.e621DbExportService.download();

    // POSTS
    const fileExtCounts: Record<string, number> = {};
    const sourceDomainCounts: Record<string, number> = {};
    const ratingCounts: Record<string, number> = {};
    let totalFavs = 0;

    await this.e621DbExportService.streamPosts((post) => {
      const rating =
        post.rating === "e" || post.rating === "q" || post.rating === "s"
          ? post.rating
          : "unknown";

      ratingCounts[rating] = (ratingCounts[rating] || 0) + 1;

      const favs = Number(post.fav_count) || 0;
      totalFavs += favs;

      const ext = parseFileExtension(post.file_ext);

      const width = Number(post.image_width) || 0;
      const height = Number(post.image_height) || 0;
      const resolution = resolutionBucket(width, height);

      const isGif = ext.extension === "gif" ? "true" : "false";
      const isImage = ext.category === "image" ? "true" : "false";
      const isFlash = ext.category === "flash" ? "true" : "false";
      const isVideo = ext.category === "video" ? "true" : "false";

      this.postResolutionCounter.inc({
        resolution,
        isGif,
        isVideo,
        isImage,
        isFlash,
      });

      fileExtCounts[ext.extension] = (fileExtCounts[ext.extension] || 0) + 1;

      let domain = "unknown";
      if (post.source) {
        try {
          const hostname = new URL(post.source).hostname;
          const parsed = parseTldts(hostname);
          domain = parsed.domain || "invalid";
        } catch {
          domain = "invalid";
        }
      }

      sourceDomainCounts[domain] = (sourceDomainCounts[domain] || 0) + 1;
    });

    for (const [ext, count] of Object.entries(fileExtCounts)) {
      this.postFileExtensionCounter.set({ extension: ext }, count);
    }

    for (const [domain, count] of Object.entries(sourceDomainCounts)) {
      if (count >= envs.CONSIDER_SOURCE_THRESHOLD && !Number.isNaN(count)) {
        this.postSourceDomainCounter.set({ domain }, count);
      }
    }

    for (const [rating, count] of Object.entries(ratingCounts))
      this.postRatingCounter.set({ rating }, count);

    // POOLS
    let totalPools = 0;
    await this.e621DbExportService.streamPools((pool) => {
      totalPools++;
    });
    this.poolsCount.set(totalPools);

    // TAGS
    await this.e621DbExportService.streamTags((tag) => {
      const postCount = Number(tag.post_count);

      if (
        postCount >= envs.CONSIDER_TAGS_THRESHOLD &&
        !Number.isNaN(postCount)
      ) {
        this.tagPostCount.set({ tag: tag.name }, postCount);
      }
    });

    // TAG ALIASES
    let activeAliases = 0;
    await this.e621DbExportService.streamTagAliases((alias) => {
      if (alias.status === "active") activeAliases++;
    });
    this.tagAliasCount.set(activeAliases);

    // TAG IMPLICATIONS
    let activeImplications = 0;
    await this.e621DbExportService.streamTagImplications((impl) => {
      if (impl.status === "active") activeImplications++;
    });
    this.tagImplicationCount.set(activeImplications);

    // WIKI PAGES
    let wikiTotal = 0;
    let wikiLocked = 0;
    await this.e621DbExportService.streamWikiPages((page) => {
      wikiTotal++;
      if (page.is_locked) wikiLocked++;
    });
    this.wikiPageCount.set(wikiTotal);
    this.wikiLockedPages.set(wikiLocked);

    console.log("[E621DbExportService] DB export metrics updated!");
  }

  // The rest of your methods scrapePopularTags, scrapeMonitoredArtists, getMetrics remain unchanged
  async scrapeMonitoredArtists(): Promise<void> {
    if (!envs.MONITORED_ARTISTS || envs.MONITORED_ARTISTS.length === 0) {
      console.warn("No authors to monitor");
      return;
    }

    for (const artist of envs.MONITORED_ARTISTS) {
      let foundPosts: Post[] = [];
      for (let i = 0; i < envs.PAGES_TO_SCAN; i++) {
        try {
          const postsOnPage = await this.e621.posts.search({
            tags: artist,
            limit: envs.ITEMS_PER_PAGE,
            page: i,
          });

          if (postsOnPage.length === 0) {
            break;
          }

          foundPosts = foundPosts.concat(postsOnPage);
        } catch (err) {
          console.error("Failed to search for tags");
        }

        await sleep(300);
      }

      this.artistTotalPostsCounter.set({ artist }, foundPosts.length);

      for (const post of foundPosts) {
        this.artistPostsScoreCounter.set(
          { artist, post_id: post.id.toString() },
          post.score.total,
        );
        this.artistPostsFavCounter.set(
          { artist, post_id: post.id.toString() },
          post.fav_count,
        );
      }

      if (foundPosts.length !== 0) {
        const latestPost = foundPosts.reduce((a, b) =>
          new Date(a.created_at) > new Date(b.created_at) ? a : b,
        );

        this.artistLatestPostScoreCounter.set(
          { artist, post_id: latestPost.id.toString() },
          latestPost.score.total,
        );
        this.artistLatestPostFavCounter.set(
          { artist, post_id: latestPost.id.toString() },
          latestPost.fav_count,
        );
      }
    }
  }

  async scrapePopularTags(): Promise<void> {
    let foundTags: Tag[] = [];
    for (let i = 0; i < envs.PAGES_TO_SCAN; i++) {
      try {
        const tagsOnPage = await this.e621.tags.search({
          category: 0,
          limit: envs.ITEMS_PER_PAGE,
          page: i,
          order: "count",
        });

        foundTags = foundTags.concat(tagsOnPage);
        await sleep(300);
      } catch (err) {
        console.error("Failed to search for tags");
      }
    }

    foundTags.forEach((tag) => {
      this.tagCounter.set({ tag: tag.name }, tag.post_count);
    });
  }

  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }
}
