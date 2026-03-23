package repository

import (
	"invoiceSys/db"
	"invoiceSys/models"
)

type BusinessRepo struct{}
type BusinessProfileRepository interface {
	GetBusinessProfile(id uint) (*models.Business, error)
	CreateBusinessProfile(profile *models.Business) error
	UpdateBusinessProfile(profile *models.Business) error
	
}

func (r *BusinessRepo) GetBusinessProfile(id uint) (*models.Business, error) {
	var profile models.Business
	err := db.DB.Where("id = ?", id).First(&profile).Error
	if err != nil {
		return &models.Business{}, err
	}
	return &profile, nil
}

func (r *BusinessRepo) CreateBusinessProfile(profile *models.Business) error {
	err := db.DB.Create(&profile).Error
	if err != nil {
		return err
	}
	return nil
}

func (r *BusinessRepo) UpdateBusinessProfile(profile *models.Business) error {
	err := db.DB.Save(&profile).Error
	if err != nil {
		return err
	}
	return nil
}
