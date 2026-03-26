package models

import "gorm.io/gorm"

type Business struct {
	gorm.Model
	BusinessName string `gorm:"not null" json:"business_name"`
	Address      string `gorm:"not null" json:"address"`
	Phone        string `gorm:"not null" json:"phone"`
	Email        string `gorm:"not null" json:"email"`
	VATID        string `json:"vat_id"`
	LogoURL      string `gorm:"default:null" json:"logo_url"` //optional

}
