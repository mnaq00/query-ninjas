/**
 * Parse GET /invoices/searchbyclient?client_id= responses (same shapes as Clients page).
 */

import { clientDisplayName, clientRowId, clientEmail, clientBilling } from "./clientRecord";

function mergeClientLike(parent) {
  if (!parent || typeof parent !== "object") return null;
  const nested = parent.client || parent.Client;
  if (nested && typeof nested === "object") {
    return { ...parent, ...nested };
  }
  return parent;
}

function rowHasSearchableClientFields(merged) {
  if (!merged || typeof merged !== "object") return false;
  return (
    clientRowId(merged) != null ||
    Boolean(clientDisplayName(merged)) ||
    Boolean(clientEmail(merged)) ||
    Boolean(clientBilling(merged))
  );
}

function extractClientFromCustomerSearch(data) {
  if (!data || typeof data !== "object") return null;
  if (data.client && typeof data.client === "object") return mergeClientLike(data);
  if (data.Client && typeof data.Client === "object") return mergeClientLike(data);

  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    const first = data[0];
    if (!first || typeof first !== "object") return null;
    const merged = mergeClientLike(first);
    if (merged && rowHasSearchableClientFields(merged)) return merged;
    return null;
  }

  if (Array.isArray(data.invoices) && data.invoices[0]) {
    const inv = data.invoices[0];
    if (typeof inv !== "object") return null;
    const merged = mergeClientLike(inv);
    if (merged && rowHasSearchableClientFields(merged)) return merged;
  }

  if (Array.isArray(data.Invoices) && data.Invoices[0]) {
    const inv = data.Invoices[0];
    if (typeof inv !== "object") return null;
    const merged = mergeClientLike(inv);
    if (merged && rowHasSearchableClientFields(merged)) return merged;
  }

  if (data.invoice && typeof data.invoice === "object") {
    const merged = mergeClientLike(data.invoice);
    if (merged && rowHasSearchableClientFields(merged)) return merged;
  }

  return null;
}

function getInvoicesListFromSearchResponse(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== "object") return [];
  const direct = [data.invoices, data.Invoices, data.invoice_list, data.InvoiceList, data.results, data.Results];
  for (const x of direct) {
    if (Array.isArray(x)) return x;
  }
  const nested = data.data ?? data.Data ?? data.payload ?? data.Payload;
  if (nested && typeof nested === "object") {
    const inner = nested.invoices ?? nested.Invoices;
    if (Array.isArray(inner)) return inner;
  }
  if (data.invoice && typeof data.invoice === "object") return [data.invoice];
  return [];
}

function ensureSearchedClientIdOnRow(row, searchedClientId) {
  const merged = row && typeof row === "object" ? mergeClientLike(row) : null;
  if (!merged) return null;
  const n = Number(searchedClientId);
  if (clientRowId(merged) != null) return merged;
  if (!Number.isFinite(n) || n <= 0) return merged;
  return { ...merged, ID: n, id: n, client_id: n };
}

/** Parse GET /invoices/searchbyclient for a display row (used by Clients search + invoice create name hint). */
export function extractClientRowFromSearchByClientResponse(data, searchedClientId) {
  const tryRow = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const m = mergeClientLike(obj);
    if (!m || !rowHasSearchableClientFields(m)) return null;
    return ensureSearchedClientIdOnRow(m, searchedClientId);
  };

  for (const inv of getInvoicesListFromSearchResponse(data)) {
    const r = tryRow(inv);
    if (r) return r;
  }

  const fromLegacy = extractClientFromCustomerSearch(data);
  if (fromLegacy) return ensureSearchedClientIdOnRow(fromLegacy, searchedClientId);

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const r = tryRow(data);
    if (r) return r;
  }

  return null;
}

/** Display name from GET /invoices/searchbyclient JSON (first invoice / embedded client fields). */
export function clientDisplayNameFromSearchByClientResponse(data, searchedClientId) {
  const row = extractClientRowFromSearchByClientResponse(data, searchedClientId);
  if (!row) return "";
  return clientDisplayName(row) || "";
}
