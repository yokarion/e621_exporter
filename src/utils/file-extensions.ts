export const FILE_EXTENSIONS = {
  image: [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "webp",
    "tiff",
    "tif",
    "heic",
    "ico",
    "jfif",
    "svg",
    "psd",
    "exr",
  ] as const,
  video: [
    "webm",
    "mp4",
    "mov",
    "avi",
    "mkv",
    "flv",
    "wmv",
    "m4v",
    "3gp",
    "ogv",
    "vob",
    "mts",
    "m2ts",
  ] as const,
  flash: ["swf", "spl"] as const,
};

type FileExtensionCategory = keyof typeof FILE_EXTENSIONS;

export const parseFileExtension = (
  fileExt: string | undefined,
): {
  extension: string;
  category: FileExtensionCategory | "unknown";
} => {
  if (!fileExt) return { extension: "unknown", category: "unknown" };

  const ext = fileExt.trim().toLowerCase();

  for (const category of Object.keys(
    FILE_EXTENSIONS,
  ) as FileExtensionCategory[]) {
    if ((FILE_EXTENSIONS[category] as readonly string[]).includes(ext)) {
      return { extension: ext, category };
    }
  }

  return { extension: "unknown", category: "unknown" };
};
