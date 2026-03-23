package handlers

import (
	"encoding/json"
	"invoiceSys/models"
	"invoiceSys/services"
	"net/http"
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

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	client, err := h.ClientService.AddClient(req.Name, req.Email, req.BillingAddress)
	if err != nil {
		if err.Error() == "Client with this email already exists!" {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
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
	err := json.NewDecoder(r.Body).Decode(&client)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	updatedClient, err := h.ClientService.UpdateClient(&client)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Client updated successfully",
		"client":  updatedClient,
	})
}
