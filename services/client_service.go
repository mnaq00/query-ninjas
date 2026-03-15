package services

import (
	"errors"
	"strings"

	"invoiceSys/models"
	"invoiceSys/repository"

	"gorm.io/gorm"
)

type ClientService struct {
	Repo *repository.ClientRepo
}

func (s *ClientService) AddClient(name, email, billingAddress string) (*models.Client, error) {
	name = strings.TrimSpace(name)
	email = strings.TrimSpace(strings.ToLower(email))
	billingAddress = strings.TrimSpace(billingAddress)

	if name == "" {
		return nil, errors.New("Client name is required")
	}
	if email == "" {
		return nil, errors.New("Client email is required")
	}
	if billingAddress == "" {
        return nil, errors.New("Billing Address is required")
	}
	_, err := s.Repo.GetClientByEmail(email)
	if err == nil {
		return nil, errors.New("Client with this email already exists!")
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	client := &models.Client{
		Name:          name,
		Email:         email,
		BillingAddress: billingAddress,
	}

	err = s.Repo.CreateClient(client)
	if err != nil {
		return nil, err
	}

	return client, nil

}