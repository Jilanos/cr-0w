package main

// The butler launcher (item_176, req_032): one `claude -p` stream-json process per
// conversation, on the account the owner picked (its cdx profile home), in an empty
// folder outside every repo, with the core MCP server as its only tools.

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"crow-core/internal/butler"
	"crow-core/internal/config"
)

//go:embed internal/butler/persona.md
var butlerPersona []byte

var accountName = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,31}$`)

// butlerManager builds the manager, or nil (logged) when claude or the cdx profiles are
// missing: the rest of the core serves without the butler.
func butlerManager(cfg config.Config) (*butler.Manager, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	claude := os.Getenv("CROW_CLAUDE")
	if claude == "" {
		if p, err := exec.LookPath("claude"); err == nil {
			claude = p
		} else {
			claude = filepath.Join(home, ".local", "bin", "claude")
		}
	}
	if _, err := os.Stat(claude); err != nil {
		return nil, fmt.Errorf("claude not found (set CROW_CLAUDE): %w", err)
	}
	profiles := os.Getenv("CROW_CDX_PROFILES")
	if profiles == "" {
		profiles = filepath.Join(home, ".cdx", "profiles")
	}
	self, err := os.Executable()
	if err != nil {
		return nil, err
	}
	state := filepath.Join(cfg.Home, "local", "state", "butler")
	// The work folder sits outside every repo so no CLAUDE.md, settings or hooks load.
	cwd := filepath.Join(home, ".local", "state", "crow-butler")
	for _, d := range []string{state, cwd} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return nil, err
		}
	}
	persona := filepath.Join(state, "persona.md")
	if err := os.WriteFile(persona, butlerPersona, 0o600); err != nil {
		return nil, err
	}
	mcp, _ := json.Marshal(map[string]any{"mcpServers": map[string]any{"core": map[string]any{
		"command": self, "args": []string{"mcp"},
		"env": map[string]string{"CROW_HOME": cfg.Home, "CROW_ENGINE": cfg.Engine},
	}}})
	mcpFile := filepath.Join(state, "core-mcp.json")
	if err := os.WriteFile(mcpFile, mcp, 0o600); err != nil {
		return nil, err
	}
	model := os.Getenv("CROW_BUTLER_MODEL")
	if model == "" {
		model = "sonnet"
	}
	launch := func(account, resume string) (*exec.Cmd, error) {
		if !accountName.MatchString(account) {
			return nil, fmt.Errorf("account %q: bad name", account)
		}
		profile := filepath.Join(profiles, account, "claude-home")
		if _, err := os.Stat(profile); err != nil {
			return nil, fmt.Errorf("no cdx profile for account %s", account)
		}
		args := butlerArgs(claude, profile, model, mcpFile, persona, resume)
		cmd := exec.Command("env", args...)
		cmd.Dir = cwd
		return cmd, nil
	}
	pick := func() (string, error) {
		out, err := exec.Command(filepath.Join(cfg.Engine, "bin", "crow-accounts"), "pick", "--on-busy", "fail").Output()
		lines := strings.Fields(strings.TrimSpace(string(out)))
		if err != nil || len(lines) == 0 {
			var ee *exec.ExitError
			if errors.As(err, &ee) && len(ee.Stderr) > 0 {
				return "", errors.New(strings.TrimSpace(string(ee.Stderr)))
			}
			return "", fmt.Errorf("crow-accounts pick: %v", err)
		}
		return lines[len(lines)-1], nil
	}
	return butler.New(butler.Options{Dir: state, Launch: launch, Pick: pick}), nil
}

// butlerArgs is the `env` command line: the account's profile as HOME (so the account
// shows in the launch args, AC7), then claude with only the core tools (AC5).
func butlerArgs(claude, profile, model, mcpFile, persona, resume string) []string {
	args := []string{
		"-u", "CLAUDE_CONFIG_DIR", "-u", "CLAUDE_CODE_OAUTH_TOKEN", "-u", "ANTHROPIC_API_KEY",
		"HOME=" + profile, "CLAUDE_CODE_DISABLE_AUTO_MEMORY=1",
		claude, "-p",
		"--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
		"--model", model,
		"--tools", "",
		"--strict-mcp-config", "--mcp-config", mcpFile,
		"--allowedTools", butler.ToolPrefix + "*",
		"--permission-mode", "dontAsk",
		"--setting-sources", "project",
		"--disable-slash-commands",
		"--system-prompt-file", persona,
	}
	if resume != "" {
		args = append(args, "--resume", resume)
	}
	return args
}
