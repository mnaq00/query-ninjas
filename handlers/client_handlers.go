package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"invoiceSys/apperrors"
	"invoiceSys/middleware"
	"invoiceSys/models"
	"invoiceSys/services"

	"github.com/gorilla/mux"
)

type ClientHandler struct {
	ClientService *services.ClientService
}

type CreateClientRequest struct {
	Name           string `json:"name"`
	Email          string `json:"email"`
	BillingAddress string `json:"billing_address"`
}

func (h *ClientHandler) ListClients(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	clients, err := h.ClientService.ListClients(middleware.BusinessIDFromRequest(r))
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"clients": clients,
	})
}

func (h *ClientHandler) AddClient(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CreateClientRequest
	if err := decodeJSON(w, r, &req); err != nil {
		st, msg := jsonDecodeErrorStatus(err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(st)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
		return
	}

	client, err := h.ClientService.AddClient(middleware.BusinessIDFromRequest(r), req.Name, req.Email, req.BillingAddress)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Client saved successfully",
		"client":  client,
	})
}

func (h *ClientHandler) UpdateClient(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var client models.Client
	if err := decodeJSON(w, r, &client); err != nil {
		st, msg := jsonDecodeErrorStatus(err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(st)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
		return
	}

	updatedClient, err := h.ClientService.UpdateClient(middleware.BusinessIDFromRequest(r), &client)
	if err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Client updated successfully",
		"client":  updatedClient,
	})
}

func (h *ClientHandler) ArchiveClient(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	params := mux.Vars(r)
	idInt, err := strconv.Atoi(params["id"])
	if err != nil || idInt <= 0 {
		writeJSONError(w, apperrors.NewValidation(map[string]string{"id": "invalid client id"}))
		return
	}

	if err := h.ClientService.ArchiveClient(middleware.BusinessIDFromRequest(r), uint(idInt)); err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Client archived"})
}
