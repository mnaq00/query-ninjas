package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"invoiceSys/middleware"
	"invoiceSys/models"
	"invoiceSys/services"
)

type BusinessHandler struct {
	Service *services.BusinessService
}

func (h *BusinessHandler) CreateBusinessProfile(w http.ResponseWriter, r *http.Request) {
	if services.IsMultipartBusinessProfileRequest(r) {
		h.createBusinessProfileMultipart(w, r)
		return
	}

	var signUp models.Business
	if err := decodeJSON(w, r, &signUp); err != nil {
		st, msg := jsonDecodeErrorStatus(err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(st)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
		return
	}

	userID := middleware.UserIDFromRequest(r)
	err := h.Service.CreateBusinessProfile(&signUp, userID)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	token, err := middleware.GenerateJWT(userID, signUp.ID)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"business":    signUp,
		"token":       token,
		"business_id": signUp.ID,
	})
}

func businessFromForm(r *http.Request) models.Business {
	var b models.Business
	if v := strings.TrimSpace(r.FormValue("ID")); v != "" {
		if n, err := strconv.ParseUint(v, 10, 32); err == nil {
			b.ID = uint(n)
		}
	}
	b.BusinessName = strings.TrimSpace(r.FormValue("business_name"))
	b.Address = strings.TrimSpace(r.FormValue("address"))
	b.Phone = strings.TrimSpace(r.FormValue("phone"))
	b.Email = strings.TrimSpace(r.FormValue("email"))
	b.VATID = strings.TrimSpace(r.FormValue("vat_id"))
	if v := strings.TrimSpace(r.FormValue("logo_url")); v != "" {
		b.LogoURL = &v
	}
	return b
}

func (h *BusinessHandler) createBusinessProfileMultipart(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid multipart form"})
		return
	}

	signUp := businessFromForm(r)
	if r.MultipartForm != nil && len(r.MultipartForm.File["logo"]) > 0 {
		signUp.LogoURL = nil
	}

	userID := middleware.UserIDFromRequest(r)
	err := h.Service.CreateBusinessProfile(&signUp, userID)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	f, fh, err := r.FormFile("logo")
	if err != nil && !errors.Is(err, http.ErrMissingFile) {
		writeJSONError(w, err)
		return
	}
	if err == nil && f != nil {
		defer f.Close()
		pub, err := services.SaveBusinessLogoFile(signUp.ID, f, fh)
		if err != nil {
			writeJSONError(w, err)
			return
		}
		signUp.LogoURL = &pub
		if err := h.Service.UpdateBusinessProfile(&signUp); err != nil {
			writeJSONError(w, err)
			return
		}
	}

	token, err := middleware.GenerateJWT(userID, signUp.ID)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"business":    signUp,
		"token":       token,
		"business_id": signUp.ID,
	})
}

func (h *BusinessHandler) GetBusinessProfile(w http.ResponseWriter, r *http.Request) {
	businessID := middleware.BusinessIDFromRequest(r)
	if businessID == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "no business context"})
		return
	}

	profile, err := h.Service.GetBusinessProfile(businessID)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(profile)
}

func (h *BusinessHandler) UpdateBusinessProfile(w http.ResponseWriter, r *http.Request) {
	if services.IsMultipartBusinessProfileRequest(r) {
		h.updateBusinessProfileMultipart(w, r)
		return
	}

	var profile models.Business
	if err := decodeJSON(w, r, &profile); err != nil {
		st, msg := jsonDecodeErrorStatus(err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(st)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
		return
	}

	err := h.Service.UpdateBusinessProfileForTenant(middleware.BusinessIDFromRequest(r), &profile)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(profile)
}

func (h *BusinessHandler) updateBusinessProfileMultipart(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid multipart form"})
		return
	}

	tenantID := middleware.BusinessIDFromRequest(r)
	existing, err := h.Service.GetBusinessProfile(tenantID)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	profile := businessFromForm(r)
	if profile.LogoURL == nil && strings.TrimSpace(r.FormValue("logo_url")) == "" {
		profile.LogoURL = existing.LogoURL
	}

	f, fh, err := r.FormFile("logo")
	if err != nil && !errors.Is(err, http.ErrMissingFile) {
		writeJSONError(w, err)
		return
	}
	if err == nil && f != nil {
		defer f.Close()
		services.RemoveBusinessLogoFile(existing.LogoURL)
		pub, err := services.SaveBusinessLogoFile(tenantID, f, fh)
		if err != nil {
			writeJSONError(w, err)
			return
		}
		profile.LogoURL = &pub
	}

	if err := h.Service.UpdateBusinessProfileForTenant(tenantID, &profile); err != nil {
		writeJSONError(w, err)
		return
	}

	updated, err := h.Service.GetBusinessProfile(tenantID)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(updated)
}
