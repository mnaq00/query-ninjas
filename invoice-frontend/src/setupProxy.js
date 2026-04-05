/**
 * Dev-only proxy to the Go API.
 *
 * Do NOT set "proxy" in package.json at the same time — that adds a second
 * http-proxy layer and can worsen multipart /business-profile failures (EPIPE).
 *
 * Target: REACT_APP_PROXY_TARGET=http://127.0.0.1:8080 (prefer 127.0.0.1 over
 * "localhost" to avoid IPv6 ::1 vs IPv4 mismatch with the API).
 */
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { createProxyMiddleware } = require("http-proxy-middleware");

const target = process.env.REACT_APP_PROXY_TARGET || "http://127.0.0.1:8080";

function agentForTarget(urlString) {
  try {
    const u = new URL(urlString);
    const opts = { keepAlive: true, keepAliveMsecs: 1000, maxSockets: 64 };
    return u.protocol === "https:" ? new https.Agent(opts) : new http.Agent(opts);
  } catch {
    return new http.Agent({ keepAlive: true, keepAliveMsecs: 1000, maxSockets: 64 });
  }
}

const apiPrefixes = ["/business-profile", "/login", "/register", "/clients", "/products", "/invoices", "/uploads"];

function matchesApiPath(pathname) {
  return apiPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

module.exports = function setupProxy(app) {
  const agent = agentForTarget(target);

  app.use(
    createProxyMiddleware(matchesApiPath, {
      target,
      changeOrigin: true,
      secure: false,
      agent,
      xfwd: true,
      timeout: 180_000,
      proxyTimeout: 180_000,
      logLevel: "silent",
      onProxyReq(proxyReq, req) {
        if (req.socket) req.socket.setNoDelay(true);
      },
      onError(err, req, res) {
        const code = err && err.code;
        console.warn("[dev proxy]", req.method, req.url, "→", target, code || err.message);
        if (res && !res.headersSent && typeof res.writeHead === "function") {
          res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(
            `Bad gateway (dev proxy): ${code || err.message}. Is the API listening on ${target}?`
          );
        }
      },
    })
  );
};
