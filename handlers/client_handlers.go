package handlers

import (
	"encoding/json"
	"net/http"

	"invoiceSys/models"
	"invoiceSys/services"
)

type ClientHandler struct {
	ClientService *services.ClientService
}

type CreateClientRequest struct {
	Name           string `json:"name"`
	Email          string `json:"email"`
	BillingAddress string `json:"billing_address"`
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

	client, err := h.ClientService.AddClient(req.Name, req.Email, req.BillingAddress)
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

	updatedClient, err := h.ClientService.UpdateClient(&client)
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
