package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

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
	businessRepo := &repository.BusinessRepo{}
	invoiceRepo := &repository.InvoiceRepo{}
	clientRepo := &repository.ClientRepo{}
	productRepo := &repository.ProductRepo{}

	// initialize service
	userService := &services.UserService{Repo: userRepo}
	businessService := &services.BusinessService{Repo: businessRepo}

	invoiceService := &services.InvoiceService{
		Repo:            invoiceRepo,
		ClientRepo:      clientRepo,
		ProductRepo:     productRepo,
		BusinessService: businessService,
	}
	clientService := &services.ClientService{Repo: clientRepo}
	productService := &services.ProductService{Repo: productRepo}

	// initialize handlers
	userHandler := &handlers.UserHandler{Service: userService}
	businessHandler := &handlers.BusinessHandler{Service: businessService}

	invoiceHandler := &handlers.InvoiceHandler{Service: *invoiceService}
	clientHandler := &handlers.ClientHandler{ClientService: clientService}
	productHandler := &handlers.ProductHandler{ProductService: productService}

	//routes
	r := routes.SetupRouter(userHandler, businessHandler, invoiceHandler, clientHandler, productHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port
	fmt.Println("server listening on", addr)
	err := http.ListenAndServe(addr, r)
	if err != nil {
		log.Fatal("failed to start server", err)
	}

}
