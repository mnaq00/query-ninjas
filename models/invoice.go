package models

import (
	"time"

	"gorm.io/gorm"
)

func (i *Invoice) BeforeCreate(tx *gorm.DB) (err error) {
	if i.InvoiceDate.IsZero() {
		i.InvoiceDate = time.Now() // or time.Now().UTC()
	}
	return nil
}

type Invoice struct {
	gorm.Model
	CustomerName string  `json:"customer_name"`
	Subtotal     float64 `json:"subtotal"`
	TaxRate      float64 `json:"tax_rate"`
	TaxAmount    float64 `json:"tax_amount"`
	Total        float64 `json:"total"`

	InvoiceNumber           string        `json:"invoice_number" gorm:"unique"`
	ClientID                uint          `json:"client_id"`
	Items                   []InvoiceItem `json:"items"`
	InvoiceDate             time.Time     `json:"invoice_date"`
	Customer_payment_status string        `json:"customer_payment_status" gorm:"type:varchar(20);default:'draft';not null"`
	PaymentDate             time.Time     `json:"PaymentDate"`
}

type InvoiceItem struct {
	gorm.Model
	InvoiceID   uint    `json:"invoice_id" gorm:"index"`
	ProductID   uint    `json:"product_id"`
	Name        string  `json:"name"`
	ProductName string  `json:"product_name"`
	Price       float64 `json:"price"`
	LineTotal   float64 `json:"line_total"`
	Quantity    int     `json:"quantity"`
}

type CreateInvoiceRequests struct {
	ClientID uint                `json:"client_id"`
	TaxRate  float64             `json:"tax_rate"`
	Items    []CreateInvoiceItem `json:"items"`
}

type CreateInvoiceItem struct {
	Name     string  `json:"name"`
	Price    float64 `json:"price"`
	Quantity int     `json:"quantity"`
}
