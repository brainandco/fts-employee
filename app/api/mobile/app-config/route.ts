import { NextResponse } from "next/server";

/**
 * Public mobile app update policy.
 * Ops: set env vars when a store release must be installed.
 *
 * MOBILE_APP_LATEST_VERSION   — newest store version (e.g. 1.0.1)
 * MOBILE_APP_MIN_VERSION      — lowest allowed; below this → required update screen
 * MOBILE_UPDATE_MESSAGE         — optional body text on the update page
 * MOBILE_IOS_STORE_URL        — App Store link
 * MOBILE_ANDROID_STORE_URL    — Play Store link
 */
export async function GET() {
  const latestVersion = (process.env.MOBILE_APP_LATEST_VERSION ?? "1.0.0").trim() || "1.0.0";
  const minSupportedVersion = (process.env.MOBILE_APP_MIN_VERSION ?? latestVersion).trim() || latestVersion;
  const message =
    (process.env.MOBILE_UPDATE_MESSAGE ?? "").trim() ||
    "A new version of FTS Employee is required to continue. Please update from the store.";

  const iosStoreUrl =
    (process.env.MOBILE_IOS_STORE_URL ?? "").trim() ||
    "https://apps.apple.com/us/app/fts-employee-connect/id6797016282";
  const androidStoreUrl =
    (process.env.MOBILE_ANDROID_STORE_URL ?? "").trim() ||
    "https://play.google.com/store/apps/details?id=com.ftsksa.employee";

  return NextResponse.json({
    latestVersion,
    minSupportedVersion,
    message,
    iosStoreUrl,
    androidStoreUrl,
  });
}
