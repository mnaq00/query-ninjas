package services

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"invoiceSys/models"
	"invoiceSys/repository"
	"mime/multipart"
	"net/smtp"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jung-kurt/gofpdf"
)

// invoicePDFLogoWidthMM is the logo width on the page; height scales to preserve aspect ratio.
const invoicePDFLogoWidthMM = 34.0

// businessLogoFilePath returns a local filesystem path from biz.LogoURL, or "" if unset (no PDF logo).
func businessLogoFilePath(biz *models.Business) string {
	if biz == nil || biz.LogoURL == nil {
		return ""
	}
	return strings.TrimSpace(*biz.LogoURL)
}

// invoiceBillToFields prefers frozen snapshot on the invoice; falls back to live client for legacy rows.
func invoiceBillToFields(inv *models.Invoice, client *models.Client) (name, email, addr string) {
	name = strings.TrimSpace(inv.CustomerName)
	email = strings.TrimSpace(inv.BillingEmail)
	addr = strings.TrimSpace(inv.BillingAddress)
	if client != nil {
		if name == "" {
			name = strings.TrimSpace(client.Name)
		}
		if email == "" {
			email = strings.TrimSpace(client.Email)
		}
		if addr == "" {
			addr = strings.TrimSpace(client.BillingAddress)
		}
	}
	return name, email, addr
}

// calendarDatePastDue is true when today's calendar date (UTC) is after the due date's calendar date (UTC).
func calendarDatePastDue(due time.Time, now time.Time) bool {
	if due.IsZero() {
		return false
	}
	dueDay := time.Date(due.Year(), due.Month(), due.Day(), 0, 0, 0, 0, time.UTC)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	return today.After(dueDay)
}

type InvoiceService struct {
	Repo            repository.InvoiceRepository
	ClientRepo      *repository.ClientRepo
	ProductRepo     *repository.ProductRepo
	BusinessService *BusinessService
}

// enrichInvoiceItemsFromProducts loads product_name, description, and price from the catalog.
// Call only when creating or updating an invoice so those values are snapshotted in invoice_items.
// Do not call when rendering PDF/email for existing invoices — that would overwrite past line items.
func (s *InvoiceService) enrichInvoiceItemsFromProducts(items *[]models.InvoiceItem) error {
	if items == nil {
		return nil
	}
	for i := range *items {
		item := &(*items)[i]
		if item.ProductID == 0 {
			return errors.New("each line item must include a product_id")
		}
		if s.ProductRepo == nil {
			return fmt.Errorf("product catalog not configured (product_id %d)", item.ProductID)
		}
		p, err := s.ProductRepo.GetByID(item.ProductID)
		if err != nil {
			return fmt.Errorf("product id %d not found", item.ProductID)
		}
		item.ProductName = strings.TrimSpace(p.ProductName)
		if item.ProductName == "" {
			item.ProductName = strings.TrimSpace(p.Description)
		}
		if item.ProductName == "" {
			item.ProductName = fmt.Sprintf("Product #%d", item.ProductID)
		}
		item.Description = strings.TrimSpace(p.Description)
		if item.Price <= 0 {
			item.Price = p.Price
		}
		if item.Price <= 0 {
			return fmt.Errorf("product id %d has no valid price", item.ProductID)
		}
	}
	return nil
}

func validInvoiceLifecycle(s string) bool {
	switch models.NormalizeInvoiceStatus(s) {
	case models.InvoiceStatusDraft, models.InvoiceStatusReadyToSend, models.InvoiceStatusSentDownloaded:
		return true
	default:
		return false
	}
}

// reconcileOverdueInDB sets payment to overdue when invoice is issued (sent/downloaded), still unpaid,
// and past the payment due date; reverts overdue → unpaid when the due date is no longer past. Paid
// and non-issued invoices are unchanged.
func (s *InvoiceService) reconcileOverdueInDB(inv *models.Invoice) (updated bool, err error) {
	pay := strings.ToLower(strings.TrimSpace(inv.Customer_payment_status))
	if pay == models.PaymentStatusPaid {
		return false, nil
	}
	if models.NormalizeInvoiceStatus(inv.InvoiceStatus) != models.InvoiceStatusSentDownloaded {
		return false, nil
	}
	if inv.PaymentDueDate.IsZero() {
		return false, nil
	}
	pastDue := calendarDatePastDue(inv.PaymentDueDate, time.Now())
	if pastDue {
		if pay == models.PaymentStatusUnpaid {
			if err := s.Repo.UpdateInvoicePaymentStatus(inv.ID, models.PaymentStatusOverdue); err != nil {
				return false, err
			}
			return true, nil
		}
		return false, nil
	}
	if pay == models.PaymentStatusOverdue {
		if err := s.Repo.UpdateInvoicePaymentStatus(inv.ID, models.PaymentStatusUnpaid); err != nil {
			return false, err
		}
		return true, nil
	}
	return false, nil
}

func (s *InvoiceService) reloadInvoiceIfReconciled(inv *models.Invoice) (*models.Invoice, error) {
	changed, err := s.reconcileOverdueInDB(inv)
	if err != nil {
		return nil, err
	}
	if !changed {
		return inv, nil
	}
	return s.Repo.GetInvoiceByID(inv.ID)
}

// loadBusinessForInvoice loads the business profile for PDF/email using invoice.BusinessID.
// If BusinessID is 0 (legacy row), it falls back to ID 1.
func (s *InvoiceService) loadBusinessForInvoice(invoice *models.Invoice) (*models.Business, error) {
	if s.BusinessService == nil {
		return nil, errors.New("business service not configured")
	}
	bid := invoice.BusinessID
	if bid == 0 {
		bid = 1
	}
	profile, err := s.BusinessService.GetBusinessProfile(bid)
	if err != nil {
		return nil, fmt.Errorf("business not found for business_id %d", bid)
	}
	return profile, nil
}

// Musa
func (s *InvoiceService) CreateInvoice(req *models.Invoice) error {

	if req.BusinessID == 0 {
		return errors.New("business_id is required")
	}
	if s.BusinessService == nil {
		return errors.New("business service not configured")
	}
	if _, err := s.BusinessService.GetBusinessProfile(req.BusinessID); err != nil {
		return errors.New("business not found")
	}

	if req.ClientID == 0 {
		return errors.New("client id is required")
	}

	if len(req.Items) == 0 {
		return errors.New("at least one invoice item is required")
	}

	if err := s.enrichInvoiceItemsFromProducts(&req.Items); err != nil {
		return err
	}

	var subtotal float64

	for i := range req.Items {
		item := &req.Items[i]
		if item.Price <= 0 { // Now matches
			return errors.New("item price must be greater than 0")
		}
		if item.Quantity <= 0 {
			return errors.New("item quantity must be greater than 0")
		}
		item.LineTotal = item.Price * float64(item.Quantity)
		subtotal += item.LineTotal
	}

	req.Subtotal = subtotal

	if req.TaxRate < 0 {
		return errors.New("tax rate cannot be negative")
	}
	// Freeze client bill-to on the invoice so later client edits do not change this document.
	if s.ClientRepo == nil {
		return errors.New("client repository not configured")
	}
	client, err := s.ClientRepo.GetClientByID(req.ClientID)
	if err != nil {
		return errors.New("client not found")
	}

	req.Subtotal = subtotal

	if strings.TrimSpace(req.InvoiceStatus) == "" {
		req.InvoiceStatus = models.InvoiceStatusDraft
	} else {
		req.InvoiceStatus = models.NormalizeInvoiceStatus(req.InvoiceStatus)
		if !validInvoiceLifecycle(req.InvoiceStatus) {
			return errors.New("invoice_status must be draft, ready_to_send, or sent/downloaded")
		}
	}
	if strings.TrimSpace(req.Customer_payment_status) == "" {
		req.Customer_payment_status = models.PaymentStatusUnpaid
	} else {
		p := models.NormalizePaymentStatus(req.Customer_payment_status)
		if p == "" {
			return errors.New("customer_payment_status must be unpaid, paid, or overdue")
		}
		req.Customer_payment_status = p
	}
	req.CustomerName = client.Name
	req.BillingEmail = client.Email
	req.BillingAddress = client.BillingAddress
	req.TaxAmount = req.Subtotal * (req.TaxRate / 100.0)
	req.Total = req.Subtotal + req.TaxAmount

	req.InvoiceNumber = fmt.Sprintf("INV-%d", time.Now().UnixNano())

	if err := s.Repo.CreateInvoice(req); err != nil {
		return err
	}
	inv, err := s.Repo.GetInvoiceByID(req.ID)
	if err != nil {
		return err
	}
	fresh, err := s.reloadInvoiceIfReconciled(inv)
	if err != nil {
		return err
	}
	*req = *fresh
	return nil
}

func (s *InvoiceService) UpdateInvoice(id uint, invoice *models.Invoice) (*models.Invoice, error) {
	if invoice.ClientID == 0 {
		return nil, errors.New("client id is required")
	}

	if len(invoice.Items) == 0 {
		return nil, errors.New("at least one invoice item is required")
	}

	if invoice.TaxRate < 0 {
		return nil, errors.New("vat rate cannot be negative")
	}

	existing, err := s.Repo.GetInvoiceByID(id)
	if err != nil {
		return nil, err
	}

	// Preserve invoice status when client omits it; otherwise it may get overwritten
	// with an empty string during JSON decode.
	if strings.TrimSpace(invoice.InvoiceStatus) == "" {
		invoice.InvoiceStatus = existing.InvoiceStatus
	}
	invoice.InvoiceStatus = models.NormalizeInvoiceStatus(invoice.InvoiceStatus)
	if !validInvoiceLifecycle(invoice.InvoiceStatus) {
		return nil, errors.New("invoice_status must be draft, ready_to_send, or sent/downloaded")
	}
	if strings.TrimSpace(invoice.Customer_payment_status) == "" {
		invoice.Customer_payment_status = existing.Customer_payment_status
	}
	p := models.NormalizePaymentStatus(invoice.Customer_payment_status)
	if p == "" {
		return nil, errors.New("customer_payment_status must be unpaid, paid, or overdue")
	}
	invoice.Customer_payment_status = p
	if invoice.PaymentDueDate.IsZero() {
		invoice.PaymentDueDate = existing.PaymentDueDate
	}
	if invoice.BusinessID == 0 {
		invoice.BusinessID = existing.BusinessID
	}
	if invoice.BusinessID == 0 {
		return nil, errors.New("business_id is required")
	}
	if s.BusinessService == nil {
		return nil, errors.New("business service not configured")
	}
	if _, err := s.BusinessService.GetBusinessProfile(invoice.BusinessID); err != nil {
		return nil, errors.New("business not found")
	}

	if err := s.enrichInvoiceItemsFromProducts(&invoice.Items); err != nil {
		return nil, err
	}

	var subtotal float64

	for i := range invoice.Items {
		item := &invoice.Items[i]

		if item.Quantity <= 0 {
			return nil, errors.New("quantity must be greater than zero")
		}
		if item.Price <= 0 {
			return nil, errors.New("item price must be greater than 0")
		}

		item.LineTotal = item.Price * float64(item.Quantity)
		subtotal += item.LineTotal
	}

	if s.ClientRepo == nil {
		return nil, errors.New("client repository not configured")
	}
	sameClient := invoice.ClientID == existing.ClientID
	if sameClient {
		// Keep frozen bill-to; editing the client record must not alter this invoice.
		invoice.CustomerName = existing.CustomerName
		invoice.BillingEmail = existing.BillingEmail
		invoice.BillingAddress = existing.BillingAddress
	} else {
		client, err := s.ClientRepo.GetClientByID(invoice.ClientID)
		if err != nil {
			return nil, errors.New("client not found")
		}
		invoice.CustomerName = client.Name
		invoice.BillingEmail = client.Email
		invoice.BillingAddress = client.BillingAddress
	}
	invoice.InvoiceDate = time.Now()
	invoice.InvoiceNumber = fmt.Sprintf("INV-%d", time.Now().Unix())

	invoice.Subtotal = subtotal
	invoice.TaxAmount = subtotal * (invoice.TaxRate / 100)
	invoice.Total = invoice.Subtotal + invoice.TaxAmount

	if err := s.Repo.UpdateInvoice(id, invoice); err != nil {
		return nil, err
	}
	inv, err := s.Repo.GetInvoiceByID(id)
	if err != nil {
		return nil, err
	}
	return s.reloadInvoiceIfReconciled(inv)
}

func (s *InvoiceService) SearchByClient(customerName string) ([]models.Invoice, error) {
	if err := s.Repo.SyncOverdueBatch(time.Now()); err != nil {
		return nil, err
	}
	return s.Repo.SearchByClient(customerName)
}

func (s *InvoiceService) SearchByPaymentStatus(status string) ([]models.Invoice, error) {
	if err := s.Repo.SyncOverdueBatch(time.Now()); err != nil {
		return nil, err
	}
	return s.Repo.SearchByPaymentStatus(status)
}

func (s *InvoiceService) MarkInvoicePaid(id uint, paymentDate time.Time) (*models.Invoice, error) {
	return s.Repo.MarkInvoicePaid(id, paymentDate)
}

func (s *InvoiceService) SaveInvoiceDraft(id uint) (*models.Invoice, error) {
	return s.Repo.SetInvoiceDraft(id)
}

// RenderInvoicePDF builds the invoice PDF in memory for HTTP responses (browser / Postman / deployed API).
// Draft invoices are allowed so users can preview before sending.
func (s *InvoiceService) RenderInvoicePDF(id uint) (pdf []byte, filename string, err error) {
	invoice, err := s.Repo.GetInvoiceByID(id)
	if err != nil {
		return nil, "", err
	}
	invoice, err = s.reloadInvoiceIfReconciled(invoice)
	if err != nil {
		return nil, "", err
	}
	if s.ClientRepo == nil {
		return nil, "", errors.New("client repository not configured")
	}
	var client *models.Client
	if c, e := s.ClientRepo.GetClientByID(invoice.ClientID); e == nil {
		client = c
	}
	billName, _, _ := invoiceBillToFields(invoice, client)
	if billName == "" {
		return nil, "", errors.New("invoice has no bill-to name; client may be missing")
	}

	bizPtr, err := s.loadBusinessForInvoice(invoice)
	if err != nil {
		return nil, "", err
	}

	pdfPath, err := GenerateInvoicePDF(invoice, bizPtr, client)
	if err != nil {
		return nil, "", err
	}
	defer os.Remove(pdfPath)

	data, err := os.ReadFile(pdfPath)
	if err != nil {
		return nil, "", err
	}
	return data, filepath.Base(pdfPath), nil
}

// Robel
// bodyInvoiceStatus must normalize to ready_to_send (e.g. JSON "ready_to_send" or "ready to send").
// If the invoice is draft, it is promoted to ready_to_send in the DB before sending (no prior PUT).
func (s *InvoiceService) SendInvoiceEmail(id uint, bodyInvoiceStatus string) error {
	want := models.NormalizeInvoiceStatus(bodyInvoiceStatus)
	if want != models.InvoiceStatusReadyToSend {
		return errors.New(`request body must include "invoice_status": "ready_to_send" (or "ready to send")`)
	}

	invoice, err := s.Repo.GetInvoiceByID(id)
	if err != nil {
		return err
	}
	invoice, err = s.reloadInvoiceIfReconciled(invoice)
	if err != nil {
		return err
	}

	cur := models.NormalizeInvoiceStatus(invoice.InvoiceStatus)
	switch cur {
	case models.InvoiceStatusDraft:
		if err := s.Repo.SetInvoiceLifecycleStatus(id, models.InvoiceStatusReadyToSend); err != nil {
			return err
		}
		invoice, err = s.Repo.GetInvoiceByID(id)
		if err != nil {
			return err
		}
	case models.InvoiceStatusReadyToSend, models.InvoiceStatusSentDownloaded:
		// ok — send now or resend after a previous send
	default:
		return errors.New("email send is only allowed when invoice is draft, ready_to_send, or sent/downloaded")
	}

	if s.ClientRepo == nil {
		return errors.New("client repository not configured")
	}
	var client *models.Client
	if c, e := s.ClientRepo.GetClientByID(invoice.ClientID); e == nil {
		client = c
	}
	billName, toEmail, _ := invoiceBillToFields(invoice, client)
	if strings.TrimSpace(toEmail) == "" {
		return errors.New("invoice has no billing email snapshot; cannot send invoice")
	}

	bizPtr, err := s.loadBusinessForInvoice(invoice)
	if err != nil {
		return err
	}

	pdfPath, err := GenerateInvoicePDF(invoice, bizPtr, client)
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
		smtpFrom = strings.TrimSpace(bizPtr.Email)
	}
	if smtpFrom == "" {
		return errors.New("SMTP_FROM not configured (set SMTP_FROM or business_profile.email)")
	}

	subject := fmt.Sprintf("Invoice %s", invoice.InvoiceNumber)
	bodyText := fmt.Sprintf(
		"Hello %s,\n\nPlease find your invoice attached.\nInvoice: %s\nTotal: %.2f\n\nThank you.",
		billName,
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
	fmt.Fprintf(&msg, "To: %s\r\n", toEmail)
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
		if err := smtp.SendMail(addr, auth, smtpFrom, []string{toEmail}, msg.Bytes()); err != nil {
			return err
		}
	}

	// Mark as issued (sent/downloaded); payment stays unpaid until marked paid.
	return s.Repo.SetInvoiceLifecycleStatus(id, models.InvoiceStatusSentDownloaded)
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
	// Core fonts (Arial) expect Windows-1252, not raw UTF-8; without translation,
	// UTF-8 em dashes and similar show as mojibake (e.g. "â€"").
	tr := pdf.UnicodeTranslatorFromDescriptor("")

	// Set margins
	leftMargin, topMargin, rightMargin := 15.0, 15.0, 15.0
	pdf.SetMargins(leftMargin, topMargin, rightMargin)

	pageW, pageH := pdf.GetPageSize()
	contentW := pageW - leftMargin - rightMargin

	headerTop := topMargin
	logoGapMM := 10.0
	logoUsedW := 0.0
	headerMinBottom := headerTop

	logoPath := businessLogoFilePath(biz)
	if logoPath != "" {
		if fi, err := os.Stat(logoPath); err == nil && !fi.IsDir() {
			pdf.ImageOptions(logoPath, leftMargin, headerTop, invoicePDFLogoWidthMM, 0, false, gofpdf.ImageOptions{ReadDpi: true}, 0, "")
			logoUsedW = invoicePDFLogoWidthMM + logoGapMM
			headerMinBottom = headerTop + invoicePDFLogoWidthMM
		}
	}

	// Business details (top-right): full width if no logo; otherwise to the right of the logo.
	bizX := leftMargin + logoUsedW
	bizW := contentW - logoUsedW
	pdf.SetXY(bizX, headerTop)
	pdf.SetFont("Arial", "B", 14)
	pdf.MultiCell(bizW, 6, tr(strings.TrimSpace(biz.BusinessName)), "", "R", false)

	pdf.SetFont("Arial", "", 10)
	if strings.TrimSpace(biz.Address) != "" {
		pdf.SetX(bizX)
		pdf.MultiCell(bizW, 4.5, tr(strings.TrimSpace(biz.Address)), "", "R", false)
	}
	if strings.TrimSpace(biz.Phone) != "" {
		pdf.SetX(bizX)
		pdf.MultiCell(bizW, 4.5, tr(fmt.Sprintf("Phone: %s", strings.TrimSpace(biz.Phone))), "", "R", false)
	}
	if strings.TrimSpace(biz.Email) != "" {
		pdf.SetX(bizX)
		pdf.MultiCell(bizW, 4.5, tr(fmt.Sprintf("Email: %s", strings.TrimSpace(biz.Email))), "", "R", false)
	}
	if strings.TrimSpace(biz.VATID) != "" {
		pdf.SetX(bizX)
		pdf.MultiCell(bizW, 4.5, tr(fmt.Sprintf("VAT ID: %s", strings.TrimSpace(biz.VATID))), "", "R", false)
	}

	headerBottom := pdf.GetY()
	if headerBottom < headerMinBottom {
		headerBottom = headerMinBottom
	}

	// Divider line under header.
	pdf.SetDrawColor(220, 220, 220)
	pdf.Line(leftMargin, headerBottom+3, pageW-rightMargin, headerBottom+3)
	pdf.SetY(headerBottom + 8)

	// Invoice title
	pdf.SetFont("Arial", "B", 22)
	pdf.SetTextColor(35, 35, 35)
	pdf.CellFormat(contentW, 10, tr("Invoice"), "0", 1, "L", false, 0, "")
	pdf.SetTextColor(0, 0, 0)

	pdf.SetFont("Arial", "", 12)
	pdf.Cell(95, 7, tr(fmt.Sprintf("Invoice No: %s", invoice.InvoiceNumber)))
	pdf.Ln(7)
	pdf.Cell(95, 7, tr(fmt.Sprintf("Invoice Date: %s", invoice.InvoiceDate.Format("2006-01-02"))))
	pdf.Ln(7)
	if !invoice.PaymentDueDate.IsZero() {
		pdf.Cell(95, 7, tr(fmt.Sprintf("Payment Due: %s", invoice.PaymentDueDate.Format("2006-01-02"))))
		pdf.Ln(7)
	}

	pay := strings.ToLower(strings.TrimSpace(invoice.Customer_payment_status))
	pdf.SetFont("Arial", "", 12)
	pdf.SetTextColor(0, 0, 0)
	pdf.Cell(48, 7, tr("Payment status: "))
	switch pay {
	case models.PaymentStatusPaid:
		pdf.SetTextColor(34, 139, 34)
		pdf.Cell(40, 7, tr("Paid"))
	case models.PaymentStatusUnpaid:
		pdf.SetTextColor(200, 40, 40)
		pdf.Cell(40, 7, tr("Unpaid"))
	case models.PaymentStatusOverdue:
		pdf.SetTextColor(200, 40, 40)
		pdf.Cell(40, 7, tr("Overdue"))
	default:
		pdf.SetTextColor(80, 80, 80)
		label := pay
		if label == "" {
			label = "—"
		}
		pdf.Cell(40, 7, tr(label))
	}
	pdf.SetTextColor(0, 0, 0)
	pdf.Ln(7)
	if pay == models.PaymentStatusPaid && !invoice.PaymentDate.IsZero() {
		pdf.Cell(95, 7, tr(fmt.Sprintf("Payment date: %s", invoice.PaymentDate.Format("2006-01-02"))))
		pdf.Ln(7)
	}
	pdf.Ln(3)

	// Bill-to: frozen snapshot on invoice (fallback to live client for legacy rows).
	billName, billEmail, billAddr := invoiceBillToFields(invoice, client)
	pdf.SetFont("Arial", "B", 12)
	pdf.Cell(40, 7, tr("Bill To"))
	pdf.Ln(7)
	pdf.SetFont("Arial", "", 11)
	if billName != "" {
		pdf.Cell(180, 6, tr(billName))
		pdf.Ln(6)
	}
	if billEmail != "" {
		pdf.Cell(180, 6, tr(billEmail))
		pdf.Ln(6)
	}
	if billAddr != "" {
		pdf.MultiCell(180, 5, tr(billAddr), "", "", false)
	}
	pdf.Ln(6)

	// Items table: narrow # column, then item (name + description), then qty/price/totals.
	colNum := 8.0
	colDesc := 87.0
	colQty := 20.0
	colUnit := 30.0
	colLine := 35.0
	rowH := 7.0
	_ = pageH // keep for future pagination improvements

	pdf.SetFont("Arial", "B", 11)
	pdf.SetFillColor(240, 240, 240)
	pdf.CellFormat(colNum, rowH, tr("#"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(colDesc, rowH, tr("Item"), "1", 0, "L", true, 0, "")
	pdf.CellFormat(colQty, rowH, tr("Qty"), "1", 0, "C", true, 0, "")
	pdf.CellFormat(colUnit, rowH, tr("Unit Price"), "1", 0, "R", true, 0, "")
	pdf.CellFormat(colLine, rowH, tr("Line Total"), "1", 1, "R", true, 0, "")

	itemPad := 1.0
	innerDescW := colDesc - 2*itemPad
	xDesc := leftMargin + colNum
	nameLineH := 5.0
	descLineH := 4.0
	minItemRowH := rowH

	pdf.SetFont("Arial", "", 11)
	for i, item := range invoice.Items {
		lineNo := i + 1
		name := strings.TrimSpace(item.ProductName)
		if name == "" {
			name = fmt.Sprintf("Product #%d", item.ProductID)
		}
		desc := strings.TrimSpace(item.Description)
		lineTotal := item.LineTotal
		if lineTotal == 0 {
			lineTotal = item.Price * float64(item.Quantity)
		}

		x0 := leftMargin
		y0 := pdf.GetY()
		pdf.SetX(x0)

		pdf.SetFont("Arial", "", 11)
		nameLines := len(pdf.SplitLines([]byte(tr(name)), innerDescW))
		if nameLines < 1 {
			nameLines = 1
		}
		descLines := 0
		if desc != "" {
			pdf.SetFont("Arial", "", 9)
			descLines = len(pdf.SplitLines([]byte(tr(desc)), innerDescW))
			if descLines < 1 {
				descLines = 1
			}
			pdf.SetFont("Arial", "", 11)
		}
		gapBetween := 0.0
		if desc != "" {
			gapBetween = 1.5
		}
		rowItemH := float64(nameLines)*nameLineH + gapBetween + float64(descLines)*descLineH + 2*itemPad
		if rowItemH < minItemRowH {
			rowItemH = minItemRowH
		}

		pdf.Rect(x0, y0, colNum, rowItemH, "D")
		pdf.Rect(x0+colNum, y0, colDesc, rowItemH, "D")
		pdf.Rect(x0+colNum+colDesc, y0, colQty, rowItemH, "D")
		pdf.Rect(x0+colNum+colDesc+colQty, y0, colUnit, rowItemH, "D")
		pdf.Rect(x0+colNum+colDesc+colQty+colUnit, y0, colLine, rowItemH, "D")

		pdf.SetXY(xDesc+itemPad, y0+itemPad)
		pdf.SetFont("Arial", "", 11)
		pdf.MultiCell(innerDescW, nameLineH, tr(name), "", "L", false)
		if desc != "" {
			pdf.SetX(xDesc + itemPad)
			pdf.SetFont("Arial", "", 9)
			pdf.SetTextColor(72, 72, 72)
			pdf.MultiCell(innerDescW, descLineH, tr(desc), "", "L", false)
			pdf.SetTextColor(0, 0, 0)
			pdf.SetFont("Arial", "", 11)
		}

		numY := y0 + (rowItemH-7)/2
		if numY < y0 {
			numY = y0
		}
		pdf.SetXY(x0, numY)
		pdf.CellFormat(colNum, 7, tr(fmt.Sprintf("%d", lineNo)), "0", 0, "C", false, 0, "")
		pdf.SetXY(x0+colNum+colDesc, numY)
		pdf.CellFormat(colQty, 7, fmt.Sprintf("%d", item.Quantity), "0", 0, "C", false, 0, "")
		pdf.CellFormat(colUnit, 7, fmt.Sprintf("%.2f", item.Price), "0", 0, "R", false, 0, "")
		pdf.CellFormat(colLine, 7, fmt.Sprintf("%.2f", lineTotal), "0", 0, "R", false, 0, "")
		pdf.SetXY(leftMargin, y0+rowItemH)
	}

	pdf.Ln(4)

	// Totals block (right-aligned)
	pdf.SetFont("Arial", "", 11)
	rightLabelW := 40.0
	rightValueW := 35.0
	pdf.SetX(190 - 15 - rightLabelW - rightValueW)
	pdf.CellFormat(rightLabelW, 6, tr("Subtotal"), "0", 0, "R", false, 0, "")
	pdf.CellFormat(rightValueW, 6, tr(fmt.Sprintf("£%.2f", invoice.Subtotal)), "0", 1, "R", false, 0, "")

	pdf.SetX(190 - 15 - rightLabelW - rightValueW)
	pdf.CellFormat(rightLabelW, 6, tr(fmt.Sprintf("Tax (%.2f%%)", invoice.TaxRate)), "0", 0, "R", false, 0, "")
	pdf.CellFormat(rightValueW, 6, tr(fmt.Sprintf("£%.2f", invoice.TaxAmount)), "0", 1, "R", false, 0, "")

	pdf.SetFont("Arial", "B", 12)
	pdf.SetX(190 - 15 - rightLabelW - rightValueW)
	pdf.CellFormat(rightLabelW, 7, tr("Total"), "T", 0, "R", false, 0, "")
	pdf.CellFormat(rightValueW, 7, tr(fmt.Sprintf("£%.2f", invoice.Total)), "T", 1, "R", false, 0, "")

	filePath := fmt.Sprintf("invoice_%d.pdf", invoice.ID)
	err := pdf.OutputFileAndClose(filePath)
	if err != nil {
		return "", err
	}

	return filePath, nil
}
