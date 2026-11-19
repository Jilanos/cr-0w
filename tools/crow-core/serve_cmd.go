package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"crow-core/internal/api"
	"crow-core/internal/config"
	"crow-core/internal/mission"
)

// unitName is the systemd user unit `crow core install` writes.
const unitName = "crow-core.service"

// serve runs the HTTP service until SIGINT or SIGTERM: the TCP listener tailscale
// serve proxies to, and the unix socket for local clients.
func serve(env mission.Env, cfg config.Config, stdout io.Writer) error {
	owner := ownerLogin(cfg.Serve.Owner)
	bm, err := butlerManager(cfg)
	if err != nil {
		log.Printf("butler disabled: %v", err)
	} else {
		defer bm.Close()
	}
	srv := api.New(api.Options{
		Butler:    bm,
		Env:       env,
		Owner:     owner,
		Nest:      cfg.Serve.Nest,
		Sources:   sources(cfg),
		Script:    scriptRunner(cfg.Engine),
		ActionLog: filepath.Join(filepath.Dir(env.Store.Root()), api.ActionLogName),
	})
	tcp, err := net.Listen("tcp", cfg.Serve.Listen)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(cfg.Serve.Socket), 0o700); err != nil {
		return err
	}
	if err := os.Remove(cfg.Serve.Socket); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	old := syscall.Umask(0o177)
	sock, err := net.Listen("unix", cfg.Serve.Socket)
	syscall.Umask(old)
	if err != nil {
		tcp.Close()
		return err
	}
	if err := os.Chmod(cfg.Serve.Socket, 0o600); err != nil {
		return err
	}
	servers := []*http.Server{
		{Handler: srv.Handler(false), ReadHeaderTimeout: 10 * time.Second},
		{Handler: srv.Handler(true), ReadHeaderTimeout: 10 * time.Second},
	}
	fmt.Fprintf(stdout, "crow-core serve: http://%s (owner %s), unix %s, nest %s\n",
		tcp.Addr(), orNone(owner()), cfg.Serve.Socket, orNone(cfg.Serve.Nest))
	bg, stopBg := context.WithCancel(context.Background())
	defer stopBg()
	go srv.Run(bg)
	startTicker(bg, srv, env, cfg.Engine)
	errc := make(chan error, 2)
	for i, l := range []net.Listener{tcp, sock} {
		go func(s *http.Server, l net.Listener) { errc <- s.Serve(l) }(servers[i], l)
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	select {
	case <-sig:
	case err = <-errc:
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, s := range servers {
		_ = s.Shutdown(ctx)
	}
	os.Remove(cfg.Serve.Socket)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

// startTicker runs the mission tick every CROW_TICK_INTERVAL (default 2 min, 0 off)
// until ctx ends. A pass that started or finished runs refreshes the dispatch section.
func startTicker(ctx context.Context, srv *api.Server, env mission.Env, engine string) {
	every, err := tickInterval(os.Getenv)
	if err != nil {
		log.Printf("tick: %v; using %s", err, every)
	}
	if every == 0 {
		log.Printf("tick off (CROW_TICK_INTERVAL=0)")
		return
	}
	if engine == "" {
		log.Printf("tick off: no engine checkout (CROW_ENGINE) to find crow-runs")
		return
	}
	t := &ticker{
		env:     env,
		runner:  crowRuns{bin: filepath.Join(engine, "bin", "crow-runs")},
		maxRuns: func() int { return maxRuns(os.Getenv) },
		locked:  srv.Locked,
		after:   func(mission.TickReport) { go srv.Refresh("dispatch") },
		logf:    log.Printf,
	}
	log.Printf("tick every %s, first in %s", every, min(firstTickDelay, every))
	go t.loop(ctx, firstTickDelay, every)
}

func orNone(s string) string {
	if s == "" {
		return "(none)"
	}
	return s
}

// ownerLogin returns the configured login, or the login tailscale reports for this
// node. It asks tailscale again at most once a minute while it has none.
func ownerLogin(configured string) func() string {
	if configured != "" {
		return func() string { return configured }
	}
	var mu sync.Mutex
	var login string
	var tried time.Time
	return func() string {
		mu.Lock()
		defer mu.Unlock()
		if login == "" && time.Since(tried) > time.Minute {
			tried = time.Now()
			l, err := tailscaleLogin()
			if err != nil {
				log.Printf("owner login: %v", err)
			}
			login = l
		}
		return login
	}
}

func tailscaleLogin() (string, error) {
	out, err := exec.Command("tailscale", "status", "--json").Output()
	if err != nil {
		return "", fmt.Errorf("tailscale status: %w", err)
	}
	var st struct {
		Self struct{ UserID int64 }
		User map[string]struct{ LoginName string }
	}
	if err := json.Unmarshal(out, &st); err != nil {
		return "", err
	}
	u := st.User[strconv.FormatInt(st.Self.UserID, 10)]
	if u.LoginName == "" {
		return "", errors.New("tailscale status names no login for this node")
	}
	return u.LoginName, nil
}

// script is one section read from a bin/ script: its JSON is the section data, unchanged.
type script struct {
	name    string
	timeout time.Duration // deck's timeout for the same script
	env     []string
	args    []string
}

// scripts are the deck sources core serves (item_169), in response order after the store.
var scripts = []script{
	{"sessions", 20 * time.Second, nil, []string{"crow-sessions", "list", "--json"}},
	{"dispatch", 20 * time.Second, nil, []string{"crow-runs", "json"}},
	{"usage", 30 * time.Second, []string{"CROW_TITLES_PER_DAY=0"}, []string{"crow-usage", "--json"}},
	{"today", 60 * time.Second, nil, []string{"crow-today", "json"}},
	{"mrs", 90 * time.Second, nil, []string{"crow-mrs", "json"}},
	{"checks", 30 * time.Second, nil, []string{"crow-checks", "json"}},
	{"projects", 30 * time.Second, nil, []string{"crow-registry", "json"}},
	{"accounts", 10 * time.Second, nil, []string{"crow-accounts", "json"}},
	{"ready", 30 * time.Second, nil, []string{"crow-ready", "json"}},
}

// sources builds every external section with its configured TTL.
func sources(cfg config.Config) []api.Source {
	var out []api.Source
	for _, sc := range scripts {
		out = append(out, api.Source{Name: sc.name, TTL: cfg.Serve.TTL[sc.name], Fetch: scriptFetch(cfg.Engine, sc)})
	}
	return append(out, api.Source{Name: "jobs", TTL: cfg.Serve.TTL["jobs"], Fetch: jobsFetch})
}

// scriptFetch runs a bin/ script and parses its stdout. The error carries the end of
// stderr, which the section shows while stale.
func scriptFetch(engine string, sc script) api.Fetch {
	return func() (any, error) {
		if engine == "" {
			return nil, errors.New("CROW_ENGINE is not set")
		}
		ctx, cancel := context.WithTimeout(context.Background(), sc.timeout)
		defer cancel()
		cmd := exec.CommandContext(ctx, filepath.Join(engine, "bin", sc.args[0]), sc.args[1:]...)
		cmd.Env = append(os.Environ(), sc.env...)
		out, err := cmd.Output()
		if err != nil {
			if ctx.Err() != nil {
				return nil, fmt.Errorf("%s: timed out after %s", sc.args[0], sc.timeout)
			}
			msg := ""
			var ee *exec.ExitError
			if errors.As(err, &ee) {
				msg = stderrTail(ee.Stderr)
			}
			if msg != "" {
				return nil, fmt.Errorf("%s: %w: %s", sc.args[0], err, msg)
			}
			return nil, fmt.Errorf("%s: %w", sc.args[0], err)
		}
		var v any
		if err := json.Unmarshal(out, &v); err != nil {
			return nil, fmt.Errorf("%s: %w", sc.args[0], err)
		}
		return v, nil
	}
}

// scriptRunner runs the live actions' bin/ scripts (item_170). Nil without an engine.
func scriptRunner(engine string) api.Script {
	if engine == "" {
		return nil
	}
	return func(env []string, name string, args ...string) ([]byte, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, filepath.Join(engine, "bin", name), args...)
		cmd.Env = append(os.Environ(), env...)
		out, err := cmd.Output()
		if err == nil {
			return out, nil
		}
		if ctx.Err() != nil {
			return out, fmt.Errorf("%s: timed out", name)
		}
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			if msg := stderrTail(ee.Stderr); msg != "" {
				return out, fmt.Errorf("%s: %w: %s", name, err, msg)
			}
		}
		return out, fmt.Errorf("%s: %w", name, err)
	}
}

// stderrTail is the last line of stderr, cut to 300 bytes.
func stderrTail(b []byte) string {
	l := string(lastLine(b))
	if len(l) > 300 {
		l = l[:300]
	}
	return l
}

func jobsFetch() (any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "systemctl", "--user", "list-timers", "--all", "-o", "json").Output()
	if err != nil {
		return nil, fmt.Errorf("systemctl list-timers: %w", err)
	}
	return api.ParseTimers(out)
}

// unitFile is the systemd user unit that runs this binary as the service.
func unitFile(bin string, cfg config.Config, home string) string {
	return fmt.Sprintf(`[Unit]
Description=crow core service (state API and Nest over the tailnet)
After=network-online.target

[Service]
ExecStart=%s serve
Environment=CROW_HOME=%s
Environment=CROW_ENGINE=%s
Environment=PATH=%s/.local/bin:/usr/local/bin:/usr/bin:/bin
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`, bin, cfg.Home, cfg.Engine, home)
}

// realHome is the passwd home: cdx sandboxes HOME, systemd reads the real one.
func realHome() (string, error) {
	u, err := user.Current()
	if err != nil {
		return "", err
	}
	return u.HomeDir, nil
}

func systemctl(stdout io.Writer, args ...string) error {
	cmd := exec.Command("systemctl", append([]string{"--user"}, args...)...)
	cmd.Stdout, cmd.Stderr = stdout, os.Stderr
	return cmd.Run()
}

// install writes the unit, starts it and points tailscale serve at the listener.
func install(cfg config.Config, stdout io.Writer) error {
	if cfg.Engine == "" {
		return errors.New("CROW_ENGINE is not set (run through `crow core install`)")
	}
	home, err := realHome()
	if err != nil {
		return err
	}
	bin, err := os.Executable()
	if err != nil {
		return err
	}
	dir := filepath.Join(home, ".config", "systemd", "user")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	p := filepath.Join(dir, unitName)
	if err := os.WriteFile(p, []byte(unitFile(bin, cfg, home)), 0o644); err != nil {
		return err
	}
	fmt.Fprintln(stdout, "wrote", p)
	if err := systemctl(stdout, "daemon-reload"); err != nil {
		return err
	}
	if err := systemctl(stdout, "enable", "--now", unitName); err != nil {
		return err
	}
	if err := systemctl(stdout, "restart", unitName); err != nil {
		return err
	}
	_, port, err := net.SplitHostPort(cfg.Serve.Listen)
	if err != nil {
		return err
	}
	cmd := exec.Command("tailscale", "serve", "--bg", "--https=443", "http://127.0.0.1:"+port)
	cmd.Stdout, cmd.Stderr = stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(stdout, "tailscale serve failed (%v): run `tailscale set --operator=$USER` once, then install again\n", err)
	}
	if u, err := user.Current(); err == nil {
		out, _ := exec.Command("loginctl", "show-user", u.Username, "-p", "Linger", "--value").Output()
		if strings.TrimSpace(string(out)) != "yes" {
			fmt.Fprintf(stdout, "linger is off: the service stops at logout. Run `loginctl enable-linger %s` to keep it up.\n", u.Username)
		}
	}
	return status(cfg, stdout)
}

// status prints the unit state, the listen addresses and the tailscale serve config.
func status(cfg config.Config, stdout io.Writer) error {
	out, _ := exec.Command("systemctl", "--user", "show", unitName, "-p", "ActiveState,SubState,MainPID,UnitFileState").Output()
	fmt.Fprintf(stdout, "unit %s\n", unitName)
	for _, l := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fmt.Fprintln(stdout, "  "+l)
	}
	fmt.Fprintf(stdout, "listen  http://%s (owner header required)\n", cfg.Serve.Listen)
	fmt.Fprintf(stdout, "socket  %s\n", cfg.Serve.Socket)
	fmt.Fprintf(stdout, "nest    %s\n", orNone(cfg.Serve.Nest))
	ts, err := exec.Command("tailscale", "serve", "status").CombinedOutput()
	if err != nil {
		fmt.Fprintf(stdout, "tailnet tailscale serve status failed: %v\n", err)
		return nil
	}
	fmt.Fprintln(stdout, "tailnet")
	for _, l := range strings.Split(strings.TrimSpace(string(bytes.TrimSpace(ts))), "\n") {
		if strings.TrimSpace(l) != "" {
			fmt.Fprintln(stdout, "  "+l)
		}
	}
	return nil
}

func coreCmd(cmd string, env mission.Env, cfg config.Config, stdout io.Writer) error {
	switch cmd {
	case "serve":
		return serve(env, cfg, stdout)
	case "install":
		return install(cfg, stdout)
	case "status":
		return status(cfg, stdout)
	case "restart":
		if err := systemctl(stdout, "restart", unitName); err != nil {
			return err
		}
		return status(cfg, stdout)
	}
	return fmt.Errorf("unknown command %q", cmd)
}
