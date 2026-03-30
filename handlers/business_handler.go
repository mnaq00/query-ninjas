package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

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

	err := h.Service.CreateBusinessProfile(&signUp)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(signUp)
}

func (h *BusinessHandler) GetBusinessProfile(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid id"})
		return
	}

	profile, err := h.Service.GetBusinessProfile(uint(id))
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

	err := h.Service.UpdateBusinessProfile(&profile)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(profile)
}
