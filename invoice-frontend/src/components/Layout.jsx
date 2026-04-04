import React, { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getBusinessProfile, getToken, logout } from "../services/api";
import { extractLogoUrlFromBusinessApi, resolveLogoImgSrc } from "../utils/businessProfile";

const linkClass = ({ isActive }) => (isActive ? "nav-link active" : "nav-link");

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profileLogoSrc, setProfileLogoSrc] = useState("");
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [logoRefreshTick, setLogoRefreshTick] = useState(0);

  useEffect(() => {
    function bump() {
      setLogoRefreshTick((t) => t + 1);
    }
    window.addEventListener("business-profile-updated", bump);
    return () => window.removeEventListener("business-profile-updated", bump);
  }, []);

  useEffect(() => {
    setLogoLoadFailed(false);
    let cancelled = false;
    if (!getToken()) {
      setProfileLogoSrc("");
      return;
    }
    getBusinessProfile()
      .then((data) => {
        if (cancelled || !data || typeof data !== "object") return;
        const raw = extractLogoUrlFromBusinessApi(data);
        const src = raw ? resolveLogoImgSrc(raw) : "";
        setProfileLogoSrc(src);
      })
      .catch(() => {
        if (!cancelled) setProfileLogoSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, logoRefreshTick]);

  function handleLogout() {
    logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <Link to="/dashboard" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
            Invoice Studio
          </Link>
          <nav className="nav-main">
            <NavLink to="/dashboard" className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/clients" className={linkClass}>
              Clients
            </NavLink>
            <NavLink to="/products" className={linkClass}>
              Products
            </NavLink>
            <NavLink to="/invoices" className={linkClass}>
              Invoices
            </NavLink>
          </nav>
        </div>
        <div className="header-right">
          <Link
            to="/business"
            className="header-profile-logo-btn"
            title="My Profile"
            aria-label="My Profile"
          >
            {profileLogoSrc && !logoLoadFailed ? (
              <img
                key={profileLogoSrc}
                src={profileLogoSrc}
                alt=""
                className="header-profile-logo-img"
                referrerPolicy="no-referrer"
                onError={() => setLogoLoadFailed(true)}
              />
            ) : (
              <span className="header-profile-logo-placeholder" aria-hidden="true" />
            )}
          </Link>
          <NavLink to="/business" className={linkClass}>
            My Profile
          </NavLink>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
