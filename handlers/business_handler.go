package handlers

import (
	"encoding/json"
	"invoiceSys/models"
	"invoiceSys/services"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

type BusinessHandler struct {
	Service *services.BusinessService
}

func (h *BusinessHandler) UpdateBusiness(w http.ResponseWriter, r *http.Request) {

	idParam := mux.Vars(r)["id"]
	id, _ := strconv.Atoi(idParam)

	var input models.Business
	json.NewDecoder(r.Body).Decode(&input)

	b, err := h.Service.UpdateBusiness(uint(id), &input)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	json.NewEncoder(w).Encode(b)
}