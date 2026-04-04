/**
 * Disables the webpack-dev-server fullscreen error overlay (dark dim layer that blocks clicks).
 * Errors still appear in the terminal and browser console; the in-app AppErrorBoundary catches many render errors.
 */
module.exports = {
  devServer: (devServerConfig) => {
    devServerConfig.client = {
      ...devServerConfig.client,
      overlay: false,
    };
    // Longer Node HTTP timeouts — default headers/request timeouts can abort
    // large multipart logo uploads and surface as EPIPE in the proxy.
    const prev = devServerConfig.server;
    let serverType = "http";
    let serverOptions = {};
    if (typeof prev === "string") {
      serverType = prev;
    } else if (prev && typeof prev === "object") {
      serverType = prev.type || "http";
      if (typeof prev.options === "object" && prev.options !== null) {
        serverOptions = prev.options;
      }
    }
    // Node requires headersTimeout <= requestTimeout or http.createServer throws
    // (ERR_OUT_OF_RANGE) and the dev server never listens → browser ERR_CONNECTION_REFUSED.
    devServerConfig.server = {
      type: serverType,
      options: {
        ...serverOptions,
        requestTimeout: 300_000,
        headersTimeout: 300_000,
      },
    };
    return devServerConfig;
  },
};
