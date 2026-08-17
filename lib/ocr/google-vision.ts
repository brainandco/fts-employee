import { getGoogleAccessToken, isGoogleSaConfigured } from "@/lib/google/service-account";
import { releaseOcrUnits, reserveOcrUnits } from "@/lib/ocr/quota";

export type VisionOcrResult = {
  fullText: string;
  unitsUsed: number;
  skippedQuota: boolean;
};

/**
 * Run TEXT_DETECTION on one image URL (1 unit). Respects monthly OCR hard cap.
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
            image: { source: { imageUri: imageUrl } },
            features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
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
