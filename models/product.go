package models

import "gorm.io/gorm"

type Product struct {
	gorm.Model
	BusinessID  uint    `json:"business_id" gorm:"not null;index"`
	ProductName string  `json:"product_name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
}