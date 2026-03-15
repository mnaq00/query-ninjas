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
	//connect to database
	err := godotenv.Load()
	if err != nil {
		log.Println("no .env file found")
	}
	connStr := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_PORT"),
	)

	DB, err = gorm.Open(postgres.Open(connStr), &gorm.Config{})
	if err != nil {
		panic(err)
	}

	//migrate the schema
	err = DB.AutoMigrate(models.User{}, &models.Business{})
	if err != nil {
		log.Fatal("failed to migrate schema", err)
	}

	fmt.Println("connected to database successfully!")
}
