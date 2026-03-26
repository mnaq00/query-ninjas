package services

import (
	"errors"
	"invoiceSys/models"
	"invoiceSys/repository"
	"regexp"
)

type BusinessService struct {
	Repo *repository.BusinessRepo
}

func (s *BusinessService) CreateBusinessProfile(req *models.Business) error {

	// Check if business already exists
	_, err := s.Repo.GetBusinessProfile(req.ID)
	if err == nil {
		return errors.New("Business already exists")
	}

	if req.VATID == "" {
		return errors.New("VAT ID is required")
	}

	//Check if business name or email is empty
	if req.BusinessName == "" {
		return errors.New("Business name is required")
	}

	if req.Email == "" {
		return errors.New("Business email is required")
	}

	// Check email format
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`, req.Email)
	if !matched {
		return errors.New("Invalid email format")
	}

	if req.Phone == "" {
		return errors.New("phone number is required")
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
		return errors.New("Business profile not found")
	}

	//Check if business name or email is empty
	if req.BusinessName == "" {
		return errors.New("Business name is required")
	}

	if req.Email == "" {
		return errors.New("Business email is required")
	}
	// Check email format
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`, req.Email)
	if !matched {
		return errors.New("Invalid email format")
	}

	//Save business profile to database
	err = s.Repo.UpdateBusinessProfile(req)
	if err != nil {
		return err
	}
	return nil
}
