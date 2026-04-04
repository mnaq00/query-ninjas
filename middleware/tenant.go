package middleware

import (
	"encoding/json"
	"net/http"

	"invoiceSys/repository"
)

// TenantMiddleware requires a non-zero business_id in the JWT and verifies the user is linked to that business.
func TenantMiddleware(userBiz *repository.UserBusinessRepo) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			bid := BusinessIDFromRequest(r)
			if bid == 0 {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "no business context: create a business profile (POST /business-profile) then sign in again to receive a token with business_id",
				})
				return
			}
			uid := UserIDFromRequest(r)
			if userBiz != nil && !userBiz.UserBelongsToBusiness(uid, bid) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "not a member of this business",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
