package services

import (
	"errors"

	"invoiceSys/apperrors"
	"invoiceSys/models"
	"invoiceSys/repository"
	"invoiceSys/validate"

	"gorm.io/gorm"
)

type ClientService struct {
	Repo *repository.ClientRepo
}

func mergeValidation(fields map[string]string, more map[string]string) {
	for k, v := range more {
		fields[k] = v
	}
}

func (s *ClientService) AddClient(name, email, billingAddress string) (*models.Client, error) {
	fields := make(map[string]string)

	n, errMap := validate.Name(name, validate.MaxClientName, "name")
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	em, msg := validate.NormalizeEmail(email)
	if msg != "" {
		fields["email"] = msg
	}

	addr, errMap := validate.BillingAddress(billingAddress)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	if len(fields) > 0 {
		return nil, apperrors.NewValidation(fields)
	}

	existing, err := s.Repo.GetClientByEmail(em)
	if err == nil && existing != nil {
		return nil, apperrors.ErrClientEmailTaken
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	client := &models.Client{
		Name:           n,
		Email:          em,
		BillingAddress: addr,
	}

	err = s.Repo.CreateClient(client)
	if err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil, apperrors.ErrClientEmailTaken
		}
		return nil, err
	}

	return client, nil
}

func (s *ClientService) UpdateClient(client *models.Client) (*models.Client, error) {
	if client.ID == 0 {
		return nil, apperrors.NewValidation(map[string]string{"id": "is required"})
	}

	_, err := s.Repo.GetClientByID(client.ID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrClientNotFound
		}
		return nil, err
	}

	fields := make(map[string]string)

	n, errMap := validate.Name(client.Name, validate.MaxClientName, "name")
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	em, msg := validate.NormalizeEmail(client.Email)
	if msg != "" {
		fields["email"] = msg
	}

	addr, errMap := validate.BillingAddress(client.BillingAddress)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	if len(fields) > 0 {
		return nil, apperrors.NewValidation(fields)
	}

	other, err := s.Repo.GetClientByEmail(em)
	if err == nil && other != nil && other.ID != client.ID {
		return nil, apperrors.ErrClientEmailTaken
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	client.Name = n
	client.Email = em
	client.BillingAddress = addr

	err = s.Repo.UpdateClient(client)
	if err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil, apperrors.ErrClientEmailTaken
		}
		return nil, err
	}

	return client, nil
}
