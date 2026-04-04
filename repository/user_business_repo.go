package repository

import (
	"errors"

	"invoiceSys/db"
	"invoiceSys/models"

	"gorm.io/gorm"
)

type UserBusinessRepo struct{}

func (r *UserBusinessRepo) CreateLink(userID, businessID uint) error {
	if userID == 0 || businessID == 0 {
		return errors.New("invalid user or business id")
	}
	ub := models.UserBusiness{UserID: userID, BusinessID: businessID}
	return db.DB.Where("user_id = ? AND business_id = ?", userID, businessID).FirstOrCreate(&ub).Error
}

// GetFirstBusinessIDForUser returns the lowest business_id the user belongs to, or 0 if none.
func (r *UserBusinessRepo) GetFirstBusinessIDForUser(userID uint) (uint, error) {
	if userID == 0 {
		return 0, nil
	}
	var ub models.UserBusiness
	err := db.DB.Where("user_id = ?", userID).Order("business_id ASC").First(&ub).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return ub.BusinessID, nil
}

func (r *UserBusinessRepo) UserBelongsToBusiness(userID, businessID uint) bool {
	if userID == 0 || businessID == 0 {
		return false
	}
	var n int64
	db.DB.Model(&models.UserBusiness{}).
		Where("user_id = ? AND business_id = ?", userID, businessID).
		Count(&n)
	return n > 0
}
