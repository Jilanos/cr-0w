package contract

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"sort"
	"strings"
	"testing"
)

// The spec lives in the hub repo, three levels up from this package.
var (
	repo    = filepath.Join("..", "..", "..")
	spec    = filepath.Join(repo, "logics", "specs", "core_contract")
	schemas = filepath.Join(spec, "schemas")
	fix     = filepath.Join(spec, "fixtures")
	runSpec = filepath.Join(repo, "logics", "specs", "req_037_run_contract")
)

func read(t *testing.T, p string) []byte {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func glob(t *testing.T, pattern string) []string {
	t.Helper()
	m, err := filepath.Glob(pattern)
	if err != nil || len(m) == 0 {
		t.Fatalf("no files match %s", pattern)
	}
	return m
}

// sameJSON fails unless a and b hold the same JSON value.
func sameJSON(t *testing.T, name string, a, b []byte) {
	t.Helper()
	var x, y any
	if err := json.Unmarshal(a, &x); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	if err := json.Unmarshal(b, &y); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	if !reflect.DeepEqual(x, y) {
		t.Errorf("%s: round trip differs\n got %s\nwant %s", name, b, a)
	}
}

// roundTrip strictly decodes b into v, encodes it again and checks nothing was lost.
func roundTrip(t *testing.T, name string, b []byte, v any) {
	t.Helper()
	if err := Decode(b, v); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	out, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	sameJSON(t, name, b, out)
}

func jsonLines(t *testing.T, p string) [][]byte {
	t.Helper()
	var out [][]byte
	sc := bufio.NewScanner(bytes.NewReader(read(t, p)))
	for sc.Scan() {
		if line := bytes.TrimSpace(sc.Bytes()); len(line) > 0 {
			out = append(out, append([]byte(nil), line...))
		}
	}
	return out
}

func TestMessageFixtures(t *testing.T) {
	var seen []string
	for _, p := range glob(t, filepath.Join(fix, "messages", "*.request.json")) {
		name := filepath.Base(p)
		var req Request
		roundTrip(t, name, read(t, p), &req)
		data, err := DecodeRequestData(req)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		out, _ := json.Marshal(data)
		sameJSON(t, name+" data", req.Data, out)

		rp := strings.Replace(p, ".request.", ".reply.", 1)
		var rep Reply
		roundTrip(t, filepath.Base(rp), read(t, rp), &rep)
		if rep.ID != req.ID || rep.Type != req.Type || !rep.OK {
			t.Errorf("%s: reply does not answer the request", rp)
		}
		rdata, err := DecodeReplyData(rep)
		if err != nil {
			t.Fatalf("%s: %v", rp, err)
		}
		out, _ = json.Marshal(rdata)
		sameJSON(t, filepath.Base(rp)+" data", rep.Data, out)
		seen = append(seen, req.Type)
	}
	var want []string
	for _, m := range Messages {
		want = append(want, m.Type)
	}
	sort.Strings(seen)
	sort.Strings(want)
	if !slices.Equal(seen, want) {
		t.Errorf("message fixtures %v, Messages %v", seen, want)
	}
}

func TestErrorFixtures(t *testing.T) {
	for _, p := range glob(t, filepath.Join(fix, "errors", "*.request.json")) {
		name := filepath.Base(p)
		var req Request
		roundTrip(t, name, read(t, p), &req)
		var rep Reply
		roundTrip(t, name, read(t, strings.Replace(p, ".request.", ".reply.", 1)), &rep)
		if rep.OK || rep.Error == nil || rep.Data != nil {
			t.Fatalf("%s: want a failed reply", name)
		}
		switch rep.Error.Code {
		case ErrUnknownType:
			if _, ok := LookupMessage(req.Type); ok {
				t.Errorf("%s: %s is a known message", name, req.Type)
			}
		case ErrBadRequest:
			if _, err := DecodeRequestData(req); err == nil {
				t.Errorf("%s: bad data decoded", name)
			}
		case ErrUnsupportedContract:
			d, err := DecodeRequestData(req)
			if err != nil {
				t.Fatal(err)
			}
			if d.(*HelloRequest).Contract == Version {
				t.Errorf("%s: contract equals ours", name)
			}
		default:
			t.Errorf("%s: no check for code %s", name, rep.Error.Code)
		}
	}
}

func eventFiles(t *testing.T) []string {
	return append(glob(t, filepath.Join(fix, "events", "*.jsonl")),
		filepath.Join(runSpec, "examples", "20261109-build-item-095", "events.jsonl"))
}

func TestEventFixtures(t *testing.T) {
	for _, p := range eventFiles(t) {
		for i, line := range jsonLines(t, p) {
			name := fmt.Sprintf("%s/%s:%d", filepath.Base(filepath.Dir(p)), filepath.Base(p), i+1)
			var e Event
			roundTrip(t, name, line, &e)
			data, err := DecodeEventData(e)
			if err != nil {
				t.Fatalf("%s: %v", name, err)
			}
			out, _ := json.Marshal(data)
			sameJSON(t, name+" data", e.Data, out)
		}
	}
}

func TestRecordFixtures(t *testing.T) {
	var missions []Mission
	roundTrip(t, "missions.json", read(t, filepath.Join(fix, "records", "missions.json")), &missions)
	var runs []Run
	roundTrip(t, "runs.json", read(t, filepath.Join(fix, "records", "runs.json")), &runs)
	var inbox []InboxItem
	roundTrip(t, "inbox.json", read(t, filepath.Join(fix, "records", "inbox.json")), &inbox)
	var work []WorkItem
	roundTrip(t, "work.json", read(t, filepath.Join(fix, "records", "work.json")), &work)
	var ops Ops
	roundTrip(t, "ops.json", read(t, filepath.Join(fix, "records", "ops.json")), &ops)
	for _, name := range []string{filepath.Join("records", "run-report.json"), filepath.Join("api", "run-report.json"), filepath.Join("api", "run-report-mission.json")} {
		var rr RunReport
		roundTrip(t, name, read(t, filepath.Join(fix, name)), &rr)
	}
	for _, l := range ops.Lanes {
		if !slices.Contains(OpsKinds, l.Kind) || !slices.Contains(OpsLaneStates, l.State) {
			t.Errorf("ops %s: unknown kind %s or state %s", l.ID, l.Kind, l.State)
		}
		for _, s := range l.Spans {
			if !slices.Contains(OpsSpanStates, s.State) {
				t.Errorf("ops %s: unknown span state %s", l.ID, s.State)
			}
		}
	}
	for _, w := range work {
		if !slices.Contains(WorkKinds, w.Kind) || !slices.Contains(WorkStates, w.State) {
			t.Errorf("%s: unknown kind %s or state %s", w.ID, w.Kind, w.State)
		}
	}
	var nested []Run
	for _, m := range missions {
		if !slices.Contains(States, m.State) {
			t.Errorf("%s: unknown state %s", m.ID, m.State)
		}
		nested = append(nested, m.Runs...)
	}
	if !reflect.DeepEqual(nested, runs) {
		t.Errorf("runs.json differs from the runs inside missions.json")
	}
}

func TestRunContractExamples(t *testing.T) {
	for _, p := range glob(t, filepath.Join(runSpec, "kinds", "*.yaml")) {
		j, err := YAMLToJSON(read(t, p))
		if err != nil {
			t.Fatal(err)
		}
		var k Kind
		roundTrip(t, filepath.Base(p), j, &k)
		if k.Name+".yaml" != filepath.Base(p) {
			t.Errorf("%s: name %s", p, k.Name)
		}
	}
	mds := append(glob(t, filepath.Join(runSpec, "examples", "*", "*.v[0-9]*.md")),
		glob(t, filepath.Join(runSpec, "examples", "gates", "*.md"))...)
	n := 0
	for _, p := range mds {
		md := read(t, p)
		if !bytes.Contains(md, []byte("```crow")) {
			continue
		}
		body, err := ExtractCrowBlock(md)
		if err != nil {
			t.Fatalf("%s: %v", p, err)
		}
		j, err := YAMLToJSON(body)
		if err != nil {
			t.Fatal(err)
		}
		var cb CrowBlock
		roundTrip(t, filepath.Base(p), j, &cb)
		if cb.Contract != Version {
			t.Errorf("%s: contract %d", p, cb.Contract)
		}
		n++
	}
	if n == 0 {
		t.Fatal("no crow blocks found")
	}
	var q Questions
	roundTrip(t, "questions.json", read(t, filepath.Join(runSpec, "examples", "gates", "questions.json")), &q)
}

func TestExtractCrowBlockWantsOne(t *testing.T) {
	two := []byte("```crow\na: 1\n```\ntext\n```crow\nb: 2\n```\n")
	if _, err := ExtractCrowBlock(two); err == nil {
		t.Error("two blocks accepted")
	}
	if _, err := ExtractCrowBlock([]byte("no block\n")); err == nil {
		t.Error("missing block accepted")
	}
}

func TestDecodeIsStrict(t *testing.T) {
	var h HelloRequest
	for _, bad := range []string{`{"contract":1,"core":"x","extra":1}`, `{"contract":1,"core":"x"} {}`, `{"contract":"1"}`} {
		if err := Decode([]byte(bad), &h); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
}

// --- schema walk: Go json tags must equal schema properties, required fields must not be omitempty.

type schemaDoc struct {
	path string
	root map[string]any
}

var docCache = map[string]map[string]any{}

func loadSchema(t *testing.T, p string) schemaDoc {
	t.Helper()
	p = filepath.Clean(p)
	if d, ok := docCache[p]; ok {
		return schemaDoc{p, d}
	}
	var d map[string]any
	if err := json.Unmarshal(read(t, p), &d); err != nil {
		t.Fatalf("%s: %v", p, err)
	}
	docCache[p] = d
	return schemaDoc{p, d}
}

// resolve follows $ref until it reaches a node without one.
func resolve(t *testing.T, doc schemaDoc, node map[string]any) (schemaDoc, map[string]any) {
	t.Helper()
	for {
		ref, ok := node["$ref"].(string)
		if !ok {
			return doc, node
		}
		file, frag, _ := strings.Cut(ref, "#")
		if file != "" {
			doc = loadSchema(t, filepath.Join(filepath.Dir(doc.path), file))
		}
		var cur any = doc.root
		for _, part := range strings.Split(strings.TrimPrefix(frag, "/"), "/") {
			if part == "" {
				continue
			}
			cur = cur.(map[string]any)[part]
		}
		if cur == nil {
			t.Fatalf("%s: unresolved $ref %s", doc.path, ref)
		}
		node = cur.(map[string]any)
	}
}

var rawMessage = reflect.TypeOf(json.RawMessage{})

func walk(t *testing.T, where string, typ reflect.Type, doc schemaDoc, node map[string]any) {
	t.Helper()
	doc, node = resolve(t, doc, node)
	for typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}
	if typ == rawMessage {
		return
	}
	for _, key := range []string{"oneOf", "anyOf"} {
		if alts, ok := node[key].([]any); ok {
			for _, a := range alts {
				am := a.(map[string]any)
				if am["type"] == "null" {
					continue
				}
				walk(t, where, typ, doc, am)
			}
		}
	}
	switch typ.Kind() {
	case reflect.Struct:
		props, _ := node["properties"].(map[string]any)
		if props == nil {
			if typ.NumField() > 0 {
				t.Errorf("%s: struct %s has fields, schema has no properties", where, typ)
			}
			return
		}
		required := map[string]bool{}
		if req, ok := node["required"].([]any); ok {
			for _, r := range req {
				required[r.(string)] = true
			}
		}
		fields := map[string]bool{}
		for i := 0; i < typ.NumField(); i++ {
			f := typ.Field(i)
			name, opts, _ := strings.Cut(f.Tag.Get("json"), ",")
			fields[name] = true
			sub, ok := props[name].(map[string]any)
			if !ok {
				t.Errorf("%s: %s.%s (%s) is not in the schema", where, typ.Name(), f.Name, name)
				continue
			}
			if omit := strings.Contains(opts, "omitempty"); omit == required[name] {
				t.Errorf("%s: %s: required=%v but omitempty=%v", where, name, required[name], omit)
			}
			walk(t, where+"."+name, f.Type, doc, sub)
		}
		for name := range props {
			if !fields[name] {
				t.Errorf("%s: schema property %s has no field in %s", where, name, typ.Name())
			}
		}
	case reflect.Slice:
		if items, ok := node["items"].(map[string]any); ok {
			walk(t, where+"[]", typ.Elem(), doc, items)
		}
	case reflect.Map:
		if ap, ok := node["additionalProperties"].(map[string]any); ok {
			walk(t, where+"{}", typ.Elem(), doc, ap)
		}
	}
}

// dataRefs maps each type const of a schema's allOf if/then to its data subschema.
func dataRefs(t *testing.T, doc schemaDoc) map[string]map[string]any {
	out := map[string]map[string]any{}
	all, _ := doc.root["allOf"].([]any)
	for _, a := range all {
		am := a.(map[string]any)
		ifp, _ := am["if"].(map[string]any)["properties"].(map[string]any)
		tp, ok := ifp["type"].(map[string]any)
		if !ok {
			continue
		}
		then, _ := am["then"].(map[string]any)["properties"].(map[string]any)
		if d, ok := then["data"].(map[string]any); ok {
			out[tp["const"].(string)] = d
		}
	}
	return out
}

func keys[V any](m map[string]V) []string {
	var k []string
	for x := range m {
		k = append(k, x)
	}
	sort.Strings(k)
	return k
}

func TestTypesMatchSchemas(t *testing.T) {
	core := func(n string) schemaDoc { return loadSchema(t, filepath.Join(schemas, n)) }
	run := func(n string) schemaDoc { return loadSchema(t, filepath.Join(runSpec, "schemas", n)) }
	pairs := []struct {
		v   any
		doc schemaDoc
	}{
		{Request{}, core("request.schema.json")},
		{Reply{}, core("reply.schema.json")},
		{Event{}, core("event.schema.json")},
		{Mission{}, core("mission.schema.json")},
		{Run{}, core("run.schema.json")},
		{InboxItem{}, core("inbox.schema.json")},
		{WorkItem{}, core("work-item.schema.json")},
		{Ops{}, core("ops.schema.json")},
		{RunReport{}, core("run-report.schema.json")},
		{CrowBlock{}, run("crow-block.schema.json")},
		{Kind{}, run("kind.schema.json")},
		{Questions{}, run("questions.schema.json")},
	}
	for _, p := range pairs {
		walk(t, filepath.Base(p.doc.path), reflect.TypeOf(p.v), p.doc, p.doc.root)
	}

	req, rep, ev := core("request.schema.json"), core("reply.schema.json"), core("event.schema.json")
	reqData, repData, evData := dataRefs(t, req), dataRefs(t, rep), dataRefs(t, ev)
	var names []string
	for _, m := range Messages {
		names = append(names, m.Type)
		walk(t, "request "+m.Type, reflect.TypeOf(m.Request()), req, reqData[m.Type])
		walk(t, "reply "+m.Type, reflect.TypeOf(m.Reply()), rep, repData[m.Type])
	}
	sort.Strings(names)
	if !slices.Equal(names, keys(reqData)) || !slices.Equal(names, keys(repData)) {
		t.Errorf("Messages %v, request schema %v, reply schema %v", names, keys(reqData), keys(repData))
	}
	for typ, mk := range EventTypes {
		node, ok := evData[typ]
		if !ok {
			t.Errorf("event type %s has no data schema", typ)
			continue
		}
		walk(t, "event "+typ, reflect.TypeOf(mk()), ev, node)
	}
	if enum := typeEnum(ev); !slices.Equal(enum, keys(EventTypes)) {
		t.Errorf("event schema types %v, EventTypes %v", enum, keys(EventTypes))
	}
	walk(t, "error", reflect.TypeOf(Error{}), rep, rep.root["$defs"].(map[string]any)["error"].(map[string]any))
}

func typeEnum(doc schemaDoc) []string {
	var out []string
	for _, v := range doc.root["properties"].(map[string]any)["type"].(map[string]any)["enum"].([]any) {
		out = append(out, v.(string))
	}
	sort.Strings(out)
	return out
}

// AC3 (item_132): every from x to pair is legal exactly when Moves lists it. item_134
// adds waiting and review back to queued, item_135 queued to waiting.
func TestStateMoves(t *testing.T) {
	legal := map[[2]string]bool{
		{"preflight", "queued"}: true, {"preflight", "cancelled"}: true,
		{"queued", "running"}: true, {"queued", "waiting"}: true, {"queued", "failed"}: true, {"queued", "cancelled"}: true,
		{"running", "waiting"}: true, {"running", "review"}: true, {"running", "done"}: true,
		{"running", "failed"}: true, {"running", "cancelled"}: true,
		{"waiting", "queued"}: true, {"waiting", "running"}: true, {"waiting", "failed"}: true, {"waiting", "cancelled"}: true,
		{"review", "queued"}: true, {"review", "running"}: true, {"review", "publishing"}: true, {"review", "done"}: true,
		{"review", "cancelled"}: true,
		{"publishing", "done"}:  true, {"publishing", "failed"}: true,
		{"done", "queued"}:   true,
		{"failed", "queued"}: true, {"failed", "cancelled"}: true,
	}
	for _, from := range States {
		for _, to := range States {
			if got, want := CanMove(from, to), legal[[2]string{from, to}]; got != want {
				t.Errorf("CanMove(%s, %s) = %v, want %v", from, to, got, want)
			}
		}
	}
	if CanMove("nope", "queued") || CanMove("queued", "nope") {
		t.Error("unknown states must not move")
	}
}
