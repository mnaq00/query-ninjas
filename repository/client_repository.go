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