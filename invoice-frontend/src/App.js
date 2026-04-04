import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Business from "./pages/Business";
import Clients from "./pages/Clients";
import Products from "./pages/Products";
import Invoices from "./pages/Invoices";

/**
 * Catches render-phase errors so the CRA dev overlay is less likely to block the whole app.
 * Async and event-handler errors are not caught here.
 */
class AppErrorBoundary extends React.Component {
  state = { error: null, resetNonce: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App render error:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState((s) => ({ error: null, resetNonce: s.resetNonce + 1 }));
  };

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: "2rem",
            background: "#1a2332",
            color: "#e7ecf3",
            fontFamily: "system-ui, sans-serif",
            maxWidth: "42rem",
            margin: "0 auto",
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: "1.35rem" }}>Something went wrong</h1>
          <p style={{ color: "#8b9cb3", lineHeight: 1.5 }}>
            A rendering error stopped the UI. This sometimes happens when API data cannot be shown. Use Try again or
            reload the page. If you are in development, check the browser console for details.
          </p>
          <pre
            style={{
              padding: "1rem",
              background: "#1a2332",
              border: "1px solid #2d3a4d",
              borderRadius: 8,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "0.85rem",
            }}
          >
            {msg}
          </pre>
          <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{
                padding: "0.55rem 1rem",
                borderRadius: 6,
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                background: "#3d8bfd",
                color: "#fff",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "0.55rem 1rem",
                borderRadius: 6,
                border: "1px solid #2d3a4d",
                fontWeight: 500,
                cursor: "pointer",
                background: "transparent",
                color: "#e7ecf3",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    const child = React.Children.only(this.props.children);
    return React.cloneElement(child, { key: this.state.resetNonce });
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/business" element={<Business />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/products" element={<Products />} />
              <Route path="/invoices" element={<Invoices />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AppErrorBoundary>
  );
}

export default App;
