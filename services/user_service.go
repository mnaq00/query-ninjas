package services

import (
	"errors"
	"invoiceSys/middleware"
	"invoiceSys/models"
	"invoiceSys/repository"
	"invoiceSys/utils"
)

type UserService struct {
	Repo repository.UserRepository
}

// RegisterUser creates the user and returns a JWT so the client can authenticate immediately.
func (s *UserService) RegisterUser(req *models.User) (token string, err error) {

	// Check if user already exists
	_, err = s.Repo.GetUserByUsername(req.Username)
	if err == nil {
		return "", errors.New("user already exists")
	}

	// Hash password
	hashedPass, err := utils.HashPassword(req.Password)
	if err != nil {
		return "", err
	}

	req.Password = hashedPass

	// Save user to DB (populates req.ID)
	err = s.Repo.CreateUser(req)
	if err != nil {
		return "", err
	}

	token, err = middleware.GenerateJWT(req.ID)
	if err != nil {
		return "", err
	}

	return token, nil
}

func (s *UserService) Login(req *models.User) (string, error) {

	// Check if user exists
	user, err := s.Repo.GetUserByUsername(req.Username)
	if err != nil {
		return "", err
	}

	// Compare password
	err = utils.ComparePassword(user.Password, req.Password)
	if err != nil {
		return "", errors.New("invalid username or password")
	}

	// Generate JWT token
	token, err := middleware.GenerateJWT(user.ID)
	if err != nil {
		return "", err
	}

	return token, nil
}