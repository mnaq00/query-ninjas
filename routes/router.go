package routes

import (
	"invoiceSys/handlers"
	"invoiceSys/middleware"

	"github.com/gorilla/mux"
)

func SetupRouter(userHandler *handlers.UserHandler, clientHandler *handlers.ClientHandler, businessHandler *handlers.BusinessHandler) *mux.Router {
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

	return r
}
