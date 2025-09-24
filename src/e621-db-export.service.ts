import fs from "fs";
import path from "path";
import https from "https";
import zlib from "zlib";
import { pipeline } from "stream";
import { promisify } from "util";
import { envs } from "./utils/envs";

import { parse } from "csv-parse";
import {
  Pool,
  Post,
  Tag,
  TagAlias,
  TagImplication,
  WikiPage,
} from "./types/e621DbExport";

const pipelineAsync = promisify(pipeline);

export class E621DbExportService {
  private cacheDir: string;
  private dbExportUrl: string;

  constructor(
    cacheDir = "./cache_data",
    dbExportUrl = "https://e621.net/db_export/",
  ) {
    this.cacheDir = path.resolve(cacheDir);
    this.dbExportUrl = dbExportUrl;

    if (!fs.existsSync(this.cacheDir))
      fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  private async fetchHTML(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https
        .get(
          url,
          { headers: { "User-Agent": envs.SCRAPE_USER_AGENT } },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve(data));
          },
        )
        .on("error", reject);
    });
  }

  private async getFileSize(url: string): Promise<number | null> {
    return new Promise((resolve, reject) => {
      https
        .request(
          url,
          { method: "HEAD", headers: { "User-Agent": envs.SCRAPE_USER_AGENT } },
          (res) => {
            const length = res.headers["content-length"];
            resolve(length ? parseInt(length, 10) : null);
          },
        )
        .on("error", reject)
        .end();
    });
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    if (fs.existsSync(dest)) {
      console.log("[E621DbExportService] File already downloaded");
      return;
    }

    const size = await this.getFileSize(url);
    if (size)
      console.log(
        `Downloading file: ${url} (${(size / 1024 / 1024).toFixed(2)} MB)`,
      );

    const fileStream = fs.createWriteStream(dest);
    return new Promise((resolve, reject) => {
      https
        .get(
          url,
          { headers: { "User-Agent": envs.SCRAPE_USER_AGENT } },
          (res) => {
            res.pipe(fileStream);
            fileStream.on("finish", () =>
              fileStream.close((err) => (err ? reject(err) : resolve())),
            );
          },
        )
        .on("error", (err) => {
          fs.unlinkSync(dest);
          reject(err);
        });
    });
  }

  private async extractGz(filePath: string): Promise<void> {
    const outPath = filePath.replace(/\.gz$/, "");
    if (fs.existsSync(outPath)) return;

    try {
      await pipelineAsync(
        fs.createReadStream(filePath),
        zlib.createGunzip(),
        fs.createWriteStream(outPath),
      );
    } catch (err) {
      if ((err as any).code === "Z_BUF_ERROR") {
        console.warn(
          `[E621DbExportService] Corrupted file detected: ${filePath}, redownloading...`,
        );
        fs.unlinkSync(filePath);
        await this.downloadFile(
          this.dbExportUrl + path.basename(filePath),
          filePath,
        );
        await this.extractGz(filePath); // retry
      } else {
        throw err;
      }
    }
  }
  private async getLatestFiles(): Promise<string[]> {
    console.log("[E621DbExportService] Getting latest files from list");
    const html = await this.fetchHTML(this.dbExportUrl);
    const regex = /href="([^"]+\.csv\.gz)"/g;
    const files: string[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      files.push(match[1]);
    }

    const latestMap = new Map<string, string>();
    for (const file of files) {
      const type = file.split("-")[0];
      const datePart = file.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      if (!datePart) continue;
      if (
        !latestMap.has(type) ||
        datePart > latestMap.get(type)!.match(/\d{4}-\d{2}-\d{2}/)![0]
      ) {
        latestMap.set(type, file);
      }
    }

    return Array.from(latestMap.values());
  }

  private getLatestFileByPrefix(prefix: string): string {
    const files = fs
      .readdirSync(this.cacheDir)
      .filter((f) => f.startsWith(prefix) && !f.endsWith(".gz"));
    if (files.length === 0)
      throw new Error(`No ${prefix} files found in cache`);
    files.sort((a, b) => (a > b ? -1 : 1)); // descending by name (date)
    return files[0];
  }

  private async readCsvFile<T>(fileName: string): Promise<T[]> {
    const filePath = path.join(this.cacheDir, fileName);
    if (!fs.existsSync(filePath))
      throw new Error(`File not found: ${filePath}`);

    return new Promise((resolve, reject) => {
      const results: T[] = [];
      fs.createReadStream(filePath)
        .pipe(
          parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
          }),
        )
        .on("data", (row) => results.push(row))
        .on("error", reject)
        .on("end", () => resolve(results));
    });
  }

  public async download(): Promise<void> {
    const latestFiles = await this.getLatestFiles();
    for (const file of latestFiles) {
      const url = this.dbExportUrl + file;
      const dest = path.join(this.cacheDir, file);
      console.log("[E621DbExportService] Downloading:", file);
      await this.downloadFile(url, dest);
      console.log("[E621DbExportService] Extracting:", file);
      await this.extractGz(dest);
    }
    console.log("All latest files downloaded and extracted.");
  }

  public get(): string[] {
    return fs.readdirSync(this.cacheDir).filter((f) => !f.endsWith(".gz"));
  }

  public async getPosts(): Promise<Post[]> {
    const latestFile = this.getLatestFileByPrefix("posts");
    return this.readCsvFile<Post>(latestFile);
  }

  public async getPools(): Promise<Pool[]> {
    const latestFile = this.getLatestFileByPrefix("pools");
    return this.readCsvFile<Pool>(latestFile);
  }

  public async getTagAliases(): Promise<TagAlias[]> {
    const latestFile = this.getLatestFileByPrefix("tag_aliases");
    return this.readCsvFile<TagAlias>(latestFile);
  }

  public async getTagImplications(): Promise<TagImplication[]> {
    const latestFile = this.getLatestFileByPrefix("tag_implications");
    return this.readCsvFile<TagImplication>(latestFile);
  }

  public async getTags(): Promise<Tag[]> {
    const latestFile = this.getLatestFileByPrefix("tags");
    return this.readCsvFile<Tag>(latestFile);
  }

  public async getWikiPages(): Promise<WikiPage[]> {
    const latestFile = this.getLatestFileByPrefix("wiki_pages");
    return this.readCsvFile<WikiPage>(latestFile);
  }
}
