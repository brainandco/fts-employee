type NominatimAddress = {
  road?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
};

function composeLabel(addr: NominatimAddress, displayName: string | undefined): string {
  const parts = [
    addr.road || addr.pedestrian,
    addr.neighbourhood || addr.suburb || addr.city_district || addr.district,
    addr.city || addr.town || addr.village || addr.municipality,
    addr.state,
    addr.country,
  ].filter((p, i, arr) => Boolean(p) && arr.indexOf(p) === i);
  if (parts.length >= 2) return parts.join(", ");
  const fallback = (displayName ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return fallback.slice(0, 4).join(", ") || displayName?.trim() || "";
}

/**
 * Turn GPS into a readable place (road, district, city). Does not replace lat/lng.
 */
export async function reverseGeocodeLatLng(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (mapsKey) {
    const label = await googleReverse(lat, lng, mapsKey);
    if (label) return label;
  }

  return nominatimReverse(lat, lng);
}

async function googleReverse(lat: number, lng: number, key: string): Promise<string | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}&language=en&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      results?: Array<{ formatted_address?: string }>;
    };
    if (data.status !== "OK") return null;
    const formatted = data.results?.[0]?.formatted_address?.trim();
    return formatted || null;
  } catch {
    return null;
  }
}

async function nominatimReverse(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=18&addressdetails=1&accept-language=en`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "FTS-Employee-Portal/1.0 (odometer@fts-ksa.com)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      display_name?: string;
      address?: NominatimAddress;
    };
    const label = composeLabel(data.address ?? {}, data.display_name);
    return label || null;
  } catch {
    return null;
  }
}
