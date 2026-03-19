package models

import "gorm.io/gorm"

type Invoice struct {
	gorm.Model
	ClientID uint `json:"client_id"`
	VATRate      float64 `json:"vat_rate"`
	Subtotal     float64 `json:"subtotal"`
	VATAmount    float64 `json:"vat_amount"`
	Total        float64 `json:"total"`
	Items        []InvoiceItem `json:"items" gorm:"foreignKey:InvoiceID"`
}
