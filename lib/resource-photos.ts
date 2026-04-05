export const MIN_RESOURCE_PHOTOS = 2;
export const MAX_RESOURCE_PHOTOS = 8;

export function parseImageUrlArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

export function hasMinimumPhotos(urls: unknown): boolean {
  return parseImageUrlArray(urls).length >= MIN_RESOURCE_PHOTOS;
}
