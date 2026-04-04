/**
 * Business GET payloads may nest the row or use alternate JSON keys (Go / GORM).
 */

function pickLogoString(obj) {
  if (!obj || typeof obj !== "object") return "";
  const v =
    obj.logo_url ??
    obj.LogoURL ??
    obj.logoUrl ??
    obj.LogoUrl ??
    obj.LOGO_URL ??
    obj.logo_path ??
    obj.LogoPath ??
    obj.image_url ??
    obj.ImageURL ??
    obj.file_url ??
    obj.FileURL;
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s || "";
}

/** Last resort: walk nested objects for known logo-related keys only (avoid false positives). */
function deepFindLogoUrlString(obj, depth) {
  if (!obj || typeof obj !== "object" || depth > 8) return "";
  const keyHints = new Set([
    "logo_url",
    "logourl",
    "logo",
    "image_url",
    "file_url",
    "avatar_url",
    "logo_path",
    "company_logo",
    "business_logo",
  ]);
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val !== "string") continue;
    const t = val.trim();
    if (!t) continue;
    const k = key.toLowerCase();
    if (keyHints.has(k) || k.endsWith("logo_url") || k.endsWith("_logo")) {
      return t;
    }
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const found = deepFindLogoUrlString(val, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

export function extractLogoUrlFromBusinessApi(data) {
  if (!data || typeof data !== "object") return "";
  let s = pickLogoString(data);
  if (s) return s;
  const b = data.business ?? data.Business;
  if (b && typeof b === "object") {
    s = pickLogoString(b);
    if (s) return s;
  }
  const inner = data.data ?? data.Data;
  if (inner && typeof inner === "object") {
    s = pickLogoString(inner);
    if (s) return s;
    const ib = inner.business ?? inner.Business;
    if (ib && typeof ib === "object") {
      s = pickLogoString(ib);
      if (s) return s;
    }
  }
  const prof = data.profile ?? data.Profile;
  if (prof && typeof prof === "object") {
    s = pickLogoString(prof);
    if (s) return s;
  }
  const result = data.result ?? data.Result;
  if (result && typeof result === "object") {
    s = pickLogoString(result);
    if (s) return s;
  }
  s = deepFindLogoUrlString(data, 0);
  return s || "";
}

/**
 * Logo URL for forms / display. Does not overwrite a good API `logo_url` with "" when extraction misses once.
 */
export function resolveBusinessLogoUrlForUi(data) {
  if (!data || typeof data !== "object") return "";
  const extracted = extractLogoUrlFromBusinessApi(data);
  if (extracted) return extracted;
  const raw = data.logo_url;
  if (raw != null && typeof raw === "string") {
    const t = raw.trim();
    if (t) return t;
  }
  return "";
}

/**
 * When using the CRA dev server without REACT_APP_API_URL, API calls are proxied but <img src="/...">
 * is NOT — the browser requests port 3000 and misses the Go static file route. Use the API origin in dev.
 */
function developmentApiOrigin() {
  if (process.env.NODE_ENV !== "development") return "";
  if ((process.env.REACT_APP_API_URL || "").trim()) return "";
  if (typeof window === "undefined") return "";
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8080`;
}

/** Turn API logo path/URL into a value that works in <img src> from the SPA origin. */
export function resolveLogoImgSrc(raw) {
  const u = String(raw || "").trim();
  if (!u) return "";
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith("//")) return `${typeof window !== "undefined" ? window.location.protocol : "https:"}${u}`;
  const base = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
  const devOrigin = developmentApiOrigin();
  const originBase = base || devOrigin;

  if (u.startsWith("/")) {
    if (originBase) return `${originBase}${u}`;
    return u;
  }
  if (originBase) return `${originBase}/${u.replace(/^\//, "")}`;
  return u;
}

export function dispatchBusinessProfileUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("business-profile-updated"));
  }
}
