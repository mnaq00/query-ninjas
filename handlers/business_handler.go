package handlers

import (
	"encoding/json"
	"net/http"

	"invoiceSys/middleware"
	"invoiceSys/models"
	"invoiceSys/services"
)

type BusinessHandler struct {
	Service *services.BusinessService
}

func (h *BusinessHandler) CreateBusinessProfile(w http.ResponseWriter, r *http.Request) {
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
