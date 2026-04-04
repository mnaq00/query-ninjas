package handlers

import (
	"encoding/json"
	"invoiceSys/models"
	"invoiceSys/services"
	"net/http"
	"time"
)

type UserHandler struct {
	Service *services.UserService
}

func (h *UserHandler) RegisterUser(w http.ResponseWriter, r *http.Request) {
	// collect request details
	var signUp models.User
	err := json.NewDecoder(r.Body).Decode(&signUp)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	err = h.Service.RegisterUser(&signUp)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	// Account created — no JWT here; client obtains a token via POST /login.
	json.NewEncoder(w).Encode(struct {
		ID        uint      `json:"id"`
		Username  string    `json:"username"`
		CreatedAt time.Time `json:"created_at"`
		UpdatedAt time.Time `json:"updated_at"`
	}{
		ID:        signUp.ID,
		Username:  signUp.Username,
		CreatedAt: signUp.CreatedAt,
		UpdatedAt: signUp.UpdatedAt,
	})
}

func (h *UserHandler) Login(w http.ResponseWriter, r *http.Request) {
	// get login data from request body
	var login models.User
	err := json.NewDecoder(r.Body).Decode(&login)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	out, err := h.Service.Login(&login)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(out)
}