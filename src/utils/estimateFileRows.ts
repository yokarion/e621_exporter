import fs from "fs";

export async function estimateFileRows(
  filePath: string,
  samples = 1000,
): Promise<number> {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  const samplePositions = Array.from({ length: samples }, (_, i) =>
    Math.floor((i / samples) * fileSize),
  );

  let totalLineLengths = 0;
  let sampledLines = 0;

  for (const pos of samplePositions) {
    const buffer = Buffer.alloc(1024 * 16); // 16KB sample
    const fd = fs.openSync(filePath, "r");
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, pos);
    fs.closeSync(fd);

    const chunk = buffer.slice(0, bytesRead).toString("utf8");
    const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      const avg =
        lines.reduce((sum, l) => sum + l.length + 1, 0) / lines.length;
      totalLineLengths += avg;
      sampledLines++;
    }
  }

  const meanLineLength = totalLineLengths / sampledLines;
  const estimatedRows = Math.round(fileSize / meanLineLength) - 1; // minus header

  return estimatedRows;
}
