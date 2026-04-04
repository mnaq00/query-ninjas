package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"invoiceSys/apperrors"
	"invoiceSys/middleware"
	"invoiceSys/services"

	"github.com/gorilla/mux"
)

type ProductHandler struct {
	ProductService *services.ProductService
}

func (h *ProductHandler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	params := mux.Vars(r)
	idInt, err := strconv.Atoi(params["id"])
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	id := uint(idInt)

	var request struct {
		ProductName string  `json:"product_name"`
		Description string  `json:"description"`
		Price       float64 `json:"price"`
	}

	err = json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	updatedProduct, err := h.ProductService.UpdateProduct(middleware.BusinessIDFromRequest(r), id, request.ProductName, request.Description, request.Price)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(updatedProduct)
}

func (h *ProductHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	products, err := h.ProductService.ListProducts(middleware.BusinessIDFromRequest(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"products": products,
	})
}

func (h *ProductHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var request struct {
		ProductName string  `json:"product_name"`
		Description string  `json:"description"`
		Price       float64 `json:"price"`
	}

	err := json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	product, err := h.ProductService.CreateProduct(middleware.BusinessIDFromRequest(r), request.ProductName, request.Description, request.Price)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(product)
}

func (h *ProductHandler) GetProduct(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	params := mux.Vars(r)
	idInt, err := strconv.Atoi(params["id"])
	if err != nil {
		http.Error(w, "invalid product id", http.StatusBadRequest)
		return
	}

	product, err := h.ProductService.GetProduct(middleware.BusinessIDFromRequest(r), uint(idInt))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(product)
}

func (h *ProductHandler) ArchiveProduct(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	params := mux.Vars(r)
	idInt, err := strconv.Atoi(params["id"])
	if err != nil || idInt <= 0 {
		writeJSONError(w, apperrors.NewValidation(map[string]string{"id": "invalid product id"}))
		return
	}

	if err := h.ProductService.ArchiveProduct(middleware.BusinessIDFromRequest(r), uint(idInt)); err != nil {
		writeJSONError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Product archived"})
}
