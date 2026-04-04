package db

import (
	"fmt"
	"invoiceSys/models"
	"log"
	"os"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDb() {
	err := godotenv.Load()
	fmt.Println("DB_HOST:", os.Getenv("DB_HOST"))
	fmt.Println("DB_USER:", os.Getenv("DB_USER"))
	fmt.Println("DB_NAME:", os.Getenv("DB_NAME"))
	fmt.Println("DB_PORT:", os.Getenv("DB_PORT"))
	if err != nil {
		log.Fatal("Error loading .env file")
	}

connStr := fmt.Sprintf(
    "postgresql://%s:%s@%s:%s/%s?sslmode=disable",
    os.Getenv("DB_USER"),
    os.Getenv("DB_PASSWORD"),
    os.Getenv("DB_HOST"),
    os.Getenv("DB_PORT"),
    os.Getenv("DB_NAME"),
)
	DB, err = gorm.Open(postgres.Open(connStr), &gorm.Config{})
	if err != nil {
		panic(err)
	}

	// Check which database we're actually connected to
	var dbName string
	DB.Raw("SELECT current_database()").Scan(&dbName)
	fmt.Println("Actually connected to database:", dbName)

	if err := migrateDropLegacyClientEmailUnique(DB); err != nil {
		log.Printf("drop legacy client email unique: %v", err)
	}

	//migrate the schema
	err = DB.AutoMigrate(&models.User{}, &models.UserBusiness{}, &models.Business{}, &models.Invoice{}, &models.Client{}, &models.Product{}, &models.InvoiceItem{})
	if err != nil {
		fmt.Println("Migration error:", err)
		log.Fatal("Failed to migrate schema", err)
	} else {
		fmt.Println("Tables migrated successfully!")
	}

	if err := migrateProductClientBusinessID(DB); err != nil {
		log.Printf("product/client business_id backfill: %v", err)
	}

	if err := migrateUserBusinessMembershipDefaults(DB); err != nil {
		log.Printf("user_businesses default links: %v", err)
	}

	if err := migrateLegacyInvoiceStatusColumns(DB); err != nil {
		log.Printf("legacy invoice status migration: %v", err)
	}

	if err := migrateInvoiceBusinessID(DB); err != nil {
		log.Printf("invoice business_id backfill: %v", err)
	}

	if err := migrateInvoiceBillingSnapshot(DB); err != nil {
		log.Printf("invoice billing snapshot backfill: %v", err)
	}

	fmt.Println("Connected to database successfully!")
}

// migrateDropLegacyClientEmailUnique removes the old global-unique on email so (business_id, email) can apply.
func migrateDropLegacyClientEmailUnique(db *gorm.DB) error {
	if !db.Migrator().HasTable("clients") {
		return nil
	}
	return db.Exec(`
		ALTER TABLE clients DROP CONSTRAINT IF EXISTS uni_clients_email
	`).Error
}

// migrateProductClientBusinessID assigns legacy catalog rows to business 1.
func migrateProductClientBusinessID(db *gorm.DB) error {
	if err := db.Exec(`
		UPDATE products SET business_id = 1 WHERE business_id IS NULL OR business_id = 0
	`).Error; err != nil {
		return err
	}
	return db.Exec(`
		UPDATE clients SET business_id = 1 WHERE business_id IS NULL OR business_id = 0
	`).Error
}

// migrateUserBusinessMembershipDefaults links every user to business 1 if they have no membership (legacy single-tenant).
func migrateUserBusinessMembershipDefaults(db *gorm.DB) error {
	return db.Exec(`
		INSERT INTO user_businesses (user_id, business_id)
		SELECT u.id, 1 FROM users u
		WHERE NOT EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.user_id = u.id)
	`).Error
}

// migrateLegacyInvoiceStatusColumns maps rows that still use the old combined customer_payment_status
// (draft / sent/downloaded) into invoice_status + unpaid/paid/overdue. Safe to run repeatedly on new data.
func migrateLegacyInvoiceStatusColumns(db *gorm.DB) error {
	return db.Exec(`
		UPDATE invoices
		SET
			invoice_status = CASE LOWER(TRIM(customer_payment_status))
				WHEN 'draft' THEN 'draft'
				WHEN 'sent/downloaded' THEN 'sent/downloaded'
				ELSE invoice_status
			END,
			customer_payment_status = CASE LOWER(TRIM(customer_payment_status))
				WHEN 'paid' THEN 'paid'
				WHEN 'overdue' THEN 'overdue'
				WHEN 'draft' THEN 'unpaid'
				WHEN 'sent/downloaded' THEN 'unpaid'
				ELSE customer_payment_status
			END
		WHERE LOWER(TRIM(customer_payment_status)) IN ('draft', 'sent/downloaded')
	`).Error
}

// migrateInvoiceBusinessID sets business_id = 1 for legacy rows with no business (idempotent).
func migrateInvoiceBusinessID(db *gorm.DB) error {
	return db.Exec(`
		UPDATE invoices
		SET business_id = 1
		WHERE business_id IS NULL OR business_id = 0
	`).Error
}

// migrateInvoiceBillingSnapshot copies current client email/address onto invoices missing a snapshot.
func migrateInvoiceBillingSnapshot(db *gorm.DB) error {
	return db.Exec(`
		UPDATE invoices AS i
		SET
			billing_email = c.email,
			billing_address = c.billing_address
		FROM clients AS c
		WHERE i.client_id = c.id
		  AND (i.billing_email IS NULL OR TRIM(i.billing_email) = '')
	`).Error
}