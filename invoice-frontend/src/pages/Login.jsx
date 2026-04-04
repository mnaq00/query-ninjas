import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../services/api";
import { ErrorAlert, formatApiError } from "../utils/formErrors";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="sub" style={{ marginBottom: "0.75rem" }}>
          <Link to="/" className="auth-back-link">
            ← Back to home
          </Link>
        </p>
        <h1>Sign in</h1>
        <ErrorAlert error={error} />
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="sub" style={{ marginTop: "1rem", marginBottom: 0 }}>
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
