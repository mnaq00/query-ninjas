import React, { useEffect, useState, useCallback, useRef, startTransition } from "react";
import { Link } from "react-router-dom";
import {
  getBusinessProfile,
  getToken,
  getStoredBusinessId,
  listInvoicesByPaymentStatus,
  openInvoicePdfInNewTab,
} from "../services/api";
import { ErrorAlert, ErrorAlertAutoDismiss, formatApiError } from "../utils/formErrors";
import RefreshTableButton from "../components/RefreshTableButton";
import { useTimedTableRefreshSuccess } from "../hooks/useTimedTableRefreshSuccess";

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

function mergeInvoiceClientShape(inv) {
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

function pickScalar(obj, keys) {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    if (typeof v === "object") continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return "";
}

function invoiceNumericId(obj) {
  const merged = mergeInvoiceClientShape(obj);
  const v = merged.ID ?? merged.id ?? merged.InvoiceID ?? merged.invoice_id ?? merged.InvoiceId;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function invoiceCustomerName(obj) {
  const merged = mergeInvoiceClientShape(obj);
  return (
    pickScalar(merged, [
      "Customer_name",
      "customer_name",
      "CustomerName",
      "client_name",
      "ClientName",
      "name",
      "Name",
      "Customer",
      "customer",
    ]) || "—"
  );
}

function invoiceTotalAmount(obj) {
  const merged = mergeInvoiceClientShape(obj);
  const raw =
    merged.total ??
    merged.Total ??
    merged.total_amount ??
    merged.TotalAmount ??
    merged.grand_total ??
    merged.GrandTotal ??
    merged.amount ??
    merged.Amount ??
    merged.amount_due ??
    merged.AmountDue;

  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isFinite(n)) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(raw).trim() || "—";
}

function invoiceTotalNumeric(obj) {
  const merged = mergeInvoiceClientShape(obj);
  const raw =
    merged.total ??
    merged.Total ??
    merged.total_amount ??
    merged.TotalAmount ??
    merged.grand_total ??
    merged.GrandTotal ??
    merged.amount ??
    merged.Amount ??
    merged.amount_due ??
    merged.AmountDue;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calendar date in the user's locale (not UTC midnight shift).
 * Go JSON often sends "2026-04-05T00:00:00Z"; new Date(that) is wrong for "due on 5 Apr" in non-UTC zones.
 */
function coerceToLocalCalendarDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "object" && v !== null && typeof v.getTime === "function") {
    const t = v.getTime();
    if (!Number.isNaN(t)) return new Date(t);
    return null;
  }
  const s = String(v).trim();
  const cal = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (cal) {
    const y = Number(cal[1]);
    const mo = Number(cal[2]) - 1;
    const day = Number(cal[3]);
    if (y >= 1000 && y <= 9999 && mo >= 0 && mo <= 11 && day >= 1 && day <= 31) {
      const d = new Date(y, mo, day);
      if (d.getFullYear() === y && d.getMonth() === mo && d.getDate() === day) {
        return d;
      }
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse first usable date from merged invoice (ISO strings from Go time.Time). */
function parseInvoiceDateField(merged, keys) {
  if (!merged || typeof merged !== "object") return null;
  for (const k of keys) {
    const v = merged[k];
    if (v == null || v === "") continue;
    const d = coerceToLocalCalendarDate(v);
    if (d) return d;
  }
  return null;
}

function invoicePaymentDueDate(merged) {
  return parseInvoiceDateField(merged, [
    "payment_due_date",
    "PaymentDueDate",
    "paymentDueDate",
    "due_date",
    "DueDate",
  ]);
}

function invoiceIssueDate(merged) {
  return parseInvoiceDateField(merged, [
    "invoice_date",
    "InvoiceDate",
    "invoiceDate",
    "created_at",
    "CreatedAt",
    "Created",
  ]);
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Whole days from due date to today (local calendar days). */
function daysOverdueFromDueDate(due) {
  if (!due) return null;
  const dueDay = startOfLocalDay(due);
  const today = startOfLocalDay(new Date());
  const ms = today.getTime() - dueDay.getTime();
  const days = Math.floor(ms / 86400000);
  return days < 0 ? 0 : days;
}

/** Due date column: dd/mm/yyyy using local calendar components (matches parsed due/invoice date). */
function formatInvoiceTableDate(d) {
  if (!d) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${day}/${month}/${yyyy}`;
}

/** Month bucket for chart; null year/month => undated bucket. */
function invoiceMonthBucket(inv) {
  const m = mergeInvoiceClientShape(inv);
  const keys = [
    "created_at",
    "CreatedAt",
    "createdAt",
    "Created",
    "invoice_date",
    "InvoiceDate",
    "Invoice_date",
    "date",
    "Date",
    "issued_at",
    "IssuedAt",
    "updated_at",
    "UpdatedAt",
  ];
  for (const k of keys) {
    const v = m[k];
    if (v == null) continue;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getFullYear() < 1970) continue;
    return { y: d.getFullYear(), mo: d.getMonth() + 1 };
  }
  return null;
}

const NODATE_KEY = "__nodate__";

function monthKeyFromBucket(bucket) {
  if (!bucket) return NODATE_KEY;
  return `${bucket.y}-${String(bucket.mo).padStart(2, "0")}`;
}

function labelForMonthKey(key) {
  if (key === NODATE_KEY) return "No date";
  const [y, mo] = key.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function shiftCalendarMonth(year, month1to12, deltaMonths) {
  const d = new Date(year, month1to12 - 1 + deltaMonths, 1);
  return { y: d.getFullYear(), mo: d.getMonth() + 1 };
}

/** Oldest → newest: three calendar months ending in the current month. */
function pastThreeMonthKeysChronological() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth() + 1;
  const oldest = shiftCalendarMonth(y, mo, -2);
  const mid = shiftCalendarMonth(y, mo, -1);
  return [
    monthKeyFromBucket(oldest),
    monthKeyFromBucket(mid),
    monthKeyFromBucket({ y, mo }),
  ];
}

/** Avoid scanning unbounded invoice lists on the main thread (keeps the tab responsive). */
const MAX_UNIQUE_INVOICES_FOR_CHART = 15_000;

function buildMonthlyTotalsSeries(statusPayloads) {
  const byId = new Map();
  let hitCap = false;
  outer: for (const payload of statusPayloads) {
    for (const inv of invoicesArrayFromViewStatus(payload)) {
      const id = invoiceNumericId(inv);
      if (id == null) continue;
      if (!byId.has(id)) {
        if (byId.size >= MAX_UNIQUE_INVOICES_FOR_CHART) {
          hitCap = true;
          break outer;
        }
        byId.set(id, inv);
      }
    }
  }

  const monthTotals = new Map();
  for (const inv of byId.values()) {
    const amt = invoiceTotalNumeric(inv);
    const key = monthKeyFromBucket(invoiceMonthBucket(inv));
    if (key === NODATE_KEY) continue;
    monthTotals.set(key, (monthTotals.get(key) || 0) + amt);
  }

  const keys = pastThreeMonthKeysChronological();
  const series = keys.map((key) => ({
    key,
    label: labelForMonthKey(key),
    total: monthTotals.get(key) || 0,
  }));
  return { series, hitCap };
}

/** Yield to the browser so clicks/paint can run before heavy dashboard aggregation. */
function scheduleIdleOrSoon(fn) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => fn(), { timeout: 400 });
  } else {
    setTimeout(fn, 0);
  }
}

/**
 * Y-axis (GBP) step and ceiling from this business’s monthly totals: 20% headroom, then a
 * “nice” increment (1/2/5 × 10ⁿ) so ticks stay readable — e.g. mid‑range totals → £2k steps.
 */
function gbpAxisStepAndMax(dataMax, targetSegments = 5) {
  const headroom = dataMax > 0 ? dataMax * 1.2 : 0;
  if (headroom <= 0) {
    return { tickStep: 1000, scaleMax: 1000 };
  }
  const raw = headroom / targetSegments;
  const exp = Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const pow10 = 10 ** exp;
  const fr = raw / pow10;
  const m = fr <= 1 ? 1 : fr <= 2 ? 2 : fr <= 5 ? 5 : 10;
  const tickStep = m * pow10;
  const scaleMax = Math.max(tickStep, Math.ceil(headroom / tickStep) * tickStep);
  return { tickStep, scaleMax };
}

function MonthlyInvoiceLineChart({ series }) {
  if (series.length === 0) return null;

  const dataMax = Math.max(...series.map((s) => s.total), 0);
  const { tickStep, scaleMax } = gbpAxisStepAndMax(dataMax);
  const tickVals = [];
  for (let v = 0; v <= scaleMax; v += tickStep) {
    tickVals.push(v);
  }

  const W = 720;
  const H = 300;
  const padL = 56;
  const padR = 20;
  const padT = 16;
  const padB = 68;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = series.length;

  /** Plot 20% narrower than full inner width, centered, so axis text fits inside the card. */
  const plotW = innerW * 0.8;
  const plotLeft = padL + (innerW - plotW) / 2;
  const plotRight = plotLeft + plotW;

  const slotW = plotW / Math.max(n, 1);
  /** Month labels along the bottom: font scales to the space per month. */
  const xLabelFontSize = Math.min(11, Math.max(7, slotW * 0.11));

  const points = series.map((s, i) => {
    const x = n <= 1 ? plotLeft + plotW / 2 : plotLeft + (plotW * i) / (n - 1);
    const t = scaleMax > 0 ? s.total / scaleMax : 0;
    const y = padT + innerH * (1 - t);
    return { x, y, key: s.key, label: s.label, total: s.total };
  });

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="dashboard-monthly-chart">
      <div className="dashboard-chart-legend">
        <span className="dashboard-chart-legend-line" aria-hidden="true" />
        <span className="dashboard-chart-legend-label">£GBP</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Monthly Invoice Totals line chart, amounts in GBP"
      >
        {tickVals.map((val, i) => {
          const t = scaleMax > 0 ? val / scaleMax : 0;
          const y = padT + innerH * (1 - t);
          return (
            <g key={`grid-${i}`}>
              <line
                x1={plotLeft}
                y1={y}
                x2={plotRight}
                y2={y}
                className="dashboard-chart-gridline"
              />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="dashboard-chart-axis-label">
                {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}
        <polyline className="dashboard-chart-line" points={polyPoints} fill="none" />
        {points.map((p) => (
          <circle key={p.key} cx={p.x} cy={p.y} r={5} className="dashboard-chart-dot">
            <title>{`${p.label}: ${p.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</title>
          </circle>
        ))}
        {points.map((p) => {
          const estW = p.label.length * xLabelFontSize * 0.58;
          const squash = estW > slotW * 0.9;
          return (
            <text
              key={`xl-${p.key}`}
              x={p.x}
              y={H - 14}
              textAnchor="middle"
              className="dashboard-chart-x-label"
              fontSize={xLabelFontSize}
              {...(squash
                ? { textLength: slotW * 0.88, lengthAdjust: "spacingAndGlyphs" }
                : {})}
            >
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function parseOverdueInvoiceRows(data) {
  return invoicesArrayFromViewStatus(data)
    .map((inv) => {
      const id = invoiceNumericId(inv);
      if (id == null) return null;
      const merged = mergeInvoiceClientShape(inv);
      const due = invoicePaymentDueDate(merged);
      const issue = invoiceIssueDate(merged);
      const anchor = due || issue;
      const daysOverdue = daysOverdueFromDueDate(due);
      return {
        id,
        customerName: invoiceCustomerName(inv),
        total: invoiceTotalAmount(inv),
        dueDateLabel: formatInvoiceTableDate(anchor),
        daysOverdueLabel: daysOverdue != null ? String(daysOverdue) : "—",
      };
    })
    .filter(Boolean);
}

function invoiceDocumentStatus(obj) {
  const merged = mergeInvoiceClientShape(obj);
  return pickScalar(merged, [
    "invoice_status",
    "Invoice_status",
    "InvoiceStatus",
    "invoice_state",
    "InvoiceState",
    "document_status",
    "DocumentStatus",
    "Status",
    "status",
  ]);
}

function isDraftInvoice(inv) {
  const raw = invoiceDocumentStatus(inv).trim().toLowerCase();
  if (!raw) return false;
  return raw === "draft" || raw.includes("draft");
}

function invoiceCreatedAtDisplay(inv) {
  const merged = mergeInvoiceClientShape(inv);
  const d = invoiceIssueDate(merged);
  if (!d) return "—";
  try {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function invoiceCreatedSortMs(inv) {
  const merged = mergeInvoiceClientShape(inv);
  const d = invoiceIssueDate(merged);
  return d ? d.getTime() : 0;
}

const DRAFT_INVOICES_PAGE_SIZE = 5;
const OVERDUE_INVOICES_PAGE_SIZE = 5;

/** API may surface “no data” as an error (e.g. “No invoices with status: overdue”). Treat as empty list, not a failure. */
function isNoOverdueInvoicesMessage(errText) {
  const s = String(errText || "").toLowerCase();
  return s.includes("no invoices") && s.includes("overdue");
}

/** Dedupe by ID; draft rows from paid/unpaid/overdue ViewInvoiceStatus payloads (client-side filter). */
function parseDraftInvoiceRowsFromPayloads(payloads) {
  const byId = new Map();
  for (const payload of payloads) {
    if (payload == null) continue;
    for (const inv of invoicesArrayFromViewStatus(payload)) {
      if (!isDraftInvoice(inv)) continue;
      const id = invoiceNumericId(inv);
      if (id == null) continue;
      if (!byId.has(id)) byId.set(id, inv);
    }
  }
  const rows = [...byId.values()].map((inv) => ({
    id: invoiceNumericId(inv),
    clientName: invoiceCustomerName(inv),
    total: invoiceTotalAmount(inv),
    createdAtLabel: invoiceCreatedAtDisplay(inv),
    _sortMs: invoiceCreatedSortMs(inv),
  }));
  rows.sort((a, b) => b._sortMs - a._sortMs || b.id - a.id);
  return rows.map(({ _sortMs, ...rest }) => rest);
}

export default function Dashboard() {
  const [profileName, setProfileName] = useState("");
  const [overdueRows, setOverdueRows] = useState([]);
  const [overduePage, setOverduePage] = useState(0);
  const [draftRows, setDraftRows] = useState([]);
  const [draftPage, setDraftPage] = useState(0);
  const [overdueLoading, setOverdueLoading] = useState(true);
  const [overdueError, setOverdueError] = useState(null);
  const [invoicePdfError, setInvoicePdfError] = useState(null);
  const [pdfOpeningId, setPdfOpeningId] = useState(null);
  const [chartSeries, setChartSeries] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(null);
  const [chartPartialWarning, setChartPartialWarning] = useState(null);
  const [dashboardTablesRefreshLoading, setDashboardTablesRefreshLoading] = useState(false);
  const {
    successVisible: overdueTableRefreshSuccess,
    showSuccess: showOverdueTableRefreshSuccess,
    hideSuccess: hideOverdueTableRefreshSuccess,
    clearTimer: clearOverdueTableRefreshTimer,
  } = useTimedTableRefreshSuccess();
  const {
    successVisible: draftTableRefreshSuccess,
    showSuccess: showDraftTableRefreshSuccess,
    hideSuccess: hideDraftTableRefreshSuccess,
    clearTimer: clearDraftTableRefreshTimer,
  } = useTimedTableRefreshSuccess();
  const dashboardRefreshLock = useRef(false);
  const businessId = getStoredBusinessId();

  async function handleOpenInvoicePdf(id) {
    setInvoicePdfError(null);
    setPdfOpeningId(id);
    try {
      await openInvoicePdfInNewTab(id);
    } catch (err) {
      setInvoicePdfError(formatApiError(err));
    } finally {
      setPdfOpeningId((cur) => (cur === id ? null : cur));
    }
  }

  useEffect(() => {
    if (!getToken()) {
      setProfileName("");
      return;
    }
    let cancelled = false;
    getBusinessProfile()
      .then((data) => {
        if (cancelled || !data || typeof data !== "object") return;
        const name = typeof data.business_name === "string" ? data.business_name.trim() : "";
        setProfileName(name);
      })
      .catch(() => {
        if (!cancelled) setProfileName("");
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const loadDashboardInvoiceTables = useCallback(async () => {
    setOverdueLoading(true);
    setChartLoading(true);
    setOverdueError(null);
    setChartError(null);
    setChartPartialWarning(null);

    const results = await Promise.allSettled([
      listInvoicesByPaymentStatus("unpaid"),
      listInvoicesByPaymentStatus("paid"),
      listInvoicesByPaymentStatus("overdue"),
    ]);

    const ok = [];
    const failed = [];
    for (const r of results) {
      if (r.status === "fulfilled") ok.push(r.value);
      else failed.push(r.reason);
    }
    setDraftRows(parseDraftInvoiceRowsFromPayloads(ok));
    setDraftPage(0);

    const overdueResult = results[2];
    const overdueOk = overdueResult.status === "fulfilled";
    setTimeout(() => {
      if (overdueOk) {
        setOverdueError(null);
        setOverdueRows(parseOverdueInvoiceRows(overdueResult.value));
        setOverduePage(0);
      } else {
        const errStr = formatApiError(overdueResult.reason);
        if (isNoOverdueInvoicesMessage(errStr)) {
          setOverdueError(null);
          setOverdueRows([]);
          setOverduePage(0);
        } else {
          setOverdueError(errStr);
          setOverdueRows([]);
          setOverduePage(0);
        }
      }
      setOverdueLoading(false);
    }, 0);

    const refreshMeta = await new Promise((resolve) => {
      scheduleIdleOrSoon(() => {
        if (ok.length === 0) {
          startTransition(() => {
            setChartError(failed[0] ? formatApiError(failed[0]) : "Could not load invoices.");
            setChartSeries([]);
            setChartLoading(false);
          });
          resolve({ overdueOk, draftDataOk: false });
          return;
        }

        const { series, hitCap } = buildMonthlyTotalsSeries(ok);
        const parts = [];
        if (hitCap) {
          parts.push(
            `Chart uses up to ${MAX_UNIQUE_INVOICES_FOR_CHART.toLocaleString()} unique invoices for performance; totals may be approximate.`
          );
        }

        startTransition(() => {
          setChartSeries(series);
          setChartError(null);
          setChartPartialWarning(parts.length ? parts.join(" ") : null);
          setChartLoading(false);
        });
        resolve({ overdueOk, draftDataOk: true });
      });
    });

    return refreshMeta;
  }, []);

  useEffect(() => {
    void loadDashboardInvoiceTables();
  }, [loadDashboardInvoiceTables]);

  async function handleRefreshDashboardOverdueTable() {
    if (dashboardRefreshLock.current) return;
    clearOverdueTableRefreshTimer();
    hideOverdueTableRefreshSuccess();
    dashboardRefreshLock.current = true;
    setDashboardTablesRefreshLoading(true);
    try {
      const { overdueOk } = await loadDashboardInvoiceTables();
      if (overdueOk) showOverdueTableRefreshSuccess();
    } finally {
      setDashboardTablesRefreshLoading(false);
      dashboardRefreshLock.current = false;
    }
  }

  async function handleRefreshDashboardDraftTable() {
    if (dashboardRefreshLock.current) return;
    clearDraftTableRefreshTimer();
    hideDraftTableRefreshSuccess();
    dashboardRefreshLock.current = true;
    setDashboardTablesRefreshLoading(true);
    try {
      const { draftDataOk } = await loadDashboardInvoiceTables();
      if (draftDataOk) showDraftTableRefreshSuccess();
    } finally {
      setDashboardTablesRefreshLoading(false);
      dashboardRefreshLock.current = false;
    }
  }

  const draftPageCount = Math.max(1, Math.ceil(draftRows.length / DRAFT_INVOICES_PAGE_SIZE));

  useEffect(() => {
    setDraftPage((p) => Math.min(p, draftPageCount - 1));
  }, [draftPageCount]);

  const draftPageClamped = Math.min(draftPage, draftPageCount - 1);
  const draftPagedRows = draftRows.slice(
    draftPageClamped * DRAFT_INVOICES_PAGE_SIZE,
    draftPageClamped * DRAFT_INVOICES_PAGE_SIZE + DRAFT_INVOICES_PAGE_SIZE
  );

  const overduePageCount = Math.max(1, Math.ceil(overdueRows.length / OVERDUE_INVOICES_PAGE_SIZE));

  useEffect(() => {
    setOverduePage((p) => Math.min(p, overduePageCount - 1));
  }, [overduePageCount]);

  const overduePageClamped = Math.min(overduePage, overduePageCount - 1);
  const overduePagedRows = overdueRows.slice(
    overduePageClamped * OVERDUE_INVOICES_PAGE_SIZE,
    overduePageClamped * OVERDUE_INVOICES_PAGE_SIZE + OVERDUE_INVOICES_PAGE_SIZE
  );

  return (
    <div>
      <h1 className="dashboard-page-title">Dashboard</h1>
      <div className="card">
        <h2 className="dashboard-welcome-heading">
          <span>Welcome</span>
          {profileName ? (
            <span className="dashboard-welcome-business" title={profileName}>
              {profileName}
            </span>
          ) : null}
        </h2>
        <h3 className="dashboard-quick-links-heading">Quick Links:</h3>
        <div className="btn-row dashboard-welcome-btn-row">
          <Link to="/invoices" className="btn">
            Create Invoice
          </Link>
          <Link to="/invoices" className="btn">
            Send Invoice to Client
          </Link>
          <Link to="/products" className="btn">
            Update Products
          </Link>
        </div>
      </div>

      <ErrorAlertAutoDismiss error={invoicePdfError} onDismiss={() => setInvoicePdfError(null)} />

      <div className="card">
        <div className="table-section-heading">
          <h2>Overdue Invoices</h2>
          <RefreshTableButton
            loading={dashboardTablesRefreshLoading}
            disabled={overdueLoading}
            onClick={() => void handleRefreshDashboardOverdueTable()}
            ariaLabel="Refresh overdue invoices table"
          />
        </div>
        {overdueTableRefreshSuccess ? (
          <div className="alert alert-success" role="status">
            Your table has been refreshed.
          </div>
        ) : null}
        <p className="hint" style={{ marginTop: 0 }}>
          To view invoice as PDF, click on the invoice ID below
        </p>
        <ErrorAlert error={overdueError} />
        {overdueLoading ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Loading…
          </p>
        ) : overdueRows.length === 0 ? (
          <p className="dashboard-overdue-empty-notice" role="status">
            Currently no invoices overdue.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table dashboard-overdue-table">
                <thead>
                  <tr>
                    <th className="col-id">Invoice ID</th>
                    <th>Client name</th>
                    <th className="col-due-date">Due date</th>
                    <th className="col-days-overdue">Days overdue</th>
                    <th className="col-price">Total amount (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {overduePagedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="col-id">
                        <button
                          type="button"
                          className="invoice-pdf-link"
                          disabled={pdfOpeningId === row.id}
                          onClick={() => handleOpenInvoicePdf(row.id)}
                          title="Open PDF in a new tab"
                        >
                          {pdfOpeningId === row.id ? "Opening…" : row.id}
                        </button>
                      </td>
                      <td>{row.customerName}</td>
                      <td className="col-due-date">{row.dueDateLabel}</td>
                      <td className="col-days-overdue">{row.daysOverdueLabel}</td>
                      <td className="col-price">{row.total}</td>
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
                      disabled={overduePageClamped <= 0}
                      onClick={() => setOverduePage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={overduePageClamped >= overduePageCount - 1}
                      onClick={() => setOverduePage((p) => Math.min(overduePageCount - 1, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
                <div className="table-pagination-meta-aside">
                  <p className="hint table-pagination-meta">
                    Showing{" "}
                    {overduePageClamped * OVERDUE_INVOICES_PAGE_SIZE + 1}
                    –
                    {Math.min((overduePageClamped + 1) * OVERDUE_INVOICES_PAGE_SIZE, overdueRows.length)} of{" "}
                    {overdueRows.length}
                    {overduePageCount > 1 ? ` (page ${overduePageClamped + 1} of ${overduePageCount})` : null}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="table-section-heading">
          <h2>Draft Invoices</h2>
          <RefreshTableButton
            loading={dashboardTablesRefreshLoading}
            disabled={overdueLoading}
            onClick={() => void handleRefreshDashboardDraftTable()}
            ariaLabel="Refresh draft invoices table"
          />
        </div>
        {draftTableRefreshSuccess ? (
          <div className="alert alert-success" role="status">
            Your table has been refreshed.
          </div>
        ) : null}
        <p className="hint" style={{ marginTop: 0 }}>
          Click on invoice ID below to view recently drafted invoices
        </p>
        {overdueLoading ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Loading…
          </p>
        ) : draftRows.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            No draft invoices.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table dashboard-overdue-table dashboard-draft-table">
              <thead>
                <tr>
                  <th className="col-id">Invoice ID</th>
                  <th>Client name</th>
                  <th className="col-price">Total amount (£)</th>
                  <th className="col-created-at">Created at</th>
                </tr>
              </thead>
              <tbody>
                {draftPagedRows.map((row) => (
                  <tr key={row.id}>
                    <td className="col-id">
                      <button
                        type="button"
                        className="invoice-pdf-link"
                        disabled={pdfOpeningId === row.id}
                        onClick={() => handleOpenInvoicePdf(row.id)}
                        title="Open PDF in a new tab"
                      >
                        {pdfOpeningId === row.id ? "Opening…" : row.id}
                      </button>
                    </td>
                    <td>{row.clientName}</td>
                    <td className="col-price">{row.total}</td>
                    <td className="col-created-at">{row.createdAtLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!overdueLoading && draftRows.length > 0 ? (
          <div className="table-pagination table-pagination--balanced">
            <div className="table-pagination-inner">
              <div className="table-pagination-spacer" aria-hidden="true" />
              <div className="table-pagination-controls">
                <div className="btn-row table-pagination-prev-next">
                  <button
                    type="button"
                    className="btn"
                    disabled={draftPageClamped <= 0}
                    onClick={() => setDraftPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={draftPageClamped >= draftPageCount - 1}
                    onClick={() => setDraftPage((p) => Math.min(draftPageCount - 1, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
              <div className="table-pagination-meta-aside">
                <p className="hint table-pagination-meta">
                  Showing{" "}
                  {draftPageClamped * DRAFT_INVOICES_PAGE_SIZE + 1}
                  –
                  {Math.min((draftPageClamped + 1) * DRAFT_INVOICES_PAGE_SIZE, draftRows.length)} of {draftRows.length}
                  {draftPageCount > 1 ? ` (page ${draftPageClamped + 1} of ${draftPageCount})` : null}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Monthly Invoice Totals</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Line chart for the past three calendar months. Totals include every invoice from paid, unpaid, and overdue
          lists.
        </p>
        {chartPartialWarning ? <p className="hint">{chartPartialWarning}</p> : null}
        <ErrorAlert error={chartError} />
        {chartLoading ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Loading…
          </p>
        ) : chartSeries.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            No invoice data to chart yet.
          </p>
        ) : (
          <MonthlyInvoiceLineChart series={chartSeries} />
        )}
      </div>
    </div>
  );
}
