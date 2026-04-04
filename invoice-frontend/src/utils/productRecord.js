/** Normalized product object from GET /products/{id} (root or nested `product`). */

export function normalizeProductRecord(data) {
  if (!data || typeof data !== "object") return {};
  return data.product && typeof data.product === "object" ? data.product : data;
}

export function productDisplayNameFromApiData(data) {
  const p = normalizeProductRecord(data);
  const name = p.product_name ?? p.ProductName ?? p.name ?? p.Name ?? "";
  return String(name).trim();
}

export function unitPriceFromProductPayload(data) {
  const p = normalizeProductRecord(data);
  const raw = p.price ?? p.Price;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
