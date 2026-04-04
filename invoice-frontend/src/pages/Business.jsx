import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  createBusinessProfile,
  createBusinessProfileFormData,
  getBusinessProfile,
  updateBusinessProfile,
  updateBusinessProfileFormData,
  extractId,
  setStoredBusinessId,
} from "../services/api";
import { ErrorAlert, formatApiError } from "../utils/formErrors";
import PageBackButton from "../components/PageBackButton";
import {
  dispatchBusinessProfileUpdated,
  resolveBusinessLogoUrlForUi,
  resolveLogoImgSrc,
} from "../utils/businessProfile";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const emptyForm = {
  business_name: "",
  address: "",
  phone: "",
  email: "",
  vat_id: "",
  logo_url: "",
};

function isLogoImageFile(file) {
  if (!file || !file.name) return false;
  const t = (file.type || "").toLowerCase();
  if (["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/pjpeg"].includes(t)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) : false;
}

function BusinessLogoDropZone({ disabled, inputId, onValidFile, onInvalid }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  function validateAndDeliver(file) {
    if (!file) return;
    if (!isLogoImageFile(file)) {
      onInvalid("Use a PNG, JPEG, WebP, or GIF image for your logo.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      onInvalid("Logo must be 2 MB or smaller.");
      return;
    }
    onValidFile(file);
  }

  function handleInputChange(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    validateAndDeliver(f);
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={`logo-dropzone${dragOver ? " is-dragover" : ""}${disabled ? " is-disabled" : ""}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        if (disabled) return;
        validateAndDeliver(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
        className="logo-dropzone-input"
        disabled={disabled}
        onChange={handleInputChange}
        tabIndex={-1}
      />
      <p className="logo-dropzone-title">Drop a logo here or click to browse</p>
      <p className="logo-dropzone-meta">PNG, JPEG, WebP, or GIF · max 2 MB</p>
    </div>
  );
}

export default function Business() {
  const [createForm, setCreateForm] = useState(emptyForm);
  const [form, setForm] = useState(emptyForm);
  const [businessId, setBusinessId] = useState("");
  const [displayProfile, setDisplayProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [createLogoFile, setCreateLogoFile] = useState(null);
  const [createLogoPreviewUrl, setCreateLogoPreviewUrl] = useState(null);
  const [updateLogoFile, setUpdateLogoFile] = useState(null);
  const [updateLogoPreviewUrl, setUpdateLogoPreviewUrl] = useState(null);

  useEffect(() => {
    return () => {
      if (createLogoPreviewUrl) URL.revokeObjectURL(createLogoPreviewUrl);
    };
  }, [createLogoPreviewUrl]);

  useEffect(() => {
    return () => {
      if (updateLogoPreviewUrl) URL.revokeObjectURL(updateLogoPreviewUrl);
    };
  }, [updateLogoPreviewUrl]);

  /** GET /business-profile — tenant from JWT; no business ID field required. */
  const loadMyProfile = useCallback(async (options = {}) => {
    const { quiet = false } = options;
    setError(null);
    if (!quiet) setSuccess("");
    setLoading(true);
    setProfileLoading(true);
    try {
      const data = await getBusinessProfile();
      if (!data || typeof data !== "object") {
        setDisplayProfile(null);
        setBusinessId("");
        setStoredBusinessId("");
        if (!quiet) setSuccess("");
        return;
      }
      const logoUrl = resolveBusinessLogoUrlForUi(data);
      setForm({
        business_name: data.business_name || "",
        address: data.address || "",
        phone: data.phone || "",
        email: data.email || "",
        vat_id: data.vat_id || "",
        logo_url: logoUrl,
      });
      const extracted = extractId(data);
      if (extracted != null) {
        setBusinessId(String(extracted));
        setStoredBusinessId(extracted);
      }
      setDisplayProfile(
        data && typeof data === "object"
          ? { ...data, ...(logoUrl ? { logo_url: logoUrl } : {}) }
          : data
      );
      setUpdateLogoFile(null);
      setUpdateLogoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      dispatchBusinessProfileUpdated();
      if (!quiet) setSuccess("Profile loaded. You can edit fields below.");
    } catch (err) {
      const status = err?.status;
      if (status === 404) {
        setDisplayProfile(null);
        setBusinessId("");
        setStoredBusinessId("");
        if (!quiet) setError("No business profile found for this account. Create one below.");
        else setError(null);
      } else {
        setError(formatApiError(err));
      }
    } finally {
      setLoading(false);
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMyProfile({ quiet: true });
  }, [loadMyProfile]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setCreateField(key, value) {
    setCreateForm((f) => ({ ...f, [key]: value }));
  }

  function clearCreateLogoStaging() {
    setCreateLogoFile(null);
    setCreateLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function onCreateLogoPicked(file) {
    setError(null);
    setCreateLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setCreateLogoFile(file);
  }

  function clearUpdateLogoStaging() {
    setUpdateLogoFile(null);
    setUpdateLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function onUpdateLogoPicked(file) {
    setError(null);
    setUpdateLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setUpdateLogoFile(file);
  }

  async function handleCreateLogoUpload(file) {
    setError(null);
    setSuccess("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("business_name", createForm.business_name.trim());
      fd.append("address", createForm.address.trim());
      fd.append("phone", createForm.phone.trim());
      fd.append("email", createForm.email.trim());
      fd.append("vat_id", createForm.vat_id.trim());
      if (createForm.logo_url.trim()) fd.append("logo_url", createForm.logo_url.trim());
      fd.append("logo", file, file.name);
      const data = await createBusinessProfileFormData(fd);
      const id = extractId(data);
      if (id) {
        await loadMyProfile({ quiet: true });
        const fromPut = data && typeof data === "object" ? resolveBusinessLogoUrlForUi(data) : "";
        if (fromPut) {
          setDisplayProfile((prev) => (prev && typeof prev === "object" ? { ...prev, logo_url: fromPut } : prev));
          setForm((f) => ({ ...f, logo_url: fromPut }));
        }
      }
      setCreateForm(emptyForm);
      clearCreateLogoStaging();
      setSuccess("Profile created.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setSuccess("");
    if (createLogoFile) {
      await handleCreateLogoUpload(createLogoFile);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        business_name: createForm.business_name.trim(),
        address: createForm.address.trim(),
        phone: createForm.phone.trim(),
        email: createForm.email.trim(),
        vat_id: createForm.vat_id.trim(),
      };
      if (createForm.logo_url.trim()) payload.logo_url = createForm.logo_url.trim();
      const data = await createBusinessProfile(payload);
      const id = extractId(data);
      if (id) {
        await loadMyProfile({ quiet: true });
      }
      setCreateForm(emptyForm);
      clearCreateLogoStaging();
      setSuccess("Profile created.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshProfile() {
    await loadMyProfile({ quiet: false });
  }

  async function handleUpdateLogoUpload(file) {
    setError(null);
    setSuccess("");
    if (!businessId) {
      setError("Load your profile first before uploading a logo.");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("ID", String(Number(businessId)));
      fd.append("business_name", form.business_name.trim());
      fd.append("address", form.address.trim());
      fd.append("phone", form.phone.trim());
      fd.append("email", form.email.trim());
      fd.append("vat_id", form.vat_id.trim());
      if (form.logo_url.trim()) fd.append("logo_url", form.logo_url.trim());
      fd.append("logo", file, file.name);
      const returned = await updateBusinessProfileFormData(fd);
      await loadMyProfile({ quiet: true });
      const fromPut = returned && typeof returned === "object" ? resolveBusinessLogoUrlForUi(returned) : "";
      if (fromPut) {
        setDisplayProfile((prev) => (prev && typeof prev === "object" ? { ...prev, logo_url: fromPut } : prev));
        setField("logo_url", fromPut);
      }
      setSuccess("Profile updated.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e) {
    e.preventDefault();
    setError(null);
    setSuccess("");
    if (!businessId) {
      setError("Load your profile first.");
      return;
    }
    if (updateLogoFile) {
      await handleUpdateLogoUpload(updateLogoFile);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ID: Number(businessId),
        business_name: form.business_name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        vat_id: form.vat_id.trim(),
      };
      if (form.logo_url.trim()) payload.logo_url = form.logo_url.trim();
      else payload.logo_url = null;
      await updateBusinessProfile(payload);
      await loadMyProfile({ quiet: true });
      setSuccess("Profile updated.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveLogo() {
    setError(null);
    setSuccess("");
    if (!businessId) {
      setError("Load your profile first.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ID: Number(businessId),
        business_name: form.business_name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        vat_id: form.vat_id.trim(),
        logo_url: null,
      };
      await updateBusinessProfile(payload);
      setField("logo_url", "");
      await loadMyProfile({ quiet: true });
      setSuccess("Logo removed from profile.");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  const summaryId = displayProfile ? extractId(displayProfile) ?? businessId : businessId || null;
  const summaryLogoRaw = displayProfile ? resolveBusinessLogoUrlForUi(displayProfile) : "";
  const summaryLogoSrc = summaryLogoRaw ? resolveLogoImgSrc(summaryLogoRaw) : "";
  const [summaryLogoFailed, setSummaryLogoFailed] = useState(false);

  useEffect(() => {
    setSummaryLogoFailed(false);
  }, [displayProfile, summaryLogoSrc]);

  const updateSectionHasLogo =
    Boolean(businessId) &&
    (Boolean(form.logo_url.trim()) ||
      Boolean(displayProfile && resolveBusinessLogoUrlForUi(displayProfile)));

  return (
    <div className="business-page">
      <div className="business-page-header">
        <PageBackButton />
        <h1 className="business-page-title">My profile</h1>
      </div>
      {success || error ? (
        <div className="page-alerts-stack">
          {success ? <div className="alert alert-success">{success}</div> : null}
          <ErrorAlert error={error} />
        </div>
      ) : null}

      <div className="card">
        {profileLoading ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Loading…
          </p>
        ) : displayProfile ? (
          <div className="profile-summary-layout">
            <div className="profile-summary-logo-column">
              {summaryLogoSrc && !summaryLogoFailed ? (
                <div className="profile-summary-logo profile-summary-logo--beside-details">
                  <img
                    key={summaryLogoSrc || summaryLogoRaw}
                    src={summaryLogoSrc}
                    alt="Business logo"
                    referrerPolicy="no-referrer"
                    onError={() => setSummaryLogoFailed(true)}
                  />
                </div>
              ) : summaryLogoRaw ? (
                <p className="hint profile-summary-logo-fallback" style={{ margin: 0, wordBreak: "break-all" }}>
                  Could not display image. URL from server: {summaryLogoRaw}
                </p>
              ) : (
                <div className="profile-summary-logo-placeholder">No logo on file</div>
              )}
            </div>
            <dl className="profile-summary profile-summary--beside-logo">
              <div className="profile-summary-row">
                <dt>Name</dt>
                <dd>{displayProfile.business_name || "—"}</dd>
              </div>
              <div className="profile-summary-row">
                <dt>Phone</dt>
                <dd>{displayProfile.phone || "—"}</dd>
              </div>
              <div className="profile-summary-row">
                <dt>Address</dt>
                <dd className="profile-summary-multiline">{displayProfile.address || "—"}</dd>
              </div>
              <div className="profile-summary-row">
                <dt>Email</dt>
                <dd>{displayProfile.email || "—"}</dd>
              </div>
              <div className="profile-summary-row">
                <dt>Business ID</dt>
                <dd>{summaryId ?? "—"}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="hint" style={{ marginBottom: 0 }}>
            Create a profile below, or use <strong>Refresh profile</strong> in Update Profile to load it from the server.
          </p>
        )}
      </div>

      {!profileLoading && !displayProfile ? (
      <div className="card">
        <h2>Create Profile</h2>
        <form onSubmit={handleCreate} className="form-grid">
          <label className="field">
            Business name
            <input
              value={createForm.business_name}
              onChange={(e) => setCreateField("business_name", e.target.value)}
              required
            />
          </label>
          <label className="field">
            Address
            <textarea value={createForm.address} onChange={(e) => setCreateField("address", e.target.value)} required />
          </label>
          <label className="field">
            Phone
            <input value={createForm.phone} onChange={(e) => setCreateField("phone", e.target.value)} required />
          </label>
          <label className="field">
            Email
            <input type="email" value={createForm.email} onChange={(e) => setCreateField("email", e.target.value)} required />
          </label>
          <label className="field">
            VAT ID (e.g. GB123456789)
            <input value={createForm.vat_id} onChange={(e) => setCreateField("vat_id", e.target.value)} required />
          </label>
          <label className="field">
            Logo URL
            <input
              value={createForm.logo_url}
              onChange={(e) => setCreateField("logo_url", e.target.value)}
              placeholder="https://..."
            />
          </label>
          <div className="field">
            <span className="create-invoice-client-sublabel" style={{ display: "block", marginBottom: "0.25rem" }}>
              Logo File
            </span>
            <BusinessLogoDropZone
              disabled={loading}
              inputId="create-business-logo-file"
              onValidFile={onCreateLogoPicked}
              onInvalid={(msg) => setError(msg)}
            />
            {createLogoFile ? (
              <p className="hint" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                Logo selected — review the preview and your details below, then confirm.
              </p>
            ) : null}
          </div>
          {createLogoFile && createLogoPreviewUrl ? (
            <div className="profile-staging-review">
              <h3 className="profile-staging-review-heading">Review profile before creating</h3>
              <p className="hint" style={{ marginTop: 0 }}>
                Check your logo and business details. You can still edit the form above.
              </p>
              <div className="profile-staging-review-inner">
                <div className="profile-staging-review-logo">
                  <img src={createLogoPreviewUrl} alt="Staged logo preview" />
                </div>
                <dl className="profile-staging-summary">
                  <div className="profile-staging-summary-row">
                    <dt>Business name</dt>
                    <dd>{createForm.business_name.trim() || "—"}</dd>
                  </div>
                  <div className="profile-staging-summary-row">
                    <dt>Email</dt>
                    <dd>{createForm.email.trim() || "—"}</dd>
                  </div>
                  <div className="profile-staging-summary-row">
                    <dt>Phone</dt>
                    <dd>{createForm.phone.trim() || "—"}</dd>
                  </div>
                  <div className="profile-staging-summary-row">
                    <dt>VAT ID</dt>
                    <dd>{createForm.vat_id.trim() || "—"}</dd>
                  </div>
                  <div className="profile-staging-summary-row">
                    <dt>Address</dt>
                    <dd className="profile-summary-multiline">{createForm.address.trim() || "—"}</dd>
                  </div>
                  {createForm.logo_url.trim() ? (
                    <div className="profile-staging-summary-row">
                      <dt>Logo URL</dt>
                      <dd style={{ wordBreak: "break-all" }}>{createForm.logo_url.trim()}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
              <div className="btn-row" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn"
                  disabled={loading}
                  onClick={() => void handleCreateLogoUpload(createLogoFile)}
                >
                  {loading ? "Creating…" : "Confirm and create profile"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={loading}
                  onClick={clearCreateLogoStaging}
                >
                  Choose a different image
                </button>
              </div>
            </div>
          ) : null}
          {!createLogoFile ? (
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "Saving…" : "Create profile"}
            </button>
          ) : (
            <p className="hint" style={{ marginBottom: 0 }}>
              Use <strong>Confirm and create profile</strong> or <strong>Create profile</strong> — both save with your staged logo.
              Remove the staged image for JSON-only create (no file).
            </p>
          )}
        </form>
      </div>
      ) : null}

      <div className="card">
        <h2>Update Profile</h2>
        <p className="hint">Edit your details below and click save to continue.</p>
        <div className="btn-row business-update-load-form" style={{ marginBottom: "1.25rem" }}>
          <button type="button" className="btn" disabled={loading} onClick={() => void handleRefreshProfile()}>
            {loading ? "Loading…" : "Refresh profile"}
          </button>
        </div>
        <form onSubmit={handleUpdate} className="form-grid">
          <label className="field">
            Business name
            <input value={form.business_name} onChange={(e) => setField("business_name", e.target.value)} required />
          </label>
          <label className="field">
            Address
            <textarea value={form.address} onChange={(e) => setField("address", e.target.value)} required />
          </label>
          <label className="field">
            Phone
            <input value={form.phone} onChange={(e) => setField("phone", e.target.value)} required />
          </label>
          <label className="field">
            Email
            <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required />
          </label>
          <label className="field">
            VAT ID (e.g. GB123456789)
            <input value={form.vat_id} onChange={(e) => setField("vat_id", e.target.value)} required />
          </label>
          <label className="field">
            Logo URL
            <input value={form.logo_url} onChange={(e) => setField("logo_url", e.target.value)} placeholder="https://..." />
          </label>
          <div className="field">
            <span className="create-invoice-client-sublabel" style={{ display: "block", marginBottom: "0.25rem" }}>
              Logo File
            </span>
            <BusinessLogoDropZone
              disabled={loading || !businessId}
              inputId="update-business-logo-file"
              onValidFile={onUpdateLogoPicked}
              onInvalid={(msg) => setError(msg)}
            />
            {!businessId ? (
              <p className="hint" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                Load your profile above to enable logo upload.
              </p>
            ) : updateLogoFile ? (
              <p className="hint" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                Logo selected — click <strong>Save update</strong> or use <strong>Confirm logo upload</strong> below (same multipart request).
              </p>
            ) : null}
          </div>
          {updateLogoFile && updateLogoPreviewUrl && businessId ? (
            <div className="profile-staging-review">
              <h3 className="profile-staging-review-heading">Review logo before upload</h3>
              <p className="hint" style={{ marginTop: 0 }}>
                This will update your profile with the logo below and the field values in the form above.
              </p>
              <div className="profile-staging-review-inner">
                <div className="profile-staging-review-logo">
                  <img src={updateLogoPreviewUrl} alt="Staged logo preview" />
                </div>
                <dl className="profile-staging-summary">
                  <div className="profile-staging-summary-row">
                    <dt>Business name</dt>
                    <dd>{form.business_name.trim() || "—"}</dd>
                  </div>
                  <div className="profile-staging-summary-row">
                    <dt>Email</dt>
                    <dd>{form.email.trim() || "—"}</dd>
                  </div>
                  <div className="profile-staging-summary-row">
                    <dt>Phone</dt>
                    <dd>{form.phone.trim() || "—"}</dd>
                  </div>
                  <div className="profile-staging-summary-row">
                    <dt>VAT ID</dt>
                    <dd>{form.vat_id.trim() || "—"}</dd>
                  </div>
                  <div className="profile-staging-summary-row">
                    <dt>Address</dt>
                    <dd className="profile-summary-multiline">{form.address.trim() || "—"}</dd>
                  </div>
                  {form.logo_url.trim() ? (
                    <div className="profile-staging-summary-row">
                      <dt>Logo URL field</dt>
                      <dd style={{ wordBreak: "break-all" }}>{form.logo_url.trim()}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
              <div className="btn-row" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn"
                  disabled={loading}
                  onClick={() => void handleUpdateLogoUpload(updateLogoFile)}
                >
                  {loading ? "Uploading…" : "Confirm logo upload"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={loading}
                  onClick={clearUpdateLogoStaging}
                >
                  Discard staged image
                </button>
              </div>
            </div>
          ) : null}
          {updateSectionHasLogo ? (
            <div className="field">
              <button type="button" className="btn" disabled={loading} onClick={() => void handleRemoveLogo()}>
                Remove logo
              </button>
              <p className="hint" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                Clears the logo on your profile. Then use the box above to upload a new image or enter a new URL.
              </p>
            </div>
          ) : null}
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Saving…" : "Save update"}
          </button>
        </form>
      </div>
    </div>
  );
}
