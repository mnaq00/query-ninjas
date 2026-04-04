package models

import "gorm.io/gorm"

type Client struct {
	gorm.Model
	BusinessID     uint   `json:"business_id" gorm:"not null;index;uniqueIndex:idx_client_business_email"`
	Name           string `json:"name" gorm:"not null"`
	Email          string `json:"email" gorm:"not null;uniqueIndex:idx_client_business_email"`
	BillingAddress string `json:"billing_address" gorm:"not null"`
}