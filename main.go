package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"invoiceSys/db"
	"invoiceSys/handlers"
	"invoiceSys/repository"
	"invoiceSys/routes"
	"invoiceSys/services"

	"github.com/rs/cors"
)

func main() {

	db.InitDb()

	if strings.TrimSpace(os.Getenv("JWT_SECRET")) == "" {
		log.Println("ERROR: JWT_SECRET is not set. Registration can succeed, but login will always fail until you set JWT_SECRET (e.g. on your Render Web Service).")
	}

	userRepo := &repository.UserRepo{}
	userBizRepo := &repository.UserBusinessRepo{}
	businessRepo := &repository.BusinessRepo{}
	invoiceRepo := &repository.InvoiceRepo{}
	clientRepo := &repository.ClientRepo{}
	productRepo := &repository.ProductRepo{}

	userService := &services.UserService{Repo: userRepo, UserBiz: userBizRepo}
	businessService := &services.BusinessService{Repo: businessRepo, UserBiz: userBizRepo}

	invoiceService := &services.InvoiceService{
		Repo:            invoiceRepo,
		ClientRepo:      clientRepo,
		ProductRepo:     productRepo,
		BusinessService: businessService,
	}
	clientService := &services.ClientService{Repo: clientRepo}
	productService := &services.ProductService{Repo: productRepo}

	userHandler := &handlers.UserHandler{Service: userService}
	businessHandler := &handlers.BusinessHandler{Service: businessService}

	invoiceHandler := &handlers.InvoiceHandler{Service: *invoiceService}
	clientHandler := &handlers.ClientHandler{ClientService: clientService}
	productHandler := &handlers.ProductHandler{ProductService: productService}

	r := routes.SetupRouter(userHandler, businessHandler, invoiceHandler, clientHandler, productHandler, userBizRepo)

	allowedList := corsAllowedOriginsList()
	if os.Getenv("RENDER") == "true" && !corsHasNonLocalhost(allowedList) {
		log.Println("NOTE: CORS allows localhost only. If the UI is on another Render origin, set CORS_ORIGINS or FRONTEND_ORIGIN on this Web Service.")
	}
	handler := cors.New(cors.Options{
		AllowedOrigins:   allowedList,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "Accept", "X-Requested-With"},
		AllowCredentials: false,
	}).Handler(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port
	fmt.Println("server listening on", addr)
	fmt.Println("CORS allowed origins:", allowedList)
	err := http.ListenAndServe(addr, handler)
	if err != nil {
		log.Fatal("failed to start server", err)
	}
}

func normalizeOrigin(s string) string {
	return strings.TrimSuffix(strings.TrimSpace(s), "/")
}

func corsAllowedOriginsList() []string {
	raw := strings.TrimSpace(os.Getenv("CORS_ORIGINS"))
	single := normalizeOrigin(os.Getenv("FRONTEND_ORIGIN"))
	defaults := []string{"http://localhost:3000", "http://127.0.0.1:3000"}
	out := make(map[string]bool)
	if raw != "" {
		for _, p := range strings.Split(raw, ",") {
			if o := normalizeOrigin(p); o != "" {
				out[o] = true
			}
		}
	}
	if single != "" {
		out[single] = true
	}
	if len(out) == 0 {
		for _, d := range defaults {
			out[d] = true
		}
	}
	list := make([]string, 0, len(out))
	for o := range out {
		list = append(list, o)
	}
	return list
}

func corsHasNonLocalhost(origins []string) bool {
	for _, o := range origins {
		if !strings.HasPrefix(o, "http://localhost") && !strings.HasPrefix(o, "http://127.0.0.1") {
			return true
		}
	}
	return false
}
