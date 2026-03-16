package models

import "gorm.io/gorm"

type Invoice struct {
	gorm.Model
	CustomerName string `json:"customer_name"`
	Subtotal float64 `json:"subtotal"`
	VATID string `json:"vat_id"`
	TaxRate float64 `json:"tax_rate"`
	TaxAmount float64 `json:"tax_amount"`
	Total float64 `json:"total"`
}