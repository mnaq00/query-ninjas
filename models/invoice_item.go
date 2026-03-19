package models

import "gorm.io/gorm"

type InvoiceItem struct {
	gorm.Model
	InvoiceID uint `json:"invoice_id"`
	ProductID uint `json:"product_id"`
	ProductName string `json:"product_name"`
	UnitPrice float64 `json:"unit_price"`
	Quantity int `json:"quantity"`
	LineTotal float64 `json:"line_total"`
}