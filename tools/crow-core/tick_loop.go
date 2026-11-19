package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"crow-core/internal/mission"
)

// DefaultTickInterval is how often serve runs the mission tick (adr_001).
const DefaultTickInterval = 2 * time.Minute

// errTickBusy says another tick (serve or `crow-core tick`) holds the tick lock.
var errTickBusy = errors.New("another tick is running")

// tickInterval reads CROW_TICK_INTERVAL: a Go duration ("90s", "5m") or whole seconds.
// 0 turns the serve tick off; empty is the default.
func tickInterval(getenv func(string) string) (time.Duration, error) {
	v := strings.TrimSpace(getenv("CROW_TICK_INTERVAL"))
	if v == "" {
		return DefaultTickInterval, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		n, nerr := strconv.Atoi(v)
		if nerr != nil {
			return DefaultTickInterval, fmt.Errorf("CROW_TICK_INTERVAL %q: want a duration (2m) or seconds", v)
		}
		d = time.Duration(n) * time.Second
	}
	if d < 0 {
		return DefaultTickInterval, fmt.Errorf("CROW_TICK_INTERVAL %q: negative", v)
	}
	return d, nil
}

// tickLock takes the tick lock next to the missions root without waiting. One tick runs
// at a time across the serve loop and the CLI.
func tickLock(env mission.Env) (unlock func(), err error) {
	p := filepath.Join(filepath.Dir(env.Store.Root()), "tick.lock")
	f, err := os.OpenFile(p, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, errTickBusy
		}
		return nil, err
	}
	return func() {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		f.Close()
	}, nil
}

// ticker runs the mission tick for serve: one pass at a time, a failure logged and the
// next pass on schedule.
type ticker struct {
	env     mission.Env
	runner  mission.Runner
	maxRuns func() int
	locked  func(func(mission.Env) error) error // the server lock; rebuilds the store sections
	after   func(mission.TickReport)            // a pass that started or finished runs
	observe func() error                        // after every pass: the ops state log; nil skips it
	logf    func(string, ...any)
}

// pass runs one tick, then records the live lane states, also when the tick was skipped.
func (t *ticker) pass() {
	_, _ = t.once()
	if t.observe == nil {
		return
	}
	if err := t.observe(); err != nil {
		t.logf("ops state log: %v", err)
	}
}

// once runs one pass. A held lock skips it.
func (t *ticker) once() (rep mission.TickReport, err error) {
	defer func() {
		if p := recover(); p != nil {
			err = fmt.Errorf("tick panic: %v", p)
			t.logf("tick: %v", err)
		}
	}()
	unlock, err := tickLock(t.env)
	if err != nil {
		t.logf("tick skipped: %v", err)
		return rep, err
	}
	defer unlock()
	err = t.locked(func(env mission.Env) error {
		var terr error
		rep, terr = env.Tick(t.runner, t.maxRuns())
		return terr
	})
	if err != nil {
		t.logf("tick failed: %v", err)
		return rep, err
	}
	if len(rep.Finished)+len(rep.Started)+len(rep.Held) > 0 {
		b, _ := json.Marshal(rep)
		t.logf("tick: %s", b)
	}
	if len(rep.Finished)+len(rep.Started) > 0 && t.after != nil {
		t.after(rep)
	}
	return rep, nil
}

// firstTickDelay lets serve finish starting before the first pass after a restart.
const firstTickDelay = 30 * time.Second

// loop runs a first pass after first (capped at every), then one every interval until ctx
// ends. Passes run in this goroutine, so two never overlap; a slow pass delays the next one.
func (t *ticker) loop(ctx context.Context, first, every time.Duration) {
	if first > every {
		first = every
	}
	select {
	case <-ctx.Done():
		return
	case <-time.After(first):
		t.pass()
	}
	tk := time.NewTicker(every)
	defer tk.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tk.C:
			t.pass()
		}
	}
}
