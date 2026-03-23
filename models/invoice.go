package models

import (
"time"
"gorm.io/gorm"
)

type Invoice struct {
	gorm.Model

    BusinessName string `json:"business_name"`
	InvoiceNumber string `json:"invoice_number"`
	InvoiceDate time.Time `json:"invoice_date"`

	ClientID uint `json:"client_id"`
	VATRate      float64 `json:"vat_rate"`
	Subtotal     float64 `json:"subtotal"`
	VATAmount    float64 `json:"vat_amount"`
	Total        float64 `json:"total"`

	Items        []InvoiceItem `json:"items" gorm:"foreignKey:InvoiceID"`
}
