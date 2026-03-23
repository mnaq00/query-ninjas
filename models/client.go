package models

import "gorm.io/gorm"

type Client struct {
	gorm.Model
	Name           string `json:"name" gorm:"not null"`
	Email          string `json:"email" gorm:"unique;not null"`
	BillingAddress string `json:"billing_address" gorm:"not null"`
}
