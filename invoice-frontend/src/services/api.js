/**
 * Use empty base URL in dev so Create React App "proxy" forwards to the Go API (localhost:8080).
 * For production, set REACT_APP_API_URL=https://your-api.onrender.com
 */
const API_BASE = process.env.REACT_APP_API_URL || "";

export const setToken = (token) => localStorage.setItem("token", token);
export const getToken = () => localStorage.getItem("token");
export const removeToken = () => localStorage.removeItem("token");

const LS_BUSINESS_ID = "invoice_app_business_id";
const LS_CLIENT_ID = "invoice_app_client_id";
const LS_CLIENT_IDS = "invoice_app_client_ids";
const LS_PRODUCT_ID = "invoice_app_product_id";
const LS_PRODUCT_IDS = "invoice_app_product_ids";

export const getStoredBusinessId = () => localStorage.getItem(LS_BUSINESS_ID) || "";
export const setStoredBusinessId = (id) =>
  id ? localStorage.setItem(LS_BUSINESS_ID, String(id)) : localStorage.removeItem(LS_BUSINESS_ID);

export function getStoredClientIds() {
  try {
    const raw = localStorage.getItem(LS_CLIENT_IDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

export function addStoredClientId(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  const existing = getStoredClientIds();
  if (existing.includes(n)) return;
  existing.push(n);
  localStorage.setItem(LS_CLIENT_IDS, JSON.stringify(existing));
}

export function removeStoredClientId(id) {
  const n = Number(id);
  const next = getStoredClientIds().filter((x) => x !== n);
  localStorage.setItem(LS_CLIENT_IDS, JSON.stringify(next));
}

export function clearStoredClientIds() {
  localStorage.removeItem(LS_CLIENT_IDS);
}

export const getStoredClientId = () => localStorage.getItem(LS_CLIENT_ID) || "";

export const setStoredClientId = (id) => {
  if (id) {
    localStorage.setItem(LS_CLIENT_ID, String(id));
    addStoredClientId(id);
  } else {
    localStorage.removeItem(LS_CLIENT_ID);
  }
};

/** All product IDs we know about (for GET /products/{id} — no list endpoint). */
export function getStoredProductIds() {
  try {
    const raw = localStorage.getItem(LS_PRODUCT_IDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

export function addStoredProductId(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  const existing = getStoredProductIds();
  if (existing.includes(n)) return;
  existing.push(n);
  localStorage.setItem(LS_PRODUCT_IDS, JSON.stringify(existing));
}

export function removeStoredProductId(id) {
  const n = Number(id);
  const next = getStoredProductIds().filter((x) => x !== n);
  localStorage.setItem(LS_PRODUCT_IDS, JSON.stringify(next));
}

export function clearStoredProductIds() {
  localStorage.removeItem(LS_PRODUCT_IDS);
}

export const getStoredProductId = () => localStorage.getItem(LS_PRODUCT_ID) || "";

export const setStoredProductId = (id) => {
  if (id) {
    localStorage.setItem(LS_PRODUCT_ID, String(id));
    addStoredProductId(id);
  } else {
    localStorage.removeItem(LS_PRODUCT_ID);
  }
};

export function extractId(obj) {
  if (!obj || typeof obj !== "object") return null;
  return obj.ID ?? obj.id ?? null;
}

function parseErrorPayload(text, res) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || res.statusText };
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * @returns {Promise<any>}
 */
export async function apiRequest(path, options = {}) {
  const {
    method = "GET",
    body,
    auth = true,
    skipJson = false,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal: outerSignal,
  } = options;
  const headers = {};
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", onOuterAbort);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error(
        outerSignal?.aborted
          ? "Request cancelled."
          : "Request timed out or the API is unreachable. For local dev, start the Go API (e.g. port 8080) and use the CRA proxy."
      );
      err.status = 408;
      err.data = {};
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
    if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
  }

  if (skipJson) {
    return res;
  }

  const text = await res.text();
  const data = text ? parseErrorPayload(text, res) : {};

  if (res.status === 401) {
    removeToken();
  }

  if (!res.ok) {
    const err = new Error(data.error || data.message || res.statusText || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function register(username, password) {
  return apiRequest("/register", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
}

/** Apply token + business_id from login / business-profile create|update responses. */
export function applyAuthSessionFromResponse(data) {
  if (!data || typeof data !== "object") return;
  if (typeof data.token === "string" && data.token.trim()) {
    setToken(data.token.trim());
  }
  const bid = Number(data.business_id);
  if (Number.isFinite(bid) && bid > 0) {
    setStoredBusinessId(bid);
  }
}

/** Unwrap `{ business }` from POST/PUT business-profile or pass through legacy body-as-business. */
export function unwrapBusinessProfileResponse(data) {
  if (!data || typeof data !== "object") return data;
  if (data.business && typeof data.business === "object") return data.business;
  return data;
}

/**
 * Login: API returns `{ token, business_id }` (or legacy JSON string JWT only).
 * @returns {{ token: string, business_id: number | null }}
 */
export async function login(username, password) {
  const raw = await apiRequest("/login", {
    method: "POST",
    body: { username, password },
    auth: false,
    timeoutMs: 45_000,
  });

  let token;
  if (typeof raw === "string") {
    token = raw.trim();
    if (!token) {
      const err = new Error("Login response was not a valid token.");
      err.status = 500;
      throw err;
    }
    setToken(token);
    setStoredBusinessId("");
    return { token, business_id: null };
  }

  if (raw && typeof raw === "object" && typeof raw.token === "string") {
    token = raw.token.trim();
    if (!token) {
      const err = new Error("Login response was not a valid token.");
      err.status = 500;
      throw err;
    }
    setToken(token);
    const bid = Number(raw.business_id);
    if (Number.isFinite(bid) && bid > 0) {
      setStoredBusinessId(bid);
      return { token, business_id: bid };
    }
    setStoredBusinessId("");
    return { token, business_id: null };
  }

  const err = new Error("Login response was not a valid token.");
  err.status = 500;
  throw err;
}

export function logout() {
  removeToken();
  setStoredBusinessId("");
  setStoredClientId("");
  clearStoredClientIds();
  setStoredProductId("");
  clearStoredProductIds();
}

/* —— Clients —— */
export function createClient(payload) {
  return apiRequest("/clients", { method: "POST", body: payload });
}

export function getClient(id) {
  return apiRequest(`/clients/${id}`);
}

/** Normalize GET /clients (or similar) JSON to a flat array of client objects. */
function normalizeClientsListPayload(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== "object") return [];
  for (const key of ["clients", "Clients", "data", "results", "items"]) {
    const part = data[key];
    if (Array.isArray(part)) return part;
  }
  return [];
}

/**
 * GET /clients — all clients for the authenticated business (when the API supports it).
 * @returns {Promise<object[]>}
 */
export async function listClients() {
  const data = await apiRequest("/clients", { method: "GET" });
  return normalizeClientsListPayload(data)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      return item.client && typeof item.client === "object" ? item.client : item;
    })
    .filter(Boolean);
}

export function updateClient(client) {
  return apiRequest("/clients", { method: "PUT", body: client });
}

/** DELETE /clients/{id} — soft-deletes (archives) the client on the server. */
export function archiveClient(id) {
  const raw = String(id ?? "").trim();
  return apiRequest(`/clients/${encodeURIComponent(raw)}`, { method: "DELETE" });
}

/** Loads each known client via GET /clients/{id}. */
export async function fetchStoredClients() {
  const fromList = getStoredClientIds();
  const last = getStoredClientId();
  const idSet = new Set(fromList);
  if (last) idSet.add(Number(last));
  const ids = [...idSet].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);

  if (ids.length === 0) return [];

  const settled = await Promise.allSettled(ids.map((id) => getClient(id)));

  const clients = [];
  let firstError = null;

  settled.forEach((result, i) => {
    const id = ids[i];
    if (result.status === "fulfilled") {
      const data = result.value;
      const row = data.client && typeof data.client === "object" ? data.client : data;
      clients.push(row);
      return;
    }
    const err = result.reason;
    const status = err?.status;
    if (status === 404) {
      removeStoredClientId(id);
      if (String(getStoredClientId()) === String(id)) {
        setStoredClientId("");
      }
    } else if (!firstError) {
      firstError = err;
    }
  });

  const sortKey = (c) => c?.ID ?? c?.id ?? 0;
  clients.sort((a, b) => sortKey(a) - sortKey(b));

  if (firstError && clients.length === 0) {
    throw firstError;
  }

  return clients;
}

/* —— Business —— */
export async function createBusinessProfile(business) {
  const data = await apiRequest("/business-profile", { method: "POST", body: business });
  applyAuthSessionFromResponse(data);
  return unwrapBusinessProfileResponse(data);
}

/** GET /business-profile — tenant from JWT only (no query). */
export async function getBusinessProfile() {
  const data = await apiRequest("/business-profile");
  return unwrapBusinessProfileResponse(data);
}

export async function updateBusinessProfile(business) {
  const data = await apiRequest("/business-profile", { method: "PUT", body: business });
  applyAuthSessionFromResponse(data);
  return unwrapBusinessProfileResponse(data);
}

/**
 * POST/PUT /business-profile with multipart form (logo file + text fields).
 * Send file under form field name "logo". Include other profile fields as form values (e.g. ID, business_name, …).
 * Do not set Content-Type manually; the browser sets multipart boundaries.
 */
export async function businessProfileMultipartRequest(method, formData) {
  const headers = {};
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  let res;
  try {
    res = await fetch(`${API_BASE}/business-profile`, {
      method,
      headers,
      body: formData,
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error("Upload timed out. Try a smaller logo or check your connection.");
      err.status = 408;
      err.data = {};
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await res.text();
  const data = text ? parseErrorPayload(text, res) : {};

  if (res.status === 401) {
    removeToken();
  }

  if (!res.ok) {
    const err = new Error(data.error || data.message || res.statusText || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function createBusinessProfileFormData(formData) {
  const data = await businessProfileMultipartRequest("POST", formData);
  applyAuthSessionFromResponse(data);
  return unwrapBusinessProfileResponse(data);
}

export async function updateBusinessProfileFormData(formData) {
  const data = await businessProfileMultipartRequest("PUT", formData);
  applyAuthSessionFromResponse(data);
  return unwrapBusinessProfileResponse(data);
}

/* —— Products —— */
export function createProduct(payload) {
  return apiRequest("/products", { method: "POST", body: payload });
}

export function getProduct(id) {
  return apiRequest(`/products/${id}`);
}

/** Normalize GET /products JSON to a flat array of product objects. */
function normalizeProductsListPayload(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== "object") return [];
  for (const key of ["products", "Products", "data", "results", "items"]) {
    const part = data[key];
    if (Array.isArray(part)) return part;
  }
  return [];
}

/**
 * GET /products — all products for the authenticated business (when the API supports it).
 * @returns {Promise<object[]>}
 */
export async function listProducts() {
  const data = await apiRequest("/products", { method: "GET" });
  return normalizeProductsListPayload(data)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const inner = item.product ?? item.Product;
      return inner && typeof inner === "object" ? inner : item;
    })
    .filter(Boolean);
}

/**
 * Loads each known product via GET /products/{id} (fallback when GET /products is unavailable).
 * IDs come from localStorage (every create/select adds to the list).
 */
export async function fetchStoredProducts() {
  const fromList = getStoredProductIds();
  const last = getStoredProductId();
  const idSet = new Set(fromList);
  if (last) idSet.add(Number(last));
  const ids = [...idSet].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);

  if (ids.length === 0) return [];

  const settled = await Promise.allSettled(ids.map((id) => getProduct(id)));

  const products = [];
  let firstError = null;

  settled.forEach((result, i) => {
    const id = ids[i];
    if (result.status === "fulfilled") {
      products.push(result.value);
      return;
    }
    const err = result.reason;
    const status = err?.status;
    if (status === 404) {
      removeStoredProductId(id);
      if (String(getStoredProductId()) === String(id)) {
        setStoredProductId("");
      }
    } else if (!firstError) {
      firstError = err;
    }
  });

  const sortKey = (p) => p?.ID ?? p?.id ?? 0;
  products.sort((a, b) => sortKey(a) - sortKey(b));

  if (firstError && products.length === 0) {
    throw firstError;
  }

  return products;
}

export function updateProduct(id, payload) {
  return apiRequest(`/products/${id}`, { method: "PUT", body: payload });
}

/** DELETE /products/{id} — soft-deletes (archives) the product on the server. */
export function archiveProduct(id) {
  const raw = String(id ?? "").trim();
  return apiRequest(`/products/${encodeURIComponent(raw)}`, { method: "DELETE" });
}

/* —— Invoices —— */
export function createInvoice(invoice) {
  return apiRequest("/invoices", { method: "POST", body: invoice });
}

export function updateInvoice(id, invoice) {
  return apiRequest(`/invoices/${id}`, { method: "PUT", body: invoice });
}

/** DELETE /invoices/{id} — soft-deletes (archives) the invoice and its line items. */
export function archiveInvoice(id) {
  const raw = String(id ?? "").trim();
  return apiRequest(`/invoices/${encodeURIComponent(raw)}`, { method: "DELETE" });
}

/** GET /invoices/{id} — invoice detail (for client name on PDF download block). */
export function getInvoice(id) {
  const n = encodeURIComponent(String(id).trim());
  return apiRequest(`/invoices/${n}`);
}

/** GET /invoices/searchbyclient?client_id= — returns invoices for that client (use first row for bill-to snapshot). */
export function searchInvoicesByClientId(clientId) {
  const id = encodeURIComponent(String(clientId).trim());
  return apiRequest(`/invoices/searchbyclient?client_id=${id}`);
}

/** Fetch invoices for a client ID; UI can derive client display fields from the first invoice. */
export function searchClientsByClientId(clientId) {
  return searchInvoicesByClientId(clientId);
}

/**
 * GET /invoices/ViewInvoiceStatus — query params: customer_payment_status, invoice_id, client_id (when supported).
 */
export function viewInvoiceStatus(params = {}) {
  const sp = new URLSearchParams();
  if (params.customer_payment_status != null && String(params.customer_payment_status).trim() !== "") {
    sp.set("customer_payment_status", String(params.customer_payment_status).trim());
  }
  if (params.invoice_id != null && String(params.invoice_id).trim() !== "") {
    sp.set("invoice_id", String(params.invoice_id).trim());
  }
  if (params.client_id != null && String(params.client_id).trim() !== "") {
    sp.set("client_id", String(params.client_id).trim());
  }
  const qs = sp.toString();
  return apiRequest(`/invoices/ViewInvoiceStatus${qs ? `?${qs}` : ""}`);
}

export function listInvoicesByPaymentStatus(status) {
  return viewInvoiceStatus({ customer_payment_status: status });
}

export function markInvoicePaid(id) {
  return apiRequest(`/invoices/${id}/paid`, { method: "PUT" });
}

export async function downloadInvoicePdf(id) {
  const res = await apiRequest(`/invoices/${id}/pdf`, { skipJson: true, timeoutMs: 120_000 });
  if (!res.ok) {
    const text = await res.text();
    const data = text ? parseErrorPayload(text, res) : {};
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice_${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Fetch PDF with auth and open in a new browser tab (inline viewer). */
export async function openInvoicePdfInNewTab(id) {
  const res = await apiRequest(`/invoices/${id}/pdf`, { skipJson: true, timeoutMs: 120_000 });
  if (!res.ok) {
    const text = await res.text();
    const data = text ? parseErrorPayload(text, res) : {};
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    URL.revokeObjectURL(url);
    const err = new Error("Pop-up blocked. Allow pop-ups for this site to view the PDF.");
    throw err;
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export function sendInvoiceEmail(id, invoiceStatus = "ready_to_send") {
  return apiRequest(`/invoices/${id}/send`, {
    method: "POST",
    body: { invoice_status: invoiceStatus },
  });
}
