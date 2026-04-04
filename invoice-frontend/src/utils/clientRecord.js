/** Same nesting merge as Clients.jsx so GET /clients/:id and similar payloads resolve display fields. */

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

export function flattenClientRecord(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  return shallowMergeNestedObjects(shallowMergeNestedObjects(obj));
}

/** Display name from a client API object (nested or flat). */
export function clientDisplayName(data) {
  const o = flattenClientRecord(data);
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

export function clientRowId(c) {
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

export function clientEmail(c) {
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

export function clientBilling(c) {
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
