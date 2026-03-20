package repository

import (
	"invoiceSys/db"
	"invoiceSys/models"

)

type InvoiceRepository interface {
	CreateInvoice(invoice *models.Invoice) error
	UpdateInvoice(id uint, invoice *models.Invoice) error
}

type InvoiceRepo struct{}

func (r *InvoiceRepo) CreateInvoice(invoice *models.Invoice) error {
	return db.DB.Create(invoice).Error

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