import { createSign } from "crypto";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

function loadServiceAccount(): ServiceAccount | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as ServiceAccount;
      if (parsed.client_email && parsed.private_key) return parsed;
    } catch {
      /* fall through */
    }
  }
  const email = process.env.GOOGLE_VISION_CLIENT_EMAIL?.trim() || process.env.GOOGLE_CLIENT_EMAIL?.trim();
  let key = process.env.GOOGLE_VISION_PRIVATE_KEY?.trim() || process.env.GOOGLE_PRIVATE_KEY?.trim();
  if (!email || !key) return null;
  key = key.replace(/\\n/g, "\n");
  return { client_email: email, private_key: key };
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** OAuth2 access token for Google APIs (Vision / Sheets) via service account JWT. */
export async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  const sa = loadServiceAccount();
  if (!sa) {
    throw new Error(
      "Google service account not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: scopes.join(" "),
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(sa.private_key));
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || `Google token exchange failed (${res.status})`);
  }
  return data.access_token;
}

export function isGoogleSaConfigured(): boolean {
  return loadServiceAccount() !== null;
}
