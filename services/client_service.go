package services

import (
	"errors"
	"strings"
	"regexp"
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
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`, email)
	if !matched {
		return nil, errors.New("invalid email format")
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
		Name:           name,
		Email:          email,
		BillingAddress: billingAddress,
	}

	err = s.Repo.CreateClient(client)
	if err != nil {
		return nil, err
	}

	return client, nil

}

func (s *ClientService) UpdateClient(client *models.Client) (*models.Client, error) {
	client.Name = strings.TrimSpace(client.Name)
	client.Email = strings.TrimSpace(strings.ToLower(client.Email))
	client.BillingAddress = strings.TrimSpace(client.BillingAddress)

	if client.Name == "" {
		return nil, errors.New("Client name is required")
	}
	if client.Email == "" {
		return nil, errors.New("Client email is required")
	}
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`, client.Email)
	if !matched {
		return nil, errors.New("invalid email format")
	}

	if client.BillingAddress == "" {
		return nil, errors.New("Billing address is required")
	}

	err := s.Repo.UpdateClient(client)
	if err != nil {
		return nil, err
	}

	return client, nil
}
