// Package butler runs the butler conversations (item_176): one long-lived `claude -p`
// stream-json process per conversation whose only tools are the core MCP tools. The
// bridge serialises turns, keeps the transcript on disk, stops an idle process and
// resumes it on the next message. A change of account starts a fresh process seeded
// with the last turns of the transcript.
package butler

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ToolPrefix is the only tool family a butler process may hold (AC5).
const ToolPrefix = "mcp__core__"

// Msg is one transcript line.
type Msg struct {
	Seq     int    `json:"seq"`
	TS      string `json:"ts"`
	Role    string `json:"role"` // you, crow, tool, note
	Text    string `json:"text"`
	Surface string `json:"surface,omitempty"`
	Account string `json:"account,omitempty"`
	Chips   []Chip `json:"chips,omitempty"`
}

// Chip is an action the reply offers; Nest opens Href.
type Chip struct {
	Label string `json:"label"`
	Href  string `json:"href"`
}

// Meta is the conversation state kept across processes.
type Meta struct {
	SessionID string   `json:"session_id,omitempty"`
	Account   string   `json:"account,omitempty"` // account the session lives on
	Tools     []string `json:"tools,omitempty"`   // from the last init event
	Args      []string `json:"args,omitempty"`    // launch args of the last process
}

// View is GET /api/butler/{conv}.
type View struct {
	Conv     string   `json:"conv"`
	Messages []Msg    `json:"messages"`
	Partial  string   `json:"partial"` // text of the reply being written
	Busy     bool     `json:"busy"`
	Queued   int      `json:"queued"`
	Running  bool     `json:"running"` // a process is up
	Account  string   `json:"account"` // account the next turn runs on; empty = auto
	Last     int      `json:"last"`    // highest seq
	Tools    []string `json:"tools,omitempty"`
}

// Launcher builds the process for a conversation turn. account is resolved (never
// empty); resume is the session to continue, empty for a fresh one.
type Launcher func(account, resume string) (*exec.Cmd, error)

// Options builds a Manager.
type Options struct {
	Dir    string                 // transcripts and meta, one folder per conversation
	Launch Launcher               // nil refuses every turn
	Pick   func() (string, error) // auto account
	Idle   time.Duration          // stop an idle process after this (default 30 min)
	Now    func() time.Time
	Seed   int // transcript turns replayed into a fresh session (default 10)
}

// Manager owns every conversation.
type Manager struct {
	o     Options
	mu    sync.Mutex
	convs map[string]*conv
}

// New returns a manager.
func New(o Options) *Manager {
	if o.Idle <= 0 {
		o.Idle = 30 * time.Minute
	}
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.Seed <= 0 {
		o.Seed = 10
	}
	return &Manager{o: o, convs: map[string]*conv{}}
}

var convID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)

// ErrConv is returned for a malformed conversation id.
var ErrConv = errors.New("conversation: want 1-40 chars of a-z, 0-9 and -")

type conv struct {
	id      string
	dir     string
	mu      sync.Mutex
	meta    Meta
	want    string // account the owner chose; empty = auto
	msgs    []Msg
	partial strings.Builder
	busy    bool
	queue   []turn
	proc    *proc
	timer   *time.Timer
	chips   []Chip // gathered from tool results during the turn
	seed    bool   // next turn starts a fresh session: prefix the last turns
}

type turn struct{ text, surface string }

type proc struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stderr *tail
	done   chan struct{}
}

func (m *Manager) get(id string) (*conv, error) {
	if !convID.MatchString(id) {
		return nil, ErrConv
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.convs[id]; ok {
		return c, nil
	}
	c := &conv{id: id, dir: filepath.Join(m.o.Dir, id)}
	if err := c.load(); err != nil {
		return nil, err
	}
	c.want = c.meta.Account
	m.convs[id] = c
	return c, nil
}

// Get returns the messages after seq after.
func (m *Manager) Get(id string, after int) (View, error) {
	c, err := m.get(id)
	if err != nil {
		return View{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.view(after), nil
}

func (c *conv) view(after int) View {
	v := View{Conv: c.id, Messages: []Msg{}, Partial: c.partial.String(), Busy: c.busy, Queued: len(c.queue),
		Running: c.proc != nil, Account: c.want, Tools: c.meta.Tools}
	for _, msg := range c.msgs {
		if msg.Seq > after {
			v.Messages = append(v.Messages, msg)
		}
		v.Last = msg.Seq
	}
	return v
}

// SetAccount changes the account of the next turn. A change from the account the session
// lives on stops the process; the next turn starts fresh, seeded from the transcript.
func (m *Manager) SetAccount(id, account string) error {
	c, err := m.get(id)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if account == c.want {
		return nil
	}
	c.want = account
	if account != "" && account != c.meta.Account && c.meta.SessionID != "" {
		c.stop()
		c.meta.SessionID = ""
		c.seed = true
		c.note(m.o.Now(), "account changed to "+account+": next reply on a fresh session")
	}
	return nil
}

// Say adds the owner's message and starts the turn, or queues it behind the running one.
func (m *Manager) Say(id, text, surface string) (Msg, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return Msg{}, errors.New("text: required")
	}
	c, err := m.get(id)
	if err != nil {
		return Msg{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	msg := c.add(Msg{TS: m.o.Now().Format(time.RFC3339), Role: "you", Text: text, Surface: surface, Account: c.want})
	if c.busy {
		c.queue = append(c.queue, turn{text, surface})
		return msg, nil
	}
	if err := m.send(c, turn{text, surface}); err != nil {
		c.note(m.o.Now(), "butler could not start: "+err.Error())
		return msg, err
	}
	return msg, nil
}

// send writes one turn to the process, starting it first when needed. c.mu is held.
func (m *Manager) send(c *conv, t turn) error {
	if c.proc == nil {
		if err := m.start(c); err != nil {
			return err
		}
	}
	text := t.text
	if t.surface != "" {
		text = "[" + t.surface + "] " + text
	}
	if c.seed {
		text = c.seedText() + text
		c.seed = false
	}
	line, _ := json.Marshal(map[string]any{"type": "user",
		"message": map[string]any{"role": "user", "content": text}})
	if _, err := c.proc.stdin.Write(append(line, '\n')); err != nil {
		c.stop()
		return err
	}
	c.busy = true
	c.partial.Reset()
	c.chips = nil
	if c.timer != nil {
		c.timer.Stop()
	}
	return nil
}

// seedText replays the last turns into a fresh session.
func (c *conv) seedText() string {
	var b strings.Builder
	n := 0
	for i := len(c.msgs) - 2; i >= 0 && n < 10; i-- { // the last message is the one being sent
		if r := c.msgs[i].Role; r == "you" || r == "crow" {
			n++
		}
	}
	if n == 0 {
		return ""
	}
	b.WriteString("[earlier in this conversation, for context only]\n")
	start := len(c.msgs) - 1
	for n > 0 && start > 0 {
		start--
		if r := c.msgs[start].Role; r == "you" || r == "crow" {
			n--
		}
	}
	for _, msg := range c.msgs[start : len(c.msgs)-1] {
		if msg.Role == "you" || msg.Role == "crow" {
			fmt.Fprintf(&b, "%s: %s\n", map[string]string{"you": "owner", "crow": "you"}[msg.Role], oneLine(msg.Text, 400))
		}
	}
	b.WriteString("[now]\n")
	return b.String()
}

func (m *Manager) start(c *conv) error {
	if m.o.Launch == nil {
		return errors.New("butler disabled on this core")
	}
	account := c.want
	if account == "" {
		if m.o.Pick == nil {
			return errors.New("no account: pick one")
		}
		a, err := m.o.Pick()
		if err != nil {
			return fmt.Errorf("auto account: %w", err)
		}
		account = a
	}
	resume := c.meta.SessionID
	if account != c.meta.Account {
		if resume != "" {
			c.seed = true
		}
		resume = ""
	}
	cmd, err := m.o.Launch(account, resume)
	if err != nil {
		return err
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	p := &proc{cmd: cmd, stdin: stdin, stderr: &tail{}, done: make(chan struct{})}
	cmd.Stderr = p.stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	c.proc = p
	c.meta.Account = account
	c.meta.Args = cmd.Args[1:]
	c.meta.Tools = nil
	c.saveMeta()
	go m.read(c, p, stdout)
	return nil
}

// read follows one process's stdout until it exits.
func (m *Manager) read(c *conv, p *proc, stdout io.Reader) {
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 64<<10), 16<<20)
	for sc.Scan() {
		var ev event
		if json.Unmarshal(sc.Bytes(), &ev) != nil {
			continue
		}
		c.mu.Lock()
		if c.proc == p {
			m.handle(c, ev)
		}
		c.mu.Unlock()
	}
	_ = p.cmd.Wait()
	close(p.done)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.proc != p {
		return
	}
	c.proc = nil
	if c.timer != nil {
		c.timer.Stop()
	}
	if c.busy {
		c.busy = false
		c.flushPartial(m.o.Now())
		c.note(m.o.Now(), "butler stopped mid-reply: "+orDefault(p.stderr.String(), "no error output"))
		c.queue = nil
	}
}

type event struct {
	Type      string          `json:"type"`
	Subtype   string          `json:"subtype"`
	SessionID string          `json:"session_id"`
	Tools     []string        `json:"tools"`
	Event     json.RawMessage `json:"event"`
	Message   struct {
		Content json.RawMessage `json:"content"`
	} `json:"message"`
	Result  string `json:"result"`
	IsError bool   `json:"is_error"`
}

type block struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	Name      string          `json:"name"`
	ID        string          `json:"id"`
	Input     json.RawMessage `json:"input"`
	ToolUseID string          `json:"tool_use_id"`
	Content   json.RawMessage `json:"content"`
}

// handle applies one stream-json event. c.mu is held.
func (m *Manager) handle(c *conv, ev event) {
	now := m.o.Now()
	switch ev.Type {
	case "system":
		if ev.Subtype != "init" {
			return
		}
		c.meta.SessionID = ev.SessionID
		c.meta.Tools = ev.Tools
		c.saveMeta()
		for _, t := range ev.Tools {
			if !strings.HasPrefix(t, ToolPrefix) {
				c.note(now, "butler refused: it was given tool "+t+" outside the core tools")
				c.busy = false
				c.queue = nil
				c.stop()
				return
			}
		}
	case "stream_event":
		var se struct {
			Type  string `json:"type"`
			Delta struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"delta"`
		}
		if json.Unmarshal(ev.Event, &se) == nil && se.Type == "content_block_delta" && se.Delta.Type == "text_delta" {
			c.partial.WriteString(se.Delta.Text)
		}
	case "assistant":
		var blocks []block
		if json.Unmarshal(ev.Message.Content, &blocks) != nil {
			return
		}
		for _, b := range blocks {
			switch b.Type {
			case "text":
				c.partial.Reset()
				if t := strings.TrimSpace(b.Text); t != "" {
					c.add(Msg{TS: now.Format(time.RFC3339), Role: "crow", Text: t, Account: c.meta.Account})
				}
			case "tool_use":
				c.add(Msg{TS: now.Format(time.RFC3339), Role: "tool", Text: toolLine(b.Name, b.Input)})
			}
		}
	case "user":
		var blocks []block
		if json.Unmarshal(ev.Message.Content, &blocks) != nil {
			return
		}
		for _, b := range blocks {
			if b.Type == "tool_result" {
				c.chips = append(c.chips, chipsFrom(resultText(b.Content))...)
			}
		}
	case "result":
		c.partial.Reset()
		if ev.IsError {
			c.note(now, "butler error: "+orDefault(ev.Result, ev.Subtype))
		}
		if len(c.chips) > 0 {
			for i := len(c.msgs) - 1; i >= 0; i-- {
				if c.msgs[i].Role == "crow" {
					c.msgs[i].Chips = dedupe(c.chips)
					c.rewrite()
					break
				}
			}
			c.chips = nil
		}
		c.busy = false
		if ev.SessionID != "" && ev.SessionID != c.meta.SessionID {
			c.meta.SessionID = ev.SessionID
			c.saveMeta()
		}
		if len(c.queue) > 0 {
			t := c.queue[0]
			c.queue = c.queue[1:]
			if err := m.send(c, t); err != nil {
				c.note(now, "butler could not continue: "+err.Error())
			}
			return
		}
		c.arm(m.o.Idle)
	}
}

// arm stops the process after d without a turn. c.mu is held.
func (c *conv) arm(d time.Duration) {
	if c.timer != nil {
		c.timer.Stop()
	}
	p := c.proc
	c.timer = time.AfterFunc(d, func() {
		c.mu.Lock()
		defer c.mu.Unlock()
		if c.proc == p && !c.busy {
			c.stop()
		}
	})
}

// stop ends the process. c.mu is held.
func (c *conv) stop() {
	p := c.proc
	if p == nil {
		return
	}
	c.proc = nil
	p.stdin.Close()
	go func() {
		select {
		case <-p.done:
		case <-time.After(5 * time.Second):
			_ = p.cmd.Process.Kill()
		}
	}()
}

// Close stops every process.
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, c := range m.convs {
		c.mu.Lock()
		c.stop()
		c.mu.Unlock()
	}
}

// Meta returns the conversation meta (launch args and tools, for AC5 and AC7 checks).
func (m *Manager) Meta(id string) (Meta, error) {
	c, err := m.get(id)
	if err != nil {
		return Meta{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.meta, nil
}

func (c *conv) flushPartial(now time.Time) {
	if t := strings.TrimSpace(c.partial.String()); t != "" {
		c.add(Msg{TS: now.Format(time.RFC3339), Role: "crow", Text: t, Account: c.meta.Account})
	}
	c.partial.Reset()
}

func (c *conv) note(now time.Time, text string) {
	c.add(Msg{TS: now.Format(time.RFC3339), Role: "note", Text: text})
}

func (c *conv) add(msg Msg) Msg {
	msg.Seq = 1
	if n := len(c.msgs); n > 0 {
		msg.Seq = c.msgs[n-1].Seq + 1
	}
	c.msgs = append(c.msgs, msg)
	if err := os.MkdirAll(c.dir, 0o700); err == nil {
		if f, err := os.OpenFile(filepath.Join(c.dir, "messages.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600); err == nil {
			line, _ := json.Marshal(msg)
			f.Write(append(line, '\n'))
			f.Close()
		}
	}
	return msg
}

// rewrite saves the whole transcript (after chips land on a message).
func (c *conv) rewrite() {
	var b strings.Builder
	for _, msg := range c.msgs {
		line, _ := json.Marshal(msg)
		b.Write(line)
		b.WriteByte('\n')
	}
	writeAtomic(filepath.Join(c.dir, "messages.jsonl"), []byte(b.String()))
}

func (c *conv) saveMeta() {
	if err := os.MkdirAll(c.dir, 0o700); err != nil {
		return
	}
	b, _ := json.MarshalIndent(c.meta, "", "  ")
	writeAtomic(filepath.Join(c.dir, "meta.json"), b)
}

func (c *conv) load() error {
	if b, err := os.ReadFile(filepath.Join(c.dir, "meta.json")); err == nil {
		if err := json.Unmarshal(b, &c.meta); err != nil {
			return fmt.Errorf("butler meta %s: %w", c.id, err)
		}
	}
	f, err := os.Open(filepath.Join(c.dir, "messages.jsonl"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64<<10), 4<<20)
	for sc.Scan() {
		var msg Msg
		if json.Unmarshal(sc.Bytes(), &msg) == nil {
			c.msgs = append(c.msgs, msg)
		}
	}
	return sc.Err()
}

func writeAtomic(path string, b []byte) {
	tmp := path + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		os.Rename(tmp, path)
	}
}

// toolLine is the one-line summary of a tool call shown in the transcript.
func toolLine(name string, input json.RawMessage) string {
	name = strings.TrimPrefix(name, ToolPrefix)
	var in map[string]any
	_ = json.Unmarshal(input, &in)
	var parts []string
	for _, k := range []string{"section", "mission_id", "kind", "project", "goal", "run", "pid", "account"} {
		if v, ok := in[k]; ok && fmt.Sprint(v) != "" {
			parts = append(parts, oneLine(fmt.Sprint(v), 60))
		}
	}
	if len(parts) == 0 {
		return name
	}
	return name + " · " + strings.Join(parts, " · ")
}

func resultText(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var blocks []block
	if json.Unmarshal(raw, &blocks) == nil {
		var b strings.Builder
		for _, x := range blocks {
			b.WriteString(x.Text)
		}
		return b.String()
	}
	return ""
}

var (
	missionRe = regexp.MustCompile(`"mission_id"\s*:\s*"([0-9]{8}-[a-z0-9-]+)"`)
	inboxRe   = regexp.MustCompile(`"inbox"\s*:\s*true`)
)

// chipsFrom finds the links a tool result offers: a mission it created or read, and the
// inbox when an action waits on the owner.
func chipsFrom(text string) []Chip {
	var out []Chip
	for _, m := range missionRe.FindAllStringSubmatch(text, 3) {
		out = append(out, Chip{Label: "Open mission", Href: "/missions/" + m[1]})
	}
	if inboxRe.MatchString(text) {
		out = append(out, Chip{Label: "Open inbox", Href: "/inbox"})
	}
	return out
}

func dedupe(cs []Chip) []Chip {
	seen := map[string]bool{}
	var out []Chip
	for _, c := range cs {
		if !seen[c.Href] {
			seen[c.Href] = true
			out = append(out, c)
		}
	}
	return out
}

func oneLine(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > n {
		return string(r[:n-1]) + "…"
	}
	return s
}

func orDefault(s, d string) string {
	if strings.TrimSpace(s) == "" {
		return d
	}
	return s
}

// tail keeps the last 2 KB written to it.
type tail struct {
	mu sync.Mutex
	b  []byte
}

func (t *tail) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.b = append(t.b, p...)
	if len(t.b) > 2048 {
		t.b = t.b[len(t.b)-2048:]
	}
	return len(p), nil
}

func (t *tail) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return strings.TrimSpace(string(t.b))
}
