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

func (s *ClientService) ListClients(businessID uint) ([]models.Client, error) {
	if businessID == 0 {
		return nil, errors.New("business context required")
	}
	return s.Repo.ListClientsByBusinessID(businessID)
}

// GetClient returns one client for the tenant or ErrClientNotFound.
func (s *ClientService) GetClient(businessID, clientID uint) (*models.Client, error) {
	if businessID == 0 {
		return nil, errors.New("business context required")
	}
	if clientID == 0 {
		return nil, apperrors.NewValidation(map[string]string{"id": "is required"})
	}
	c, err := s.Repo.GetClientByID(businessID, clientID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.ErrClientNotFound
		}
		return nil, err
	}
	return c, nil
}

func (s *ClientService) AddClient(businessID uint, name, email, billingAddress string) (*models.Client, error) {
	if businessID == 0 {
		return nil, errors.New("business context required")
	}
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

	existing, err := s.Repo.GetClientByEmail(businessID, em)
	if err == nil && existing != nil {
		return nil, apperrors.ErrClientEmailTaken
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	client := &models.Client{
		BusinessID:     businessID,
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

func (s *ClientService) UpdateClient(businessID uint, client *models.Client) (*models.Client, error) {
	if businessID == 0 {
		return nil, errors.New("business context required")
	}
	if client.ID == 0 {
		return nil, apperrors.NewValidation(map[string]string{"id": "is required"})
	}

	_, err := s.Repo.GetClientByID(businessID, client.ID)
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

	other, err := s.Repo.GetClientByEmail(businessID, em)
	if err == nil && other != nil && other.ID != client.ID {
		return nil, apperrors.ErrClientEmailTaken
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	client.Name = n
	client.Email = em
	client.BillingAddress = addr
	client.BusinessID = businessID

	err = s.Repo.UpdateClient(client)
	if err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil, apperrors.ErrClientEmailTaken
		}
		return nil, err
	}

	return client, nil
}

// ArchiveClient soft-deletes the client for this business (row kept for invoice FK integrity).
func (s *ClientService) ArchiveClient(businessID, clientID uint) error {
	if businessID == 0 {
		return errors.New("business context required")
	}
	if clientID == 0 {
		return apperrors.NewValidation(map[string]string{"id": "is required"})
	}
	err := s.Repo.SoftDeleteClient(businessID, clientID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.ErrClientNotFound
		}
		return err
	}
	return nil
}
