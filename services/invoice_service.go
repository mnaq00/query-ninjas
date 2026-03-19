package services

import (
	"errors"
	"invoiceSys/models"
	"invoiceSys/repository"
)

type InvoiceService struct {
	Repo *repository.InvoiceRepo
}

func (s *InvoiceService) CreateInvoice(invoice *models.Invoice) error {
	if invoice.ClientID == 0 {
		return errors.New("client id is required")
	}

	if len(invoice.Items) == 0 {
		return errors.New("at least one invoice item is required")
	}

	if invoice.VATRate < 0 {
		return errors.New("vat rate cannot be negative")
	}
	var subtotal float64

	for i := range invoice.Items {
		item := &invoice.Items[i]

		if item.Quantity <= 0 {
			return errors.New("quantity must be greater than zero")
		}

		item.LineTotal = item.UnitPrice * float64(item.Quantity)
        subtotal += item.LineTotal
	}

	invoice.Subtotal = subtotal
    invoice.VATAmount = subtotal * (invoice.VATRate / 100)
    invoice.Total = invoice.Subtotal + invoice.VATAmount

	return s.Repo.CreateInvoice(invoice)
}
