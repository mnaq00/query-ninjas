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
	SearchByClientID(clientID, businessID uint) ([]models.Invoice, error)
	SearchByPaymentStatus(status string, businessID uint) ([]models.Invoice, error)
	MarkInvoicePaid(id, businessID uint, paymentDate time.Time) (*models.Invoice, error)
	SetInvoiceDraft(id, businessID uint) (*models.Invoice, error)
	SetInvoiceLifecycleStatus(id, businessID uint, invoiceStatus string) error
	UpdateInvoice(id uint, invoice *models.Invoice) error
	SetInvoiceIssuerSnapshot(id, businessID uint, invoice *models.Invoice) error
	SetInvoiceBillingSnapshot(id, businessID uint, invoice *models.Invoice) error
	GetInvoiceByIDForBusiness(id, businessID uint) (*models.Invoice, error)
	UpdateInvoicePaymentStatus(id, businessID uint, status string) error
	SyncOverdueBatch(now time.Time) error
	SoftDeleteInvoice(businessID, id uint) error
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

// SearchByClientID returns invoices for the client within one business.
func (r *InvoiceRepo) SearchByClientID(clientID, businessID uint) ([]models.Invoice, error) {
	var matches []models.Invoice
	err := db.DB.
		Preload("Items").
		Where("client_id = ? AND business_id = ?", clientID, businessID).
		Find(&matches).Error
	return matches, err
}

// Search by payment status (case-insensitive) within one business.
func (r *InvoiceRepo) SearchByPaymentStatus(status string, businessID uint) ([]models.Invoice, error) {
	var matches []models.Invoice
	err := db.DB.
		Where("business_id = ? AND LOWER(customer_payment_status) = ?", businessID, strings.ToLower(status)).
		Find(&matches).Error
	return matches, err
}

// Mark invoice as paid
func (r *InvoiceRepo) MarkInvoicePaid(id, businessID uint, paymentDate time.Time) (*models.Invoice, error) {
	var invoice models.Invoice

	if err := db.DB.Where("id = ? AND business_id = ?", id, businessID).First(&invoice).Error; err != nil {
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

	return r.GetInvoiceByIDForBusiness(invoice.ID, businessID)
}

// Set invoice to draft
func (r *InvoiceRepo) SetInvoiceDraft(id, businessID uint) (*models.Invoice, error) {
	var invoice models.Invoice

	if err := db.DB.Where("id = ? AND business_id = ?", id, businessID).First(&invoice).Error; err != nil {
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

func (r *InvoiceRepo) SetInvoiceLifecycleStatus(id, businessID uint, invoiceStatus string) error {
	res := db.DB.Model(&models.Invoice{}).
		Where("id = ? AND business_id = ?", id, businessID).
		Update("invoice_status", strings.TrimSpace(invoiceStatus))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// Update invoice and replace items
func (r *InvoiceRepo) UpdateInvoice(id uint, invoice *models.Invoice) error {
	items := invoice.Items
	invoice.Items = nil
	defer func() { invoice.Items = items }()

	return db.DB.Transaction(func(tx *gorm.DB) error {
		invoice.ID = id

		if err := tx.Save(invoice).Error; err != nil {
			return err
		}

		if err := tx.Unscoped().Where("invoice_id = ?", id).
			Delete(&models.InvoiceItem{}).Error; err != nil {
			return err
		}

		for i := range items {
			items[i].Model = gorm.Model{}
			items[i].InvoiceID = invoice.ID
			if err := tx.Create(&items[i]).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

// SetInvoiceIssuerSnapshot writes only issuer snapshot columns (legacy backfill / first PDF freeze).
func (r *InvoiceRepo) SetInvoiceIssuerSnapshot(id, businessID uint, invoice *models.Invoice) error {
	if invoice == nil {
		return errors.New("invoice required")
	}
	updates := map[string]interface{}{
		"issuer_business_name": invoice.IssuerBusinessName,
		"issuer_address":       invoice.IssuerAddress,
		"issuer_phone":         invoice.IssuerPhone,
		"issuer_email":         invoice.IssuerEmail,
		"issuer_vat_id":        invoice.IssuerVATID,
		"issuer_logo_url":      invoice.IssuerLogoURL,
	}
	res := db.DB.Model(&models.Invoice{}).
		Where("id = ? AND business_id = ?", id, businessID).
		Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// SetInvoiceBillingSnapshot writes bill-to snapshot columns (legacy backfill / first PDF freeze).
func (r *InvoiceRepo) SetInvoiceBillingSnapshot(id, businessID uint, invoice *models.Invoice) error {
	if invoice == nil {
		return errors.New("invoice required")
	}
	updates := map[string]interface{}{
		"customer_name":   invoice.CustomerName,
		"billing_email":   invoice.BillingEmail,
		"billing_address": invoice.BillingAddress,
	}
	res := db.DB.Model(&models.Invoice{}).
		Where("id = ? AND business_id = ?", id, businessID).
		Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// GetInvoiceByIDForBusiness loads an invoice and lines only if it belongs to the business.
func (r *InvoiceRepo) GetInvoiceByIDForBusiness(id, businessID uint) (*models.Invoice, error) {
	var invoice models.Invoice

	if err := db.DB.
		Preload("Items").
		Where("id = ? AND business_id = ?", id, businessID).
		First(&invoice).Error; err != nil {
		return nil, err
	}

	return &invoice, nil
}

func (r *InvoiceRepo) UpdateInvoicePaymentStatus(id, businessID uint, status string) error {
	res := db.DB.Model(&models.Invoice{}).
		Where("id = ? AND business_id = ?", id, businessID).
		Update("customer_payment_status", status)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// SoftDeleteInvoice soft-deletes the invoice and its line items for this business.
func (r *InvoiceRepo) SoftDeleteInvoice(businessID, id uint) error {
	return db.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Where("id = ? AND business_id = ?", id, businessID).Delete(&models.Invoice{})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return tx.Where("invoice_id = ?", id).Delete(&models.InvoiceItem{}).Error
	})
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
