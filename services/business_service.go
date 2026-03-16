package services

import (
	"invoiceSys/models"
	"invoiceSys/repository"
)

type BusinessService struct {
	Repo *repository.BusinessRepo
}

func (s *BusinessService) UpdateBusiness(id uint, data *models.Business) (*models.Business, error) {

	b, err := s.Repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	b.Name = data.Name
	b.Address = data.Address
	b.Phone = data.Phone
	b.Email = data.Email

	err = s.Repo.Update(b)
	if err != nil {
		return nil, err
	}

	return b, nil
}