import React, { useState, useEffect, useMemo } from "react";
import {
  createClient,
  updateClient,
  getClient,
  listClients,
  listInvoicesByPaymentStatus,
  fetchStoredClients,
  extractId,
  getStoredClientId,
  setStoredClientId,
  archiveClient,
  removeStoredClientId,
} from "../services/api";
import { ErrorAlert, formatApiError } from "../utils/formErrors";
import PageBackButton from "../components/PageBackButton";
import RefreshTableButton from "../components/RefreshTableButton";
import { useTimedTableRefreshSuccess } from "../hooks/useTimedTableRefreshSuccess";

/** Max data rows per page in the Your Clients table (not counting header). */
const CLIENTS_TABLE_PAGE_SIZE = 5;

const CLIENTS_SORT = {
  CREATED_ASC: "created_asc",
  CREATED_DESC: "created_desc",
  INVOICES_DESC: "invoices_desc",
  INVOICES_ASC: "invoices_asc",
};

const CLIENT_CREATED_AT_KEYS = [
  "CreatedAt",
  "created_at",
  "createdAt",
  "Created",
  "created",
  "CreateTime",
  "create_time",
  "DateCreated",
  "date_created",
];

function clientCreatedAtMs(c) {
  const o = flattenClientRecord(c);
  for (const k of CLIENT_CREATED_AT_KEYS) {
    const v = o[k];
    if (v == null || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      return v < 1e12 ? v * 1000 : v;
    }
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

function invoicesArrayFromViewStatus(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of ["invoices", "Invoices", "data", "Data", "results", "Results"]) {
    const v = data[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const inner = v.invoices ?? v.Invoices;
      if (Array.isArray(inner)) return inner;
    }
  }
  if (data.invoice && typeof data.invoice === "object") return [data.invoice];
  return [];
}

function mergeInvoiceShapeForClientId(inv) {
  if (!inv || typeof inv !== "object") return {};
  const o = { ...inv };
  for (const k of ["client", "Client", "customer", "Customer"]) {
    const inner = o[k];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return { ...o, ...inner };
    }
  }
  return o;
}

function invoiceNumericIdForDedupe(inv) {
  const m = mergeInvoiceShapeForClientId(inv);
  const v = m.ID ?? m.id ?? m.InvoiceID ?? m.invoice_id ?? m.InvoiceId;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function invoiceClientNumericIdFromPayload(inv) {
  const m = mergeInvoiceShapeForClientId(inv);
  const v =
    m.client_id ?? m.ClientID ?? m.ClientId ?? m.customer_id ?? m.CustomerID ?? m.CustomerId ?? m.Client_Id;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Dedupe by invoice id across unpaid/paid/overdue lists; count invoices per client id. */
async function fetchInvoiceCountsByClientId() {
  const settled = await Promise.allSettled([
    listInvoicesByPaymentStatus("unpaid"),
    listInvoicesByPaymentStatus("paid"),
    listInvoicesByPaymentStatus("overdue"),
  ]);
  if (settled.every((r) => r.status === "rejected")) {
    const first = settled[0];
    throw first.status === "rejected" ? first.reason : new Error("Could not load invoices.");
  }
  const invoiceIdToClientId = new Map();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const arr = invoicesArrayFromViewStatus(r.value);
    for (const inv of arr) {
      const invId = invoiceNumericIdForDedupe(inv);
      const cid = invoiceClientNumericIdFromPayload(inv);
      if (invId == null || cid == null) continue;
      if (!invoiceIdToClientId.has(invId)) invoiceIdToClientId.set(invId, cid);
    }
  }
  /** @type {Record<string, number>} */
  const counts = {};
  for (const cid of invoiceIdToClientId.values()) {
    const key = String(cid);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function compareClientIdsStable(a, b) {
  const na = Number(clientRowId(a));
  const nb = Number(clientRowId(b));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(clientRowId(a) ?? "").localeCompare(String(clientRowId(b) ?? ""));
}

function invoiceCountForClient(counts, c) {
  const id = clientRowId(c);
  if (id == null) return 0;
  const n = Number(id);
  if (!Number.isFinite(n)) return 0;
  return counts[String(n)] ?? 0;
}

/** Page numbers (and ellipsis gaps) for large page counts. */
function buildClientListPageItems(current, total) {
  if (total <= 1) return [];
  if (total <= 12) {
    return Array.from({ length: total }, (_, i) => ({ kind: "page", num: i + 1 }));
  }
  const want = new Set([
    1,
    2,
    total - 1,
    total,
    current,
    current - 1,
    current + 1,
    current - 2,
    current + 2,
  ]);
  const sorted = [...want].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      out.push({ kind: "gap", key: `${sorted[i - 1]}-${sorted[i]}` });
    }
    out.push({ kind: "page", num: sorted[i] });
  }
  return out;
}

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

const CLIENT_NEST_KEYS = [
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
  for (const k of CLIENT_NEST_KEYS) {
    const inner = out[k];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      out = { ...out, ...inner };
    }
  }
  return out;
}

/** Merge nested client/customer blobs (two passes so Client → fields hoists email). */
function flattenClientRecord(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  return shallowMergeNestedObjects(shallowMergeNestedObjects(obj));
}

/** Last resort: any key that looks like an email field. */
function pickEmailFromKeys(obj) {
  if (!obj || typeof obj !== "object") return "";
  for (const key of Object.keys(obj)) {
    if (!/email|e_mail|e-mail|mail$/i.test(key)) continue;
    if (/address|name|domain|verified|confirm|status|type|template/i.test(key)) continue;
    const v = obj[key];
    if (v == null || typeof v === "boolean" || (typeof v === "object" && v !== null)) continue;
    const s = String(v).trim();
    if (s.includes("@") || /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s) || s.length > 3) return s;
  }
  return "";
}

function clientRowId(c) {
  const flat = flattenClientRecord(c);
  const v =
    flat.ID ??
    flat.id ??
    flat.client_id ??
    flat.ClientID ??
    flat.ClientId ??
    flat.Client_Id ??
    flat.clientId ??
    flat.customer_id ??
    flat.CustomerID ??
    flat.CustomerId ??
    null;
  return v != null ? v : null;
}

function clientName(c) {
  const o = flattenClientRecord(c);
  return pickFirstString(o, [
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
  ]);
}

function clientEmail(c) {
  const o = flattenClientRecord(c);
  const direct = pickFirstString(o, [
    "email",
    "Email",
    "customer_email",
    "Customer_email",
    "CustomerEmail",
    "client_email",
    "ClientEmail",
    "mail",
    "Mail",
    "email_address",
    "EmailAddress",
    "EMail",
    "e_mail",
    "E_mail",
    "billing_email",
    "BillingEmail",
    "contact_email",
    "ContactEmail",
    "user_email",
    "UserEmail",
    "primary_email",
    "PrimaryEmail",
  ]);
  return direct || pickEmailFromKeys(o);
}

function clientBilling(c) {
  const o = flattenClientRecord(c);
  return pickFirstString(o, [
    "billing_address",
    "BillingAddress",
    "billingAddress",
    "Billing_address",
    "address",
    "Address",
    "customer_address",
    "Customer_address",
    "CustomerAddress",
    "BillToAddress",
    "bill_to_address",
    "customer_billing_address",
    "CustomerBillingAddress",
  ]);
}

function normalizeClientPayload(data) {
  if (!data || typeof data !== "object") return {};
  return flattenClientRecord(data);
}

function applyClientToEditSetters(data, setters) {
  const c = normalizeClientPayload(data);
  const id = clientRowId(c);
  if (id != null) setters.setEditId(String(id));
  setters.setEditName(clientName(c));
  setters.setEditEmail(clientEmail(c));
  setters.setEditBilling(clientBilling(c));
  setters.setEditLoaded(true);
}

function mergeSearchResult(prev, client) {
  const id = clientRowId(client);
  if (id == null) return prev;
  const n = Number(id);
  const idx = prev.findIndex((c) => Number(clientRowId(c)) === n);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = client;
    return next;
  }
  return [...prev, client];
}

/** Load client rows for the table (API first, then stored fallback). */
async function fetchClientsRows() {
  try {
    const rows = await listClients();
    return { ok: true, rows };
  } catch (listErr) {
    try {
      const rows = await fetchStoredClients();
      if (rows.length === 0) {
        return { ok: false, rows, error: formatApiError(listErr) };
      }
      return { ok: true, rows };
    } catch (fallbackErr) {
      return { ok: false, rows: [], error: formatApiError(fallbackErr) };
    }
  }
}

export default function Clients() {
  const [searchResultClients, setSearchResultClients] = useState([]);
  const [searchResultsPage, setSearchResultsPage] = useState(1);

  const [initialClientsLoading, setInitialClientsLoading] = useState(true);
  const [initialClientsError, setInitialClientsError] = useState(null);
  const [clientsRefreshLoading, setClientsRefreshLoading] = useState(false);
  const { successVisible: clientsRefreshSuccess, showSuccess: showClientsRefreshSuccess, hideSuccess: hideClientsRefreshSuccess, clearTimer: clearClientsRefreshSuccessTimer } =
    useTimedTableRefreshSuccess();

  /* Create */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [lastCreatedId, setLastCreatedId] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);

  /* Update */
  const [editId, setEditId] = useState(getStoredClientId() || "");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editBilling, setEditBilling] = useState("");
  const [editLoaded, setEditLoaded] = useState(false);
  const [editLoadLoading, setEditLoadLoading] = useState(false);
  const [editSaveLoading, setEditSaveLoading] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editSuccess, setEditSuccess] = useState(null);

  const [archiveError, setArchiveError] = useState(null);
  const [archivingId, setArchivingId] = useState(null);

  const [clientsSortMode, setClientsSortMode] = useState(CLIENTS_SORT.CREATED_DESC);
  const [invoiceCounts, setInvoiceCounts] = useState(null);
  const [invoiceCountsLoading, setInvoiceCountsLoading] = useState(false);
  const [invoiceCountsError, setInvoiceCountsError] = useState(null);

  const clientsListSignature = useMemo(
    () => searchResultClients.map((c) => clientRowId(c)).join(","),
    [searchResultClients]
  );

  const displayedClientsList = useMemo(() => {
    const rows = [...searchResultClients];
    if (clientsSortMode === CLIENTS_SORT.CREATED_ASC) {
      return rows.sort((a, b) => {
        const ta = clientCreatedAtMs(a);
        const tb = clientCreatedAtMs(b);
        const na = ta ?? Number.POSITIVE_INFINITY;
        const nb = tb ?? Number.POSITIVE_INFINITY;
        if (na !== nb) return na - nb;
        return compareClientIdsStable(a, b);
      });
    }
    if (clientsSortMode === CLIENTS_SORT.CREATED_DESC) {
      return rows.sort((a, b) => {
        const ta = clientCreatedAtMs(a);
        const tb = clientCreatedAtMs(b);
        const na = ta ?? Number.NEGATIVE_INFINITY;
        const nb = tb ?? Number.NEGATIVE_INFINITY;
        if (na !== nb) return nb - na;
        return compareClientIdsStable(a, b);
      });
    }
    if (clientsSortMode === CLIENTS_SORT.INVOICES_DESC || clientsSortMode === CLIENTS_SORT.INVOICES_ASC) {
      const counts = invoiceCounts || {};
      const desc = clientsSortMode === CLIENTS_SORT.INVOICES_DESC;
      return rows.sort((a, b) => {
        const ca = invoiceCountForClient(counts, a);
        const cb = invoiceCountForClient(counts, b);
        if (ca !== cb) return desc ? cb - ca : ca - cb;
        return compareClientIdsStable(a, b);
      });
    }
    return rows;
  }, [searchResultClients, clientsSortMode, invoiceCounts]);

  const searchTotalPages = Math.max(1, Math.ceil(displayedClientsList.length / CLIENTS_TABLE_PAGE_SIZE));
  const searchSafePage = Math.min(searchResultsPage, searchTotalPages);
  const searchPageSlice = useMemo(() => {
    const start = (searchSafePage - 1) * CLIENTS_TABLE_PAGE_SIZE;
    return displayedClientsList.slice(start, start + CLIENTS_TABLE_PAGE_SIZE);
  }, [displayedClientsList, searchSafePage]);

  const clientPageItems = useMemo(
    () => buildClientListPageItems(searchSafePage, searchTotalPages),
    [searchSafePage, searchTotalPages]
  );

  useEffect(() => {
    if (searchResultsPage > searchTotalPages) setSearchResultsPage(searchTotalPages);
  }, [searchResultsPage, searchTotalPages]);

  useEffect(() => {
    setSearchResultsPage(1);
  }, [clientsSortMode]);

  useEffect(() => {
    if (clientsSortMode !== CLIENTS_SORT.INVOICES_DESC && clientsSortMode !== CLIENTS_SORT.INVOICES_ASC) {
      setInvoiceCountsError(null);
      return;
    }
    let cancelled = false;
    setInvoiceCountsLoading(true);
    setInvoiceCountsError(null);
    void fetchInvoiceCountsByClientId()
      .then((counts) => {
        if (!cancelled) {
          setInvoiceCounts(counts);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setInvoiceCounts({});
          setInvoiceCountsError(formatApiError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setInvoiceCountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientsSortMode, clientsListSignature]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setInitialClientsLoading(true);
      setInitialClientsError(null);
      try {
        const res = await fetchClientsRows();
        if (cancelled) return;
        setSearchResultClients(res.rows);
        setInitialClientsError(res.ok ? null : res.error);
      } finally {
        if (!cancelled) setInitialClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefreshClientsTable() {
    clearClientsRefreshSuccessTimer();
    hideClientsRefreshSuccess();
    setClientsRefreshLoading(true);
    try {
      const res = await fetchClientsRows();
      setSearchResultClients(res.rows);
      setInitialClientsError(res.ok ? null : res.error);
      if (res.ok) {
        setSearchResultsPage(1);
        showClientsRefreshSuccess();
      }
    } finally {
      setClientsRefreshLoading(false);
    }
  }

  const editSetters = {
    setEditId,
    setEditName,
    setEditEmail,
    setEditBilling,
    setEditLoaded,
  };

  async function loadClientIntoEditForm(idOverride) {
    const raw = idOverride !== undefined ? String(idOverride) : editId;
    setEditError(null);
    setEditSuccess(null);
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      setEditError("Enter a valid client ID.");
      setEditLoaded(false);
      return;
    }
    setEditLoadLoading(true);
    try {
      const data = await getClient(id);
      applyClientToEditSetters(data, editSetters);
      setStoredClientId(id);
    } catch (err) {
      setEditLoaded(false);
      setEditError(formatApiError(err));
    } finally {
      setEditLoadLoading(false);
    }
  }

  function handleEditIdChange(value) {
    setEditId(value);
    setEditLoaded(false);
    setEditError(null);
    setEditSuccess(null);
  }

  function handleEditIdBlur() {
    const id = Number(String(editId).trim());
    if (!Number.isFinite(id) || id <= 0) return;
    loadClientIntoEditForm(id);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const data = await createClient({
        name: name.trim(),
        email: email.trim(),
        billing_address: billingAddress.trim(),
        phone: phone.trim(),
      });
      const c = data.client || data;
      const id = extractId(c);
      if (id != null) {
        setLastCreatedId(id);
        setStoredClientId(id);
      } else {
        setLastCreatedId(null);
      }
      if (c && typeof c === "object") {
        setSearchResultClients((prev) => mergeSearchResult(prev, c));
      }
      setName("");
      setEmail("");
      setBillingAddress("");
      setPhone("");
    } catch (err) {
      setCreateError(formatApiError(err));
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleArchiveClient(c) {
    const id = clientRowId(c);
    if (id == null) return;
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) return;
    setArchiveError(null);
    if (!window.confirm("Are you sure you want to delete this client?")) {
      return;
    }
    setArchivingId(n);
    try {
      await archiveClient(n);
      setSearchResultClients((prev) => prev.filter((row) => Number(clientRowId(row)) !== n));
      removeStoredClientId(n);
      if (String(getStoredClientId()) === String(n)) {
        setStoredClientId("");
      }
      if (String(editId).trim() === String(n)) {
        setEditLoaded(false);
        setEditSuccess(null);
      }
    } catch (err) {
      setArchiveError(formatApiError(err));
    } finally {
      setArchivingId(null);
    }
  }

  async function handleEditSave(e) {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(null);
    const id = Number(editId);
    if (!Number.isFinite(id) || id <= 0) {
      setEditError("Enter a valid client ID.");
      return;
    }
    if (!editLoaded) {
      setEditError("Load the client first (tab out of the ID field or click Load client).");
      return;
    }
    setEditSaveLoading(true);
    try {
      await updateClient({
        ID: id,
        name: editName.trim(),
        email: editEmail.trim(),
        billing_address: editBilling.trim(),
      });
      setStoredClientId(id);
      setEditSuccess("Client updated.");
    } catch (err) {
      setEditError(formatApiError(err));
    } finally {
      setEditSaveLoading(false);
    }
  }

  return (
    <div className="clients-page">
      <div className="clients-page-header">
        <PageBackButton />
        <h1 className="clients-page-title">Clients</h1>
      </div>
      <div className="card clients-list-card">
        <div className="table-section-heading clients-list-card-heading">
          <h2>Your Clients:</h2>
          <div className="clients-heading-actions">
            {!initialClientsLoading ? (
              <>
                <label className="clients-sort-field clients-sort-field--inline" htmlFor="clients-sort-select">
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
                    id="clients-sort-select"
                    className="clients-sort-select"
                    value={clientsSortMode}
                    onChange={(e) => setClientsSortMode(e.target.value)}
                  >
                    <option value={CLIENTS_SORT.CREATED_DESC}>Newest</option>
                    <option value={CLIENTS_SORT.CREATED_ASC}>Oldest</option>
                    <option value={CLIENTS_SORT.INVOICES_DESC}>Most Common</option>
                    <option value={CLIENTS_SORT.INVOICES_ASC}>Least Common</option>
                  </select>
                </label>
                {invoiceCountsLoading ? (
                  <span className="hint clients-sort-status" aria-live="polite">
                    Loading invoice usage…
                  </span>
                ) : null}
                {invoiceCountsError ? (
                  <span className="hint clients-sort-status" role="alert">
                    {invoiceCountsError}
                  </span>
                ) : null}
              </>
            ) : null}
            <RefreshTableButton
              loading={clientsRefreshLoading}
              disabled={initialClientsLoading}
              onClick={() => void handleRefreshClientsTable()}
              ariaLabel="Refresh client list"
            />
          </div>
        </div>
        {clientsRefreshSuccess ? (
          <div className="alert alert-success" role="status">
            Your table has been refreshed.
          </div>
        ) : null}
        {initialClientsError ? <div className="alert alert-error">{initialClientsError}</div> : null}
        {archiveError ? (
          <div className="alert alert-error" role="alert">
            {archiveError}
          </div>
        ) : null}
        {initialClientsLoading ? (
          <p className="hint" style={{ marginTop: 0, marginBottom: "0.75rem" }}>
            Loading clients…
          </p>
        ) : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-id">Client ID</th>
                <th>Name</th>
                <th className="col-email">Email</th>
                <th className="cell-address">Billing address</th>
                <th className="col-archive" scope="col" aria-label="Delete client" />
              </tr>
            </thead>
            <tbody>
              {!initialClientsLoading && searchPageSlice.length === 0 ? (
                <tr>
                  <td colSpan={5} className="hint" style={{ textAlign: "center", padding: "1rem" }}>
                    No clients yet. Add one below.
                  </td>
                </tr>
              ) : null}
              {searchPageSlice.map((c, idx) => {
                const id = clientRowId(c);
                const busy = id != null && archivingId === Number(id);
                return (
                  <tr key={id != null ? String(id) : `client-search-${idx}`}>
                    <td className="col-id">{id ?? "—"}</td>
                    <td>{clientName(c) || "—"}</td>
                    <td className="col-email">{clientEmail(c) || "—"}</td>
                    <td className="cell-address">{clientBilling(c) || "—"}</td>
                    <td className="col-archive">
                      <button
                        type="button"
                        className="clients-archive-btn"
                        disabled={initialClientsLoading || id == null || busy}
                        aria-label={id != null ? `Delete client ${id}` : "Delete client"}
                        title="Delete client (archived on server; invoices preserved)"
                        onClick={() => void handleArchiveClient(c)}
                      >
                        {busy ? "…" : "×"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!initialClientsLoading && displayedClientsList.length > 0 ? (
          <div className="table-pagination table-pagination--balanced">
            <div className="table-pagination-inner">
              <div className="table-pagination-spacer" aria-hidden="true" />
              <div className="table-pagination-controls">
                <div className="btn-row table-pagination-prev-next">
                  <button
                    type="button"
                    className="btn"
                    disabled={searchSafePage <= 1}
                    onClick={() => setSearchResultsPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={searchSafePage >= searchTotalPages}
                    onClick={() => setSearchResultsPage((p) => Math.min(searchTotalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
                {searchTotalPages > 1 ? (
                  <div
                    className="btn-row table-pagination-page-buttons"
                    role="group"
                    aria-label="Go to page"
                  >
                    {clientPageItems.map((item) =>
                      item.kind === "gap" ? (
                        <span key={item.key} className="table-pagination-ellipsis" aria-hidden>
                          …
                        </span>
                      ) : (
                        <button
                          key={item.num}
                          type="button"
                          className={item.num === searchSafePage ? "btn" : "btn btn-secondary"}
                          disabled={item.num === searchSafePage}
                          aria-current={item.num === searchSafePage ? "page" : undefined}
                          onClick={() => setSearchResultsPage(item.num)}
                        >
                          {item.num}
                        </button>
                      )
                    )}
                  </div>
                ) : null}
              </div>
              <div className="table-pagination-meta-aside">
                <span className="table-pagination-meta">
                  Page {searchSafePage} of {searchTotalPages} ({displayedClientsList.length} Total)
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Add client</h2>
        <p className="hint">Enter client details below.</p>
        <ErrorAlert error={createError} />
        <form className="form-grid client-form-fields" onSubmit={handleCreate}>
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            Billing address
            <textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} required />
          </label>
          <label className="field">
            Phone number
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={createLoading}>
            {createLoading ? "Creating…" : "Create client"}
          </button>
        </form>
        {lastCreatedId != null ? (
          <div className="alert alert-success" style={{ marginTop: "1rem", marginBottom: 0 }} role="status">
            <strong>Created client ID:</strong> {lastCreatedId}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Update client</h2>
        <p className="hint">
          Enter a client ID first to <strong>update</strong> your client details. Then click the button. 
        </p>
        <ErrorAlert error={editError} />
        {editSuccess ? <div className="alert alert-success">{editSuccess}</div> : null}
        <form
          className="form-grid clients-update-load-form"
          onSubmit={(e) => {
            e.preventDefault();
            loadClientIntoEditForm();
          }}
          style={{ marginBottom: editLoaded ? "1.25rem" : 0 }}
        >
          <label className="field">
            Client ID
            <input
              type="number"
              min="1"
              step="1"
              value={editId}
              onChange={(e) => handleEditIdChange(e.target.value)}
              onBlur={handleEditIdBlur}
              placeholder="e.g. 1"
            />
          </label>
          <button type="submit" className="btn" disabled={editLoadLoading}>
            {editLoadLoading ? "Loading…" : "Update client"}
          </button>
        </form>

        {editLoaded ? (
          <form className="form-grid client-form-fields" onSubmit={handleEditSave}>
            <label className="field">
              Name
              <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </label>
            <label className="field">
              Email
              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
            </label>
            <label className="field">
              Billing address
              <textarea value={editBilling} onChange={(e) => setEditBilling(e.target.value)} required />
            </label>
            <button type="submit" className="btn" disabled={editSaveLoading}>
              {editSaveLoading ? "Saving…" : "Save changes"}
            </button>
          </form>
        ) : (
          <p className="hint" style={{ marginBottom: 0 }}>
          </p>
        )}
      </div>
    </div>
  );
}
