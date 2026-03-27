package repository

import (
	"invoiceSys/db"
	"invoiceSys/models"
)

type ProductRepo struct{}

func (r *ProductRepo) GetByID(id uint) (*models.Product, error) {
	var product models.Product

	err := db.DB.First(&product, id).Error
	if err != nil {
		return nil, err
	}

	return &product, nil
}

func (r *ProductRepo) UpdateProduct(product *models.Product) error {
	return db.DB.Save(product).Error
}

func (r *ProductRepo) CreateProduct(product *models.Product) error {
	return db.DB.Create(product).Error
}