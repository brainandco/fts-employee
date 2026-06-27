/**
 * Small accessory categories — no condition photos for receipt, return, or transfer.
 * Key assets (laptop, mobile, GPS, etc.) still require photos.
 */
const PHOTO_EXEMPT_CATEGORIES = new Set(["data cable", "usb hub", "cable"]);

export function assetCategoryRequiresConditionPhotos(category: string | null | undefined): boolean {
  const c = (category ?? "").trim().toLowerCase();
  if (!c) return true;
  return !PHOTO_EXEMPT_CATEGORIES.has(c);
}
