package routes

import (
	"invoiceSys/handlers"
	"invoiceSys/middleware"

	"github.com/gorilla/mux"
)

func SetupRouter(
	userHandler *handlers.UserHandler, businessHandler *handlers.BusinessHandler,
	invoiceHandler *handlers.InvoiceHandler,
 clientHandler *handlers.ClientHandler) *mux.Router {
	r := mux.NewRouter()

	//public routes
	r.HandleFunc("/login", userHandler.Login).Methods("POST")
	r.HandleFunc("/register", userHandler.RegisterUser).Methods("POST")
	r.HandleFunc("/invoices", invoiceHandler.CreateInvoice).Methods("POST")

	// //sub router for protected routes
	protected := r.PathPrefix("/").Subrouter()
	protected.Use(middleware.AuthMiddleware)
	protected.HandleFunc("/business/{id}", businessHandler.UpdateBusiness).Methods("PUT")

	// //authenticated routes
	protected.HandleFunc("/business-profile", businessHandler.CreateBusinessProfile).Methods("POST")
	protected.HandleFunc("/business-profile", businessHandler.GetBusinessProfile).Methods("GET")
	protected.HandleFunc("/business-profile", businessHandler.UpdateBusinessProfile).Methods("PUT")
	r.HandleFunc("/clients", clientHandler.AddClient).Methods("POST")


	return r
}
