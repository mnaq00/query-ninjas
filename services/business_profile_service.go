package services

import (
	"errors"
	"invoiceSys/models"
	"invoiceSys/repository"
)

type BusinessService struct {
	Repo repository.BusinessProfileRepository
}

// function to create a new business profile
func (s *BusinessService) CreateBusinessProfile(req *models.BusinessProfile) error {

	//Check if business name or email is empty
	if req.BusinessName == "" {
		return errors.New("business name is required")
	}

	if req.Email == "" {
		return errors.New("business email is required")
	}

	err := s.Repo.CreateBusinessProfile(req)
	if err != nil {
		return err
	}
	return nil
}

// function to get business profile
func (s *BusinessService) GetBusinessProfile(id uint) (*models.BusinessProfile, error) {
	profile, err := s.Repo.GetBusinessProfile(id)
	if err != nil {
		return nil, err
	}
	return profile, nil
}

// function to update business profile
func (s *BusinessService) UpdateBusinessProfile(req *models.BusinessProfile) error {

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
