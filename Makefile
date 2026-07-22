.PHONY: build test run check

build:
	go build -trimpath -o bin/onix ./cmd/onix

test:
	go test ./...

run:
	go run ./cmd/onix

check:
	go test -race ./...
	go vet ./...

