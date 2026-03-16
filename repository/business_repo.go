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
	GetByID(id uint) (*models.Business, error)
	Update(b *models.Business) error
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

func (r *BusinessRepo) GetByID(id uint) (*models.Business, error) {
	var b models.Business
	err := db.DB.First(&b, id).Error
	return &b, err
}

func (r *BusinessRepo) Update(b *models.Business) error {
	return db.DB.Save(b).Error
}
