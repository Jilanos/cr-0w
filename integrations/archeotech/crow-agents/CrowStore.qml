pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// One poller per shell: every placed instance (bar pill, panel) reads this, so
// two pills never double the polling or the notifications. The bar pill pushes
// its per-instance config here (a panel gets no config from the shell).
Singleton {
    id: store

    property string command: "crow json"
    property string watchCommand: "kitty -e crow watch"
    // Sessions cut off by a usage limit (crow-sessions); "" turns the list off.
    property string sessionsCommand: "crow sessions list --json"
    property var registry: []         // last good crow-sessions list
    property bool notifications: true
    property int intervalMs: 5000

    property var snap: null           // last good snapshot (crow-runs collect())
    property bool available: false    // last poll succeeded
    property string error: ""
    property real updatedAt: 0        // ms epoch of the last good snapshot
    property string copiedId: ""      // row feedback after a click

    // Derived views
    readonly property var agents: snap && snap.agents ? snap.agents : []
    readonly property var runs: agents.filter(a => a.kind === "run")
    // Sessions waiting on you first, then by how alive they are (stable within a rank).
    readonly property var sessions: {
        var rank = { waiting: 0, working: 1, quiet: 2, idle: 3 }
        return agents.filter(a => a.kind === "session")
                     .map((a, i) => ({ a: a, i: i }))
                     .sort((x, y) => ((rank[x.a.state] ?? 4) - (rank[y.a.state] ?? 4)) || (x.i - y.i))
                     .map(x => x.a)
    }
    readonly property var finished: snap && snap.finished ? snap.finished.slice(0, 5) : []
    readonly property int busy: snap && snap.slots ? snap.slots.busy : 0
    readonly property int maxSlots: snap && snap.slots ? snap.slots.max : 2
    readonly property int waiting: sessions.filter(a => a.state === "waiting").length

    // Stopped by a limit in the last 24 h, not relaunched, not open again.
    readonly property var interrupted: {
        var live = {}
        agents.forEach(a => { if (a.session_id) live[a.session_id] = true })
        return (registry || []).filter(s => !s.relaunched && !live[s.conversation_id]
                                            && since(s.last_event) >= 0 && since(s.last_event) < 86400)
    }
    // Board groups, in the order the panel lists them (same as crow watch).
    readonly property var needsYou: sessions.filter(a => a.state === "waiting")
        .concat(finished.filter(f => f.status !== "done"))
    readonly property var working: runs.concat(sessions.filter(a => a.state === "working" || a.state === "quiet"))
    readonly property var done: finished.filter(f => f.status === "done")
    readonly property var idle: sessions.filter(a => a.state === "idle")
    readonly property int attention: needsYou.length + interrupted.length
    // Context window the % bar is measured against.
    readonly property int contextWindow: 1000000
    function contextPct(tokens) { return tokens > 0 ? Math.min(100, Math.round(tokens * 100 / contextWindow)) : 0 }

    function configure(cfg) {
        if (!cfg) return
        if (cfg.command) command = cfg.command
        if (cfg.watchCommand) watchCommand = cfg.watchCommand
        if (cfg.sessionsCommand !== undefined) sessionsCommand = cfg.sessionsCommand
        if (cfg.notifications !== undefined) notifications = !!cfg.notifications
    }

    // A strip opener or the panel can poll before the pill pushes its config,
    // so the first poll may run the default command. When the command changes
    // mid-poll, one re-poll is queued for when that run exits and its output is
    // dropped; polls never stack.
    property string _running: ""      // command of the poll in flight
    property bool _repoll: false

    function poll() {
        if (proc.running) {
            if (_running !== command) _repoll = true
            return
        }
        _running = command
        proc.running = true
    }

    // The shell's environment may lack ~/.local/bin (where `crow` usually
    // lives), so every command runs in a login shell with it prepended.
    function _sh(cmd) { return ["bash", "-lc", 'PATH="$HOME/.local/bin:$PATH"; ' + cmd] }

    function openWatch() {
        Quickshell.execDetached(_sh(watchCommand))
    }

    // Focus the session's kitty window, or resume it in a new one when none holds it.
    function openSession(d) {
        if (!d || !d.account || !d.cwd) return
        Quickshell.execDetached(["bash", "-lc", 'PATH="$HOME/.local/bin:$PATH"; exec crow focus --pid "$1" --account "$2" --cwd "$3"',
                                 "crow-focus", String(d.pid || 0), String(d.account), String(d.cwd)])
    }

    function copy(id) {
        if (!id) return
        Quickshell.execDetached(["wl-copy", id])
        copiedId = id
        copiedTimer.restart()
    }

    // ── helpers shared by the views ─────────────────────────────────────────
    function age(sec) {
        var s = Math.floor(sec)
        if (!(s >= 0)) return "–"
        if (s < 60) return s + "s"
        if (s < 3600) return Math.floor(s / 60) + "m"
        var m = Math.floor((s % 3600) / 60)
        return Math.floor(s / 3600) + "h" + (m < 10 ? "0" : "") + m
    }

    // Seconds since an ISO timestamp (Python may emit 6 fraction digits, which
    // Date.parse rejects: keep 3).
    function since(iso) {
        if (!iso) return -1
        var t = Date.parse(String(iso).replace(/(\.\d{3})\d+/, "$1"))
        return isNaN(t) ? -1 : (Date.now() - t) / 1000
    }

    function shortId(id) { return id ? String(id).slice(0, 8) : "" }

    // ── notifications ───────────────────────────────────────────────────────
    // run_id → true once handled. The first good snapshot is a baseline: runs
    // that already ended don't fire. "lost" is not final (the result may land
    // later), so it isn't marked.
    property var _seen: ({})
    property bool _baselined: false

    function _notify(list) {
        var fresh = []
        for (var i = 0; i < list.length; i++) {
            var f = list[i]
            if (!f || !f.run_id || _seen[f.run_id]) continue
            if (f.status !== "done" && f.status !== "failed" && f.status !== "limit") continue
            _seen[f.run_id] = true
            fresh.push(f)
        }
        if (!_baselined) { _baselined = true; return }
        if (!notifications) return
        fresh.forEach(f => {
            var body = f.project + " — " + (f.label || shortId(f.run_id))
            if (f.status === "limit")
                Quickshell.execDetached(["notify-send", "-a", "crow", "-u", "critical",
                                         "Run stopped: usage limit", body])
            else
                Quickshell.execDetached(["notify-send", "-a", "crow", "-u", "normal",
                                         f.status === "done" ? "Run done" : "Run failed", body])
        })
    }

    function _ingest(text) {
        if (_repoll) return           // output of a superseded command
        var d
        try { d = JSON.parse(text) } catch (e) { d = null }
        if (!d || !d.slots || !Array.isArray(d.agents)) {
            available = false
            error = "bad output from " + command
            return
        }
        snap = d
        available = true
        error = ""
        updatedAt = Date.now()
        _notify(d.finished || [])
    }

    // Parse on stream end (order vs onExited isn't guaranteed); a non-zero exit
    // only marks the poll failed.
    Process {
        id: proc
        command: store._sh(store._running || store.command)
        stdout: StdioCollector {
            id: out
            onStreamFinished: store._ingest(out.text)
        }
        onExited: (code, status) => {
            if (store._repoll) { store._repoll = false; Qt.callLater(store.poll); return }
            if (code !== 0) { store.available = false; store.error = store.command + " exited " + code }
        }
    }

    Timer {
        interval: store.intervalMs
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: store.poll()
    }
    Timer { id: copiedTimer; interval: 1500; onTriggered: store.copiedId = "" }

    // The registry changes rarely and a scan costs more than a snapshot: once a minute.
    // Same queueing as poll(): a command change mid-scan re-scans once it exits.
    property string _regRunning: ""
    property bool _regAgain: false
    function scanRegistry() {
        if (sessionsCommand === "") { registry = []; return }
        if (regProc.running) { if (_regRunning !== sessionsCommand) _regAgain = true; return }
        _regRunning = sessionsCommand
        regProc.running = true
    }
    Process {
        id: regProc
        command: store._sh(store._regRunning || store.sessionsCommand)
        onExited: if (store._regAgain) { store._regAgain = false; Qt.callLater(store.scanRegistry) }
        stdout: StdioCollector {
            id: regOut
            onStreamFinished: {
                if (store._regAgain || store._regRunning !== store.sessionsCommand) return
                try { var d = JSON.parse(regOut.text); if (d && Array.isArray(d.sessions)) store.registry = d.sessions } catch (e) {}
            }
        }
    }
    Timer {
        interval: 60000
        running: store.sessionsCommand !== ""
        repeat: true
        triggeredOnStart: true
        onTriggered: store.scanRegistry()
    }
    onCommandChanged: poll()
    // The pill pushes its config after the first tick: rescan with the new command.
    onSessionsCommandChanged: { registry = []; scanRegistry() }
}
