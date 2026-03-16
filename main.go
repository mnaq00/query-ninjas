package main

import (
	"fmt"
	"log"
	"net/http"

	"invoiceSys/db"
	"invoiceSys/handlers"
	"invoiceSys/repository"
	"invoiceSys/routes"
	"invoiceSys/services"
)

func main() {

	db.InitDb()

	// initialize repositories
	userRepo := &repository.UserRepo{}
	invoiceRepo := &repository.InvoiceRepo{}
clientRepo := &repository.ClientRepo{}

	// initialize service
	userService := &services.UserService{Repo: userRepo}
	invoiceService := &services.InvoiceService{Repo: invoiceRepo}
    clientService := &services.ClientService{Repo: clientRepo}
	
	// initialize handlers
	userHandler := &handlers.UserHandler{Service: userService}
	invoiceHandler := &handlers.InvoiceHandler{Service: *invoiceService}
    clientHandler := &handlers.ClientHandler{ClientService: clientService}
	
	//routes
	r := routes.SetupRouter(userHandler, invoiceHandler, clientHandler)

	//start server
	fmt.Println("server started on :8080")
	err := http.ListenAndServe(":8080", r)
	if err != nil {
		log.Fatal("failed to start server", err)
	}
	
}
