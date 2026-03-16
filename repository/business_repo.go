package repository

import (
	"invoiceSys/db"
	"invoiceSys/models"
)

type BusinessRepo struct{}

func (r *BusinessRepo) GetByID(id uint) (*models.Business, error) {
	var b models.Business
	err := db.DB.First(&b, id).Error
	return &b, err
}

func (r *BusinessRepo) Update(b *models.Business) error {
	return db.DB.Save(b).Error
}