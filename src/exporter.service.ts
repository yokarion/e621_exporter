import E621, { Post, Tag } from "e621";
import client from "prom-client";
import { envs } from "./utils/envs";
import { sleep } from "./utils/sleep";
import { E621DbExportService } from "./e621-db-export.service";

import {
  Post as DbExportPost,
  Pool,
  Tag as DbExportTag,
  TagAlias,
  TagImplication,
  WikiPage,
} from "./types/e621DbExport";
import { getMemoryUsage } from "./utils/getMemoryUsage";

export class ExporterService {
  private e621: E621;
  private tagCounter: client.Gauge<string>;
  private artistTotalPostsCounter: client.Gauge<string>;
  private artistPostsScoreCounter: client.Gauge<string>;
  private artistLatestPostScoreCounter: client.Gauge<string>;
  private artistPostsFavCounter: client.Gauge<string>;
  private artistLatestPostFavCounter: client.Gauge<string>;

  // from dbExport
  private postRatingCounter: client.Gauge<string>;
  private uploaderTotalPosts: client.Gauge<string>;
  private postDimensions: client.Gauge<string>;
  private postFavorites: client.Gauge<string>;
  private poolsCount: client.Gauge<string>;
  private poolPostCount: client.Gauge<string>;
  private tagPostCount: client.Gauge<string>;
  private tagAliasCount: client.Gauge<string>;
  private tagImplicationCount: client.Gauge<string>;
  private wikiPageCount: client.Gauge<string>;
  private wikiLockedPages: client.Gauge<string>;

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

    // from dbExport
    this.postRatingCounter = new client.Gauge({
      name: "e621_posts_by_rating_total",
      help: "Total posts by rating",
      labelNames: ["rating"],
    });

    this.uploaderTotalPosts = new client.Gauge({
      name: "e621_posts_by_uploader_total",
      help: "Total posts per uploader",
      labelNames: ["uploader_id"],
    });

    this.postDimensions = new client.Gauge({
      name: "e621_post_dimensions",
      help: "Width and height of posts",
      labelNames: ["post_id", "dimension"],
    });

    this.postFavorites = new client.Gauge({
      name: "e621_post_favorites",
      help: "Favorite count per post",
      labelNames: ["post_id"],
    });

    this.poolsCount = new client.Gauge({
      name: "e621_pools_total",
      help: "Total number of pools",
    });

    this.poolPostCount = new client.Gauge({
      name: "e621_pool_post_count",
      help: "Number of posts in a pool",
      labelNames: ["pool_id"],
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
  }

  async performScrape(): Promise<void> {
    const tasks: { fn: () => Promise<void>; name: string }[] = [
      { fn: () => this.scrapePopularTags(), name: "scrapePopularTags" },
      {
        fn: () => this.scrapeMonitoredArtists(),
        name: "scrapeMonitoredArtists",
      },
      {
        fn: () => this.extractDataFromDbExport(),
        name: "extractDataFromDbExport",
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
    const posts: DbExportPost[] = await this.e621DbExportService.getPosts();
    const ratingCounts: Record<string, number> = {};
    const uploaderCounts: Map<string, number> = new Map();

    for (const post of posts) {
      // Rating counts
      ratingCounts[post.rating] = (ratingCounts[post.rating] || 0) + 1;

      // Uploader post counts
      const uploaderId = post.uploader_id.toString();
      uploaderCounts.set(uploaderId, (uploaderCounts.get(uploaderId) || 0) + 1);

      // Dimensions and favorites
      this.postDimensions.set(
        { post_id: post.id.toString(), dimension: "width" },
        post.image_width,
      );
      this.postDimensions.set(
        { post_id: post.id.toString(), dimension: "height" },
        post.image_height,
      );
      this.postFavorites.set({ post_id: post.id.toString() }, post.fav_count);
    }

    // Set rating counters
    for (const [rating, count] of Object.entries(ratingCounts)) {
      this.postRatingCounter.set({ rating }, count);
    }

    // Set uploader counters
    for (const [uploaderId, count] of uploaderCounts) {
      this.uploaderTotalPosts.set({ uploader_id: uploaderId }, count);
    }

    // POOLS
    const pools: Pool[] = await this.e621DbExportService.getPools();
    this.poolsCount.set(pools.length);
    for (const pool of pools) {
      const count = pool.post_ids ? pool.post_ids.split(",").length : 0;
      this.poolPostCount.set({ pool_id: pool.id.toString() }, count);
    }

    // TAGS
    const tags: DbExportTag[] = await this.e621DbExportService.getTags();
    for (const tag of tags) {
      this.tagPostCount.set({ tag: tag.name }, tag.post_count);
    }

    // TAG ALIASES
    const tagAliases: TagAlias[] =
      await this.e621DbExportService.getTagAliases();
    this.tagAliasCount.set(
      tagAliases.filter((a) => a.status === "active").length,
    );

    // TAG IMPLICATIONS
    const tagImplications: TagImplication[] =
      await this.e621DbExportService.getTagImplications();
    this.tagImplicationCount.set(
      tagImplications.filter((i) => i.status === "active").length,
    );

    // WIKI PAGES
    const wikiPages: WikiPage[] = await this.e621DbExportService.getWikiPages();
    this.wikiPageCount.set(wikiPages.length);
    this.wikiLockedPages.set(wikiPages.filter((p) => p.is_locked).length);
  }

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
