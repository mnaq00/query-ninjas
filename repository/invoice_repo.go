package repository

import (
	"errors"
	"invoiceSys/db"
	"invoiceSys/models"
	"time"

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
	// SyncInvoiceCustomerSnapshot updates stored customer_name from the current client (e.g. when sending).
	SyncInvoiceCustomerSnapshot(id uint, customerName string) error
}

type InvoiceRepo struct{}

func (r *InvoiceRepo) CreateInvoice(invoice *models.Invoice) error {
	// Create parent first, then each line item explicitly so product_id, name, and
	// product_name are always persisted (nested Create can omit association fields).
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

	var inv models.Invoice
	db.DB.First(&inv, id)
	return &inv, nil
}

func (r *InvoiceRepo) SetInvoiceDraft(id uint) (*models.Invoice, error) {
	var invoice models.Invoice
	if err := db.DB.First(&invoice, id).Error; err != nil {
		return nil, errors.New("Invoice not found")
	}

	invoice.Customer_payment_status = "draft"
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

	for i := range invoice.Items {
		invoice.Items[i].Model = gorm.Model{}
		invoice.Items[i].InvoiceID = invoice.ID
		if err := db.DB.Create(&invoice.Items[i]).Error; err != nil {
			return err
		}
	}

	return nil
}

func (r *InvoiceRepo) GetInvoiceByID(id uint) (*models.Invoice, error) {
	var invoice models.Invoice

	err := db.DB.Preload("Items").First(&invoice, id).Error
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

func (r *InvoiceRepo) SyncInvoiceCustomerSnapshot(id uint, customerName string) error {
	return db.DB.Model(&models.Invoice{}).Where("id = ?", id).Update("customer_name", customerName).Error
}
