import E621, { Post, Tag } from "e621";
import client from "prom-client";
import { envs } from "./utils/envs";
import { sleep } from "./utils/sleep";

export class ExporterService {
  private e621: E621;
  private tagCounter: client.Gauge<string>;
  private artistTotalPostsCounter: client.Gauge<string>;
  private artistPostsScoreCounter: client.Gauge<string>;
  private artistLatestPostScoreCounter: client.Gauge<string>;
  private artistPostsFavCounter: client.Gauge<string>;
  private artistLatestPostFavCounter: client.Gauge<string>;

  constructor() {
    this.e621 = new E621({ userAgent: envs.SCRAPE_USER_AGENT });

    this.tagCounter = new client.Gauge({
      name: "e621_post_count_tags",
      help: "Number of posts per tag",
      labelNames: ["tag"],
    });

    this.artistTotalPostsCounter = new client.Gauge({
      name: "e621_posts_by_artist_total",
      help: "Number of posts per artist",
      labelNames: ["artist"],
    });

    this.artistPostsScoreCounter = new client.Gauge({
      name: "e621_artist_posts_score",
      help: "Score per artist posts",
      labelNames: ["artist", "post_id"],
    });

    this.artistLatestPostScoreCounter = new client.Gauge({
      name: "e621_latest_post_score",
      help: "Score per artist latest post",
      labelNames: ["artist", "post_id"],
    });

    this.artistPostsFavCounter = new client.Gauge({
      name: "e621_artist_posts_fav",
      help: "fav_count per artist posts",
      labelNames: ["artist", "post_id"],
    });

    this.artistLatestPostFavCounter = new client.Gauge({
      name: "e621_latest_post_fav",
      help: "fav_count per artist latest post",
      labelNames: ["artist", "post_id"],
    });
  }

  async performScrape(): Promise<void> {
    const tasks: { fn: () => Promise<void>; name: string }[] = [
      { fn: () => this.scrapePopularTags(), name: "scrapePopularTags" },
      {
        fn: () => this.scrapeMonitoredArtists(),
        name: "scrapeMonitoredArtists",
      },
    ];

    for (const task of tasks) {
      try {
        await task.fn();
      } catch (err) {
        console.error(`Failed to run ${task.name}:`, err);
      }

      await sleep(1000);
    }

    console.log("Scrape tasks performed!");
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
        this.artistLatestPostScoreCounter.set(
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
