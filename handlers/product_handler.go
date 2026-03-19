package handlers

import (
	"encoding/json"
	"invoiceSys/services"
	"net/http"
	"strconv"

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
		ProductName string `json:"product_name"`
		Description string  `json:"description"`
		Price       float64 `json:"price"`
	}

	err = json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	updatedProduct, err := h.ProductService.UpdateProduct(id, request.ProductName, request.Description, request.Price)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(updatedProduct)
}
