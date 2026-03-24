package repository

import (
	"errors"
	"invoiceSys/db"
	"invoiceSys/models"
	"time"
)

type InvoiceRepository interface {
	CreateInvoice(invoice *models.Invoice) error
	SearchByClient(customerName string) ([]models.Invoice, error)
	SearchByPaymentStatus(status string) ([]models.Invoice, error)
	MarkInvoicePaid(id uint, paymentDate time.Time) (*models.Invoice, error)
}

type InvoiceRepo struct{}

func (r *InvoiceRepo) CreateInvoice(invoice *models.Invoice) error {
	return db.DB.Create(invoice).Error
}

func (r *InvoiceRepo) SearchByClient(customerName string) ([]models.Invoice, error) {
	var matches []models.Invoice
	err := db.DB.Where("LOWER(customer_name) = LOWER(?)", customerName).Find(&matches).Error
	return matches, err
}

func (r *InvoiceRepo) SearchByPaymentStatus(status string) ([]models.Invoice, error) {
	var matches []models.Invoice
	err := db.DB.Where("LOWER(customer_payment_status) = LOWER(?)", status).Find(&matches).Error
	return matches, err
}

func (r *InvoiceRepo) MarkInvoicePaid(id uint, paymentDate time.Time) (*models.Invoice, error) {
	// CHECKs if already paid FIRST
	var existing models.Invoice
	err := db.DB.First(&existing, id).Error
	if err != nil {
		return nil, errors.New("Invoice not found")
	}

	if existing.Customer_payment_status == "Paid" {
		return nil, errors.New("Invoice already paid on " + existing.PaymentDate.Format("2006-01-02 15:04"))
	}

	result := db.DB.Model(&models.Invoice{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"customer_payment_status": "Paid",
			"payment_date":            paymentDate,
		})

	if result.Error != nil {
		return nil, result.Error
	}

	var invoice models.Invoice
	db.DB.First(&invoice, id)
	return &invoice, nil
}
