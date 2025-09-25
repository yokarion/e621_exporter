import fs from "fs";
import path from "path";
import https from "https";
import zlib from "zlib";
import { pipeline } from "stream";
import { promisify } from "util";
import { envs } from "./utils/envs";
import {
  Pool,
  Post,
  Tag,
  TagAlias,
  TagImplication,
  WikiPage,
} from "./types/e621DbExport";
import { estimateFileRows } from "./utils/estimateFileRows";
import { Logger } from "./types/logger";

const pipelineAsync = promisify(pipeline);

export class E621DbExportService {
  private cacheDir: string;
  private dbExportUrl: string;

  constructor(
    private readonly logger: Logger,
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
    if (fs.existsSync(dest)) return;
    const size = await this.getFileSize(url);
    if (size)
      this.logger.log(
        `Downloading file: ${url} (${(size / 1024 / 1024).toFixed(2)} MB)`,
      );

    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(dest);
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
    } catch (err: any) {
      if (err.code === "Z_BUF_ERROR") {
        this.logger.warn(`Corrupted file: ${filePath}, redownloading...`);
        fs.unlinkSync(filePath);
        await this.downloadFile(
          this.dbExportUrl + path.basename(filePath),
          filePath,
        );
        await this.extractGz(filePath);
      } else {
        throw err;
      }
    }
  }

  public async getLatestFiles(): Promise<string[]> {
    const html = await this.fetchHTML(this.dbExportUrl);
    const regex = /href="([^"]+\.csv\.gz)"/g;
    const files: string[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) files.push(match[1]);

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
    files.sort((a, b) => (a > b ? -1 : 1));
    return files[0];
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          result.push(field);
          field = "";
        } else {
          field += char;
        }
      }
    }

    result.push(field);
    return result;
  }

  private async streamCsv<T>(
    fileName: string,
    callback: (row: T) => void,
    progressInterval = 1_000_000,
  ) {
    const filePath = path.join(this.cacheDir, fileName);
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    let buffer = "";
    let rowCount = 0;

    this.logger.log("streamCsv estimating total rows...");
    const totalRows = await estimateFileRows(filePath, 10000);
    this.logger.log(`streamCsv estimated rows: ${totalRows}`);

    let headers: string[] | null = null;

    return new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk) => {
        buffer += chunk;
        let lineEnd: number;

        while ((lineEnd = buffer.indexOf("\n")) >= 0) {
          let line = buffer.slice(0, lineEnd);
          buffer = buffer.slice(lineEnd + 1);

          // Remove trailing \r
          if (line.endsWith("\r")) line = line.slice(0, -1);

          // Parse header
          if (!headers) {
            headers = this.parseCsvLine(line);
            continue;
          }

          // Parse row
          const fields = this.parseCsvLine(line);
          if (fields.length === 0) continue;

          const row: any = {};
          for (let i = 0; i < headers.length; i++) {
            row[headers[i]] = fields[i] ?? "";
          }

          // Normalize description
          if (row.description)
            row.description = row.description.replace(/\r?\n/g, " ");

          rowCount++;
          if (rowCount % progressInterval === 0 || rowCount === totalRows) {
            const percent = ((rowCount / totalRows) * 100).toFixed(2);
            this.logger.log(
              `streamCsv Processed ${rowCount.toLocaleString()} / ${totalRows.toLocaleString()} rows (${percent}%)`,
            );
          }

          try {
            callback(row);
          } catch (err) {
            this.logger.warn("Error processing row:", err);
          }
        }
      });

      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
  }
  public async download(): Promise<void> {
    const latestFiles = await this.getLatestFiles();
    for (const file of latestFiles) {
      const url = this.dbExportUrl + file;
      const dest = path.join(this.cacheDir, file);
      this.logger.log(`Downloading: ${file}`);
      await this.downloadFile(url, dest);
      this.logger.log(`Extracting: ${file}`);
      await this.extractGz(dest);
    }
    this.logger.log("All latest files downloaded and extracted.");
  }

  public cleanCacheFolder(): void {
    if (!fs.existsSync(this.cacheDir)) return;

    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      try {
        if (fs.lstatSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        this.logger.warn(`Failed to delete ${filePath}:`, err);
      }
    }

    this.logger.log("Cache folder cleaned");
  }

  public getFiles(): string[] {
    return fs.readdirSync(this.cacheDir).filter((f) => !f.endsWith(".gz"));
  }

  // Stream-based getters
  public async streamPosts(callback: (post: Post) => void) {
    const latestFile = this.getLatestFileByPrefix("posts");
    await this.streamCsv<Post>(latestFile, callback);
  }

  public async streamPools(callback: (pool: Pool) => void) {
    const latestFile = this.getLatestFileByPrefix("pools");
    await this.streamCsv<Pool>(latestFile, callback);
  }

  public async streamTags(callback: (tag: Tag) => void) {
    const latestFile = this.getLatestFileByPrefix("tags");
    await this.streamCsv<Tag>(latestFile, callback);
  }

  public async streamTagAliases(callback: (alias: TagAlias) => void) {
    const latestFile = this.getLatestFileByPrefix("tag_aliases");
    await this.streamCsv<TagAlias>(latestFile, callback);
  }

  public async streamTagImplications(callback: (impl: TagImplication) => void) {
    const latestFile = this.getLatestFileByPrefix("tag_implications");
    await this.streamCsv<TagImplication>(latestFile, callback);
  }

  public async streamWikiPages(callback: (page: WikiPage) => void) {
    const latestFile = this.getLatestFileByPrefix("wiki_pages");
    await this.streamCsv<WikiPage>(latestFile, callback);
  }
}
