package models

// UserBusiness links a user account to a business (tenant) for membership checks and JWT scope.
type UserBusiness struct {
	UserID     uint `gorm:"primaryKey;index" json:"user_id"`
	BusinessID uint `gorm:"primaryKey;index" json:"business_id"`
}

func (UserBusiness) TableName() string {
	return "user_businesses"
}
