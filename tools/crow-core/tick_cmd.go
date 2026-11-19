package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"crow-core/internal/mission"
)

// crowRuns runs missions through `crow-runs` of the engine checkout.
type crowRuns struct{ bin string }

func (c crowRuns) Dispatch(d mission.Dispatch) (mission.Started, error) {
	args := []string{"dispatch", d.Project, d.Label, "--prompt-file", d.PromptFile,
		"--mission", d.Mission, "--kind", d.Kind, "--json"}
	if d.Model != "" {
		args = append(args, "--model", d.Model)
	}
	if d.Power != "" {
		args = append(args, "--power", d.Power)
	}
	if d.Permission != "" {
		args = append(args, "--permission", d.Permission)
	}
	if d.WriteDir != "" {
		args = append(args, "--write-dir", d.WriteDir)
	}
	if d.BudgetUSD > 0 {
		args = append(args, "--budget", strconv.FormatFloat(d.BudgetUSD, 'f', -1, 64))
	}
	if d.ContinueRun != "" {
		args = append(args, "--continue-run", d.ContinueRun)
	}
	if d.Resumes != "" {
		args = append(args, "--resumes", d.Resumes)
	}
	if d.TimeoutMin > 0 {
		args = append(args, "--timeout-min", strconv.Itoa(d.TimeoutMin))
	}
	var stdout, stderr bytes.Buffer
	cmd := exec.Command(c.bin, args...)
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	runErr := cmd.Run()
	var res struct {
		OK      bool   `json:"ok"`
		RunID   string `json:"run_id"`
		Account string `json:"account"`
		Error   *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(lastLine(stdout.Bytes()), &res); err != nil {
		// Early refusals (no allowed account, unknown project) print plain text.
		msg := strings.TrimSpace(stderr.String() + " " + stdout.String())
		if msg == "" && runErr != nil {
			msg = runErr.Error()
		}
		return mission.Started{}, &mission.DispatchError{Code: "dispatch_failed", Message: msg}
	}
	if !res.OK || res.RunID == "" {
		de := &mission.DispatchError{Code: "dispatch_failed", Message: strings.TrimSpace(stderr.String())}
		if res.Error != nil {
			de.Code, de.Message = res.Error.Code, res.Error.Message
		}
		return mission.Started{}, de
	}
	return mission.Started{RunID: res.RunID, Account: res.Account}, nil
}

func (c crowRuns) State(run string) (mission.RunState, error) {
	out, err := exec.Command(c.bin, "state", run).Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return mission.RunState{}, fmt.Errorf("crow-runs state: %v: %s", err, strings.TrimSpace(string(ee.Stderr)))
		}
		return mission.RunState{}, fmt.Errorf("crow-runs state: %w", err)
	}
	var st mission.RunState
	if err := json.Unmarshal(lastLine(out), &st); err != nil {
		return st, fmt.Errorf("crow-runs state: %w", err)
	}
	return st, nil
}

func lastLine(b []byte) []byte {
	b = bytes.TrimSpace(b)
	if i := bytes.LastIndexByte(b, '\n'); i >= 0 {
		return b[i+1:]
	}
	return b
}

// maxRuns is the admission cap: CROW_MAX_RUNS, default 2 (the owner's background run cap).
func maxRuns(getenv func(string) string) int {
	if n, err := strconv.Atoi(getenv("CROW_MAX_RUNS")); err == nil && n >= 0 {
		return n
	}
	return 2
}

// tickCmd runs `tick [--json]`: one pass, no model call.
func tickCmd(env mission.Env, engine string, args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("tick", flag.ContinueOnError)
	asJSON := fs.Bool("json", false, "print JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if engine == "" {
		return fmt.Errorf("tick: no engine checkout (CROW_ENGINE) to find crow-runs")
	}
	unlock, err := tickLock(env)
	if err != nil {
		return fmt.Errorf("tick: %w", err)
	}
	defer unlock()
	rep, err := env.Tick(crowRuns{bin: filepath.Join(engine, "bin", "crow-runs")}, maxRuns(os.Getenv))
	if err != nil {
		return err
	}
	if *asJSON {
		return printJSON(stdout, rep)
	}
	for _, g := range []struct {
		name  string
		lines []mission.TickLine
	}{{"finished", rep.Finished}, {"started", rep.Started}, {"held", rep.Held}} {
		for _, l := range g.lines {
			fmt.Fprintf(stdout, "%-8s %s %s %s %s\n", g.name, l.Mission, l.State, l.Run, l.Detail)
		}
	}
	if len(rep.Finished)+len(rep.Started)+len(rep.Held) == 0 {
		fmt.Fprintln(stdout, "nothing to do")
	}
	return nil
}
