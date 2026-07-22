package config

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address         string
	Environment     string
	PublicURL       string
	SecretKey       string
	DataDir         string
	ShutdownTimeout time.Duration
}

func Load() (Config, error) {
	loadDotEnv(".env")
	cfg := Config{
		Address:         env("ONIX_ADDRESS", "127.0.0.1:8000"),
		Environment:     env("ONIX_ENV", "development"),
		PublicURL:       env("ONIX_PUBLIC_URL", "http://127.0.0.1:8000"),
		SecretKey:       os.Getenv("ONIX_SECRET_KEY"),
		DataDir:         env("ONIX_DATA_DIR", "data"),
		ShutdownTimeout: duration("ONIX_SHUTDOWN_TIMEOUT", 15*time.Second),
	}
	if len(cfg.SecretKey) < 32 {
		return Config{}, fmt.Errorf("ONIX_SECRET_KEY must contain at least 32 characters")
	}
	if cfg.Environment != "development" && cfg.Environment != "test" && cfg.Environment != "production" {
		return Config{}, fmt.Errorf("unsupported ONIX_ENV %q", cfg.Environment)
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func duration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	if parsed, err := time.ParseDuration(value); err == nil {
		return parsed
	}
	if seconds, err := strconv.Atoi(value); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	return fallback
}

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), "\"'")
		if key != "" {
			_, exists := os.LookupEnv(key)
			if !exists {
				_ = os.Setenv(key, value)
			}
		}
	}
}

