import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../services/api";
import { ErrorAlert, formatApiError } from "../utils/formErrors";

export default function Register() {
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
      await register(username, password);
      navigate("/login", { replace: true });
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
        <h1>Create account</h1>
        <ErrorAlert error={error} />
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              minLength={2}
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={4}
            />
          </label>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Creating…" : "Register"}
          </button>
        </form>
        <p className="sub" style={{ marginTop: "1rem", marginBottom: 0 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
