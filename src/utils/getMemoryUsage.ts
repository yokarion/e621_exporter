export function getMemoryUsage() {
  const mem = process.memoryUsage();

  return {
    rss: (mem.rss / 1024 / 1024).toFixed(2) + " MB", // Resident Set Size
    heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2) + " MB", // Total heap allocated
    heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + " MB", // Heap actually used
    external: (mem.external / 1024 / 1024).toFixed(2) + " MB", // C++ objects
    arrayBuffers: (mem.arrayBuffers / 1024 / 1024).toFixed(2) + " MB",
  };
}
