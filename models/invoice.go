package models

import (
	"strings"
	"time"

	"gorm.io/gorm"
)

// Invoice lifecycle (document / delivery), separate from payment.
const (
	InvoiceStatusDraft           = "draft"
	InvoiceStatusReadyToSend     = "ready_to_send"
	InvoiceStatusSentDownloaded  = "sent/downloaded"
)

// Customer (payment) status — money only.
const (
	PaymentStatusUnpaid  = "unpaid"
	PaymentStatusPaid    = "paid"
	PaymentStatusOverdue = "overdue"
)

// NormalizeInvoiceStatus maps JSON-friendly input (e.g. "ready to send", "sent_downloaded") to stored values.
func NormalizeInvoiceStatus(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "_")
	if s == "sent_downloaded" {
		return InvoiceStatusSentDownloaded
	}
	return s
}

// NormalizePaymentStatus returns unpaid | paid | overdue, or empty if unknown.
func NormalizePaymentStatus(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case PaymentStatusPaid, PaymentStatusOverdue, PaymentStatusUnpaid:
		return s
	case "draft", "sent/downloaded", "sent_downloaded":
		return PaymentStatusUnpaid
	default:
		return ""
	}
}

type Invoice struct {
	gorm.Model
	CustomerName            string        `json:"customer_name"`
	Subtotal                float64       `json:"subtotal"`
	TaxRate                 float64       `json:"tax_rate"`
	TaxAmount               float64       `json:"tax_amount"`
	Total                   float64       `json:"total"`
	InvoiceNumber           string        `json:"invoice_number" gorm:"unique"`
	BusinessID              uint          `json:"business_id" gorm:"index"`
	ClientID                uint          `json:"client_id"`
	// BillingEmail and BillingAddress are frozen at invoice create (or when client_id changes on update)
	// so PDF/email stay correct if the client record is edited later.
	BillingEmail            string        `json:"billing_email" gorm:"type:varchar(255)"`
	BillingAddress          string        `json:"billing_address" gorm:"type:text"`
	Items                   []InvoiceItem `json:"items"`
	InvoiceDate             time.Time     `json:"invoice_date"`
	PaymentDueDate          time.Time     `json:"payment_due_date"`
	InvoiceStatus           string        `json:"invoice_status" gorm:"type:varchar(32);default:'draft';not null"`
	Customer_payment_status string        `json:"customer_payment_status" gorm:"type:varchar(20);default:'unpaid';not null"`
	PaymentDate             time.Time     `json:"payment_date"`
}

func (i *Invoice) BeforeCreate(tx *gorm.DB) (err error) {
	if i.InvoiceDate.IsZero() {
		i.InvoiceDate = time.Now()
	}
	return nil
}

type InvoiceItem struct {
	gorm.Model
	InvoiceID   uint    `json:"invoice_id" gorm:"index"`
	ProductID   uint    `json:"product_id"`
	ProductName string  `json:"product_name"`
	Description string  `json:"description" gorm:"type:text"`
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
	ProductID uint    `json:"product_id"`
	Price     float64 `json:"price"`
	Quantity  int     `json:"quantity"`
}