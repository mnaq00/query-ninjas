package handlers

import (
	"encoding/json"
	"net/http"

	"invoiceSys/models"
	"invoiceSys/services"

)

type InvoiceHandler struct {
	Service services.InvoiceService
}

func (h *InvoiceHandler) CreateInvoice(w http.ResponseWriter, r*http.Request) {
	var req models.Invoice

	if err := json.NewDecoder(r.Body) .Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w) .Encode(map[string]string{
			"error": err.Error(),
	    })
	    return 
	}

	if err := h.Service.CreateInvoice(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w) .Encode(map[string]string{
			"error": err.Error(),
	    })
	    return 
	    
    }
	
	w.Header() .Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
	    "message": "invoice created successfully",
		"invoice": req,
	})
}