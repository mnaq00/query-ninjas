package repository

import (
	"invoiceSys/db"
	"invoiceSys/models"

	"gorm.io/gorm"
)

type ClientRepo struct{}

func (r *ClientRepo) CreateClient(client *models.Client) error {
	return db.DB.Create(client).Error
}

func (r *ClientRepo) GetClientByEmail(businessID uint, email string) (*models.Client, error) {
	var client models.Client
	err := db.DB.Where("business_id = ? AND email = ?", businessID, email).First(&client).Error
	if err != nil {
		return nil, err
	}
	return &client, nil
}

func (r *ClientRepo) UpdateClient(client *models.Client) error {
	return db.DB.Save(client).Error
}

func (r *ClientRepo) GetClientByID(businessID, id uint) (*models.Client, error) {
	var client models.Client
	err := db.DB.Where("id = ? AND business_id = ?", id, businessID).First(&client).Error
	if err != nil {
		return nil, err
	}
	return &client, nil
}

// ListClientsByBusinessID returns all clients for a tenant, ordered by primary key.
func (r *ClientRepo) ListClientsByBusinessID(businessID uint) ([]models.Client, error) {
	var clients []models.Client
	err := db.DB.Where("business_id = ?", businessID).Order("id ASC").Find(&clients).Error
	return clients, err
}

// SoftDeleteClient sets deleted_at (GORM soft delete) for the client row; invoices keep a valid client_id.
func (r *ClientRepo) SoftDeleteClient(businessID, id uint) error {
	res := db.DB.Where("id = ? AND business_id = ?", id, businessID).Delete(&models.Client{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
