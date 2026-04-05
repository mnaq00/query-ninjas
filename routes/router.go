package routes

import (
	"net/http"

	"invoiceSys/handlers"
	"invoiceSys/middleware"
	"invoiceSys/repository"

	"github.com/gorilla/mux"
)

func SetupRouter(
	userHandler *handlers.UserHandler,
	businessHandler *handlers.BusinessHandler,
	invoiceHandler *handlers.InvoiceHandler,
	clientHandler *handlers.ClientHandler,
	productHandler *handlers.ProductHandler,
	userBizRepo *repository.UserBusinessRepo,
) *mux.Router {
	r := mux.NewRouter()

	r.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}).Methods("GET")

	// Browsers open the service URL as GET /; JSON endpoints live under other paths.
	r.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Query Ninjas API</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5"><h1>Query Ninjas API</h1><p>This host serves a JSON API for the app. There is no web UI here.</p><p><a href="/health">GET /health</a> — status check (JSON).</p></body></html>`))
	}).Methods("GET")

	r.HandleFunc("/login", userHandler.Login).Methods("POST")
	r.HandleFunc("/register", userHandler.RegisterUser).Methods("POST")

	// Authenticated, but no tenant required yet (e.g. first-time business creation).
	authRoutes := r.PathPrefix("/").Subrouter()
	authRoutes.Use(middleware.AuthMiddleware)
	authRoutes.HandleFunc("/business-profile", businessHandler.CreateBusinessProfile).Methods("POST")

	// All other protected routes require JWT business_id > 0.
	tenant := r.PathPrefix("/").Subrouter()
	tenant.Use(middleware.AuthMiddleware)
	tenant.Use(middleware.TenantMiddleware(userBizRepo))

	tenant.HandleFunc("/clients", clientHandler.ListClients).Methods("GET")
	tenant.HandleFunc("/clients", clientHandler.AddClient).Methods("POST")
	tenant.HandleFunc("/clients", clientHandler.UpdateClient).Methods("PUT")
	tenant.HandleFunc("/clients/{id}", clientHandler.GetClient).Methods("GET")
	tenant.HandleFunc("/clients/{id}", clientHandler.ArchiveClient).Methods("DELETE")
	tenant.HandleFunc("/business-profile", businessHandler.GetBusinessProfile).Methods("GET")
	tenant.HandleFunc("/business-profile", businessHandler.UpdateBusinessProfile).Methods("PUT")
	tenant.HandleFunc("/invoices/searchbyclient", invoiceHandler.SearchByClient).Methods("GET")
	tenant.HandleFunc("/invoices", invoiceHandler.CreateInvoice).Methods("POST")
	tenant.HandleFunc("/invoices/ViewInvoiceStatus", invoiceHandler.ViewInvoiceStatus).Methods("GET")
	tenant.HandleFunc("/invoices/{id}/paid", invoiceHandler.MarkInvoicePaid).Methods("PUT")
	tenant.HandleFunc("/invoices/{id}/pdf", invoiceHandler.GetInvoicePDF).Methods("GET")
	tenant.HandleFunc("/invoices/{id}", invoiceHandler.UpdateInvoice).Methods("PUT")
	tenant.HandleFunc("/invoices/{id}", invoiceHandler.ArchiveInvoice).Methods("DELETE")
	tenant.HandleFunc("/products/{id}", productHandler.UpdateProduct).Methods("PUT")
	tenant.HandleFunc("/products", productHandler.ListProducts).Methods("GET")
	tenant.HandleFunc("/products", productHandler.CreateProduct).Methods("POST")
	tenant.HandleFunc("/products/{id}", productHandler.GetProduct).Methods("GET")
	tenant.HandleFunc("/products/{id}", productHandler.ArchiveProduct).Methods("DELETE")
	tenant.HandleFunc("/invoices/{id}/send", invoiceHandler.SendInvoice).Methods("POST")

	return r
}
