package onix

import "embed"

// Frontend contains the audited legacy-compatible UI. Keeping the exact
// assets embedded in the Go binary preserves the current layout and behavior.
//
//go:embed public/onix
var Frontend embed.FS

