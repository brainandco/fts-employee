import { NextResponse } from "next/server";

/**
 * Public mobile app update policy.
 *
 * When you publish a store build that must be used, set the minimums to that build.
 * Example after Android versionCode 17 is live:
 *   MOBILE_APP_MIN_ANDROID_VERSION_CODE=17
 *   MOBILE_APP_LATEST_ANDROID_VERSION_CODE=17
 *   MOBILE_APP_MIN_VERSION=1.0.0
 *   MOBILE_APP_LATEST_VERSION=1.0.0
 *
 * Semver alone is not enough if marketing version stays 1.0.0 across releases.
 */
export async function GET() {
  const latestVersion = (process.env.MOBILE_APP_LATEST_VERSION ?? "1.0.0").trim() || "1.0.0";
  const minSupportedVersion = (process.env.MOBILE_APP_MIN_VERSION ?? latestVersion).trim() || latestVersion;

  const minAndroidVersionCode = parseInt(process.env.MOBILE_APP_MIN_ANDROID_VERSION_CODE ?? "0", 10) || 0;
  const latestAndroidVersionCode =
    parseInt(process.env.MOBILE_APP_LATEST_ANDROID_VERSION_CODE ?? String(minAndroidVersionCode), 10) ||
    minAndroidVersionCode;
  const minIosBuildNumber = parseInt(process.env.MOBILE_APP_MIN_IOS_BUILD_NUMBER ?? "0", 10) || 0;
  const latestIosBuildNumber =
    parseInt(process.env.MOBILE_APP_LATEST_IOS_BUILD_NUMBER ?? String(minIosBuildNumber), 10) || minIosBuildNumber;

  const message =
    (process.env.MOBILE_UPDATE_MESSAGE ?? "").trim() ||
    "A newer version of FTS Employee is required. Please update to continue using the app. Your data is safe — this only updates the application.";

  const iosStoreUrl =
    (process.env.MOBILE_IOS_STORE_URL ?? "").trim() ||
    "https://apps.apple.com/us/app/fts-employee-connect/id6797016282";
  const androidStoreUrl =
    (process.env.MOBILE_ANDROID_STORE_URL ?? "").trim() ||
    "https://play.google.com/store/apps/details?id=com.ftsksa.employee";

  return NextResponse.json({
    latestVersion,
    minSupportedVersion,
    minAndroidVersionCode,
    latestAndroidVersionCode,
    minIosBuildNumber,
    latestIosBuildNumber,
    message,
    iosStoreUrl,
    androidStoreUrl,
    forceUpdate: true,
  });
}
