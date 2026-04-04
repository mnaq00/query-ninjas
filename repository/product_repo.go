package repository

import (
	"invoiceSys/db"
	"invoiceSys/models"

	"gorm.io/gorm"
)

type ProductRepo struct{}

func (r *ProductRepo) GetByID(businessID, id uint) (*models.Product, error) {
	var product models.Product
	err := db.DB.Where("id = ? AND business_id = ?", id, businessID).First(&product).Error
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

// ListProductsByBusinessID returns all products for a tenant, ordered by primary key.
func (r *ProductRepo) ListProductsByBusinessID(businessID uint) ([]models.Product, error) {
	var products []models.Product
	err := db.DB.Where("business_id = ?", businessID).Order("id ASC").Find(&products).Error
	return products, err
}

// SoftDeleteProduct sets deleted_at (GORM soft delete); invoice line items keep a valid product_id.
func (r *ProductRepo) SoftDeleteProduct(businessID, id uint) error {
	res := db.DB.Where("id = ? AND business_id = ?", id, businessID).Delete(&models.Product{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
