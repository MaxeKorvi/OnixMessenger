package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/onix-messenger/onix-go/internal/config"
	"github.com/onix-messenger/onix-go/internal/httpserver"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := config.Load()
	if err != nil {
		log.Error("configuration error", "error", err)
		os.Exit(2)
	}
	for _, directory := range []string{cfg.DataDir, filepath.Join(cfg.DataDir, "uploads"), filepath.Join(cfg.DataDir, "avatars"), filepath.Join(cfg.DataDir, "voice"), filepath.Join(cfg.DataDir, "backups")} {
		if err := os.MkdirAll(directory, 0o750); err != nil {
			log.Error("cannot create data directory", "path", directory, "error", err)
			os.Exit(2)
		}
	}
	app, err := httpserver.New(cfg, log)
	if err != nil {
		log.Error("cannot initialize server", "error", err)
		os.Exit(2)
	}
	httpServer := &http.Server{
		Addr:              cfg.Address,
		Handler:           app.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		log.Info("Onix Messenger Go started", "address", cfg.Address, "env", cfg.Environment)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server stopped unexpectedly", "error", err)
			stop()
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Error("graceful shutdown failed", "error", err)
		_ = httpServer.Close()
	}
	log.Info("Onix Messenger Go stopped")
}

