package services

import (
	"errors"

	"invoiceSys/apperrors"
	"invoiceSys/models"
	"invoiceSys/repository"
	"invoiceSys/validate"

	"gorm.io/gorm"
)

type BusinessService struct {
	Repo    *repository.BusinessRepo
	UserBiz *repository.UserBusinessRepo
}

func (s *BusinessService) CreateBusinessProfile(req *models.Business, userID uint) error {
	if req.ID != 0 {
		_, err := s.Repo.GetBusinessProfile(req.ID)
		if err == nil {
			return apperrors.ErrBusinessExists
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
	}

	fields := make(map[string]string)

	bn, errMap := validate.Name(req.BusinessName, validate.MaxBusinessName, "business_name")
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	em, msg := validate.NormalizeEmail(req.Email)
	if msg != "" {
		fields["email"] = msg
	}

	addr, errMap := validate.BusinessAddress(req.Address)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	ph, errMap := validate.Phone(req.Phone)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	vat, errMap := validate.VATID(req.VATID)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	logo, errMap := validate.LogoURL(req.LogoURL)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	if len(fields) > 0 {
		return apperrors.NewValidation(fields)
	}

	req.BusinessName = bn
	req.Email = em
	req.Address = addr
	req.Phone = ph
	req.VATID = vat
	req.LogoURL = logo

	err := s.Repo.CreateBusinessProfile(req)
	if err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return apperrors.ErrBusinessExists
		}
		return err
	}
	if userID != 0 && s.UserBiz != nil {
		if err := s.UserBiz.CreateLink(userID, req.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *BusinessService) GetBusinessProfile(id uint) (*models.Business, error) {
	profile, err := s.Repo.GetBusinessProfile(id)
	if err != nil {
		return nil, err
	}
	return profile, nil
}

func (s *BusinessService) UpdateBusinessProfile(req *models.Business) error {
	if req.ID == 0 {
		return apperrors.NewValidation(map[string]string{"id": "is required"})
	}

	_, err := s.Repo.GetBusinessProfile(req.ID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.ErrBusinessNotFound
		}
		return err
	}

	fields := make(map[string]string)

	bn, errMap := validate.Name(req.BusinessName, validate.MaxBusinessName, "business_name")
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	em, msg := validate.NormalizeEmail(req.Email)
	if msg != "" {
		fields["email"] = msg
	}

	addr, errMap := validate.BusinessAddress(req.Address)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	ph, errMap := validate.Phone(req.Phone)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	vat, errMap := validate.VATID(req.VATID)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	logo, errMap := validate.LogoURL(req.LogoURL)
	if errMap != nil {
		mergeValidation(fields, errMap)
	}

	if len(fields) > 0 {
		return apperrors.NewValidation(fields)
	}

	req.BusinessName = bn
	req.Email = em
	req.Address = addr
	req.Phone = ph
	req.VATID = vat
	req.LogoURL = logo

	err = s.Repo.UpdateBusinessProfile(req)
	if err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return apperrors.ErrBusinessExists
		}
		return err
	}
	return nil
}

// UpdateBusinessProfileForTenant updates the profile for the JWT tenant; ignores a mismatched id in the body.
func (s *BusinessService) UpdateBusinessProfileForTenant(tenantBusinessID uint, req *models.Business) error {
	if tenantBusinessID == 0 {
		return errors.New("business context required")
	}
	if req.ID != 0 && req.ID != tenantBusinessID {
		return errors.New("cannot update another business")
	}
	req.ID = tenantBusinessID
	return s.UpdateBusinessProfile(req)
}
