package services

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"invoiceSys/models"
	"invoiceSys/repository"
	"io"
	"mime/multipart"
	"net/http"
	"net/smtp"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jung-kurt/gofpdf"
)

type InvoiceService struct {
	Repo            repository.InvoiceRepository
	ClientRepo      *repository.ClientRepo
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
	if s.ClientRepo == nil {
		return errors.New("client repository not configured")
	}
	client, err := s.ClientRepo.GetClientByID(req.ClientID)
	if err != nil {
		return errors.New("client not found")
	}

	req.Subtotal = subtotal

	// If the client doesn't specify a status, treat the invoice as a draft.
	if strings.TrimSpace(req.Customer_payment_status) == "" {
		req.Customer_payment_status = "draft"
	}
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

	// Preserve invoice status when client omits it; otherwise it may get overwritten
	// with an empty string during JSON decode.
	if strings.TrimSpace(invoice.Customer_payment_status) == "" {
		existing, err := s.Repo.GetInvoiceByID(id)
		if err != nil {
			return err
		}
		invoice.Customer_payment_status = existing.Customer_payment_status
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

	// Keep CustomerName in sync with the selected client.
	// This is important because `SearchByClient` queries by `customer_name`.
	if s.ClientRepo == nil {
		return errors.New("client repository not configured")
	}
	client, err := s.ClientRepo.GetClientByID(invoice.ClientID)
	if err != nil {
		return errors.New("client not found")
	}
	invoice.CustomerName = client.Name
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

func (s *InvoiceService) SaveInvoiceDraft(id uint) (*models.Invoice, error) {
	return s.Repo.SetInvoiceDraft(id)
}

// Robel
func (s *InvoiceService) SendInvoiceEmail(id uint) error {
	invoice, err := s.Repo.GetInvoiceByID(id)
	if err != nil {
		return err
	}

	if strings.EqualFold(strings.TrimSpace(invoice.Customer_payment_status), "draft") {
		return errors.New("draft invoices cannot be sent")
	}

	if s.ClientRepo == nil {
		return errors.New("client repository not configured")
	}
	client, err := s.ClientRepo.GetClientByID(invoice.ClientID)
	if err != nil {
		return errors.New("client not found")
	}

	var biz models.Business
	if s.BusinessService != nil {
		// Assumption: a single business profile exists with ID=1.
		// If you support multiple businesses later, pass business_id on the invoice.
		profile, err := s.BusinessService.GetBusinessProfile(1)
		if err == nil && profile != nil {
			biz = *profile
		}
	}

	pdfPath, err := GenerateInvoicePDF(invoice, &biz, client)
	if err != nil {
		return err
	}

	defer os.Remove(pdfPath) // best-effort cleanup

	smtpHost := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	smtpPort := strings.TrimSpace(os.Getenv("SMTP_PORT"))
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASS")
	smtpFrom := strings.TrimSpace(os.Getenv("SMTP_FROM"))
	startTLS := strings.EqualFold(strings.TrimSpace(os.Getenv("SMTP_STARTTLS")), "true")
	skipVerify := strings.EqualFold(strings.TrimSpace(os.Getenv("SMTP_SKIP_VERIFY")), "true")

	if smtpHost == "" || smtpPort == "" {
		return errors.New("SMTP not configured (SMTP_HOST and SMTP_PORT are required)")
	}
	if smtpFrom == "" {
		// Fallback to business email if caller didn't set SMTP_FROM.
		// This still requires that your SMTP server allows sending from this address.
		smtpFrom = strings.TrimSpace(biz.Email)
	}
	if smtpFrom == "" {
		return errors.New("SMTP_FROM not configured (set SMTP_FROM or business_profile.email)")
	}

	subject := fmt.Sprintf("Invoice %s", invoice.InvoiceNumber)
	bodyText := fmt.Sprintf(
		"Hello %s,\n\nPlease find your invoice attached.\nInvoice: %s\nTotal: %.2f\n\nThank you.",
		client.Name,
		invoice.InvoiceNumber,
		invoice.Total,
	)

	filename := filepath.Base(pdfPath)
	pdfBytes, err := os.ReadFile(pdfPath)
	if err != nil {
		return err
	}

	// Build a multipart/mixed email with the PDF attachment.
	var msg bytes.Buffer
	writer := multipart.NewWriter(&msg)

	fmt.Fprintf(&msg, "From: %s\r\n", smtpFrom)
	fmt.Fprintf(&msg, "To: %s\r\n", client.Email)
	fmt.Fprintf(&msg, "Subject: %s\r\n", subject)
	fmt.Fprintf(&msg, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&msg, "Content-Type: multipart/mixed; boundary=%s\r\n", writer.Boundary())
	msg.WriteString("\r\n")

	// Text part.
	textHeader := make(textproto.MIMEHeader)
	textHeader.Set("Content-Type", "text/plain; charset=utf-8")
	textHeader.Set("Content-Transfer-Encoding", "7bit")
	textPart, err := writer.CreatePart(textHeader)
	if err != nil {
		return err
	}
	if _, err := textPart.Write([]byte(bodyText)); err != nil {
		return err
	}

	// Attachment part.
	attHeader := make(textproto.MIMEHeader)
	attHeader.Set("Content-Type", "application/pdf")
	attHeader.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	attHeader.Set("Content-Transfer-Encoding", "base64")
	attPart, err := writer.CreatePart(attHeader)
	if err != nil {
		return err
	}

	encoded := make([]byte, base64.StdEncoding.EncodedLen(len(pdfBytes)))
	base64.StdEncoding.Encode(encoded, pdfBytes)
	for i := 0; i < len(encoded); i += 76 {
		end := i + 76
		if end > len(encoded) {
			end = len(encoded)
		}
		if _, err := attPart.Write(encoded[i:end]); err != nil {
			return err
		}
		if _, err := attPart.Write([]byte("\r\n")); err != nil {
			return err
		}
	}

	if err := writer.Close(); err != nil {
		return err
	}

	addr := fmt.Sprintf("%s:%s", smtpHost, smtpPort)
	var auth smtp.Auth
	if smtpUser != "" && smtpPass != "" {
		auth = smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	}

	if startTLS {
		// STARTTLS mode
		var tlsConfig *tls.Config
		if skipVerify {
			tlsConfig = &tls.Config{InsecureSkipVerify: true, ServerName: smtpHost}
		} else {
			tlsConfig = &tls.Config{ServerName: smtpHost}
		}

		c, err := smtp.Dial(addr)
		if err != nil {
			return err
		}
		defer c.Close()

		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(tlsConfig); err != nil {
				return err
			}
		}

		if auth != nil {
			if err := c.Auth(auth); err != nil {
				return err
			}
		}

		if err := c.Mail(smtpFrom); err != nil {
			return err
		}
		if err := c.Rcpt(client.Email); err != nil {
			return err
		}

		w, err := c.Data()
		if err != nil {
			return err
		}
		if _, err := w.Write(msg.Bytes()); err != nil {
			return err
		}
		if err := w.Close(); err != nil {
			return err
		}
	} else {
		// Non-STARTTLS mode.
		if err := smtp.SendMail(addr, auth, smtpFrom, []string{client.Email}, msg.Bytes()); err != nil {
			return err
		}
	}

	// Mark as sent so it can be viewed later.
	_, err = s.Repo.SetInvoiceSent(id, "sent/downloaded")
	return err
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
func GenerateInvoicePDF(invoice *models.Invoice, biz *models.Business, client *models.Client) (string, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.AddPage()

	// Set margins
	pdf.SetMargins(15, 20, 15)

	// Optional logo (top-left). Supports either:
	// - public URL in biz.LogoURL (https://...)
	// - repo/local path in biz.LogoURL (e.g. assets/logo.png)
	logoPath := strings.TrimSpace(biz.LogoURL)
	logoW := 40.0
	logoH := 0.0 // auto scale
	logoYBottom := 20.0
	var cleanupLogo func()
	if logoPath != "" {
		var localLogo string
		if strings.HasPrefix(strings.ToLower(logoPath), "http://") || strings.HasPrefix(strings.ToLower(logoPath), "https://") {
			resp, err := http.Get(logoPath)
			if err == nil && resp != nil {
				defer resp.Body.Close()
				if resp.StatusCode >= 200 && resp.StatusCode < 300 {
					ext := strings.ToLower(filepath.Ext(logoPath))
					if ext != ".png" && ext != ".jpg" && ext != ".jpeg" {
						ext = ".png"
					}
					f, err := os.CreateTemp("", "invoice-logo-*"+ext)
					if err == nil {
						if _, err := io.Copy(f, resp.Body); err == nil {
							localLogo = f.Name()
							cleanupLogo = func() { _ = os.Remove(localLogo) }
						}
						_ = f.Close()
					}
				}
			}
		} else {
			// Treat as local path (relative to current working directory).
			localLogo = logoPath
		}

		if localLogo != "" {
			x := 15.0
			y := 20.0
			// gofpdf can infer type from extension (PNG/JPG/JPEG).
			pdf.ImageOptions(localLogo, x, y, logoW, logoH, false, gofpdf.ImageOptions{ReadDpi: true}, 0, "")
			logoYBottom = y + 25.0
		}
	}
	if cleanupLogo != nil {
		defer cleanupLogo()
	}

	// Business details (top-right, dynamic below logo)
	yPos := logoYBottom - 10.0
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
	pdf.Cell(95, 7, fmt.Sprintf("Invoice No: %s", invoice.InvoiceNumber))
	pdf.Ln(7)
	pdf.Cell(95, 7, fmt.Sprintf("Invoice Date: %s", invoice.InvoiceDate.Format("2006-01-02")))
	pdf.Ln(10)

	// Bill-to block (client details)
	pdf.SetFont("Arial", "B", 12)
	pdf.Cell(40, 7, "Bill To")
	pdf.Ln(7)
	pdf.SetFont("Arial", "", 11)
	if client != nil {
		pdf.Cell(180, 6, client.Name)
		pdf.Ln(6)
		if strings.TrimSpace(client.Email) != "" {
			pdf.Cell(180, 6, client.Email)
			pdf.Ln(6)
		}
		if strings.TrimSpace(client.BillingAddress) != "" {
			pdf.MultiCell(180, 5, client.BillingAddress, "", "", false)
		}
	} else {
		pdf.Cell(180, 6, invoice.CustomerName)
		pdf.Ln(6)
	}
	pdf.Ln(6)

	// Items table
	colDesc := 95.0
	colQty := 20.0
	colUnit := 30.0
	colLine := 35.0
	rowH := 7.0

	pdf.SetFont("Arial", "B", 11)
	pdf.SetFillColor(240, 240, 240)
	pdf.CellFormat(colDesc, rowH, "Item", "1", 0, "L", true, 0, "")
	pdf.CellFormat(colQty, rowH, "Qty", "1", 0, "C", true, 0, "")
	pdf.CellFormat(colUnit, rowH, "Unit Price", "1", 0, "R", true, 0, "")
	pdf.CellFormat(colLine, rowH, "Line Total", "1", 1, "R", true, 0, "")

	pdf.SetFont("Arial", "", 11)
	for _, item := range invoice.Items {
		name := strings.TrimSpace(item.ProductName)
		if name == "" {
			name = strings.TrimSpace(item.Name)
		}
		if name == "" {
			name = fmt.Sprintf("Product #%d", item.ProductID)
		}
		lineTotal := item.LineTotal
		if lineTotal == 0 {
			lineTotal = item.Price * float64(item.Quantity)
		}

		pdf.CellFormat(colDesc, rowH, name, "1", 0, "L", false, 0, "")
		pdf.CellFormat(colQty, rowH, fmt.Sprintf("%d", item.Quantity), "1", 0, "C", false, 0, "")
		pdf.CellFormat(colUnit, rowH, fmt.Sprintf("%.2f", item.Price), "1", 0, "R", false, 0, "")
		pdf.CellFormat(colLine, rowH, fmt.Sprintf("%.2f", lineTotal), "1", 1, "R", false, 0, "")
	}

	pdf.Ln(4)

	// Totals block (right-aligned)
	pdf.SetFont("Arial", "", 11)
	rightLabelW := 40.0
	rightValueW := 35.0
	pdf.SetX(190 - 15 - rightLabelW - rightValueW)
	pdf.CellFormat(rightLabelW, 6, "Subtotal", "0", 0, "R", false, 0, "")
	pdf.CellFormat(rightValueW, 6, fmt.Sprintf("%.2f", invoice.Subtotal), "0", 1, "R", false, 0, "")

	pdf.SetX(190 - 15 - rightLabelW - rightValueW)
	pdf.CellFormat(rightLabelW, 6, fmt.Sprintf("Tax (%.2f%%)", invoice.TaxRate), "0", 0, "R", false, 0, "")
	pdf.CellFormat(rightValueW, 6, fmt.Sprintf("%.2f", invoice.TaxAmount), "0", 1, "R", false, 0, "")

	pdf.SetFont("Arial", "B", 12)
	pdf.SetX(190 - 15 - rightLabelW - rightValueW)
	pdf.CellFormat(rightLabelW, 7, "Total", "T", 0, "R", false, 0, "")
	pdf.CellFormat(rightValueW, 7, fmt.Sprintf("%.2f", invoice.Total), "T", 1, "R", false, 0, "")

	filePath := fmt.Sprintf("invoice_%d.pdf", invoice.ID)
	err := pdf.OutputFileAndClose(filePath)
	if err != nil {
		return "", err
	}

	return filePath, nil
}