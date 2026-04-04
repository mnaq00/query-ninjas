import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  createInvoice,
  listInvoicesByPaymentStatus,
  viewInvoiceStatus,
  markInvoicePaid,
  sendInvoiceEmail,
  searchClientsByClientId,
  searchInvoicesByClientId,
  openInvoicePdfInNewTab,
  getClient,
  getProduct,
  getStoredBusinessId,
  getStoredClientId,
  extractId,
  archiveInvoice,
} from "../services/api";
import { ErrorAlert, ErrorAlertAutoDismiss, formatApiError } from "../utils/formErrors";
import PageBackButton from "../components/PageBackButton";
import RefreshTableButton from "../components/RefreshTableButton";
import { useTimedTableRefreshSuccess } from "../hooks/useTimedTableRefreshSuccess";
import InvoiceLineItemRow from "../components/InvoiceLineItemRow";
import { clientDisplayNameFromSearchByClientResponse } from "../utils/searchByClient";
import { clientDisplayName } from "../utils/clientRecord";
import { unitPriceFromProductPayload } from "../utils/productRecord";

const PAYMENT_STATUS_PAGE_SIZE = 8;
const INVOICE_HISTORY_PAGE_SIZE = 6;
const RECENT_INVOICES_PAGE_SIZE = 5;

const RECENT_INVOICES_SORT = {
  UPDATED_DESC: "updated_desc",
  TOTAL_DESC: "total_desc",
  TOTAL_ASC: "total_asc",
  OLDEST_DESC: "oldest_desc",
  NEWEST_DESC: "newest_desc",
};

const INVOICE_CREATED_AT_KEYS = [
  "CreatedAt",
  "created_at",
  "Created",
  "createdAt",
  "creation_date",
  "date_created",
  "CreatedOn",
  "created_on",
];

const INVOICE_UPDATED_AT_KEYS = [
  "UpdatedAt",
  "updated_at",
  "Updated",
  "updatedAt",
  "modified_at",
  "ModifiedAt",
  "last_modified",
  "LastModified",
];

function pickFirstString(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    if (typeof v === "boolean" || (typeof v === "object" && v !== null)) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return "";
}

/** Uppercase first letter only; keeps "—" and other non-text placeholders as-is. */
function capitalizeStatusDisplay(value) {
  if (value == null || value === "") return "";
  const s = String(value);
  if (s === "—") return "—";
  const t = s.trim();
  if (!t) return s;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Same nesting as Clients page so invoice search payloads expose client name fields. */
const HISTORY_CLIENT_NEST_KEYS = [
  "client",
  "Client",
  "customer",
  "Customer",
  "contact",
  "Contact",
  "user",
  "User",
  "profile",
  "Profile",
  "details",
  "Details",
  "bill_to",
  "BillTo",
  "billTo",
  "recipient",
  "Recipient",
];

function shallowMergeNestedObjects(base) {
  if (!base || typeof base !== "object" || Array.isArray(base)) return {};
  let out = { ...base };
  for (const k of HISTORY_CLIENT_NEST_KEYS) {
    const inner = out[k];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      out = { ...out, ...inner };
    }
  }
  return out;
}

function flattenInvoiceClientFields(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  return shallowMergeNestedObjects(shallowMergeNestedObjects(obj));
}

function pickNameLikeFromKeys(obj) {
  if (!obj || typeof obj !== "object") return "";
  for (const key of Object.keys(obj)) {
    if (!/(customer|client|billto|bill_to|recipient|contact|party|payer)/i.test(key)) continue;
    if (!/(^|_)(name|company|org)|Name|Company$/i.test(key)) continue;
    const v = obj[key];
    if (v == null || typeof v === "boolean" || (typeof v === "object" && v !== null)) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return "";
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

function mergeInvoiceHistoryFields(obj) {
  if (!obj || typeof obj !== "object") return {};
  let m = { ...obj };
  const inner = m.invoice ?? m.Invoice;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    m = { ...inner, ...m };
  }
  return flattenInvoiceClientFields(m);
}

function historyInvoiceNumericId(inv) {
  const m = mergeInvoiceHistoryFields(inv);
  const v = m.ID ?? m.id ?? m.InvoiceID ?? m.invoice_id ?? m.InvoiceId;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function historyInvoiceAmountDisplay(inv) {
  const m = mergeInvoiceHistoryFields(inv);
  const raw =
    m.total ??
    m.Total ??
    m.total_amount ??
    m.TotalAmount ??
    m.grand_total ??
    m.GrandTotal ??
    m.amount ??
    m.Amount ??
    m.amount_due ??
    m.AmountDue;
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isFinite(n)) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(raw).trim() || "—";
}

function historyInvoiceTotalNumeric(inv) {
  const m = mergeInvoiceHistoryFields(inv);
  const raw =
    m.total ??
    m.Total ??
    m.total_amount ??
    m.TotalAmount ??
    m.grand_total ??
    m.GrandTotal ??
    m.amount ??
    m.Amount ??
    m.amount_due ??
    m.AmountDue;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function historyInvoicePaymentStatus(inv) {
  const m = mergeInvoiceHistoryFields(inv);
  return (
    pickFirstString(m, [
      "customer_payment_status",
      "Customer_payment_status",
      "CustomerPaymentStatus",
      "payment_status",
      "Payment_status",
      "PaymentStatus",
      "customer_payment",
      "CustomerPayment",
    ]) || "—"
  );
}

/** Draft / sent / etc. from GET /invoices/ViewInvoiceStatus rows. */
function historyInvoiceDocumentStatus(inv) {
  const m = mergeInvoiceHistoryFields(inv);
  return (
    pickFirstString(m, [
      "invoice_status",
      "Invoice_status",
      "InvoiceStatus",
      "invoice_state",
      "InvoiceState",
      "document_status",
      "DocumentStatus",
      "Status",
      "status",
    ]) || "—"
  );
}

function historyInvoiceClientName(inv) {
  const m = mergeInvoiceHistoryFields(inv);
  const direct = pickFirstString(m, [
    "name",
    "Name",
    "customer_name",
    "Customer_name",
    "CustomerName",
    "client_name",
    "ClientName",
    "full_name",
    "FullName",
    "contact_name",
    "ContactName",
    "username",
    "Username",
    "BillToName",
    "bill_to_name",
    "RecipientName",
    "recipient_name",
    "Customer",
    "customer",
    "CompanyName",
    "company_name",
    "Company",
    "company",
  ]);
  if (direct) return direct;
  const fuzzy = pickNameLikeFromKeys(m);
  return fuzzy || "—";
}

function historyInvoiceClientNumericId(inv) {
  const m = mergeInvoiceHistoryFields(inv);
  const v =
    m.client_id ??
    m.ClientID ??
    m.ClientId ??
    m.customer_id ??
    m.CustomerID ??
    m.Client_Id;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function timestampMsFromMergedFields(m, keys) {
  if (!m || typeof m !== "object") return null;
  for (const k of keys) {
    const v = m[k];
    if (v == null || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      return v < 1e12 ? v * 1000 : v;
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

/** Date only (no time) for invoices table created/updated columns. */
function formatInvoiceDateOnlyDisplay(m, keys) {
  const ms = timestampMsFromMergedFields(m, keys);
  if (ms == null) return "—";
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return "—";
  }
}

function recentInvoiceRecencySortMs(inv) {
  const m = mergeInvoiceHistoryFields(inv);
  const updated = timestampMsFromMergedFields(m, INVOICE_UPDATED_AT_KEYS);
  const created = timestampMsFromMergedFields(m, INVOICE_CREATED_AT_KEYS);
  return updated ?? created ?? 0;
}

function clientNameFromViewInvoiceStatusResponse(data, targetInvoiceId) {
  if (!data || typeof data !== "object") return "";
  const n = Number(targetInvoiceId);
  if (!Number.isFinite(n) || n <= 0) return "";
  const matchRow = (raw) => {
    if (!raw || typeof raw !== "object") return "";
    const id = historyInvoiceNumericId(raw);
    if (id == null || Number(id) !== n) return "";
    const name = historyInvoiceClientName(raw);
    return name === "—" ? "" : name;
  };
  const list = getInvoicesListFromSearchResponse(data);
  for (const raw of list) {
    const found = matchRow(raw);
    if (found) return found;
  }
  return matchRow(data);
}

/** Client name for an invoice via GET /invoices/ViewInvoiceStatus (invoice_id if supported, else scan by payment status). */
async function resolveClientNameFromViewInvoiceStatusApis(invoiceIdNum) {
  const id = Number(invoiceIdNum);
  if (!Number.isFinite(id) || id <= 0) return "";
  let name = "";
  try {
    const data = await viewInvoiceStatus({ invoice_id: id });
    name = clientNameFromViewInvoiceStatusResponse(data, id) || "";
  } catch {
    /* invoice_id query may be unsupported */
  }
  if (!name) {
    for (const status of ["unpaid", "paid", "overdue"]) {
      try {
        const data = await listInvoicesByPaymentStatus(status);
        name = clientNameFromViewInvoiceStatusResponse(data, id) || "";
        if (name) break;
      } catch {
        /* try next status */
      }
    }
  }
  return name;
}

function parseInvoiceHistoryTableRows(data) {
  const list = getInvoicesListFromSearchResponse(data);
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const id = historyInvoiceNumericId(raw);
    if (id == null) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      clientName: historyInvoiceClientName(raw),
      amount: historyInvoiceAmountDisplay(raw),
      status: historyInvoicePaymentStatus(raw),
    });
  }
  out.sort((a, b) => b.id - a.id);
  return out;
}

const VIEW_INVOICE_STATUS_PAYMENT_BUCKETS = ["unpaid", "paid", "overdue"];

/** Merge ViewInvoiceStatus lists (all payment buckets), dedupe, sort newest first. */
function parseRecentInvoicesTableRowsFromPayloads(payloads) {
  const merged = [];
  for (const data of payloads) {
    if (data == null) continue;
    merged.push(...getInvoicesListFromSearchResponse(data));
  }
  const seen = new Set();
  const rawUnique = [];
  for (const raw of merged) {
    const id = historyInvoiceNumericId(raw);
    if (id == null) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    rawUnique.push(raw);
  }
  return rawUnique.map((raw) => {
    const m = mergeInvoiceHistoryFields(raw);
    const updatedMs = timestampMsFromMergedFields(m, INVOICE_UPDATED_AT_KEYS);
    const createdMs = timestampMsFromMergedFields(m, INVOICE_CREATED_AT_KEYS);
    return {
      id: historyInvoiceNumericId(raw),
      clientName: historyInvoiceClientName(raw),
      total: historyInvoiceAmountDisplay(raw),
      invoiceStatus: historyInvoiceDocumentStatus(raw),
      paymentStatus: historyInvoicePaymentStatus(raw),
      createdAt: formatInvoiceDateOnlyDisplay(m, INVOICE_CREATED_AT_KEYS),
      updatedAt: formatInvoiceDateOnlyDisplay(m, INVOICE_UPDATED_AT_KEYS),
      _recencyMs: recentInvoiceRecencySortMs(raw),
      _updatedMs: updatedMs,
      _createdMs: createdMs,
      _totalNum: historyInvoiceTotalNumeric(raw),
    };
  });
}

function sortRecentInvoicesRows(rows, mode) {
  const byIdDesc = (a, b) => b.id - a.id;
  const copy = [...rows];
  if (mode === RECENT_INVOICES_SORT.UPDATED_DESC) {
    return copy.sort((a, b) => {
      const na = a._recencyMs ?? 0;
      const nb = b._recencyMs ?? 0;
      if (na !== nb) return nb - na;
      return byIdDesc(a, b);
    });
  }
  if (mode === RECENT_INVOICES_SORT.TOTAL_DESC) {
    return copy.sort((a, b) => {
      const na = a._totalNum == null ? Number.NEGATIVE_INFINITY : a._totalNum;
      const nb = b._totalNum == null ? Number.NEGATIVE_INFINITY : b._totalNum;
      if (na !== nb) return nb - na;
      return byIdDesc(a, b);
    });
  }
  if (mode === RECENT_INVOICES_SORT.TOTAL_ASC) {
    return copy.sort((a, b) => {
      const na = a._totalNum == null ? Number.POSITIVE_INFINITY : a._totalNum;
      const nb = b._totalNum == null ? Number.POSITIVE_INFINITY : b._totalNum;
      if (na !== nb) return na - nb;
      return byIdDesc(a, b);
    });
  }
  if (mode === RECENT_INVOICES_SORT.OLDEST_DESC) {
    return copy.sort((a, b) => {
      const na = a._createdMs == null ? Number.POSITIVE_INFINITY : a._createdMs;
      const nb = b._createdMs == null ? Number.POSITIVE_INFINITY : b._createdMs;
      if (na !== nb) return na - nb;
      return byIdDesc(a, b);
    });
  }
  if (mode === RECENT_INVOICES_SORT.NEWEST_DESC) {
    return copy.sort((a, b) => {
      const na = a._createdMs == null ? Number.NEGATIVE_INFINITY : a._createdMs;
      const nb = b._createdMs == null ? Number.NEGATIVE_INFINITY : b._createdMs;
      if (na !== nb) return nb - na;
      return byIdDesc(a, b);
    });
  }
  return copy.sort(byIdDesc);
}

/** Build client history rows from raw invoice objects (dedupes by invoice ID). */
function parseClientInvoiceHistoryRowsFromRawInvoiceList(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const id = historyInvoiceNumericId(raw);
    if (id == null) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      invoiceTotal: historyInvoiceAmountDisplay(raw),
      paymentStatus: historyInvoicePaymentStatus(raw),
      invoiceStatus: historyInvoiceDocumentStatus(raw),
    });
  }
  out.sort((a, b) => b.id - a.id);
  return out;
}

/**
 * Keep only rows whose payload client id matches the searched id.
 * searchbyclient should already scope results; this avoids showing stray rows if the API mis-filters.
 */
function filterRawInvoicesByClientId(list, clientNum) {
  if (!Array.isArray(list)) return [];
  return list.filter((raw) => {
    const cid = historyInvoiceClientNumericId(raw);
    return cid != null && cid === clientNum;
  });
}

function firstClientDisplayNameFromRawInvoiceList(list) {
  if (!Array.isArray(list)) return "";
  for (const raw of list) {
    const n = historyInvoiceClientName(raw);
    if (n && n !== "—") return n;
  }
  return "";
}

function defaultLine() {
  return {
    product_id: "",
    quantity: "",
  };
}

/** Acronyms kept uppercase when title-casing user-facing messages. */
const TITLE_CASE_PRESERVE = new Set(["ID", "SMTP", "PDF", "API", "URL", "VAT", "QR", "HTTP", "HTTPS"]);

/** Capitalise the first letter of each word (letters-only tokens); preserves numbers and punctuation. */
function titleCaseWords(str) {
  if (str == null) return str;
  const s = String(str);
  if (!s) return s;
  return s.replace(/[A-Za-z][A-Za-z'-]*/g, (word) => {
    const upper = word.toUpperCase();
    if (TITLE_CASE_PRESERVE.has(upper)) return upper;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/** Download PDF block: normalize API "record not found" / 404 copy. */
function messageForDownloadPdfBlockError(err) {
  const rawMsg = formatApiError(err);
  const msgLower = String(rawMsg).toLowerCase();
  if (err?.status === 404 || msgLower.includes("record not found")) {
    return titleCaseWords("Record not found.");
  }
  return titleCaseWords(rawMsg);
}

/** Title-cased API error string for inline alerts (create invoice, invoice actions, etc.). */
function formatInvoicesSharedCardError(err) {
  return titleCaseWords(formatApiError(err));
}

export default function Invoices() {
  const [clientId, setClientId] = useState(getStoredClientId());
  const [createClientNameHint, setCreateClientNameHint] = useState("");
  const [createClientNameLoading, setCreateClientNameLoading] = useState(false);
  const [taxRate, setTaxRate] = useState("20");
  const [paymentDue, setPaymentDue] = useState("");
  const [lines, setLines] = useState([defaultLine()]);

  const [payFilter, setPayFilter] = useState("unpaid");
  const [statusResult, setStatusResult] = useState(null);
  const [paymentStatusListError, setPaymentStatusListError] = useState(null);
  const [paymentStatusPdfError, setPaymentStatusPdfError] = useState(null);
  const [paymentStatusPdfOpeningId, setPaymentStatusPdfOpeningId] = useState(null);
  const [paymentStatusPage, setPaymentStatusPage] = useState(0);
  const [paymentStatusTableLoading, setPaymentStatusTableLoading] = useState(false);

  const paymentStatusRows = useMemo(() => parseInvoiceHistoryTableRows(statusResult), [statusResult]);

  const paymentStatusPageCount = Math.max(1, Math.ceil(paymentStatusRows.length / PAYMENT_STATUS_PAGE_SIZE));
  const paymentStatusPagedRows = useMemo(() => {
    const start = paymentStatusPage * PAYMENT_STATUS_PAGE_SIZE;
    return paymentStatusRows.slice(start, start + PAYMENT_STATUS_PAGE_SIZE);
  }, [paymentStatusRows, paymentStatusPage]);

  const [actionId, setActionId] = useState("");
  const [actionInvoiceClientHint, setActionInvoiceClientHint] = useState("");
  const [actionInvoiceClientLoading, setActionInvoiceClientLoading] = useState(false);
  const [invoiceActionError, setInvoiceActionError] = useState(null);
  const [invoiceActionSuccess, setInvoiceActionSuccess] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [invoiceHistoryClientId, setInvoiceHistoryClientId] = useState("");
  const [invoiceHistoryVerifyNameHint, setInvoiceHistoryVerifyNameHint] = useState("");
  const [invoiceHistoryVerifyNameLoading, setInvoiceHistoryVerifyNameLoading] = useState(false);
  const [invoiceHistoryRows, setInvoiceHistoryRows] = useState([]);
  const [invoiceHistoryLoading, setInvoiceHistoryLoading] = useState(false);
  const [invoiceHistoryError, setInvoiceHistoryError] = useState(null);
  const [invoiceHistoryLoaded, setInvoiceHistoryLoaded] = useState(false);
  const [invoiceHistoryPdfError, setInvoiceHistoryPdfError] = useState(null);
  const [invoiceHistoryPdfOpeningId, setInvoiceHistoryPdfOpeningId] = useState(null);
  const [invoiceHistoryPage, setInvoiceHistoryPage] = useState(0);

  const [recentInvoicesRows, setRecentInvoicesRows] = useState([]);
  const [recentInvoicesLoading, setRecentInvoicesLoading] = useState(true);
  const [recentInvoicesError, setRecentInvoicesError] = useState(null);
  const [recentInvoicesPage, setRecentInvoicesPage] = useState(0);
  const [recentInvoicesPdfError, setRecentInvoicesPdfError] = useState(null);
  const [recentInvoicesPdfOpeningId, setRecentInvoicesPdfOpeningId] = useState(null);
  const [recentInvoicesArchiveError, setRecentInvoicesArchiveError] = useState(null);
  const [recentInvoicesArchivingId, setRecentInvoicesArchivingId] = useState(null);
  const [recentInvoicesHasFetched, setRecentInvoicesHasFetched] = useState(false);
  const [recentInvoicesSortMode, setRecentInvoicesSortMode] = useState(RECENT_INVOICES_SORT.UPDATED_DESC);

  const {
    successVisible: recentInvoicesTableRefreshSuccess,
    showSuccess: showRecentInvoicesTableRefreshSuccess,
    hideSuccess: hideRecentInvoicesTableRefreshSuccess,
    clearTimer: clearRecentInvoicesTableRefreshTimer,
  } = useTimedTableRefreshSuccess();
  const {
    successVisible: paymentStatusTableRefreshSuccess,
    showSuccess: showPaymentStatusTableRefreshSuccess,
    hideSuccess: hidePaymentStatusTableRefreshSuccess,
    clearTimer: clearPaymentStatusTableRefreshTimer,
  } = useTimedTableRefreshSuccess();
  const {
    successVisible: invoiceHistoryTableRefreshSuccess,
    showSuccess: showInvoiceHistoryTableRefreshSuccess,
    hideSuccess: hideInvoiceHistoryTableRefreshSuccess,
    clearTimer: clearInvoiceHistoryTableRefreshTimer,
  } = useTimedTableRefreshSuccess();

  const [downloadPdfInvoiceId, setDownloadPdfInvoiceId] = useState("");
  const [downloadPdfClientHint, setDownloadPdfClientHint] = useState("");
  const [downloadPdfClientLoading, setDownloadPdfClientLoading] = useState(false);
  const [downloadPdfBlockError, setDownloadPdfBlockError] = useState(null);
  const [downloadPdfOpening, setDownloadPdfOpening] = useState(false);

  const createClientNameReqSeq = useRef(0);
  const downloadPdfViewStatusReqSeq = useRef(0);
  const actionInvoiceViewStatusReqSeq = useRef(0);
  const invoiceHistoryVerifyNameReqSeq = useRef(0);
  const paymentDueInputRef = useRef(null);

  const loadCreateFormClientNameForId = useCallback(async (n) => {
    const id = Number(n);
    if (!Number.isFinite(id) || id <= 0) {
      setCreateClientNameHint("");
      setCreateClientNameLoading(false);
      return;
    }
    const req = ++createClientNameReqSeq.current;
    setCreateClientNameLoading(true);
    try {
      const data = await searchClientsByClientId(id);
      if (req !== createClientNameReqSeq.current) return;
      setCreateClientNameHint(clientDisplayNameFromSearchByClientResponse(data, id) || "");
    } catch {
      if (req !== createClientNameReqSeq.current) return;
      setCreateClientNameHint("");
    } finally {
      if (req === createClientNameReqSeq.current) {
        setCreateClientNameLoading(false);
      }
    }
  }, []);

  const loadInvoiceHistoryVerifyClientName = useCallback(async (n, nameFallback = "") => {
    const id = Number(n);
    if (!Number.isFinite(id) || id <= 0) {
      setInvoiceHistoryVerifyNameHint("");
      setInvoiceHistoryVerifyNameLoading(false);
      return;
    }
    const req = ++invoiceHistoryVerifyNameReqSeq.current;
    setInvoiceHistoryVerifyNameLoading(true);
    try {
      const [data, profile] = await Promise.all([
        searchClientsByClientId(id),
        getClient(id).catch(() => null),
      ]);
      if (req !== invoiceHistoryVerifyNameReqSeq.current) return;
      let hint = clientDisplayNameFromSearchByClientResponse(data, id) || "";
      if (!hint && profile && typeof profile === "object") {
        hint = clientDisplayName(profile) || "";
      }
      setInvoiceHistoryVerifyNameHint(hint || String(nameFallback).trim() || "");
    } catch {
      if (req !== invoiceHistoryVerifyNameReqSeq.current) return;
      setInvoiceHistoryVerifyNameHint(String(nameFallback).trim() || "");
    } finally {
      if (req === invoiceHistoryVerifyNameReqSeq.current) {
        setInvoiceHistoryVerifyNameLoading(false);
      }
    }
  }, []);

  const loadRecentInvoices = useCallback(async () => {
    setRecentInvoicesError(null);
    setRecentInvoicesLoading(true);
    try {
      const settled = await Promise.allSettled(
        VIEW_INVOICE_STATUS_PAYMENT_BUCKETS.map((status) => listInvoicesByPaymentStatus(status))
      );
      const payloads = [];
      let firstError = null;
      for (const r of settled) {
        if (r.status === "fulfilled") {
          payloads.push(r.value);
        } else if (!firstError) {
          firstError = r.reason;
        }
      }
      if (payloads.length === 0) {
        throw firstError || new Error(titleCaseWords("Could not load invoices."));
      }
      setRecentInvoicesRows(parseRecentInvoicesTableRowsFromPayloads(payloads));
      setRecentInvoicesPage(0);
      return { ok: true };
    } catch (err) {
      setRecentInvoicesError(titleCaseWords(formatApiError(err)));
      setRecentInvoicesRows([]);
      return { ok: false };
    } finally {
      setRecentInvoicesLoading(false);
      setRecentInvoicesHasFetched(true);
    }
  }, []);

  async function handleRefreshRecentInvoicesTable() {
    clearRecentInvoicesTableRefreshTimer();
    hideRecentInvoicesTableRefreshSuccess();
    setRecentInvoicesArchiveError(null);
    const result = await loadRecentInvoices();
    if (result?.ok) showRecentInvoicesTableRefreshSuccess();
  }

  async function handleArchiveRecentInvoice(row) {
    const id = row?.id;
    if (id == null) return;
    setRecentInvoicesArchiveError(null);
    if (!window.confirm("Are you sure you want to delete this invoice?")) {
      return;
    }
    setRecentInvoicesArchivingId(id);
    try {
      await archiveInvoice(id);
      setRecentInvoicesRows((prev) => prev.filter((r) => String(r.id) !== String(id)));
    } catch (err) {
      setRecentInvoicesArchiveError(formatApiError(err));
    } finally {
      setRecentInvoicesArchivingId(null);
    }
  }

  useEffect(() => {
    void loadRecentInvoices();
  }, [loadRecentInvoices]);

  useEffect(() => {
    setClientId(getStoredClientId());
  }, []);

  useEffect(() => {
    setPaymentStatusPage(0);
  }, [statusResult]);

  useEffect(() => {
    const raw = String(clientId).trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) {
      return undefined;
    }
    setCreateClientNameHint("");
    setCreateClientNameLoading(true);
    const t = window.setTimeout(() => {
      void loadCreateFormClientNameForId(n);
    }, 400);
    return () => {
      window.clearTimeout(t);
      createClientNameReqSeq.current += 1;
    };
  }, [clientId, loadCreateFormClientNameForId]);

  useEffect(() => {
    const raw = String(invoiceHistoryClientId).trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) {
      return undefined;
    }
    setInvoiceHistoryVerifyNameLoading(true);
    const t = window.setTimeout(() => {
      void loadInvoiceHistoryVerifyClientName(n, "");
    }, 400);
    return () => {
      window.clearTimeout(t);
      invoiceHistoryVerifyNameReqSeq.current += 1;
    };
  }, [invoiceHistoryClientId, loadInvoiceHistoryVerifyClientName]);

  const invoiceHistoryPageCount = Math.max(1, Math.ceil(invoiceHistoryRows.length / INVOICE_HISTORY_PAGE_SIZE));
  const invoiceHistoryPagedRows = useMemo(() => {
    const start = invoiceHistoryPage * INVOICE_HISTORY_PAGE_SIZE;
    return invoiceHistoryRows.slice(start, start + INVOICE_HISTORY_PAGE_SIZE);
  }, [invoiceHistoryRows, invoiceHistoryPage]);

  const invoiceHistoryRefreshClientIdValid = useMemo(() => {
    const q = String(invoiceHistoryClientId).trim();
    const n = Number(q);
    return Boolean(q && Number.isFinite(n) && n > 0);
  }, [invoiceHistoryClientId]);

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(invoiceHistoryRows.length / INVOICE_HISTORY_PAGE_SIZE));
    const maxIdx = Math.max(0, pages - 1);
    setInvoiceHistoryPage((p) => Math.min(p, maxIdx));
  }, [invoiceHistoryRows.length]);

  const displayedRecentInvoicesRows = useMemo(
    () => sortRecentInvoicesRows(recentInvoicesRows, recentInvoicesSortMode),
    [recentInvoicesRows, recentInvoicesSortMode]
  );

  const recentInvoicesPageCount = Math.max(
    1,
    Math.ceil(displayedRecentInvoicesRows.length / RECENT_INVOICES_PAGE_SIZE)
  );
  const recentInvoicesPagedRows = useMemo(() => {
    const start = recentInvoicesPage * RECENT_INVOICES_PAGE_SIZE;
    return displayedRecentInvoicesRows.slice(start, start + RECENT_INVOICES_PAGE_SIZE);
  }, [displayedRecentInvoicesRows, recentInvoicesPage]);

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(displayedRecentInvoicesRows.length / RECENT_INVOICES_PAGE_SIZE));
    const maxIdx = Math.max(0, pages - 1);
    setRecentInvoicesPage((p) => Math.min(p, maxIdx));
  }, [displayedRecentInvoicesRows.length]);

  useEffect(() => {
    setRecentInvoicesPage(0);
  }, [recentInvoicesSortMode]);

  const loadDownloadPdfClientNameByViewInvoiceStatus = useCallback(async (invId) => {
    const id = Number(invId);
    if (!Number.isFinite(id) || id <= 0) {
      setDownloadPdfClientHint("");
      setDownloadPdfClientLoading(false);
      return;
    }
    const req = ++downloadPdfViewStatusReqSeq.current;
    setDownloadPdfClientLoading(true);
    try {
      const name = await resolveClientNameFromViewInvoiceStatusApis(id);
      if (req !== downloadPdfViewStatusReqSeq.current) return;
      setDownloadPdfClientHint(name);
    } finally {
      if (req === downloadPdfViewStatusReqSeq.current) {
        setDownloadPdfClientLoading(false);
      }
    }
  }, []);

  const loadActionInvoiceClientNameByViewInvoiceStatus = useCallback(async (invId) => {
    const id = Number(invId);
    if (!Number.isFinite(id) || id <= 0) {
      setActionInvoiceClientHint("");
      setActionInvoiceClientLoading(false);
      return;
    }
    const req = ++actionInvoiceViewStatusReqSeq.current;
    setActionInvoiceClientLoading(true);
    try {
      const name = await resolveClientNameFromViewInvoiceStatusApis(id);
      if (req !== actionInvoiceViewStatusReqSeq.current) return;
      setActionInvoiceClientHint(name);
    } finally {
      if (req === actionInvoiceViewStatusReqSeq.current) {
        setActionInvoiceClientLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const raw = String(downloadPdfInvoiceId).trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) {
      return undefined;
    }
    setDownloadPdfClientHint("");
    setDownloadPdfClientLoading(true);
    const t = window.setTimeout(() => {
      void loadDownloadPdfClientNameByViewInvoiceStatus(n);
    }, 400);
    return () => {
      window.clearTimeout(t);
      downloadPdfViewStatusReqSeq.current += 1;
    };
  }, [downloadPdfInvoiceId, loadDownloadPdfClientNameByViewInvoiceStatus]);

  useEffect(() => {
    const raw = String(actionId).trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) {
      return undefined;
    }
    setActionInvoiceClientHint("");
    setActionInvoiceClientLoading(true);
    const t = window.setTimeout(() => {
      void loadActionInvoiceClientNameByViewInvoiceStatus(n);
    }, 400);
    return () => {
      window.clearTimeout(t);
      actionInvoiceViewStatusReqSeq.current += 1;
    };
  }, [actionId, loadActionInvoiceClientNameByViewInvoiceStatus]);

  function handleDownloadPdfInvoiceIdChange(value) {
    setDownloadPdfInvoiceId(value);
    const raw = String(value).trim();
    const num = Number(raw);
    if (!raw || !Number.isFinite(num) || num <= 0) {
      setDownloadPdfClientHint("");
      setDownloadPdfClientLoading(false);
    }
  }

  function handleActionInvoiceIdChange(value) {
    setActionId(value);
    const raw = String(value).trim();
    const num = Number(raw);
    if (!raw || !Number.isFinite(num) || num <= 0) {
      setActionInvoiceClientHint("");
      setActionInvoiceClientLoading(false);
    }
  }

  async function handleDownloadPdfViewInNewTab() {
    setDownloadPdfBlockError(null);
    const raw = String(downloadPdfInvoiceId).trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) {
      setDownloadPdfBlockError(titleCaseWords("Enter a valid invoice ID."));
      return;
    }
    setDownloadPdfOpening(true);
    try {
      await openInvoicePdfInNewTab(n);
    } catch (err) {
      setDownloadPdfBlockError(messageForDownloadPdfBlockError(err));
    } finally {
      setDownloadPdfOpening(false);
    }
  }

  function handleCreateClientIdChange(value) {
    setClientId(value);
    const raw = String(value).trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) {
      setCreateClientNameHint("");
      setCreateClientNameLoading(false);
    }
  }

  function setLine(i, key, value) {
    setLines((rows) => {
      const next = [...rows];
      next[i] = { ...next[i], [key]: value };
      return next;
    });
  }

  function addLine() {
    setLines((rows) => [...rows, defaultLine()]);
  }

  function removeLine(i) {
    setLines((rows) => rows.filter((_, j) => j !== i));
  }

  async function handleCreateInvoice(e) {
    e.preventDefault();
    setError(null);
    setSuccess("");
    setInvoiceActionError(null);
    setInvoiceActionSuccess("");
    setLoading(true);
    try {
      const storedBusiness = getStoredBusinessId();
      const businessNum = Number(String(storedBusiness).trim());
      if (!storedBusiness || !Number.isFinite(businessNum) || businessNum <= 0) {
        setError(
          titleCaseWords(
            "Save your business profile under My profile first so your business ID is available for invoices."
          )
        );
        setLoading(false);
        return;
      }
      const items = [];
      for (const row of lines) {
        const productId = Number(row.product_id);
        if (!Number.isFinite(productId) || productId <= 0) {
          setError(titleCaseWords("Each line needs a valid product ID."));
          setLoading(false);
          return;
        }
        let pdata;
        try {
          pdata = await getProduct(productId);
        } catch (err) {
          setError(
            formatInvoicesSharedCardError(err) || titleCaseWords(`Could not load product ${productId}.`)
          );
          setLoading(false);
          return;
        }
        const price = unitPriceFromProductPayload(pdata);
        if (price == null || price < 0) {
          setError(titleCaseWords(`Product ${productId} has no usable price in the catalog.`));
          setLoading(false);
          return;
        }
        const qty = Number(String(row.quantity).trim());
        if (!String(row.quantity).trim() || !Number.isFinite(qty) || qty <= 0) {
          setError(titleCaseWords("Each line needs a valid quantity (at least 1)."));
          setLoading(false);
          return;
        }
        items.push({
          product_id: productId,
          price,
          quantity: qty,
        });
      }
      const payload = {
        business_id: businessNum,
        client_id: Number(clientId),
        tax_rate: Number(taxRate),
        invoice_status: "draft",
        customer_payment_status: "unpaid",
        items,
      };
      if (paymentDue) {
        const d = new Date(paymentDue);
        if (!Number.isNaN(d.getTime())) payload.payment_due_date = d.toISOString();
      }
      const data = await createInvoice(payload);
      const inv = data.invoice || data;
      const id = extractId(inv);
      if (id) setActionId(String(id));
      setSuccess(
        id
          ? titleCaseWords(
              `Invoice created. ID ${id} — use Invoice Actions below for mark paid or send email.`
            )
          : titleCaseWords("Invoice created.")
      );
      void loadRecentInvoices();
    } catch (err) {
      setError(formatInvoicesSharedCardError(err));
    } finally {
      setLoading(false);
    }
  }

  async function fetchPaymentStatusList(options = {}) {
    const { clearStatusResult = false } = options;
    setPaymentStatusListError(null);
    setPaymentStatusPdfError(null);
    if (clearStatusResult) setStatusResult(null);
    setPaymentStatusTableLoading(true);
    try {
      const data = await listInvoicesByPaymentStatus(payFilter);
      setStatusResult(data);
      setPaymentStatusPage(0);
      return { ok: true };
    } catch (err) {
      setPaymentStatusListError(formatInvoicesSharedCardError(err));
      return { ok: false };
    } finally {
      setPaymentStatusTableLoading(false);
    }
  }

  async function handleListStatus(e) {
    e.preventDefault();
    await fetchPaymentStatusList({ clearStatusResult: true });
  }

  async function handleRefreshPaymentStatusTable() {
    clearPaymentStatusTableRefreshTimer();
    hidePaymentStatusTableRefreshSuccess();
    const { ok } = await fetchPaymentStatusList({ clearStatusResult: false });
    if (ok) showPaymentStatusTableRefreshSuccess();
  }

  async function handlePaymentStatusListPdf(id) {
    setPaymentStatusPdfError(null);
    setPaymentStatusPdfOpeningId(id);
    try {
      await openInvoicePdfInNewTab(id);
    } catch (err) {
      setPaymentStatusPdfError(titleCaseWords(formatApiError(err)));
    } finally {
      setPaymentStatusPdfOpeningId((cur) => (cur === id ? null : cur));
    }
  }

  async function handlePaid() {
    setInvoiceActionError(null);
    setInvoiceActionSuccess("");
    setLoading(true);
    try {
      await markInvoicePaid(Number(actionId));
      setInvoiceActionSuccess(titleCaseWords("Invoice marked Paid"));
    } catch (err) {
      setInvoiceActionError(formatInvoicesSharedCardError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const raw = String(actionId).trim();
    const id = Number(raw);
    if (!raw || !Number.isFinite(id) || id <= 0) {
      return;
    }
    const nameTrim = String(actionInvoiceClientHint).trim();
    const namePart = nameTrim ? ` — ${nameTrim}` : "";
    const ok = window.confirm(
      titleCaseWords(`Send invoice email for invoice #${id}${namePart}?`)
    );
    if (!ok) return;

    setInvoiceActionError(null);
    setInvoiceActionSuccess("");
    setLoading(true);
    try {
      await sendInvoiceEmail(id, "ready_to_send");
      setInvoiceActionSuccess(titleCaseWords("Send request completed (requires SMTP on server)."));
    } catch (err) {
      setInvoiceActionError(formatInvoicesSharedCardError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleInvoiceHistoryClientIdChange(value) {
    setInvoiceHistoryClientId(value);
    setInvoiceHistoryRows([]);
    setInvoiceHistoryLoaded(false);
    setInvoiceHistoryPage(0);
    const raw = String(value).trim();
    const num = Number(raw);
    if (!raw || !Number.isFinite(num) || num <= 0) {
      setInvoiceHistoryVerifyNameHint("");
      setInvoiceHistoryVerifyNameLoading(false);
    }
  }

  async function loadInvoiceHistoryForClient(clientNum) {
    setInvoiceHistoryError(null);
    setInvoiceHistoryPdfError(null);
    setInvoiceHistoryLoading(true);
    setInvoiceHistoryLoaded(false);
    try {
      /* GET /invoices/searchbyclient?client_id= — canonical list for one client (all statuses). */
      const data = await searchInvoicesByClientId(clientNum);
      const list = getInvoicesListFromSearchResponse(data);
      const forClient = filterRawInvoicesByClientId(list, clientNum);
      const nameFromRows = firstClientDisplayNameFromRawInvoiceList(forClient);
      setInvoiceHistoryRows(parseClientInvoiceHistoryRowsFromRawInvoiceList(forClient));
      setInvoiceHistoryPage(0);
      setInvoiceHistoryLoaded(true);
      await loadInvoiceHistoryVerifyClientName(clientNum, nameFromRows);
      return { ok: true };
    } catch (err) {
      setInvoiceHistoryError(formatInvoicesSharedCardError(err));
      setInvoiceHistoryRows([]);
      setInvoiceHistoryLoaded(false);
      return { ok: false };
    } finally {
      setInvoiceHistoryLoading(false);
    }
  }

  async function handleInvoiceHistorySearch(e) {
    e.preventDefault();
    const q = invoiceHistoryClientId.trim();
    const clientNum = Number(q);
    if (!q || !Number.isFinite(clientNum) || clientNum <= 0) {
      setInvoiceHistoryError(titleCaseWords("Enter a valid client ID (positive number)."));
      return;
    }
    await loadInvoiceHistoryForClient(clientNum);
  }

  async function handleRefreshInvoiceHistoryTable() {
    clearInvoiceHistoryTableRefreshTimer();
    hideInvoiceHistoryTableRefreshSuccess();
    const q = invoiceHistoryClientId.trim();
    const clientNum = Number(q);
    if (!q || !Number.isFinite(clientNum) || clientNum <= 0) return;
    const { ok } = await loadInvoiceHistoryForClient(clientNum);
    if (ok) showInvoiceHistoryTableRefreshSuccess();
  }

  async function handleHistoryInvoicePdf(id) {
    setInvoiceHistoryPdfError(null);
    setInvoiceHistoryPdfOpeningId(id);
    try {
      await openInvoicePdfInNewTab(id);
    } catch (err) {
      setInvoiceHistoryPdfError(titleCaseWords(formatApiError(err)));
    } finally {
      setInvoiceHistoryPdfOpeningId((cur) => (cur === id ? null : cur));
    }
  }

  async function handleRecentInvoicePdf(id) {
    setRecentInvoicesPdfError(null);
    setRecentInvoicesPdfOpeningId(id);
    try {
      await openInvoicePdfInNewTab(id);
    } catch (err) {
      setRecentInvoicesPdfError(formatApiError(err));
    } finally {
      setRecentInvoicesPdfOpeningId((cur) => (cur === id ? null : cur));
    }
  }

  return (
    <div className="invoices-page">
      <div className="invoices-page-header">
        <PageBackButton />
        <h1 className="invoices-page-title">Invoices</h1>
      </div>
      <div className="card invoices-recent-card">
        <div className="table-section-heading invoices-recent-invoices-heading">
          <h2>Invoices:</h2>
          <div className="clients-heading-actions">
            {!recentInvoicesLoading && recentInvoicesHasFetched ? (
              <label className="clients-sort-field clients-sort-field--inline" htmlFor="recent-invoices-sort-select">
                <svg
                  className="clients-sort-icon"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <rect x="3" y="3" width="3" height="8.5" rx="1.5" />
                  <path d="M 4.5 18 L 2 12.5 h 5 L 4.5 18 z" />
                  <rect x="11" y="4" width="10" height="2.5" rx="1.25" />
                  <rect x="11" y="8.5" width="8" height="2.5" rx="1.25" />
                  <rect x="11" y="13" width="6" height="2.5" rx="1.25" />
                  <rect x="11" y="17.5" width="4" height="2.5" rx="1.25" />
                </svg>
                <span className="clients-sort-label-text">Filter by</span>
                <select
                  id="recent-invoices-sort-select"
                  className="clients-sort-select"
                  value={recentInvoicesSortMode}
                  onChange={(e) => setRecentInvoicesSortMode(e.target.value)}
                >
                  <option value={RECENT_INVOICES_SORT.UPDATED_DESC}>{titleCaseWords("Recently updated")}</option>
                  <option value={RECENT_INVOICES_SORT.TOTAL_DESC}>{titleCaseWords("Highest total")}</option>
                  <option value={RECENT_INVOICES_SORT.TOTAL_ASC}>{titleCaseWords("Lowest total")}</option>
                  <option value={RECENT_INVOICES_SORT.OLDEST_DESC}>{titleCaseWords("Oldest")}</option>
                  <option value={RECENT_INVOICES_SORT.NEWEST_DESC}>{titleCaseWords("Newest")}</option>
                </select>
              </label>
            ) : null}
            <RefreshTableButton
              loading={recentInvoicesLoading}
              disabled={!recentInvoicesHasFetched}
              onClick={() => void handleRefreshRecentInvoicesTable()}
              ariaLabel={titleCaseWords("Refresh invoices table")}
            />
          </div>
        </div>
        {recentInvoicesTableRefreshSuccess ? (
          <div className="alert alert-success" role="status">
            Your table has been refreshed.
          </div>
        ) : null}
        <ErrorAlert error={recentInvoicesError} />
        <ErrorAlert error={recentInvoicesPdfError} />
        <ErrorAlert error={recentInvoicesArchiveError} />
        {recentInvoicesLoading && recentInvoicesRows.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {titleCaseWords("Loading…")}
          </p>
        ) : null}
        {recentInvoicesHasFetched && !recentInvoicesLoading && recentInvoicesRows.length === 0 && !recentInvoicesError ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {titleCaseWords("No invoices found.")}
          </p>
        ) : null}
        {recentInvoicesRows.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data-table recent-invoices-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Client Name</th>
                    <th>Status</th>
                    <th>Total (£)</th>
                    <th>Payment Status</th>
                    <th>{titleCaseWords("created at")}</th>
                    <th>{titleCaseWords("updated at")}</th>
                    <th className="col-archive" scope="col" aria-label="Delete invoice" />
                  </tr>
                </thead>
                <tbody>
                  {recentInvoicesPagedRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          type="button"
                          className="invoice-pdf-link"
                          disabled={recentInvoicesPdfOpeningId === row.id}
                          onClick={() => void handleRecentInvoicePdf(row.id)}
                          title={titleCaseWords("Open PDF in a new tab")}
                        >
                          {recentInvoicesPdfOpeningId === row.id ? titleCaseWords("Opening…") : row.id}
                        </button>
                      </td>
                      <td>{row.clientName}</td>
                      <td>{row.invoiceStatus}</td>
                      <td>{row.total}</td>
                      <td>{row.paymentStatus}</td>
                      <td>{row.createdAt}</td>
                      <td>{row.updatedAt}</td>
                      <td className="col-archive">
                        <button
                          type="button"
                          className="invoices-archive-btn"
                          disabled={recentInvoicesArchivingId === row.id}
                          aria-label={titleCaseWords(`Delete invoice ${row.id}`)}
                          title={titleCaseWords("Delete invoice (archived on server)")}
                          onClick={() => void handleArchiveRecentInvoice(row)}
                        >
                          {recentInvoicesArchivingId === row.id ? "…" : "×"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination table-pagination--balanced">
              <div className="table-pagination-inner">
                <div className="table-pagination-spacer" aria-hidden="true" />
                <div className="table-pagination-controls">
                  <div className="btn-row table-pagination-prev-next">
                    <button
                      type="button"
                      className="btn"
                      disabled={recentInvoicesPage <= 0}
                      onClick={() => setRecentInvoicesPage((p) => Math.max(0, p - 1))}
                    >
                      {titleCaseWords("Previous")}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={recentInvoicesPage >= recentInvoicesPageCount - 1}
                      onClick={() => setRecentInvoicesPage((p) => Math.min(recentInvoicesPageCount - 1, p + 1))}
                    >
                      {titleCaseWords("Next")}
                    </button>
                  </div>
                </div>
                <div className="table-pagination-meta-aside">
                  <span className="hint table-pagination-meta">
                    {`Showing ${recentInvoicesPage * RECENT_INVOICES_PAGE_SIZE + 1} – ${Math.min(
                      (recentInvoicesPage + 1) * RECENT_INVOICES_PAGE_SIZE,
                      displayedRecentInvoicesRows.length
                    )} of ${displayedRecentInvoicesRows.length}${
                      recentInvoicesPageCount > 1
                        ? ` (page ${recentInvoicesPage + 1} of ${recentInvoicesPageCount})`
                        : ""
                    }`}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="card invoices-create-card">
        <h2>Create Invoice</h2>
        <ErrorAlert error={error} />
        {success ? <div className="alert alert-success">{success}</div> : null}
        <form onSubmit={handleCreateInvoice} className="form-grid">
          <div className="field create-invoice-client-field">
            <div className="create-invoice-client-pair">
              <label htmlFor="create-invoice-client-id" className="create-invoice-client-sublabel">
            Client ID
          </label>
              <label htmlFor="create-invoice-client-name" className="create-invoice-client-sublabel">
                Name
              </label>
              <input
                id="create-invoice-client-id"
                type="number"
                min="1"
                value={clientId}
                onChange={(e) => handleCreateClientIdChange(e.target.value)}
                onBlur={() => {
                  const raw = String(clientId).trim();
                  const n = Number(raw);
                  if (!raw || !Number.isFinite(n) || n <= 0) return;
                  void loadCreateFormClientNameForId(n);
                }}
                required
              />
              <input
                id="create-invoice-client-name"
                type="text"
                readOnly
                tabIndex={-1}
                className="create-invoice-client-name-box"
                value={createClientNameLoading ? "" : createClientNameHint}
                placeholder={createClientNameLoading ? titleCaseWords("Looking up…") : "—"}
                title={createClientNameHint || undefined}
                aria-live="polite"
              />
            </div>
          </div>
          <label className="field">
            {titleCaseWords("Tax rate (%)")}
            <input type="number" step="0.01" min="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} required />
          </label>
          <label className="field create-invoice-payment-due-field">
            {titleCaseWords("Payment due")}
            <div className="create-invoice-payment-due-control">
              <input
                ref={paymentDueInputRef}
                className="create-invoice-payment-due-input"
                type="date"
                value={paymentDue}
                onChange={(e) => setPaymentDue(e.target.value)}
                aria-label="Choose payment date"
              />
              <button
                type="button"
                className="create-invoice-payment-due-picker-btn"
                title="Choose payment date"
                aria-label="Choose payment date"
                onClick={() => {
                  const el = paymentDueInputRef.current;
                  if (!el) return;
                  if (typeof el.showPicker === "function") {
                    try {
                      el.showPicker();
                    } catch {
                      el.focus();
                    }
                  } else {
                    el.focus();
                  }
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={18}
                  height={18}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
            </div>
          </label>

          <div className="line-items-table-section">
            <div className="line-items-toolbar">
              <button type="button" className="btn" onClick={addLine}>
                {titleCaseWords("Add additional products/services")}
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table line-items-table">
                <thead>
                  <tr>
                    <th className="col-id">Product ID</th>
                    <th>Name</th>
                    <th className="col-qty">Qty</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
            {lines.map((row, i) => (
                    <InvoiceLineItemRow
                      key={i}
                      productId={row.product_id}
                      quantity={row.quantity}
                      onProductIdChange={(value) => setLine(i, "product_id", value)}
                      onQuantityChange={(value) => setLine(i, "quantity", value)}
                      onRemove={() => removeLine(i)}
                      disableRemove={lines.length < 2}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {titleCaseWords("Create invoice")}
          </button>
        </form>
      </div>

      <div className="invoices-after-create">
      <div className="card">
        <h2>Download PDF</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          {titleCaseWords("Enter your invoice ID below and click the button to generate PDF.")}
        </p>
        <ErrorAlertAutoDismiss error={downloadPdfBlockError} onDismiss={() => setDownloadPdfBlockError(null)} />
        <div className="form-grid invoices-stretch-actions-form">
          <div className="field create-invoice-client-field">
            <div className="create-invoice-client-pair">
              <label htmlFor="download-pdf-invoice-id" className="create-invoice-client-sublabel">
                Invoice ID
                </label>
              <label htmlFor="download-pdf-client-name" className="create-invoice-client-sublabel">
                Client name
                </label>
                  <input
                id="download-pdf-invoice-id"
                    type="number"
                    min="1"
                value={downloadPdfInvoiceId}
                onChange={(e) => handleDownloadPdfInvoiceIdChange(e.target.value)}
                onBlur={() => {
                  const raw = String(downloadPdfInvoiceId).trim();
                  const n = Number(raw);
                  if (!raw || !Number.isFinite(n) || n <= 0) return;
                  void loadDownloadPdfClientNameByViewInvoiceStatus(n);
                }}
                placeholder="e.g. 12"
              />
              <input
                id="download-pdf-client-name"
                type="text"
                readOnly
                tabIndex={-1}
                className="create-invoice-client-name-box"
                value={downloadPdfClientLoading ? "" : downloadPdfClientHint}
                placeholder={downloadPdfClientLoading ? titleCaseWords("Looking up…") : "—"}
                title={downloadPdfClientHint || undefined}
                aria-live="polite"
              />
              </div>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              disabled={downloadPdfOpening || !String(downloadPdfInvoiceId).trim()}
              onClick={() => {
                void handleDownloadPdfViewInNewTab();
              }}
            >
              {downloadPdfOpening ? titleCaseWords("Opening…") : titleCaseWords("View PDF")}
          </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Invoice Actions</h2>
        <p className="hint">Mark paid or send email.</p>
        <ErrorAlert error={invoiceActionError} />
        {invoiceActionSuccess ? <div className="alert alert-success">{invoiceActionSuccess}</div> : null}
        <div className="form-grid invoices-stretch-actions-form">
          <div className="field create-invoice-client-field">
            <div className="create-invoice-client-pair">
              <label htmlFor="invoice-actions-invoice-id" className="create-invoice-client-sublabel">
            Invoice ID
          </label>
              <label htmlFor="invoice-actions-customer-name" className="create-invoice-client-sublabel">
                Client Name
              </label>
              <input
                id="invoice-actions-invoice-id"
                type="number"
                min="1"
                value={actionId}
                onChange={(e) => handleActionInvoiceIdChange(e.target.value)}
                onBlur={() => {
                  const raw = String(actionId).trim();
                  const n = Number(raw);
                  if (!raw || !Number.isFinite(n) || n <= 0) return;
                  void loadActionInvoiceClientNameByViewInvoiceStatus(n);
                }}
                placeholder="e.g. 12"
              />
              <input
                id="invoice-actions-customer-name"
                type="text"
                readOnly
                tabIndex={-1}
                className="create-invoice-client-name-box"
                value={actionInvoiceClientLoading ? "" : actionInvoiceClientHint}
                placeholder={actionInvoiceClientLoading ? titleCaseWords("Looking up…") : "—"}
                title={actionInvoiceClientHint || undefined}
                aria-live="polite"
              />
            </div>
          </div>
          <div className="btn-row">
            <button type="button" className="btn" disabled={loading || !actionId} onClick={handlePaid}>
              Mark Paid
            </button>
            <button type="button" className="btn" disabled={loading || !actionId} onClick={handleSend}>
              Send Email
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-section-heading">
          <h2>View Invoice Payment Status</h2>
          <RefreshTableButton
            loading={paymentStatusTableLoading}
            onClick={() => void handleRefreshPaymentStatusTable()}
            ariaLabel={titleCaseWords("Refresh payment status invoice table")}
          />
        </div>
        {paymentStatusTableRefreshSuccess ? (
          <div className="alert alert-success" role="status">
            Your table has been refreshed.
          </div>
        ) : null}
        <p className="hint" style={{ marginTop: 0 }}>
          {titleCaseWords("Filter by payment status to view your invoices.")}
        </p>
        <ErrorAlert error={paymentStatusListError} />
        <ErrorAlertAutoDismiss error={paymentStatusPdfError} onDismiss={() => setPaymentStatusPdfError(null)} />
        <form onSubmit={handleListStatus} className="form-grid invoices-stretch-actions-form invoices-load-form">
          <label className="field">
            Status
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>
          <button type="submit" className="btn" disabled={paymentStatusTableLoading}>
            {titleCaseWords("Load")}
          </button>
        </form>
        {statusResult && paymentStatusRows.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {titleCaseWords("No invoices found for this payment status.")}
          </p>
        ) : null}
        {paymentStatusRows.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data-table invoice-history-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{titleCaseWords("Customer name")}</th>
                    <th>Total (£)</th>
                    <th>{titleCaseWords("Payment status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentStatusPagedRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          type="button"
                          className="invoice-pdf-link"
                          disabled={paymentStatusPdfOpeningId === row.id}
                          onClick={() => handlePaymentStatusListPdf(row.id)}
                          title={titleCaseWords("Open PDF in a new tab")}
                        >
                          {paymentStatusPdfOpeningId === row.id ? titleCaseWords("Opening…") : row.id}
                        </button>
                      </td>
                      <td>{row.clientName}</td>
                      <td>{row.amount}</td>
                      <td>{capitalizeStatusDisplay(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination table-pagination--balanced">
              <div className="table-pagination-inner">
                <div className="table-pagination-spacer" aria-hidden="true" />
                <div className="table-pagination-controls">
                  <div className="btn-row table-pagination-prev-next">
                    <button
                      type="button"
                      className="btn"
                      disabled={paymentStatusPage <= 0}
                      onClick={() => setPaymentStatusPage((p) => Math.max(0, p - 1))}
                    >
                      {titleCaseWords("Previous")}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={paymentStatusPage >= paymentStatusPageCount - 1}
                      onClick={() => setPaymentStatusPage((p) => Math.min(paymentStatusPageCount - 1, p + 1))}
                    >
                      {titleCaseWords("Next")}
                    </button>
                  </div>
                </div>
                <div className="table-pagination-meta-aside">
                  <span className="hint table-pagination-meta">
                    {titleCaseWords(
                      `Showing ${paymentStatusPage * PAYMENT_STATUS_PAGE_SIZE + 1} – ${Math.min(
                        (paymentStatusPage + 1) * PAYMENT_STATUS_PAGE_SIZE,
                        paymentStatusRows.length
                      )} of ${paymentStatusRows.length}${
                        paymentStatusPageCount > 1
                          ? ` (page ${paymentStatusPage + 1} of ${paymentStatusPageCount})`
                          : ""
                      }`
                    )}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="card">
        <div className="table-section-heading">
          <h2>Client Invoice History</h2>
          <RefreshTableButton
            loading={invoiceHistoryLoading}
            disabled={!invoiceHistoryRefreshClientIdValid}
            onClick={() => void handleRefreshInvoiceHistoryTable()}
            ariaLabel={titleCaseWords("Refresh client invoice history table")}
          />
        </div>
        {invoiceHistoryTableRefreshSuccess ? (
          <div className="alert alert-success" role="status">
            Your table has been refreshed.
          </div>
        ) : null}
        <p className="hint" style={{ marginTop: 0 }}>
          {titleCaseWords("Enter client ID to view all client invoices.")}
        </p>
        <ErrorAlert error={invoiceHistoryError} />
        <ErrorAlertAutoDismiss error={invoiceHistoryPdfError} onDismiss={() => setInvoiceHistoryPdfError(null)} />
        <form
          className="form-grid invoices-stretch-actions-form invoices-load-form"
          onSubmit={handleInvoiceHistorySearch}
          style={{ marginBottom: "1.25rem" }}
        >
          <div className="field create-invoice-client-field">
            <div className="create-invoice-client-pair">
              <label htmlFor="invoice-history-client-id" className="create-invoice-client-sublabel">
                Client ID
          </label>
              <label htmlFor="invoice-history-verify-client-name" className="create-invoice-client-sublabel">
                Client name
              </label>
              <input
                id="invoice-history-client-id"
                type="number"
                min="1"
                value={invoiceHistoryClientId}
                onChange={(e) => handleInvoiceHistoryClientIdChange(e.target.value)}
                onBlur={() => {
                  const raw = String(invoiceHistoryClientId).trim();
                  const n = Number(raw);
                  if (!raw || !Number.isFinite(n) || n <= 0) return;
                  void loadInvoiceHistoryVerifyClientName(n);
                }}
                required
                placeholder="e.g. 7"
              />
              <input
                id="invoice-history-verify-client-name"
                type="text"
                readOnly
                tabIndex={-1}
                className="create-invoice-client-name-box"
                value={invoiceHistoryVerifyNameHint}
                placeholder={invoiceHistoryVerifyNameLoading ? "Looking up…" : "—"}
                title={invoiceHistoryVerifyNameHint || undefined}
                aria-live="polite"
              />
            </div>
          </div>
          <button type="submit" className="btn" disabled={invoiceHistoryLoading}>
            {invoiceHistoryLoading ? titleCaseWords("Loading…") : titleCaseWords("Load invoice history")}
          </button>
        </form>
        {!invoiceHistoryLoading && invoiceHistoryLoaded && invoiceHistoryRows.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {titleCaseWords("No invoices found for this client.")}
          </p>
        ) : null}
        {invoiceHistoryRows.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data-table invoice-history-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Invoice total (£)</th>
                    <th>Payment status</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceHistoryPagedRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          type="button"
                          className="invoice-pdf-link"
                          disabled={invoiceHistoryPdfOpeningId === row.id}
                          onClick={() => handleHistoryInvoicePdf(row.id)}
                          title={titleCaseWords("Open PDF in a new tab")}
                        >
                          {invoiceHistoryPdfOpeningId === row.id ? titleCaseWords("Opening…") : row.id}
                        </button>
                      </td>
                      <td>{row.invoiceTotal}</td>
                      <td>{capitalizeStatusDisplay(row.paymentStatus)}</td>
                      <td>{capitalizeStatusDisplay(row.invoiceStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination table-pagination--balanced">
              <div className="table-pagination-inner">
                <div className="table-pagination-spacer" aria-hidden="true" />
                <div className="table-pagination-controls">
                  <div className="btn-row table-pagination-prev-next">
                    <button
                      type="button"
                      className="btn"
                      disabled={invoiceHistoryPage <= 0}
                      onClick={() => setInvoiceHistoryPage((p) => Math.max(0, p - 1))}
                    >
                      {titleCaseWords("Previous")}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={invoiceHistoryPage >= invoiceHistoryPageCount - 1}
                      onClick={() => setInvoiceHistoryPage((p) => Math.min(invoiceHistoryPageCount - 1, p + 1))}
                    >
                      {titleCaseWords("Next")}
                    </button>
                  </div>
                </div>
                <div className="table-pagination-meta-aside">
                  <span className="hint table-pagination-meta">
                    {titleCaseWords(
                      `Showing ${invoiceHistoryPage * INVOICE_HISTORY_PAGE_SIZE + 1} – ${Math.min(
                        (invoiceHistoryPage + 1) * INVOICE_HISTORY_PAGE_SIZE,
                        invoiceHistoryRows.length
                      )} of ${invoiceHistoryRows.length}${
                        invoiceHistoryPageCount > 1
                          ? ` (page ${invoiceHistoryPage + 1} of ${invoiceHistoryPageCount})`
                          : ""
                      }`
                    )}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
      </div>
    </div>
  );
}
