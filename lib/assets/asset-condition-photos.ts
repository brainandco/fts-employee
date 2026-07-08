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

/** Receipt / return / transfer — EHS tools always require condition photos. */
export function assetRequiresConditionPhotos(input: {
  category?: string | null;
  is_ehs_tool?: boolean | null;
}): boolean {
  if (input.is_ehs_tool) return true;
  return assetCategoryRequiresConditionPhotos(input.category);
}
