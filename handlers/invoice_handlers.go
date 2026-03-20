package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"invoiceSys/models"
	"invoiceSys/services"

	"github.com/gorilla/mux"
)

type InvoiceHandler struct {
	Service services.InvoiceService
}

func (h *InvoiceHandler) CreateInvoice(w http.ResponseWriter, r *http.Request) {
	var req models.Invoice

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}

	if err := h.Service.CreateInvoice(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}

		w.Header().Set("Content-Type", "application/json")
	    w.WriteHeader(http.StatusCreated)
	    json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "invoice created successfully",
		"invoice": req,
	})

}
	func (h *InvoiceHandler) UpdateInvoice(w http.ResponseWriter, r *http.Request) {
	var req models.Invoice

	vars := mux.Vars(r)
	idParam := vars["id"]

	id, err := strconv.Atoi(idParam)
	if err != nil {
		w.Header() .Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "invalid invoice id",
	})
	return
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}
    err = h.Service.UpdateInvoice(uint(id), &req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
	    w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	    w.WriteHeader(http.StatusOK)
	    json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "invoice updated successfully",
		"invoice": req,
	})

}

