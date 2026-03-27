package services

import (
	"errors"
	"invoiceSys/repository"
	"invoiceSys/models"
	"strings"
)

type ProductService struct {
	Repo *repository.ProductRepo
}

func (s *ProductService) CreateProduct(productName, description string, price float64) (*models.Product, error) {
	productName = strings.TrimSpace(productName)
	description = strings.TrimSpace(description)

	if productName == "" {
		return nil, errors.New("product name is required")
	}
	if description == "" {
		return nil, errors.New("description is required")
	}
	if price <= 0 {
		return nil, errors.New("price must be greater than 0")
	}

	product := &models.Product{
		ProductName: productName,
		Description: description,
		Price:       price,
	}

	if err := s.Repo.CreateProduct(product); err != nil {
		return nil, err
	}

	return product, nil
}

func (s *ProductService) UpdateProduct(id uint, productName, description string, price float64) (*models.Product, error) {
	productName = strings.TrimSpace(productName)
	description = strings.TrimSpace(description)

	if productName == "" {
		return nil, errors.New("product name is required")
	}
	if description == "" {
		return nil, errors.New("description is required")
	}
	if price <= 0 {
		return nil, errors.New("price must be greater than 0")
	}

	existing, err := s.Repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	existing.ProductName = productName
	existing.Description = description
	existing.Price = price

	if err := s.Repo.UpdateProduct(existing); err != nil {
		return nil, err
	}

	return existing, nil
}

func (s *ProductService) GetProduct(id uint) (*models.Product, error) {
	return s.Repo.GetByID(id)
}