package api

import (
	"encoding/json"
	"slices"
	"strings"
	"time"
)

// Job is one crow timer of the user systemd instance.
type Job struct {
	Unit      string  `json:"unit"`
	Activates string  `json:"activates"`
	Next      *string `json:"next"`
	Last      *string `json:"last"`
	// Description is the [Unit] Description of the service the timer starts.
	Description string `json:"description,omitempty"`
	// Paused: the timer is installed but stopped or disabled (crow-routine pause).
	Paused bool `json:"paused,omitempty"`
}

// AddPaused appends the crow timers installed but missing from list-timers or disabled
// (`systemctl --user list-unit-files 'crow-*.timer' -o json`) and marks them paused.
func AddPaused(jobs []Job, unitFiles []byte) []Job {
	var rows []struct {
		UnitFile string `json:"unit_file"`
		State    string `json:"state"`
	}
	if json.Unmarshal(unitFiles, &rows) != nil {
		return jobs
	}
	for _, r := range rows {
		if !strings.HasPrefix(r.UnitFile, "crow-") || !strings.HasSuffix(r.UnitFile, ".timer") {
			continue
		}
		i := slices.IndexFunc(jobs, func(j Job) bool { return j.Unit == r.UnitFile })
		if i < 0 {
			jobs = append(jobs, Job{Unit: r.UnitFile, Activates: strings.TrimSuffix(r.UnitFile, ".timer") + ".service"})
			i = len(jobs) - 1
		}
		if r.State != "enabled" || jobs[i].Next == nil {
			jobs[i].Paused, jobs[i].Next = true, nil
		}
	}
	return jobs
}

// AddDescriptions fills Description from `systemctl --user show -p Id,Description <services>`.
func AddDescriptions(jobs []Job, show []byte) []Job {
	desc := map[string]string{}
	for _, block := range strings.Split(string(show), "\n\n") {
		var id, d string
		for _, l := range strings.Split(block, "\n") {
			if v, ok := strings.CutPrefix(l, "Id="); ok {
				id = v
			} else if v, ok := strings.CutPrefix(l, "Description="); ok {
				d = v
			}
		}
		if id != "" {
			desc[id] = d
		}
	}
	for i := range jobs {
		if d := desc[jobs[i].Activates]; d != "" && d != jobs[i].Activates {
			jobs[i].Description = d
		}
	}
	return jobs
}

// ParseTimers reads `systemctl --user list-timers -o json` and keeps the crow-* timers.
// systemd gives times in microseconds since the epoch, 0 when unknown.
func ParseTimers(b []byte) ([]Job, error) {
	var rows []struct {
		Unit, Activates string
		Next, Last      int64
	}
	if err := json.Unmarshal(b, &rows); err != nil {
		return nil, err
	}
	jobs := []Job{}
	for _, r := range rows {
		if !strings.HasPrefix(r.Unit, "crow-") {
			continue
		}
		jobs = append(jobs, Job{Unit: r.Unit, Activates: r.Activates, Next: usTime(r.Next), Last: usTime(r.Last)})
	}
	return jobs, nil
}

func usTime(us int64) *string {
	if us <= 0 {
		return nil
	}
	s := time.UnixMicro(us).UTC().Format(time.RFC3339)
	return &s
}
