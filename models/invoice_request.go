package models

type CreateInvoiceItemRequest struct {
	ProductID uint `json:"product_id"`
	Quantity int `json:"quantity"`
}

type CreateInvoiceRequest struct {
	ClientID uint `json:"client_id"`
	VATRate float64 `json:"vat_rate"`
	Items []CreateInvoiceItemRequest `json:"items"`
}