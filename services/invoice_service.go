package services

import (
	"errors"
	"fmt"
	"invoiceSys/models"
	"invoiceSys/repository"
	"time"
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

	invoice.BusinessName = "Query Ninjas Furniture"
	invoice.InvoiceDate = time.Now()
	invoice.InvoiceNumber = fmt.Sprintf("INV-%d", time.Now() .Unix())

	invoice.Subtotal = subtotal
    invoice.VATAmount = subtotal * (invoice.VATRate / 100)
    invoice.Total = invoice.Subtotal + invoice.VATAmount

	return s.Repo.CreateInvoice(invoice)
}

	func (s *InvoiceService) UpdateInvoice(id uint, invoice *models.Invoice) error {
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

	invoice.BusinessName = "Query Ninjas Furniture"
	invoice.InvoiceDate = time.Now()
	invoice.InvoiceNumber = fmt.Sprintf("INV-%d", time.Now() .Unix())

	invoice.Subtotal = subtotal
    invoice.VATAmount = subtotal * (invoice.VATRate / 100)
    invoice.Total = invoice.Subtotal + invoice.VATAmount

	return s.Repo.UpdateInvoice(id, invoice)
}

func (s *InvoiceService) SearchByClient(customerName string) ([]models.Invoice, error) {
	return s.Repo.SearchByClient(customerName)
}

func (s *InvoiceService) SearchByPaymentStatus(status string) ([]models.Invoice, error) {
	return s.Repo.SearchByPaymentStatus(status)
}

func (s *InvoiceService) MarkInvoicePaid(id uint, paymentDate time.Time) (*models.Invoice, error) {
	return s.Repo.MarkInvoicePaid(id, paymentDate)
}
