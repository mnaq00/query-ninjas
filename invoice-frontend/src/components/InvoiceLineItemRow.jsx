import React, { useState, useEffect, useCallback, useRef } from "react";
import { getProduct } from "../services/api";
import { productDisplayNameFromApiData } from "../utils/productRecord";

export default function InvoiceLineItemRow({
  productId,
  quantity,
  onProductIdChange,
  onQuantityChange,
  onRemove,
  disableRemove,
}) {
  const [nameHint, setNameHint] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const reqSeq = useRef(0);

  const loadProductNameForId = useCallback(async (n) => {
    const id = Number(n);
    if (!Number.isFinite(id) || id <= 0) {
      setNameHint("");
      setNameLoading(false);
      return;
    }
    const req = ++reqSeq.current;
    setNameLoading(true);
    try {
      const data = await getProduct(id);
      if (req !== reqSeq.current) return;
      setNameHint(productDisplayNameFromApiData(data));
    } catch {
      if (req !== reqSeq.current) return;
      setNameHint("");
    } finally {
      if (req === reqSeq.current) setNameLoading(false);
    }
  }, []);

  useEffect(() => {
    const raw = String(productId).trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) {
      setNameHint("");
      setNameLoading(false);
      return undefined;
    }
    setNameHint("");
    setNameLoading(true);
    const t = window.setTimeout(() => {
      void loadProductNameForId(n);
    }, 400);
    return () => {
      window.clearTimeout(t);
      reqSeq.current += 1;
    };
  }, [productId, loadProductNameForId]);

  function handleProductIdChange(value) {
    onProductIdChange(value);
    const r = String(value).trim();
    const num = Number(r);
    if (!r || !Number.isFinite(num) || num <= 0) {
      setNameHint("");
      setNameLoading(false);
      onQuantityChange("");
    }
  }

  const rawPid = String(productId).trim();
  const productIdNum = Number(rawPid);
  const productIdValid = Boolean(rawPid && Number.isFinite(productIdNum) && productIdNum > 0);

  return (
    <tr>
      <td className="col-id">
        <input
          type="number"
          min="1"
          value={productId}
          onChange={(e) => handleProductIdChange(e.target.value)}
          onBlur={() => {
            const raw = String(productId).trim();
            const n = Number(raw);
            if (!raw || !Number.isFinite(n) || n <= 0) return;
            void loadProductNameForId(n);
          }}
          required
        />
      </td>
      <td className="col-name">
        <input
          type="text"
          readOnly
          tabIndex={-1}
          className="line-item-name-input"
          value={nameLoading ? "" : nameHint}
          placeholder={
            nameLoading ? "Looking up…" : productIdValid ? "—" : ""
          }
          title={nameHint || undefined}
          aria-live="polite"
        />
      </td>
      <td className="col-qty">
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => onQuantityChange(e.target.value)}
          disabled={!productIdValid}
          required={productIdValid}
        />
      </td>
      <td className="col-actions">
        <button
          type="button"
          className="line-item-remove-btn"
          onClick={onRemove}
          disabled={disableRemove}
          aria-label="Remove line"
          title="Remove line"
        >
          ×
        </button>
      </td>
    </tr>
  );
}
