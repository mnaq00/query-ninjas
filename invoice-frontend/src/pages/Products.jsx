import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  createProduct,
  listProducts,
  fetchStoredProducts,
  getProduct,
  updateProduct,
  archiveProduct,
  extractId,
  getStoredProductId,
  setStoredProductId,
  removeStoredProductId,
  listInvoicesByPaymentStatus,
} from "../services/api";
import { ErrorAlert, formatApiError } from "../utils/formErrors";
import PageBackButton from "../components/PageBackButton";
import RefreshTableButton from "../components/RefreshTableButton";
import { useTimedTableRefreshSuccess } from "../hooks/useTimedTableRefreshSuccess";

const PAGE_SIZE = 4;

const PRODUCTS_SORT = {
  PRICE_DESC: "price_desc",
  PRICE_ASC: "price_asc",
  CREATED_DESC: "created_desc",
  CREATED_ASC: "created_asc",
  USAGE_DESC: "usage_desc",
  USAGE_ASC: "usage_asc",
};

const PRODUCT_CREATED_AT_KEYS = [
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

function mergeInvoicePayload(inv) {
  if (!inv || typeof inv !== "object") return {};
  let m = { ...inv };
  const inner = m.invoice ?? m.Invoice;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    m = { ...inner, ...m };
  }
  return m;
}

function invoiceNumericIdForDedupe(inv) {
  const m = mergeInvoicePayload(inv);
  const v = m.ID ?? m.id ?? m.InvoiceID ?? m.invoice_id ?? m.InvoiceId;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function lineItemsFromInvoicePayload(inv) {
  const m = mergeInvoicePayload(inv);
  const keys = [
    "items",
    "Items",
    "line_items",
    "LineItems",
    "invoice_items",
    "InvoiceItems",
    "lines",
    "Lines",
  ];
  for (const k of keys) {
    const v = m[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function productIdFromLineItem(line) {
  if (!line || typeof line !== "object") return null;
  const v =
    line.product_id ??
    line.ProductID ??
    line.ProductId ??
    line.productId ??
    line.item_product_id ??
    line.ItemProductId;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function lineItemQuantity(line) {
  if (!line || typeof line !== "object") return 1;
  const raw = line.quantity ?? line.Quantity ?? line.qty ?? line.Qty;
  if (raw == null || raw === "") return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Dedupe by invoice id across unpaid/paid/overdue; sum line quantities per product id. */
async function fetchProductUsageCountsByProductId() {
  const settled = await Promise.allSettled([
    listInvoicesByPaymentStatus("unpaid"),
    listInvoicesByPaymentStatus("paid"),
    listInvoicesByPaymentStatus("overdue"),
  ]);
  if (settled.every((r) => r.status === "rejected")) {
    const first = settled[0];
    throw first.status === "rejected" ? first.reason : new Error("Could not load invoices.");
  }
  const seenInvoiceIds = new Set();
  /** @type {Record<string, number>} */
  const counts = {};
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const arr = invoicesArrayFromViewStatus(r.value);
    for (const inv of arr) {
      const invId = invoiceNumericIdForDedupe(inv);
      if (invId == null) continue;
      if (seenInvoiceIds.has(invId)) continue;
      seenInvoiceIds.add(invId);
      for (const line of lineItemsFromInvoicePayload(inv)) {
        const pid = productIdFromLineItem(line);
        if (pid == null) continue;
        const key = String(pid);
        const q = lineItemQuantity(line);
        counts[key] = (counts[key] || 0) + q;
      }
    }
  }
  return counts;
}

function productCreatedAtMs(p) {
  if (!p || typeof p !== "object") return null;
  const o = p.product && typeof p.product === "object" ? { ...p.product, ...p } : p;
  for (const k of PRODUCT_CREATED_AT_KEYS) {
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

function priceSortKey(p) {
  const v = rowPrice(p);
  if (v === "" || v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

function compareProductIdsStable(a, b) {
  const na = Number(rowId(a));
  const nb = Number(rowId(b));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(rowId(a) ?? "").localeCompare(String(rowId(b) ?? ""));
}

function usageCountForProduct(counts, p) {
  const id = rowId(p);
  if (id == null) return 0;
  const n = Number(id);
  if (!Number.isFinite(n)) return 0;
  return counts[String(n)] ?? 0;
}

function rowId(p) {
  return p.ID ?? p.id ?? null;
}

function rowName(p) {
  return p.product_name ?? p.ProductName ?? "";
}

function rowDescription(p) {
  return p.description ?? p.Description ?? "";
}

function rowPrice(p) {
  const v = p.price ?? p.Price;
  if (v === undefined || v === null) return "";
  return typeof v === "number" ? v : Number(v);
}

function fillEditFormFromData(setters, data, id) {
  const { setEditName, setEditDescription, setEditPrice, setEditId, setEditLoaded } = setters;
  setEditId(String(id));
  setEditName(rowName(data));
  setEditDescription(rowDescription(data));
  const pr = rowPrice(data);
  setEditPrice(pr === "" ? "" : String(pr));
  setEditLoaded(true);
}

/** Friendly copy when GET /products/:id fails (matches Clients page pattern). */
async function fetchProductsRows() {
  try {
    const list = await listProducts();
    return { ok: true, list };
  } catch (listErr) {
    try {
      const list = await fetchStoredProducts();
      if (list.length === 0) {
        return { ok: false, list, error: formatApiError(listErr) };
      }
      return { ok: true, list };
    } catch (fallbackErr) {
      return { ok: false, list: [], error: formatApiError(fallbackErr) };
    }
  }
}

function messageForProductFetchError(err) {
  const rawMsg = formatApiError(err);
  const msgLower = String(rawMsg).toLowerCase();
  if (err?.status === 404 || msgLower.includes("product not found")) {
    return "Product not found. Try again.";
  }
  return rawMsg;
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState(
    getStoredProductId() ? Number(getStoredProductId()) : null
  );

  /* —— Create —— */
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [lastCreatedId, setLastCreatedId] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);

  /* —— Update —— */
  const [editId, setEditId] = useState(getStoredProductId() || "");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editLoaded, setEditLoaded] = useState(false);
  const [editLoadLoading, setEditLoadLoading] = useState(false);
  const [editSaveLoading, setEditSaveLoading] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editSuccess, setEditSuccess] = useState(null);

  const [tableSuccess, setTableSuccess] = useState("");
  const [archiveError, setArchiveError] = useState(null);
  const [archivingId, setArchivingId] = useState(null);
  const [productsTableRefreshLoading, setProductsTableRefreshLoading] = useState(false);
  const { successVisible: productsTableRefreshSuccess, showSuccess: showProductsTableRefreshSuccess, hideSuccess: hideProductsTableRefreshSuccess, clearTimer: clearProductsTableRefreshTimer } =
    useTimedTableRefreshSuccess();

  const [productsSortMode, setProductsSortMode] = useState(PRODUCTS_SORT.CREATED_DESC);
  const [productUsageCounts, setProductUsageCounts] = useState(null);
  const [productUsageLoading, setProductUsageLoading] = useState(false);
  const [productUsageError, setProductUsageError] = useState(null);

  const productsListSignature = useMemo(() => products.map((p) => rowId(p)).join(","), [products]);

  const displayedProductsList = useMemo(() => {
    const rows = [...products];
    if (productsSortMode === PRODUCTS_SORT.PRICE_DESC) {
      return rows.sort((a, b) => {
        const pa = priceSortKey(a);
        const pb = priceSortKey(b);
        const na = pa ?? Number.NEGATIVE_INFINITY;
        const nb = pb ?? Number.NEGATIVE_INFINITY;
        if (na !== nb) return nb - na;
        return compareProductIdsStable(a, b);
      });
    }
    if (productsSortMode === PRODUCTS_SORT.PRICE_ASC) {
      return rows.sort((a, b) => {
        const pa = priceSortKey(a);
        const pb = priceSortKey(b);
        const na = pa ?? Number.POSITIVE_INFINITY;
        const nb = pb ?? Number.POSITIVE_INFINITY;
        if (na !== nb) return na - nb;
        return compareProductIdsStable(a, b);
      });
    }
    if (productsSortMode === PRODUCTS_SORT.CREATED_ASC) {
      return rows.sort((a, b) => {
        const ta = productCreatedAtMs(a);
        const tb = productCreatedAtMs(b);
        const na = ta ?? Number.POSITIVE_INFINITY;
        const nb = tb ?? Number.POSITIVE_INFINITY;
        if (na !== nb) return na - nb;
        return compareProductIdsStable(a, b);
      });
    }
    if (productsSortMode === PRODUCTS_SORT.CREATED_DESC) {
      return rows.sort((a, b) => {
        const ta = productCreatedAtMs(a);
        const tb = productCreatedAtMs(b);
        const na = ta ?? Number.NEGATIVE_INFINITY;
        const nb = tb ?? Number.NEGATIVE_INFINITY;
        if (na !== nb) return nb - na;
        return compareProductIdsStable(a, b);
      });
    }
    if (productsSortMode === PRODUCTS_SORT.USAGE_DESC || productsSortMode === PRODUCTS_SORT.USAGE_ASC) {
      const counts = productUsageCounts || {};
      const desc = productsSortMode === PRODUCTS_SORT.USAGE_DESC;
      return rows.sort((a, b) => {
        const ua = usageCountForProduct(counts, a);
        const ub = usageCountForProduct(counts, b);
        if (ua !== ub) return desc ? ub - ua : ua - ub;
        return compareProductIdsStable(a, b);
      });
    }
    return rows;
  }, [products, productsSortMode, productUsageCounts]);

  const totalPages = Math.max(1, Math.ceil(displayedProductsList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return displayedProductsList.slice(start, start + PAGE_SIZE);
  }, [displayedProductsList, safePage]);

  const loadProducts = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetchProductsRows();
      setProducts(res.list);
      setListError(res.ok ? null : res.error);
      return res.list;
    } finally {
      setListLoading(false);
    }
  }, []);

  const settersForEdit = {
    setEditName,
    setEditDescription,
    setEditPrice,
    setEditId,
    setEditLoaded,
  };

  async function loadProductIntoEditForm(idOverride) {
    const raw = idOverride !== undefined ? String(idOverride) : editId;
    setEditError(null);
    setEditSuccess(null);
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      setEditError("Enter a valid product ID.");
      setEditLoaded(false);
      return;
    }
    setEditLoadLoading(true);
    try {
      const data = await getProduct(id);
      fillEditFormFromData(settersForEdit, data, id);
      setStoredProductId(id);
      setSelectedId(id);
      await loadProducts();
    } catch (err) {
      setEditLoaded(false);
      setEditError(messageForProductFetchError(err));
    } finally {
      setEditLoadLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setListError(null);
      const res = await fetchProductsRows();
      if (cancelled) return;
      setProducts(res.list);
      setListError(res.ok ? null : res.error);
      setListLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [productsSortMode]);

  useEffect(() => {
    if (productsSortMode !== PRODUCTS_SORT.USAGE_DESC && productsSortMode !== PRODUCTS_SORT.USAGE_ASC) {
      setProductUsageError(null);
      return;
    }
    let cancelled = false;
    setProductUsageLoading(true);
    setProductUsageError(null);
    void fetchProductUsageCountsByProductId()
      .then((counts) => {
        if (!cancelled) setProductUsageCounts(counts);
      })
      .catch((err) => {
        if (!cancelled) {
          setProductUsageCounts({});
          setProductUsageError(formatApiError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setProductUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productsSortMode, productsListSignature]);

  async function handleRefreshProductsTable() {
    clearProductsTableRefreshTimer();
    hideProductsTableRefreshSuccess();
    setArchiveError(null);
    setProductsTableRefreshLoading(true);
    try {
      const res = await fetchProductsRows();
      setProducts(res.list);
      setListError(res.ok ? null : res.error);
      if (res.ok) {
        setPage(1);
        showProductsTableRefreshSuccess();
      }
    } finally {
      setProductsTableRefreshLoading(false);
    }
  }

  function handleRowClick(p) {
    const id = rowId(p);
    if (id == null) return;
    setCreateError(null);
    setTableSuccess("");
    setEditError(null);
    setEditSuccess(null);
    fillEditFormFromData(settersForEdit, p, id);
    setStoredProductId(id);
    setSelectedId(id);
    setTableSuccess(`Product #${id} selected — details loaded in Update product below.`);
  }

  async function handleArchiveProduct(p, e) {
    e.stopPropagation();
    const id = rowId(p);
    if (id == null) return;
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) return;
    setArchiveError(null);
    if (!window.confirm("Are you sure you want to delete this product?")) {
      return;
    }
    setArchivingId(n);
    try {
      await archiveProduct(n);
      setProducts((prev) => prev.filter((row) => String(rowId(row)) !== String(n)));
      removeStoredProductId(n);
      if (String(getStoredProductId()) === String(n)) {
        setStoredProductId("");
        setSelectedId(null);
      }
      if (String(editId).trim() === String(n)) {
        setEditLoaded(false);
        setEditSuccess(null);
        setTableSuccess("");
      }
    } catch (err) {
      setArchiveError(formatApiError(err));
    } finally {
      setArchivingId(null);
    }
  }

  function handleEditIdChange(value) {
    setEditId(value);
    setEditLoaded(false);
    setEditError(null);
    setEditSuccess(null);
  }

  function handleEditIdBlur() {
    const id = Number(editId.trim());
    if (!Number.isFinite(id) || id <= 0) return;
    loadProductIntoEditForm(id);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const data = await createProduct({
        product_name: productName.trim(),
        description: description.trim(),
        price: Number(price),
      });
      const id = extractId(data);
      if (id != null) {
        setLastCreatedId(id);
        setStoredProductId(id);
        setSelectedId(id);
      } else {
        setLastCreatedId(null);
      }
      setProductName("");
      setDescription("");
      setPrice("");
      const list = await loadProducts();
      const lastPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      setPage(lastPage);
    } catch (err) {
      setCreateError(formatApiError(err));
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEditSave(e) {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(null);
    const id = Number(editId);
    if (!Number.isFinite(id) || id <= 0) {
      setEditError("Enter a valid product ID and load the product first.");
      return;
    }
    if (!editLoaded) {
      setEditError("Load the product first (tab out of the ID field or click Load product).");
      return;
    }
    setEditSaveLoading(true);
    try {
      await updateProduct(id, {
        product_name: editName.trim(),
        description: editDescription.trim(),
        price: Number(editPrice),
      });
      setStoredProductId(id);
      setSelectedId(id);
      setEditSuccess("Product updated.");
      await loadProducts();
    } catch (err) {
      setEditError(formatApiError(err));
    } finally {
      setEditSaveLoading(false);
    }
  }

  function formatPriceDisplay(v) {
    if (v === "" || Number.isNaN(Number(v))) return "—";
    const n = Number(v);
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className="products-page">
      <div className="products-page-header">
        <PageBackButton />
        <h1 className="products-page-title">Products</h1>
      </div>
      <div className="card products-list-card">
        <div className="table-section-heading products-list-card-heading">
          <h2>Your Products:</h2>
          <div className="clients-heading-actions">
            {!listLoading ? (
              <>
                <label className="clients-sort-field clients-sort-field--inline" htmlFor="products-sort-select">
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
                    id="products-sort-select"
                    className="clients-sort-select"
                    value={productsSortMode}
                    onChange={(e) => setProductsSortMode(e.target.value)}
                  >
                    <option value={PRODUCTS_SORT.PRICE_DESC}>Highest price</option>
                    <option value={PRODUCTS_SORT.PRICE_ASC}>Lowest price</option>
                    <option value={PRODUCTS_SORT.CREATED_DESC}>Newest</option>
                    <option value={PRODUCTS_SORT.CREATED_ASC}>Oldest</option>
                    <option value={PRODUCTS_SORT.USAGE_DESC}>Most common</option>
                    <option value={PRODUCTS_SORT.USAGE_ASC}>Least common</option>
                  </select>
                </label>
                {productUsageLoading ? (
                  <span className="hint clients-sort-status" aria-live="polite">
                    Loading invoice usage…
                  </span>
                ) : null}
                {productUsageError ? (
                  <span className="hint clients-sort-status" role="alert">
                    {productUsageError}
                  </span>
                ) : null}
              </>
            ) : null}
            <RefreshTableButton
              loading={productsTableRefreshLoading}
              disabled={listLoading}
              onClick={() => void handleRefreshProductsTable()}
              ariaLabel="Refresh product list"
            />
          </div>
        </div>
        {productsTableRefreshSuccess ? (
          <div className="alert alert-success" role="status">
            Your table has been refreshed.
          </div>
        ) : null}
        {tableSuccess ? <div className="alert alert-success">{tableSuccess}</div> : null}
        {listError ? <div className="alert alert-error">{listError}</div> : null}
        {archiveError ? (
          <div className="alert alert-error" role="alert">
            {archiveError}
          </div>
        ) : null}
        {listLoading ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Loading products…
          </p>
        ) : products.length === 0 && !listError ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            No products yet. Create one using the form below.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-id">ID</th>
                    <th>Name</th>
                    <th className="cell-desc">Description</th>
                    <th className="col-price">Price (£)</th>
                    <th className="col-archive" scope="col" aria-label="Delete product" />
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.map((p, idx) => {
                    const id = rowId(p);
                    const sel = selectedId != null && id != null && Number(selectedId) === Number(id);
                    const busy = id != null && archivingId === Number(id);
                    return (
                      <tr
                        key={id != null ? String(id) : `product-row-${idx}`}
                        className={sel ? "is-selected" : ""}
                        onClick={() => handleRowClick(p)}
                      >
                        <td className="col-id">{id ?? "—"}</td>
                        <td>{rowName(p) || "—"}</td>
                        <td className="cell-desc">{rowDescription(p) || "—"}</td>
                        <td className="col-price">{formatPriceDisplay(rowPrice(p))}</td>
                        <td className="col-archive">
                          <button
                            type="button"
                            className="products-archive-btn"
                            disabled={listLoading || id == null || busy}
                            aria-label={id != null ? `Delete product ${id}` : "Delete product"}
                            title="Delete product (archived on server)"
                            onClick={(e) => void handleArchiveProduct(p, e)}
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
            {products.length > 0 ? (
              <div className="table-pagination table-pagination--balanced">
                <div className="table-pagination-inner">
                  <div className="table-pagination-spacer" aria-hidden="true" />
                  <div className="table-pagination-controls">
                    <div className="btn-row table-pagination-prev-next">
                      <button
                        type="button"
                        className="btn"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  <div className="table-pagination-meta-aside">
                    <span className="table-pagination-meta">
                      Page {safePage} of {totalPages} ({products.length} Total)
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="card">
        <h2>Create product</h2>
        <p className="hint">Add a new product. Enter name, description and price.</p>
        <ErrorAlert error={createError} />
        <form className="form-grid" onSubmit={handleCreate}>
          <label className="field">
            Name
            <input value={productName} onChange={(e) => setProductName(e.target.value)} required />
          </label>
          <label className="field">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="field">
            Price
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn" disabled={createLoading}>
            {createLoading ? "Creating…" : "Create product"}
          </button>
        </form>
        {lastCreatedId != null ? (
          <div
            className="alert alert-success"
            style={{ marginTop: "1rem", marginBottom: 0 }}
            role="status"
          >
            <strong>Created product ID:</strong> {lastCreatedId}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Update Product</h2>
        <p className="hint">
          Enter a product ID first then <strong>update the product</strong> details and click save.
        </p>
        <ErrorAlert error={editError} />
        {editSuccess ? <div className="alert alert-success">{editSuccess}</div> : null}
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            loadProductIntoEditForm();
          }}
          style={{ marginBottom: editLoaded ? "1.25rem" : 0 }}
        >
          <label className="field">
            Product ID
            <input
              type="number"
              min="1"
              step="1"
              value={editId}
              onChange={(e) => handleEditIdChange(e.target.value)}
              onBlur={handleEditIdBlur}
              placeholder="e.g. 5"
            />
          </label>
          <button type="submit" className="btn" disabled={editLoadLoading}>
            {editLoadLoading ? "Loading…" : "Load product"}
          </button>
        </form>

        {editLoaded ? (
          <form className="form-grid" onSubmit={handleEditSave}>
            <label className="field">
              Name
              <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </label>
            <label className="field">
              Description
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </label>
            <label className="field">
              Price
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn" disabled={editSaveLoading}>
              {editSaveLoading ? "Saving…" : "Save changes"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
