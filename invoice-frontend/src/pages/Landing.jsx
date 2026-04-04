import React from "react";
import { Link, Navigate } from "react-router-dom";
import { getToken } from "../services/api";
import "../styles/landing.css";

function IconBusiness() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v0M9 12v0M9 15v0M9 18v0" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconPackage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  );
}

function IconInvoice() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconPdf() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M10 12h4M10 16h4" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconCredit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <path d="M1 10h22" />
    </svg>
  );
}

const features = [
  {
    icon: IconShield,
    title: "Secure sign-in",
    body: "Register your growing business and securely store all details in one place.",
  },
  {
    icon: IconBusiness,
    title: "Business profile",
    body: "Store your company details once and attach them to every invoice you send.",
  },
  {
    icon: IconUsers,
    title: "Client management",
    body: "Keep customers organized and reuse them when you build new invoices.",
  },
  {
    icon: IconPackage,
    title: "Products & pricing",
    body: "Maintain a catalog with prices and quantities, then drop line items onto invoices fast.",
  },
  {
    icon: IconInvoice,
    title: "Flexible invoices",
    body: "Line items, tax rates, draft or final status, and payment tracking in one place.",
  },
  {
    icon: IconSearch,
    title: "Find anything",
    body: "Search for invoices fast and get paid even quicker.",
  },
  {
    icon: IconCredit,
    title: "Payments",
    body: "Track your invoices and ensure everything is up to date.",
  },
  {
    icon: IconPdf,
    title: "PDF export",
    body: "Download professional PDFs for filing, printing, or attaching to emails.",
  },
  {
    icon: IconMail,
    title: "Email delivery",
    body: "Send invoices straight to clients from the app so nothing gets lost in the shuffle.",
  },
];

export default function Landing() {
  if (getToken()) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          Invoice Studio
        </Link>
        <div className="landing-nav-actions">
          <Link to="/login" className="btn btn-ghost">
            Sign in
          </Link>
          <Link to="/register" className="btn">
            Get started
          </Link>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-heading">
        <div className="landing-hero-inner">
          <p className="landing-badge">Invoice management</p>
          <h1 id="landing-heading">Run billing from one calm, modern workspace.</h1>
          <p className="landing-lead">
            Invoice Studio connects your business profile, clients, and products to polished invoices.
            Track status, export PDFs, and email customers without juggling spreadsheets.
          </p>
          <div className="landing-cta-row">
            <Link to="/register" className="btn">
              Create free account
            </Link>
            <Link to="/login" className="btn btn-secondary">
              I already have an account
            </Link>
          </div>
          <div className="landing-stats" role="presentation">
            <div className="landing-stat">
              <strong>9+</strong>
              <span>Workflow features</span>
            </div>
            <div className="landing-stat">
              <strong>End-to-end</strong>
              <span>From client to paid</span>
            </div>
            <div className="landing-stat">
              <strong>PDF & email</strong>
              <span>Share how you prefer</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="features-heading">
        <h2 id="features-heading">Everything you need to get paid</h2>
        <p className="landing-section-intro">
          Built around a simple flow: set up your business, add clients and products, then create and manage
          invoices. Each capability below maps to what you can do in the app today.
        </p>
        <div className="landing-features">
          {features.map(({ icon: Icon, title, body }) => (
            <article key={title} className="landing-feature">
              <div className="landing-feature-icon" aria-hidden>
                <Icon />
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" aria-labelledby="steps-heading">
        <h2 id="steps-heading">How it works</h2>
        <p className="landing-section-intro">
          Follow the steps below and begin your journey on generating invoices today!
        </p>
        <div className="landing-steps">
          <div className="landing-step">
            <h3>Business</h3>
            <p>Create your business profile.</p>
          </div>
          <div className="landing-step">
            <h3>Clients & products</h3>
            <p>Register your clients and products/services.</p>
          </div>
          <div className="landing-step">
            <h3>Invoices</h3>
            <p>Create, update and send off your invoices with ease.</p>
          </div>
        </div>
      </section>

      <div className="landing-cta-band">
        <div className="landing-cta-band-inner">
          <div>
            <h2>Ready to simplify your billing?</h2>
            <p>Sign up in seconds and connect your API-backed workspace.</p>
          </div>
          <Link to="/register" className="btn">
            Start now
          </Link>
        </div>
      </div>

      <footer className="landing-footer">
        <p>Invoice Studio — structured invoicing for teams that outgrew the inbox.</p>
      </footer>
    </div>
  );
}
