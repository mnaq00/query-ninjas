package repository

import (
	"invoiceSys/db"
	"invoiceSys/models"
)

type InvoiceRepository interface {
	CreateInvoice(invoice *models.Invoice) error
}

type InvoiceRepo struct {}

func (r *InvoiceRepo) CreateInvoice(invoice *models.Invoice) error {
	return db.DB.Create(invoice).Error
}