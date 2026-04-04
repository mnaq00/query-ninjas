package middleware

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// GenerateJWT issues a token with user_id and business_id (0 if the user has no business membership yet).
func GenerateJWT(userID, businessID uint) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "", errors.New("JWT secret not set")
	}

	claims := jwt.MapClaims{
		"user_id":     userID,
		"business_id": businessID,
		"exp":         time.Now().Add(24 * time.Hour).Unix(),
		"iat":         time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// Authenticates requests using JWT
func VerifyJWT(tokenString string) (*jwt.Token, error) {
	secret := os.Getenv("JWT_SECRET")
	t, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	return t, nil
}

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		tok, err := VerifyJWT(tokenString)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		claims, ok := tok.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "invalid token claims", http.StatusUnauthorized)
			return
		}

		userID := claimUint(claims, "user_id")
		if userID == 0 {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		businessID := claimUint(claims, "business_id")

		ctx := ContextWithUser(r.Context(), userID)
		ctx = ContextWithBusiness(ctx, businessID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func claimUint(m jwt.MapClaims, key string) uint {
	v, ok := m[key]
	if !ok || v == nil {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return uint(n)
	case int:
		return uint(n)
	case int64:
		return uint(n)
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			return 0
		}
		return uint(i)
	default:
		return 0
	}
}