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
	SetInvoiceDraft(id uint) (*models.Invoice, error)
	SetInvoiceSent(id uint, paymentStatus string) (*models.Invoice, error)
	UpdateInvoice(id uint, invoice *models.Invoice) error
	GetInvoiceByID(id uint) (*models.Invoice, error)
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

func (r *InvoiceRepo) SetInvoiceDraft(id uint) (*models.Invoice, error) {
	var invoice models.Invoice
	if err := db.DB.First(&invoice, id).Error; err != nil {
		return nil, errors.New("Invoice not found")
	}

	invoice.Customer_payment_status = "draft"
	// Clear payment date when moving back to draft.
	invoice.PaymentDate = time.Time{}

	if err := db.DB.Save(&invoice).Error; err != nil {
		return nil, err
	}
	return &invoice, nil
}

func (r *InvoiceRepo) SetInvoiceSent(id uint, paymentStatus string) (*models.Invoice, error) {
	var invoice models.Invoice
	if err := db.DB.First(&invoice, id).Error; err != nil {
		return nil, errors.New("Invoice not found")
	}

	invoice.Customer_payment_status = paymentStatus

	// Sending isn't the same as payment; do not modify payment_date here.
	if err := db.DB.Save(&invoice).Error; err != nil {
		return nil, err
	}
	return &invoice, nil
}

func (r *InvoiceRepo) UpdateInvoice(id uint, invoice *models.Invoice) error {
	invoice.ID = id

	if err := db.DB.Save(invoice).Error; err != nil {
		return err
	}

	if err := db.DB.Where("invoice_id = ?", id).Delete(&models.InvoiceItem{}).Error; err != nil {
		return err
	}

	for _, item := range invoice.Items {
		item.InvoiceID = invoice.ID
		if err := db.DB.Create(&item).Error; err != nil {
			return err
		}
	}

	return nil
}

// Robel
func (r *InvoiceRepo) GetInvoiceByID(id uint) (*models.Invoice, error) {
	var invoice models.Invoice

	err := db.DB.Preload("Items").First(&invoice, id).Error
	if err != nil {
		return nil, err
	}
	return &invoice, nil

}