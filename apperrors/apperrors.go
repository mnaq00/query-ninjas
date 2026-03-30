package apperrors

import "errors"

// ValidationError carries per-field messages for JSON responses: {"errors": {...}}.
type ValidationError struct {
	Fields map[string]string
}

func NewValidation(fields map[string]string) *ValidationError {
	if len(fields) == 0 {
		fields = map[string]string{"_": "validation failed"}
	}
	return &ValidationError{Fields: fields}
}

func (e *ValidationError) Error() string {
	return "validation failed"
}

var (
	ErrClientEmailTaken = errors.New("client with this email already exists")
	ErrClientNotFound   = errors.New("client not found")
	ErrBusinessExists   = errors.New("business already exists")
	ErrBusinessNotFound = errors.New("business profile not found")
)
