package repository

import (
	"errors"
	"strings"
	"time"

	"invoiceSys/db"
	"invoiceSys/models"

	"gorm.io/gorm"
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
	SyncInvoiceCustomerSnapshot(id uint, customerName string) error
}

type InvoiceRepo struct{}

// Create invoice with items using transaction
func (r *InvoiceRepo) CreateInvoice(invoice *models.Invoice) error {
	return db.DB.Transaction(func(tx *gorm.DB) error {
		items := invoice.Items
		invoice.Items = nil

		if err := tx.Create(invoice).Error; err != nil {
			return err
		}

		for i := range items {
			items[i].Model = gorm.Model{}
			items[i].InvoiceID = invoice.ID
			if err := tx.Create(&items[i]).Error; err != nil {
				return err
			}
		}

		invoice.Items = items
		return nil
	})
}

// Search by customer name (case-insensitive)
func (r *InvoiceRepo) SearchByClient(customerName string) ([]models.Invoice, error) {
	var matches []models.Invoice
	err := db.DB.
		Where("LOWER(customer_name) = ?", strings.ToLower(customerName)).
		Find(&matches).Error
	return matches, err
}

// Search by payment status (case-insensitive)
func (r *InvoiceRepo) SearchByPaymentStatus(status string) ([]models.Invoice, error) {
	var matches []models.Invoice
	err := db.DB.
		Where("LOWER(customer_payment_status) = ?", strings.ToLower(status)).
		Find(&matches).Error
	return matches, err
}

// Mark invoice as paid
func (r *InvoiceRepo) MarkInvoicePaid(id uint, paymentDate time.Time) (*models.Invoice, error) {
	var invoice models.Invoice

	if err := db.DB.First(&invoice, id).Error; err != nil {
		return nil, errors.New("invoice not found")
	}

	if strings.ToLower(invoice.Customer_payment_status) == "paid" {
		return nil, errors.New("invoice already paid on " + invoice.PaymentDate.Format("2006-01-02 15:04"))
	}

	if err := db.DB.Model(&invoice).Updates(map[string]interface{}{
		"customer_payment_status": "paid",
		"payment_date":            paymentDate,
	}).Error; err != nil {
		return nil, err
	}

	return &invoice, nil
}

// Set invoice to draft
func (r *InvoiceRepo) SetInvoiceDraft(id uint) (*models.Invoice, error) {
	var invoice models.Invoice

	if err := db.DB.First(&invoice, id).Error; err != nil {
		return nil, errors.New("invoice not found")
	}

	invoice.Customer_payment_status = "draft"
	invoice.PaymentDate = time.Time{}

	if err := db.DB.Save(&invoice).Error; err != nil {
		return nil, err
	}

	return &invoice, nil
}

// Set invoice as sent
func (r *InvoiceRepo) SetInvoiceSent(id uint, paymentStatus string) (*models.Invoice, error) {
	var invoice models.Invoice

	if err := db.DB.First(&invoice, id).Error; err != nil {
		return nil, errors.New("invoice not found")
	}

	invoice.Customer_payment_status = strings.ToLower(paymentStatus)

	if err := db.DB.Save(&invoice).Error; err != nil {
		return nil, err
	}

	return &invoice, nil
}

// Update invoice and replace items
func (r *InvoiceRepo) UpdateInvoice(id uint, invoice *models.Invoice) error {
	return db.DB.Transaction(func(tx *gorm.DB) error {
		invoice.ID = id

		if err := tx.Save(invoice).Error; err != nil {
			return err
		}

		if err := tx.Where("invoice_id = ?", id).
			Delete(&models.InvoiceItem{}).Error; err != nil {
			return err
		}

		for _, item := range invoice.Items {
			item.InvoiceID = invoice.ID
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

// Get invoice by ID with items
func (r *InvoiceRepo) GetInvoiceByID(id uint) (*models.Invoice, error) {
	var invoice models.Invoice

	if err := db.DB.
		Preload("Items").
		First(&invoice, id).Error; err != nil {
		return nil, err
	}

	return &invoice, nil
}

// Sync customer name snapshot
func (r *InvoiceRepo) SyncInvoiceCustomerSnapshot(id uint, customerName string) error {
	return db.DB.Model(&models.Invoice{}).
		Where("id = ?", id).
		Update("customer_name", customerName).Error
}
