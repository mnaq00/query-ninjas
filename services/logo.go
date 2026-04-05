package services

import (
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const maxBusinessLogoBytes = 2 * 1024 * 1024

var allowedLogoExtensions = map[string]string{
	".png":  ".png",
	".jpg":  ".jpg",
	".jpeg": ".jpg",
	".gif":  ".gif",
	".webp": ".webp",
}

// LogoUploadDir returns the absolute directory where uploaded logos are stored.
func LogoUploadDir() string {
	d := strings.TrimSpace(os.Getenv("LOGO_UPLOAD_DIR"))
	if d == "" {
		d = filepath.Join("data", "uploads")
	}
	abs, err := filepath.Abs(d)
	if err != nil {
		return d
	}
	return abs
}

// LogoURLForPDF maps stored logo_url to a local filesystem path for gofpdf.
// Accepts public paths like /uploads/business_1/logo.png, legacy absolute paths, or empty.
func LogoURLForPDF(logoURL *string) string {
	if logoURL == nil {
		return ""
	}
	s := strings.TrimSpace(*logoURL)
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return ""
	}
	if strings.HasPrefix(s, "/uploads/") {
		rel := strings.TrimPrefix(s, "/uploads/")
		rel = filepath.FromSlash(rel)
		if strings.Contains(rel, "..") {
			return ""
		}
		return filepath.Join(LogoUploadDir(), rel)
	}
	return s
}

// SaveBusinessLogoFile writes an uploaded image under LogoUploadDir()/business_{id}/ and returns
// the public path stored in business.logo_url (e.g. /uploads/business_1/logo.png).
func SaveBusinessLogoFile(businessID uint, file multipart.File, header *multipart.FileHeader) (publicPath string, err error) {
	if businessID == 0 {
		return "", fmt.Errorf("business id required")
	}
	if header == nil {
		return "", fmt.Errorf("missing file header")
	}
	if header.Size > maxBusinessLogoBytes {
		return "", fmt.Errorf("logo must be 2 MB or smaller")
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == ".jpeg" {
		ext = ".jpg"
	}
	norm, ok := allowedLogoExtensions[ext]
	if !ok {
		ext = extFromContentType(header.Header.Get("Content-Type"))
		norm, ok = allowedLogoExtensions[ext]
	}
	if !ok {
		return "", fmt.Errorf("use PNG, JPEG, GIF, or WebP for the logo")
	}
	dir := filepath.Join(LogoUploadDir(), fmt.Sprintf("business_%d", businessID))
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	filename := "logo" + norm // norm is e.g. .png or .jpg
	fullPath := filepath.Join(dir, filename)
	out, err := os.Create(fullPath)
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		_ = os.Remove(fullPath)
		return "", err
	}
	rel := fmt.Sprintf("business_%d/%s", businessID, filename)
	return "/uploads/" + filepath.ToSlash(rel), nil
}

func extFromContentType(ct string) string {
	mt, _, _ := mime.ParseMediaType(ct)
	switch mt {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ".png"
	}
}

// RemoveBusinessLogoFile removes a previously saved upload if path is under LogoUploadDir.
func RemoveBusinessLogoFile(publicPath *string) {
	if publicPath == nil {
		return
	}
	s := strings.TrimSpace(*publicPath)
	if s == "" || !strings.HasPrefix(s, "/uploads/") {
		return
	}
	fs := LogoURLForPDF(publicPath)
	if fs == "" || strings.Contains(fs, "..") {
		return
	}
	base := LogoUploadDir()
	if !strings.HasPrefix(filepath.Clean(fs), filepath.Clean(base)) {
		return
	}
	_ = os.Remove(fs)
}

// IsMultipartBusinessProfileRequest returns true when the body is multipart (logo file upload).
func IsMultipartBusinessProfileRequest(r *http.Request) bool {
	ct := strings.ToLower(r.Header.Get("Content-Type"))
	return strings.HasPrefix(ct, "multipart/form-data")
}
