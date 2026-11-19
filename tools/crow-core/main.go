// Command crow-core is the mission core of crow (adr_001): the event logs, the store
// rebuilt from them and, in later items, the tick. It is a one-shot binary that the
// Python CLI runs through `crow core`; `crow core serve` runs it as the HTTP service.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	"crow-core/contract"
	"crow-core/internal/config"
	"crow-core/internal/mission"
	"crow-core/internal/project"
	"crow-core/internal/store"
)

const usage = `usage: crow-core <command>

  append            read one event (JSON) on stdin, append it to its mission log, sync the store
                    (ts defaults to now)
  sync [mission]    apply the new events of one mission, or of every mission
  rebuild           empty the store and replay every event log
  dump              print every mission, run and inbox row as JSON
  mission new --goal G --kind K --project P --end-state E [--key K] [--scope S]
              [--data-class D] [--gates a,b] [--autonomy A] [--json]
  mission ensure --project P --end-state E [--logics REF] [--goal G] [--json]
                    the linked mission of a handoff or dispatch: reused by project and
                    Logics ref (else end state), created running with no core run
  mission list [--json]
  mission show <id|prefix> [--json]
  mission stop <id|prefix> [--json]    stop the live run of a running mission
  mission cancel <id|prefix> [--reason R] [--json]
  mission brief <id|prefix> [--write]   print the brief a run reads first, or write brief.md
  inbox list [--json] [--all]           open items, oldest first (--all: answered too)
  inbox show <item|prefix> [--json]     block summary, questions, options and artifacts
  inbox answer <item|prefix> <verb> [words] [--json]
                    answer with a gate verb, or with plain words for a question
  inbox hide <item|prefix> [--json]     drop an open item without answering it
  tick [--json]     finish the mission runs that ended, then start queued missions through
                    crow-runs (oldest first, CROW_MAX_RUNS at once, default 2)
  serve             run the HTTP service: /api read routes and the Nest app, on the loopback
                    port tailscale serve proxies to (owner login required) and a unix socket
  install           write and start the crow-core systemd user unit, point tailscale serve at it
  status            unit state, listen addresses and tailscale serve config
  restart           restart the unit (crow core rebuilds the binary first)
  mcp               MCP stdio server of the butler: core tools over the unix socket (item_176)
  config            print the resolved paths as JSON
  version           print the core and contract versions
`

const version = "0.1.0"

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "crow-core:", err)
		os.Exit(1)
	}
}

func run(args []string, stdin io.Reader, stdout io.Writer) error {
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, usage)
		return fmt.Errorf("missing command")
	}
	cmd, rest := args[0], args[1:]
	switch cmd {
	case "help", "-h", "--help":
		fmt.Fprint(stdout, usage)
		return nil
	case "version":
		fmt.Fprintf(stdout, "crow-core %s (contract %d, store schema %d)\n", version, contract.Version, store.SchemaVersion)
		return nil
	}
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	if cmd == "config" {
		return printJSON(stdout, cfg)
	}
	if cmd == "mcp" {
		return mcpServe(cfg.Serve.Socket, stdin, stdout)
	}
	kinds := project.KindDirs(cfg.Kinds, cfg.Overrides)
	s, err := store.Open(cfg.Store, cfg.Missions, kinds)
	if err != nil {
		return err
	}
	defer s.Close()
	env := mission.Env{
		Store: s, Kinds: kinds, KindDirs: []string{cfg.Overrides, cfg.Kinds},
		Projects: cfg.Projects, Prefs: cfg.Prefs, Now: time.Now, StopRun: stopRun(cfg.Engine),
	}
	switch cmd {
	case "serve", "install", "status", "restart":
		return coreCmd(cmd, env, cfg, stdout)
	case "mission":
		return missionCmd(env, rest, stdout)
	case "inbox":
		return inboxCmd(env, rest, stdout)
	case "tick":
		return tickCmd(env, cfg.Engine, rest, stdout)
	case "append":
		return appendEvent(s, stdin, stdout)
	case "sync":
		var n int
		if len(rest) == 1 {
			n, err = s.Sync(rest[0])
		} else {
			n, err = s.SyncAll()
		}
		if err == nil {
			fmt.Fprintf(stdout, "applied %d events\n", n)
		}
		return err
	case "rebuild":
		n, err := s.Rebuild()
		if err == nil {
			fmt.Fprintf(stdout, "replayed %d events\n", n)
		}
		return err
	case "dump":
		d, err := s.Dump()
		if err != nil {
			return err
		}
		return printJSON(stdout, d)
	}
	return fmt.Errorf("unknown command %q", cmd)
}

func appendEvent(s *store.Store, stdin io.Reader, stdout io.Writer) error {
	line, err := bufio.NewReader(stdin).ReadBytes('\n')
	if err != nil && err != io.EOF {
		return err
	}
	var e contract.Event
	if err := contract.Decode(line, &e); err != nil {
		return fmt.Errorf("event: %w", err)
	}
	if e.TS == "" {
		e.TS = time.Now().Format(time.RFC3339)
	}
	_, err = s.Append(e)
	return err
}

func printJSON(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
