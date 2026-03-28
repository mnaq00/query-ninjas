package services

import (
	"errors"
	"invoiceSys/models"
	"invoiceSys/repository"
)

type ProductService struct {
	Repo *repository.ProductRepo
}

func (s *ProductService) CreateProduct(productName string, description string, price float64) (*models.Product, error) {
	if productName == "" {
		return nil, errors.New("product name is required")
	}
	if price < 0 {
		return nil, errors.New("price cannot be negative")
	}

	product := &models.Product{
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

func (s *ProductService) GetProduct(id uint) (*models.Product, error) {
	if id == 0 {
		return nil, errors.New("invalid product id")
	}

	product, err := s.Repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	return product, nil
}

func (s *ProductService) UpdateProduct(id uint, productName string, description string, price float64) (*models.Product, error) {
	if id == 0 {
		return nil, errors.New("invalid product id")
	}

	if price < 0 {
		return nil, errors.New("price cannot be negative")
	}

	product, err := s.Repo.GetByID(id)
	if err != nil {
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