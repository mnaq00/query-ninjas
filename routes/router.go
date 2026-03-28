package routes

import (
	"invoiceSys/handlers"
	"invoiceSys/middleware"

	"github.com/gorilla/mux"
)

func SetupRouter(
	userHandler *handlers.UserHandler,
	businessHandler *handlers.BusinessHandler,
	invoiceHandler *handlers.InvoiceHandler,
	clientHandler *handlers.ClientHandler,
	productHandler *handlers.ProductHandler,
) *mux.Router {
	r := mux.NewRouter()

	//public routes
	r.HandleFunc("/login", userHandler.Login).Methods("POST")
	r.HandleFunc("/register", userHandler.RegisterUser).Methods("POST")

	// sub router for protected routes
	protected := r.PathPrefix("/").Subrouter()
	protected.Use(middleware.AuthMiddleware)

	// authenticated routes
	protected.HandleFunc("/clients", clientHandler.AddClient).Methods("POST")
	protected.HandleFunc("/clients", clientHandler.UpdateClient).Methods("PUT")
	protected.HandleFunc("/business-profile", businessHandler.CreateBusinessProfile).Methods("POST")
	protected.HandleFunc("/business-profile", businessHandler.GetBusinessProfile).Methods("GET")
	protected.HandleFunc("/business-profile", businessHandler.UpdateBusinessProfile).Methods("PUT")
	protected.HandleFunc("/invoices/searchbyclient", invoiceHandler.SearchByClient).Methods("GET")
	protected.HandleFunc("/invoices", invoiceHandler.CreateInvoice).Methods("POST")
	protected.HandleFunc("/invoices/ViewInvoiceStatus", invoiceHandler.ViewInvoiceStatus).Methods("GET")
	protected.HandleFunc("/invoices/{id}/paid", invoiceHandler.MarkInvoicePaid).Methods("PUT")
	protected.HandleFunc("/invoices/{id}/pdf", invoiceHandler.GetInvoicePDF).Methods("GET")
	protected.HandleFunc("/invoices/{id}", invoiceHandler.UpdateInvoice).Methods("PUT")
	protected.HandleFunc("/products/{id}", productHandler.UpdateProduct).Methods("PUT")
	protected.HandleFunc("/products", productHandler.CreateProduct).Methods("POST")
	protected.HandleFunc("/products/{id}", productHandler.GetProduct).Methods("GET")
	protected.HandleFunc("/invoices/{id}/send", invoiceHandler.SendInvoice).Methods("POST")

	return r
}