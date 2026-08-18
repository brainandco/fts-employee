import { getGoogleAccessToken, isGoogleSaConfigured } from "@/lib/google/service-account";
import { releaseOcrUnits, reserveOcrUnits } from "@/lib/ocr/quota";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";

export type VisionOcrResult = {
  fullText: string;
  unitsUsed: number;
  skippedQuota: boolean;
};

const RESOURCE_PUBLIC = "/object/public/resource-photos/";
const RESOURCE_SIGN = "/object/sign/resource-photos/";

function resourcePhotoPathFromUrl(imageUrl: string): string | null {
  for (const marker of [RESOURCE_PUBLIC, RESOURCE_SIGN]) {
    const i = imageUrl.indexOf(marker);
    if (i < 0) continue;
    const rest = imageUrl.slice(i + marker.length).split("?")[0];
    try {
      return decodeURIComponent(rest);
    } catch {
      return rest;
    }
  }
  return null;
}

/**
 * Load image bytes ourselves. Cloud Vision imageUri often OCR's an HTML error page
 * (private bucket / blocked fetch) and that HTML contains the storage UUID.
 */
async function loadImageBase64(imageUrl: string): Promise<string> {
  const path = resourcePhotoPathFromUrl(imageUrl);
  if (path) {
    const admin = createServerSupabaseAdmin();
    const { data, error } = await admin.storage.from("resource-photos").download(path);
    if (error || !data) {
      throw new Error(error?.message || "Could not download odometer photo from storage");
    }
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length < 32) throw new Error("Downloaded photo was empty");
    return buf.toString("base64");
  }

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Could not fetch photo (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 32) throw new Error("Fetched photo was empty");
  return buf.toString("base64");
}

/**
 * Run TEXT_DETECTION on one image (1 unit). Sends bytes, not a public URL.
 */
export async function detectTextFromImageUrl(imageUrl: string): Promise<VisionOcrResult> {
  const reserve = await reserveOcrUnits(1);
  if (!reserve.ok) {
    return { fullText: "", unitsUsed: 0, skippedQuota: true };
  }

  if (!isGoogleSaConfigured()) {
    await releaseOcrUnits(1);
    throw new Error("Google Vision is not configured on the server");
  }

  try {
    const content = await loadImageBase64(imageUrl);
    const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/cloud-vision"]);
    const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
            imageContext: { languageHints: ["en", "ar"] },
          },
        ],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        textAnnotations?: Array<{ description?: string }>;
        error?: { message?: string };
      }>;
    };

    if (!res.ok) {
      await releaseOcrUnits(1);
      throw new Error(data.error?.message || `Vision API failed (${res.status})`);
    }

    const response = data.responses?.[0];
    if (response?.error?.message) {
      await releaseOcrUnits(1);
      throw new Error(response.error.message);
    }

    const fullText =
      response?.fullTextAnnotation?.text?.trim() ||
      response?.textAnnotations?.[0]?.description?.trim() ||
      "";

    return { fullText, unitsUsed: 1, skippedQuota: false };
  } catch (e) {
    await releaseOcrUnits(1);
    throw e;
  }
}

export async function detectTextFromImageUrls(urls: string[]): Promise<{
  texts: string[];
  unitsUsed: number;
  skippedQuota: boolean;
}> {
  const texts: string[] = [];
  let unitsUsed = 0;
  let skippedQuota = false;
  for (const url of urls) {
    if (!url) {
      texts.push("");
      continue;
    }
    const r = await detectTextFromImageUrl(url);
    if (r.skippedQuota) {
      skippedQuota = true;
      texts.push("");
      continue;
    }
    texts.push(r.fullText);
    unitsUsed += r.unitsUsed;
  }
  return { texts, unitsUsed, skippedQuota };
}
