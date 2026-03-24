package services

import (
	"errors"
	"invoiceSys/models"
	"invoiceSys/repository"
	"time"
)

type InvoiceService struct {
	Repo repository.InvoiceRepository
}

func (s *InvoiceService) CreateInvoice(req *models.Invoice) error {

	if req.VATID == "" {
		return errors.New("VAT ID is required")
	}

	if req.Subtotal <= 0 {
		return errors.New("subtotal must be greater than 0")
	}

	if req.TaxRate < 0 {
		return errors.New("tax rate cannot be negative")
	}

	req.TaxAmount = req.Subtotal * (req.TaxRate / 100.0)
	req.Total = req.Subtotal + req.TaxAmount

	return s.Repo.CreateInvoice(req)
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
