package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

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
		"message": "Invoice created successfully",
		"invoice": req,
	})
}

// This function searches invoices based of a customer name - This is a GET request
func (h *InvoiceHandler) SearchByClient(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	businessName := r.URL.Query().Get("Customer_name")
	if businessName == "" {
		http.Error(w, "Customer name is required", http.StatusBadRequest)
		return
	}

	matches, err := h.Service.SearchByClient(businessName) // ← CALL SERVICE
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if len(matches) == 0 {
		http.Error(w, "No invoices found for client", http.StatusNotFound)
		return
	}

	if err := json.NewEncoder(w).Encode(matches); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

// 6.2 search invoices by customer payment status: unpaid, paid, overdue
func (h *InvoiceHandler) ViewInvoiceStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	paymentStatus := r.URL.Query().Get("customer_payment_status")
	if paymentStatus == "" {
		http.Error(w, "customer_payment_status query is required (unpaid, paid, overdue)", http.StatusBadRequest)
		return
	}

	matches, err := h.Service.SearchByPaymentStatus(paymentStatus)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if len(matches) == 0 {
		http.Error(w, "No invoices with status: "+paymentStatus, http.StatusNotFound)
		return
	}

	if err := json.NewEncoder(w).Encode(matches); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

// 6.1
func (h *InvoiceHandler) MarkInvoicePaid(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	// Auto-generate NOW as payment date
	now := time.Now()

	invoice, err := h.Service.MarkInvoicePaid(uint(id), now)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":      "Invoice marked PAID",
		"invoice_id":   id,
		"payment_date": now.Format(time.RFC3339),
		"invoice":      invoice,
	})
}

func (h *InvoiceHandler) UpdateInvoice(w http.ResponseWriter, r *http.Request) {
	var req models.Invoice

	vars := mux.Vars(r)
	idParam := vars["id"]

	id, err := strconv.Atoi(idParam)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
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
	updated, err := h.Service.UpdateInvoice(uint(id), &req)
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
		"invoice": updated,
	})
}

// GetInvoicePDF streams the invoice as application/pdf with attachment disposition so
// clients (Postman “Send and Download”, browsers) save the file instead of only previewing.
func (h *InvoiceHandler) GetInvoicePDF(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idParam := vars["id"]
	id, err := strconv.Atoi(idParam)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid invoice id"})
		return
	}

	data, filename, err := h.Service.RenderInvoicePDF(uint(id))
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// Robel — Body must include "invoice_status": "ready_to_send" (or "ready to send").
// Draft invoices are promoted to ready_to_send automatically, then email is sent.
func (h *InvoiceHandler) SendInvoice(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	idParam := vars["id"]

	id, err := strconv.Atoi(idParam)
	if err != nil {
		http.Error(w, "invalid invoice id", http.StatusBadRequest)
		return
	}

	var body struct {
		InvoiceStatus string `json:"invoice_status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "JSON body required with invoice_status", http.StatusBadRequest)
		return
	}

	err = h.Service.SendInvoiceEmail(uint(id), body.InvoiceStatus)
	if err != nil {
		status := http.StatusInternalServerError
		msg := err.Error()

		if strings.HasPrefix(msg, "request body must include") ||
			strings.HasPrefix(msg, "email send is only allowed") ||
			msg == "client has no email address; cannot send invoice" ||
			strings.HasPrefix(msg, "SMTP not configured") ||
			strings.HasPrefix(msg, "SMTP_FROM not configured") {
			status = http.StatusBadRequest
		}

		http.Error(w, msg, status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "invoice sent successfully",
	})
}
