package repository

import (
	"invoiceSys/db"
	"invoiceSys/models"
)

type ClientRepo struct{}

func (r *ClientRepo) CreateClient(client *models.Client) error {
	return db.DB.Create(client).Error
}

func (r *ClientRepo) GetClientByEmail(email string) (*models.Client, error) {
	var client models.Client
	err := db.DB.Where("email = ?", email).First(&client).Error
	if err != nil {
		return nil, err
	}
	return &client, nil
}

func (r *ClientRepo) UpdateClient(client *models.Client) error {
	return db.DB.Save(client).Error
}

// used this to fetch client by ID
func (r *ClientRepo) GetClientByID(id uint) (*models.Client, error) {
	var client models.Client
	err := db.DB.First(&client, id).Error
	if err != nil {
		return nil, err
	}
	return &client, nil
}
