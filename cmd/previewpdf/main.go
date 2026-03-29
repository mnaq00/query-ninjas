package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"invoiceSys/models"
	"invoiceSys/services"
)

func main() {
	logoPath := "assets/QNF.jpg"
	biz := &models.Business{
		BusinessName: "Query Ninja Furniture Limited",
		Address:      "123 High Street, London",
		Phone:        "01234 567890",
		Email:        "accounts@queryninja.example",
		VATID:        "GB123456789",
		LogoURL:      &logoPath,
	}

	client := &models.Client{
		Name:           "Acme Ltd",
		Email:          "billing@acme.example",
		BillingAddress: "1 Client Road\nLondon\nAB1 2CD",
	}

	inv := &models.Invoice{
		InvoiceNumber: "INV-1700000000000",
		InvoiceDate:   time.Now(),
		TaxRate:       20,
		Subtotal:      250,
		TaxAmount:     50,
		Total:         300,
		Items: []models.InvoiceItem{
			{ProductName: "Strawberry Cake", Description: "Made of strawberries — hand finished.", Quantity: 1, Price: 45, LineTotal: 45},
			{ProductName: "Rattan Chair", Quantity: 2, Price: 75, LineTotal: 150},
			{ProductName: "Side Table", Description: "Compact oak.", Quantity: 1, Price: 100, LineTotal: 100},
		},
	}

	path, err := services.GenerateInvoicePDF(inv, biz, client)
	if err != nil {
		log.Fatal(err)
	}
	dest := filepath.Join("cmd", "previewpdf", "preview_invoice_layout.pdf")
	if err := os.Rename(path, dest); err != nil {
		log.Fatal(err)
	}
	fmt.Println(dest)
}

