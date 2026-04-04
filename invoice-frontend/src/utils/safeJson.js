/** Avoid render crashes from JSON.stringify (circular refs, BigInt, etc.). */
export function safeJsonStringify(value, space = 2) {
  try {
    return JSON.stringify(
      value,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      space
    );
  } catch {
    return "[Could not display: response contains circular or non-JSON-safe values.]";
  }
}
