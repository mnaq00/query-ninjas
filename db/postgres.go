package db

import (
	"errors"
	"fmt"
	"invoiceSys/models"
	"log"
	"net"
	"net/url"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDb() {
	loadDotEnvLocalOnly()
	switch postgresDSNSource() {
	case "DATABASE_URL":
		fmt.Println("database: using DATABASE_URL")
	case "POSTGRES_URL":
		fmt.Println("database: using POSTGRES_URL")
	case "PG*":
		fmt.Println("database: using PGHOST / PGUSER / PGDATABASE (libpq-style env)")
	default:
		fmt.Println("DB_HOST:", os.Getenv("DB_HOST"))
		fmt.Println("DB_USER:", os.Getenv("DB_USER"))
		fmt.Println("DB_NAME:", os.Getenv("DB_NAME"))
		fmt.Println("DB_PORT:", os.Getenv("DB_PORT"))
	}
	fmt.Println("DB_SSLMODE:", postgresSSLMode())

	dsn, dsnErr := postgresDSN()
	if dsnErr != nil {
		log.Fatal(dsnErr)
	}
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		panic(err)
	}

	var dbName string
	DB.Raw("SELECT current_database()").Scan(&dbName)
	fmt.Println("Actually connected to database:", dbName)

	if err := migrateDropLegacyClientEmailUnique(DB); err != nil {
		log.Printf("drop legacy client email unique: %v", err)
	}

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

func loadDotEnvLocalOnly() {
	if strings.TrimSpace(os.Getenv("RENDER")) == "true" {
		return
	}
	if err := godotenv.Load(); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return
		}
		log.Printf("warning: could not load .env: %v", err)
	}
}

func postgresDSNSource() string {
	switch {
	case strings.TrimSpace(os.Getenv("DATABASE_URL")) != "":
		return "DATABASE_URL"
	case strings.TrimSpace(os.Getenv("POSTGRES_URL")) != "":
		return "POSTGRES_URL"
	case strings.TrimSpace(os.Getenv("PGHOST")) != "" && strings.TrimSpace(os.Getenv("PGUSER")) != "" && strings.TrimSpace(os.Getenv("PGDATABASE")) != "":
		return "PG*"
	default:
		return ""
	}
}

func postgresDSN() (string, error) {
	sslMode := postgresSSLMode()
	if raw := strings.TrimSpace(os.Getenv("DATABASE_URL")); raw != "" {
		return ensureSSLModeInDSN(raw, sslMode)
	}
	if raw := strings.TrimSpace(os.Getenv("POSTGRES_URL")); raw != "" {
		return ensureSSLModeInDSN(raw, sslMode)
	}
	if dsn, ok := dsnFromLibpqEnv(sslMode); ok {
		return dsn, nil
	}
	return dsnFromDiscreteEnv(sslMode)
}

func dsnFromLibpqEnv(sslMode string) (string, bool) {
	host := strings.TrimSpace(os.Getenv("PGHOST"))
	user := strings.TrimSpace(os.Getenv("PGUSER"))
	name := strings.TrimSpace(os.Getenv("PGDATABASE"))
	port := strings.TrimSpace(os.Getenv("PGPORT"))
	if port == "" {
		port = "5432"
	}
	pass := os.Getenv("PGPASSWORD")
	if host == "" || user == "" || name == "" {
		return "", false
	}
	u := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(user, pass),
		Host:   net.JoinHostPort(host, port),
		Path:   "/" + name,
	}
	q := url.Values{}
	q.Set("sslmode", sslMode)
	u.RawQuery = q.Encode()
	return u.String(), true
}

func ensureSSLModeInDSN(dsn, sslMode string) (string, error) {
	u, err := url.Parse(dsn)
	if err != nil {
		return "", fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	q := u.Query()
	if q.Get("sslmode") == "" && sslMode != "" {
		q.Set("sslmode", sslMode)
		u.RawQuery = q.Encode()
	}
	return u.String(), nil
}

func dsnFromDiscreteEnv(sslMode string) (string, error) {
	host := strings.TrimSpace(os.Getenv("DB_HOST"))
	user := strings.TrimSpace(os.Getenv("DB_USER"))
	name := strings.TrimSpace(os.Getenv("DB_NAME"))
	port := strings.TrimSpace(os.Getenv("DB_PORT"))
	if port == "" {
		port = "5432"
	}
	pass := os.Getenv("DB_PASSWORD")

	if host == "" || user == "" || name == "" {
		return "", fmt.Errorf(`database not configured — set DATABASE_URL (link Postgres on the Web Service) or DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT`)
	}

	u := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(user, pass),
		Host:   net.JoinHostPort(host, port),
		Path:   "/" + name,
	}
	q := url.Values{}
	q.Set("sslmode", sslMode)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func postgresSSLMode() string {
	if v := strings.TrimSpace(os.Getenv("DB_SSLMODE")); v != "" {
		return v
	}
	if os.Getenv("RENDER") == "true" {
		return "require"
	}
	return "disable"
}

func migrateDropLegacyClientEmailUnique(db *gorm.DB) error {
	if !db.Migrator().HasTable("clients") {
		return nil
	}
	return db.Exec(`
		ALTER TABLE clients DROP CONSTRAINT IF EXISTS uni_clients_email
	`).Error
}

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

func migrateUserBusinessMembershipDefaults(db *gorm.DB) error {
	return db.Exec(`
		INSERT INTO user_businesses (user_id, business_id)
		SELECT u.id, 1 FROM users u
		WHERE NOT EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.user_id = u.id)
	`).Error
}

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

func migrateInvoiceBusinessID(db *gorm.DB) error {
	return db.Exec(`
		UPDATE invoices
		SET business_id = 1
		WHERE business_id IS NULL OR business_id = 0
	`).Error
}

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
