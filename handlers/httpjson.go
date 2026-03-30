package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"invoiceSys/apperrors"

	"gorm.io/gorm"
)

const maxJSONBodyBytes = 1 << 20 // 1 MiB

// decodeJSON caps body size and decodes into dst.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst interface{}) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	dec := json.NewDecoder(r.Body)
	return dec.Decode(dst)
}

func jsonDecodeErrorStatus(err error) (int, string) {
	var maxErr *http.MaxBytesError
	if errors.As(err, &maxErr) {
		return http.StatusRequestEntityTooLarge, "request body too large"
	}
	return http.StatusBadRequest, "invalid request body"
}

// writeJSONError maps service/repository errors to status and JSON body.
func writeJSONError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")

	var v *apperrors.ValidationError
	switch {
	case errors.As(err, &v):
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "validation failed",
			"errors": v.Fields,
		})
		return
	case errors.Is(err, apperrors.ErrClientEmailTaken):
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	case errors.Is(err, apperrors.ErrClientNotFound):
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	case errors.Is(err, apperrors.ErrBusinessExists):
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	case errors.Is(err, apperrors.ErrBusinessNotFound):
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	case errors.Is(err, gorm.ErrRecordNotFound):
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
		return
	case errors.Is(err, gorm.ErrDuplicatedKey):
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "record already exists"})
		return
	default:
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "an unexpected error occurred"})
	}
}
