package services

import (
	"errors"
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

	b.BusinessName = data.BusinessName
	b.Address = data.Address
	b.Phone = data.Phone
	b.Email = data.Email

	err = s.Repo.Update(b)
	if err != nil {
		return nil, err
	}

	return b, nil
}

func (s *BusinessService) CreateBusinessProfile(req *models.Business) error {

	// Check if business already exists
	_, err := s.Repo.GetBusinessProfile(req.ID)
	if err == nil {
		return errors.New("business already exists")
	}

	//Check if business name or email is empty
	if req.BusinessName == "" {
		return errors.New("business name is required")
	}

	if req.Email == "" {
		return errors.New("business email is required")
	}

	//Save business profile to database
	err = s.Repo.CreateBusinessProfile(req)
	if err != nil {
		return err
	}
	return nil
}

//function to get business profile

func (s *BusinessService) GetBusinessProfile(id uint) (*models.Business, error) {
	profile, err := s.Repo.GetBusinessProfile(id)
	if err != nil {
		return nil, err
	}
	return profile, nil
}

//function to update business profile

func (s *BusinessService) UpdateBusinessProfile(req *models.Business) error {

	// Check if business profile exists
	_, err := s.Repo.GetBusinessProfile(req.ID)
	if err != nil {
		return errors.New("business profile not found")
	}

	//Check if business name or email is empty
	if req.BusinessName == "" {
		return errors.New("business name is required")
	}

	if req.Email == "" {
		return errors.New("business email is required")
	}

	//Save business profile to database
	err = s.Repo.UpdateBusinessProfile(req)
	if err != nil {
		return err
	}
	return nil
}
