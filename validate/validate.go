package validate

import (
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	MaxClientName       = 255
	MaxEmail            = 254
	MaxBillingAddress   = 2000
	MaxBusinessName     = 255
	MaxBusinessAddress  = 2000
	MaxPhone            = 40
	MaxVAT              = 20
	MaxLogoURL          = 512
	minPhoneDigits      = 10
	maxPhoneDigits      = 15
)

var vatPattern = regexp.MustCompile(`(?i)^[A-Z0-9][A-Z0-9\-]{3,18}$`)

// NormalizeEmail trims, lowercases the address part, and validates with net/mail.
func NormalizeEmail(raw string) (string, string) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", "is required"
	}
	if utf8.RuneCountInString(s) > MaxEmail {
		return "", "is too long"
	}
	addr, err := mail.ParseAddress(s)
	if err != nil {
		return "", "invalid format"
	}
	em := strings.TrimSpace(strings.ToLower(addr.Address))
	if em == "" || !strings.Contains(em, "@") {
		return "", "invalid format"
	}
	return em, ""
}

// Name checks client or business name.
func Name(raw string, max int, field string) (string, map[string]string) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", map[string]string{field: "is required"}
	}
	if utf8.RuneCountInString(s) > max {
		return "", map[string]string{field: "is too long"}
	}
	return s, nil
}

// BillingAddress trims, strips risky control characters, enforces max length.
func BillingAddress(raw string) (string, map[string]string) {
	s := SanitizeMultiline(strings.TrimSpace(raw))
	if s == "" {
		return "", map[string]string{"billing_address": "is required"}
	}
	if utf8.RuneCountInString(s) > MaxBillingAddress {
		return "", map[string]string{"billing_address": "is too long"}
	}
	return s, nil
}

// BusinessAddress is required for business profile; same rules as billing address.
func BusinessAddress(raw string) (string, map[string]string) {
	s := SanitizeMultiline(strings.TrimSpace(raw))
	if s == "" {
		return "", map[string]string{"address": "is required"}
	}
	if utf8.RuneCountInString(s) > MaxBusinessAddress {
		return "", map[string]string{"address": "is too long"}
	}
	return s, nil
}

// SanitizeMultiline allows newlines and tabs; drops other control characters.
func SanitizeMultiline(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	var b strings.Builder
	for _, r := range s {
		if r == '\n' || r == '\t' || !unicode.IsControl(r) {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

// Phone requires a plausible digit count (international-friendly).
func Phone(raw string) (string, map[string]string) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", map[string]string{"phone": "is required"}
	}
	if utf8.RuneCountInString(s) > MaxPhone {
		return "", map[string]string{"phone": "is too long"}
	}
	digits := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			digits++
		}
	}
	if digits < minPhoneDigits || digits > maxPhoneDigits {
		return "", map[string]string{"phone": "must contain between 10 and 15 digits"}
	}
	return s, nil
}

// VATID is required for create; alphanumeric / hyphen, typical VAT lengths.
func VATID(raw string) (string, map[string]string) {
	s := strings.TrimSpace(raw)
	s = strings.ReplaceAll(s, " ", "")
	if s == "" {
		return "", map[string]string{"vat_id": "is required"}
	}
	if utf8.RuneCountInString(s) > MaxVAT {
		return "", map[string]string{"vat_id": "is too long"}
	}
	if !vatPattern.MatchString(s) {
		return "", map[string]string{"vat_id": "invalid format"}
	}
	return s, nil
}

// LogoURL normalizes empty pointer to nil; validates http(s) and length when set.
func LogoURL(p *string) (*string, map[string]string) {
	if p == nil {
		return nil, nil
	}
	s := strings.TrimSpace(*p)
	if s == "" {
		return nil, nil
	}
	if len(s) > MaxLogoURL {
		return nil, map[string]string{"logo_url": "is too long"}
	}
	u, err := url.Parse(s)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil, map[string]string{"logo_url": "must be a valid http or https URL"}
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, map[string]string{"logo_url": "must use http or https"}
	}
	out := s
	return &out, nil
}
