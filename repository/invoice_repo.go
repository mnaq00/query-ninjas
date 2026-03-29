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
	SetInvoiceLifecycleStatus(id uint, invoiceStatus string) error
	UpdateInvoice(id uint, invoice *models.Invoice) error
	GetInvoiceByID(id uint) (*models.Invoice, error)
	UpdateInvoicePaymentStatus(id uint, status string) error
	// SyncOverdueBatch: for issued invoices (invoice_status = sent/downloaded), unpaid → overdue when
	// past due date; overdue → unpaid when due date is today or in the future.
	SyncOverdueBatch(now time.Time) error
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

	return r.GetInvoiceByID(invoice.ID)
}

// Set invoice to draft
func (r *InvoiceRepo) SetInvoiceDraft(id uint) (*models.Invoice, error) {
	var invoice models.Invoice

	if err := db.DB.First(&invoice, id).Error; err != nil {
		return nil, errors.New("invoice not found")
	}

	invoice.InvoiceStatus = models.InvoiceStatusDraft
	invoice.Customer_payment_status = models.PaymentStatusUnpaid
	invoice.PaymentDate = time.Time{}

	if err := db.DB.Save(&invoice).Error; err != nil {
		return nil, err
	}

	return &invoice, nil
}

func (r *InvoiceRepo) SetInvoiceLifecycleStatus(id uint, invoiceStatus string) error {
	return db.DB.Model(&models.Invoice{}).
		Where("id = ?", id).
		Update("invoice_status", strings.TrimSpace(invoiceStatus)).Error
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

func (r *InvoiceRepo) UpdateInvoicePaymentStatus(id uint, status string) error {
	return db.DB.Model(&models.Invoice{}).
		Where("id = ?", id).
		Update("customer_payment_status", status).Error
}

func (r *InvoiceRepo) SyncOverdueBatch(now time.Time) error {
	y, m, d := now.UTC().Date()
	todayUTC := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	dayStr := todayUTC.Format("2006-01-02")

	if err := db.DB.Exec(`
		UPDATE invoices
		SET customer_payment_status = 'overdue'
		WHERE LOWER(TRIM(invoice_status)) = 'sent/downloaded'
		  AND LOWER(TRIM(customer_payment_status)) = 'unpaid'
		  AND payment_due_date IS NOT NULL
		  AND DATE(payment_due_date AT TIME ZONE 'UTC') < ?::date
	`, dayStr).Error; err != nil {
		return err
	}
	return db.DB.Exec(`
		UPDATE invoices
		SET customer_payment_status = 'unpaid'
		WHERE LOWER(TRIM(invoice_status)) = 'sent/downloaded'
		  AND LOWER(TRIM(customer_payment_status)) = 'overdue'
		  AND payment_due_date IS NOT NULL
		  AND DATE(payment_due_date AT TIME ZONE 'UTC') >= ?::date
	`, dayStr).Error
}
