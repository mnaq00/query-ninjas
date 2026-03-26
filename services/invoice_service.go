package services

import (
	"errors"
	"fmt"
	"invoiceSys/models"
	"invoiceSys/repository"
	"time"

	"github.com/jung-kurt/gofpdf"
)

type InvoiceService struct {
	Repo            repository.InvoiceRepository
	ClientRepo      repository.ClientRepo
	BusinessService *BusinessService
}

// Musa
func (s *InvoiceService) CreateInvoice(req *models.Invoice) error {

	if req.ClientID == 0 {
		return errors.New("client id is required")
	}

	if len(req.Items) == 0 {
		return errors.New("at least one invoice item is required")
	}

	var subtotal float64

	for _, item := range req.Items {
		if item.Price <= 0 { // Now matches
			return errors.New("item price must be greater than 0")
		}
		if item.Quantity <= 0 {
			return errors.New("item quantity must be greater than 0")
		}
		subtotal += item.Price * float64(item.Quantity)
	}

	req.Subtotal = subtotal

	if req.TaxRate < 0 {
		return errors.New("tax rate cannot be negative")
	}
	// this is saving cust name from selected client
	client, err := s.ClientRepo.GetClientByID(req.ClientID)
	if err != nil {
		return errors.New("client not found")
	}

	req.Subtotal = subtotal
	req.CustomerName = client.Name
	req.TaxAmount = req.Subtotal * (req.TaxRate / 100.0)
	req.Total = req.Subtotal + req.TaxAmount

	req.InvoiceNumber = fmt.Sprintf("INV-%d", time.Now().UnixNano())

	return s.Repo.CreateInvoice(req)
}

func (s *InvoiceService) UpdateInvoice(id uint, invoice *models.Invoice) error {
	if invoice.ClientID == 0 {
		return errors.New("client id is required")
	}

	if len(invoice.Items) == 0 {
		return errors.New("at least one invoice item is required")
	}

	if invoice.TaxRate < 0 {
		return errors.New("vat rate cannot be negative")
	}
	var subtotal float64

	for i := range invoice.Items {
		item := &invoice.Items[i]

		if item.Quantity <= 0 {
			return errors.New("quantity must be greater than zero")
		}

		item.LineTotal = item.Price * float64(item.Quantity)
		subtotal += item.LineTotal
	}

	invoice.CustomerName = "Query Ninjas Furniture"
	invoice.InvoiceDate = time.Now()
	invoice.InvoiceNumber = fmt.Sprintf("INV-%d", time.Now().Unix())

	invoice.Subtotal = subtotal
	invoice.TaxAmount = subtotal * (invoice.TaxRate / 100)
	invoice.Total = invoice.Subtotal + invoice.TaxAmount

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

// Robel
func (s *InvoiceService) SendInvoiceEmail(id uint) error {
	invoice, err := s.Repo.GetInvoiceByID(id)
	if err != nil {
		return err
	}

	pdfPath, err := GenerateInvoicePDF(invoice, &models.Business{})
	if err != nil {
		return err
	}

	fmt.Println("PDF Generated at: ", pdfPath)

	return nil
}

// func GenerateInvoicePDF(invoice *models.Invoice) (string, error) {

// 	pdf := gofpdf.New("P", "mm", "A4", "")
// 	pdf.AddPage()
// 	pdf.SetFont("Arial", "B", 16)

// 	pdf.Cell(40, 10, "Invoice")
// 	pdf.Ln(12)

// 	pdf.SetFont("Arial", "", 12)
// 	pdf.Cell(40, 10, "Customer Name: "+invoice.CustomerName)
// 	pdf.Ln(10)
// 	pdf.Cell(40, 10, fmt.Sprintf("Subtotal: %.2f", invoice.Subtotal))
// 	pdf.Ln(10)
// 	pdf.Cell(40, 10, fmt.Sprintf("Tax Rate: %.2f", invoice.TaxRate))
// 	pdf.Ln(10)
// 	pdf.Cell(40, 10, fmt.Sprintf("Tax Amount: %.2f", invoice.TaxAmount))
// 	pdf.Ln(10)
// 	pdf.Cell(40, 10, fmt.Sprintf("Total: %.2f", invoice.Total))

// 	filePath := fmt.Sprintf("invoice_%d.pdf", invoice.ID)
// 	err := pdf.OutputFileAndClose(filePath)
// 	if err != nil {
// 		return "", err
// 	}

// 	return filePath, nil

// }

// Business details (top-right)
func GenerateInvoicePDF(invoice *models.Invoice, biz *models.Business) (string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.AddPage()

	// Set margins
	pdf.SetMargins(15, 20, 15)

	// Business details (top-right, dynamic below logo)
	yPos := 10.0
	if biz.LogoURL != "" {
		yPos = 45.0
	}
	pdf.SetXY(110, yPos)
	pdf.SetFont("Arial", "B", 12)
	pdf.Cell(90, 6, biz.BusinessName) // Fixed: w=90 (right width), h=6, txt only

	pdf.SetFont("Arial", "", 11)
	pdf.SetXY(110, pdf.GetY())
	pdf.MultiCell(90, 5, biz.Address, "", "", false) // w=90 for consistency

	pdf.SetXY(110, pdf.GetY())
	pdf.Cell(90, 5, fmt.Sprintf("Phone: %s", biz.Phone)) // Fixed: 3 args only
	pdf.Ln(4)
	pdf.Cell(90, 5, fmt.Sprintf("Email: %s", biz.Email)) // Fixed: 3 args only
	if biz.VATID != "" {
		pdf.Ln(4)
		pdf.Cell(90, 5, fmt.Sprintf("VAT ID: %s", biz.VATID)) // Fixed: 3 args only
	}

	pdf.SetFont("Arial", "B", 16)
	pdf.SetXY(0, 65)
	pdf.Cell(190, 10, "Invoice")
	pdf.Ln(12)

	pdf.SetFont("Arial", "", 12)
	pdf.Cell(40, 10, "Customer Name: "+invoice.CustomerName)
	pdf.Ln(10)
	pdf.Cell(40, 10, fmt.Sprintf("Subtotal: %.2f", invoice.Subtotal))
	pdf.Ln(10)
	pdf.Cell(40, 10, fmt.Sprintf("Tax Rate: %.2f", invoice.TaxRate))
	pdf.Ln(10)
	pdf.Cell(40, 10, fmt.Sprintf("Tax Amount: %.2f", invoice.TaxAmount))
	pdf.Ln(10)
	pdf.Cell(40, 10, fmt.Sprintf("Total: %.2f", invoice.Total))

	filePath := fmt.Sprintf("invoice_%d.pdf", invoice.ID)
	err := pdf.OutputFileAndClose(filePath)
	if err != nil {
		return "", err
	}

	return filePath, nil
}
