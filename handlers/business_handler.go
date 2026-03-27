package handlers

import (
	"encoding/json"
	"invoiceSys/models"
	"invoiceSys/services"
	"net/http"
	"strconv"
)

type BusinessHandler struct {
	Service *services.BusinessService
}

func (h *BusinessHandler) CreateBusinessProfile(w http.ResponseWriter, r *http.Request) {
	// collect request details
	var signUp models.Business
	err := json.NewDecoder(r.Body).Decode(&signUp)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// call service layer
	err = h.Service.CreateBusinessProfile(&signUp)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	//response
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(signUp)
}

func (h *BusinessHandler) GetBusinessProfile(w http.ResponseWriter, r *http.Request) {

	// collect business profile
	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	// call service layer
	profile, err := h.Service.GetBusinessProfile(uint(id))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	//response
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(profile)
}

func (h *BusinessHandler) UpdateBusinessProfile(w http.ResponseWriter, r *http.Request) {
	// collect request details
	var profile models.Business
	err := json.NewDecoder(r.Body).Decode(&profile)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// call service layer
	err = h.Service.UpdateBusinessProfile(&profile)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	//response
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(profile)
}