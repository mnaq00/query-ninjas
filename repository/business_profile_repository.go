package repository

import (
    "invoiceSys/db"
    "invoiceSys/models"
)

type BusinessProfileRepository interface {
    GetBusinessProfile(id uint) (*models.BusinessProfile, error)
    CreateBusinessProfile(profile *models.BusinessProfile) error
    UpdateBusinessProfile(profile *models.BusinessProfile) error
}

type BusinessRepo struct{}

func (r *BusinessRepo) GetBusinessProfile(id uint) (*models.BusinessProfile, error) {
    var profile models.BusinessProfile
    err := db.DB.Where("id = ?", id).First(&profile).Error
    if err != nil {
        return &models.BusinessProfile{}, err
    }
    return &profile, nil
}

func (r *BusinessRepo) CreateBusinessProfile(profile *models.BusinessProfile) error {
    err := db.DB.Create(&profile).Error
    if err != nil {
        return err
    }
    return nil
}

func (r *BusinessRepo) UpdateBusinessProfile(profile *models.BusinessProfile) error {
    err := db.DB.Save(&profile).Error
    if err != nil {
        return err
    }
    return nil
}