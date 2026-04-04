package middleware

import (
	"context"
	"net/http"
)

type ctxKey struct{ name string }

var (
	ctxUserIDKey     = &ctxKey{"userID"}
	ctxBusinessIDKey = &ctxKey{"businessID"}
)

// ContextWithUser returns a copy of parent with the authenticated user id.
func ContextWithUser(parent context.Context, userID uint) context.Context {
	return context.WithValue(parent, ctxUserIDKey, userID)
}

// ContextWithBusiness returns a copy of parent with the tenant business id (0 if none).
func ContextWithBusiness(parent context.Context, businessID uint) context.Context {
	return context.WithValue(parent, ctxBusinessIDKey, businessID)
}

// UserIDFromContext returns 0 if unset.
func UserIDFromContext(ctx context.Context) uint {
	v := ctx.Value(ctxUserIDKey)
	if v == nil {
		return 0
	}
	id, _ := v.(uint)
	return id
}

// BusinessIDFromContext returns 0 if unset.
func BusinessIDFromContext(ctx context.Context) uint {
	v := ctx.Value(ctxBusinessIDKey)
	if v == nil {
		return 0
	}
	id, _ := v.(uint)
	return id
}

// UserIDFromRequest reads the user id set by AuthMiddleware.
func UserIDFromRequest(r *http.Request) uint {
	return UserIDFromContext(r.Context())
}

// BusinessIDFromRequest reads the business id set by AuthMiddleware.
func BusinessIDFromRequest(r *http.Request) uint {
	return BusinessIDFromContext(r.Context())
}
