package services

import (
	"errors"
	"invoiceSys/middleware"
	"invoiceSys/models"
	"invoiceSys/repository"
	"invoiceSys/utils"
)

type UserService struct {
	Repo    repository.UserRepository
	UserBiz *repository.UserBusinessRepo
}

// LoginResponse is returned from Login for JSON encoding (token + active tenant).
type LoginResponse struct {
	Token      string `json:"token"`
	BusinessID uint   `json:"business_id"`
}

func (s *UserService) RegisterUser(req *models.User) error {

	// Check if user already exists
	_, err := s.Repo.GetUserByUsername(req.Username)
	if err == nil {
		return errors.New("user already exists")
	}

	// Hash password
	hashedPass, err := utils.HashPassword(req.Password)
	if err != nil {
		return err
	}

	req.Password = hashedPass

	// Save user to DB (populates req.ID)
	err = s.Repo.CreateUser(req)
	if err != nil {
		return err
	}

	return nil
}

func (s *UserService) Login(req *models.User) (*LoginResponse, error) {

	// Check if user exists
	user, err := s.Repo.GetUserByUsername(req.Username)
	if err != nil {
		return nil, err
	}

	// Compare password
	err = utils.ComparePassword(user.Password, req.Password)
	if err != nil {
		return nil, errors.New("invalid username or password")
	}

	var businessID uint
	if s.UserBiz != nil {
		businessID, err = s.UserBiz.GetFirstBusinessIDForUser(user.ID)
		if err != nil {
			return nil, err
		}
	}

	token, err := middleware.GenerateJWT(user.ID, businessID)
	if err != nil {
		return nil, err
	}

	return &LoginResponse{Token: token, BusinessID: businessID}, nil
}