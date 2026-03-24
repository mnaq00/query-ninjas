package models

import (
	"time"

	"gorm.io/gorm"
)

type Invoice struct {
	gorm.Model
	ID                       uint      `gorm:"primaryKey"`
	CustomerName             string    `json:"customer_name"`
	Customer_email           string    `json:"customer_email"`
	Customer_billing_address string    `json:"customer_billing_address"`
	Subtotal                 float64   `json:"subtotal"`
	VATID                    string    `json:"vat_id"`
	TaxRate                  float64   `json:"tax_rate"`
	TaxAmount                float64   `json:"tax_amount"`
	Total                    float64   `json:"total"`
	Customer_payment_status  string    `json:"customer_payment_status"`
	PaymentDate              time.Time `json:"payment_date"`
}
