package main

import (
	"fmt"
	"invoiceSys/db"
	"invoiceSys/handlers"
	"invoiceSys/repository"
	"invoiceSys/routes"
	"invoiceSys/services"
	"log"
	"net/http"
)

func main() {
	db.InitDb()

	// initialize repositories
	userRepo := &repository.UserRepo{}
	clientRepo := &repository.ClientRepo{}
	businessRepo := &repository.BusinessRepo{}

	// initialize service
	userService := &services.UserService{Repo: userRepo}
	clientService := &services.ClientService{Repo: clientRepo}
	businessService := &services.BusinessService{Repo: businessRepo}

	// initialize handlers
	userHandler := &handlers.UserHandler{Service: userService}
	clientHandler := &handlers.ClientHandler{ClientService: clientService}
	businessHandler := &handlers.BusinessHandler{Service: businessService}

	//routes
	r := routes.SetupRouter(userHandler, clientHandler, businessHandler)

	//start server
	err := http.ListenAndServe(":8080", r)
	if err != nil {
		log.Fatal("failed to start server", err)
	}
	fmt.Println("server started on :8080")
}
