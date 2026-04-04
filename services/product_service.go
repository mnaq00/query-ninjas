package services

import (
	"errors"
	"invoiceSys/apperrors"
	"invoiceSys/models"
	"invoiceSys/repository"

	"gorm.io/gorm"
)

type ProductService struct {
	Repo *repository.ProductRepo
}

func (s *ProductService) CreateProduct(businessID uint, productName string, description string, price float64) (*models.Product, error) {
	if businessID == 0 {
		return nil, errors.New("business context required")
	}
	if productName == "" {
		return nil, errors.New("product name is required")
	}
	if price < 0 {
		return nil, errors.New("price cannot be negative")
	}

	product := &models.Product{
		BusinessID:  businessID,
		ProductName: productName,
		Description: description,
		Price:       price,
	}

	err := s.Repo.CreateProduct(product)
	if err != nil {
		return nil, err
	}

	return product, nil
}

func (s *ProductService) ListProducts(businessID uint) ([]models.Product, error) {
	if businessID == 0 {
		return nil, errors.New("business context required")
	}
	return s.Repo.ListProductsByBusinessID(businessID)
}

func (s *ProductService) GetProduct(businessID, id uint) (*models.Product, error) {
	if businessID == 0 {
		return nil, errors.New("business context required")
	}
	if id == 0 {
		return nil, errors.New("invalid product id")
	}

	product, err := s.Repo.GetByID(businessID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("product not found")
		}
		return nil, err
	}

	return product, nil
}

func (s *ProductService) UpdateProduct(businessID, id uint, productName string, description string, price float64) (*models.Product, error) {
	if businessID == 0 {
		return nil, errors.New("business context required")
	}
	if id == 0 {
		return nil, errors.New("invalid product id")
	}

	if price < 0 {
		return nil, errors.New("price cannot be negative")
	}

	product, err := s.Repo.GetByID(businessID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("product not found")
		}
		return nil, err
	}

	product.ProductName = productName
	product.Description = description
	product.Price = price

	err = s.Repo.UpdateProduct(product)
	if err != nil {
		return nil, err
	}

	return product, nil
}

// ArchiveProduct soft-deletes the product for this business (row kept for invoice line integrity).
func (s *ProductService) ArchiveProduct(businessID, productID uint) error {
	if businessID == 0 {
		return errors.New("business context required")
	}
	if productID == 0 {
		return apperrors.NewValidation(map[string]string{"id": "is required"})
	}
	err := s.Repo.SoftDeleteProduct(businessID, productID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.ErrProductNotFound
		}
		return err
	}
	return nil
}
