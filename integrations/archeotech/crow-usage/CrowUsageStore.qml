pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

// One poller per shell: every placed instance (bar pill, panel) reads this.
// The bar pill pushes its per-instance config here (a panel gets no config).
Singleton {
    id: store

    property string command: "crow usage --json"
    property int intervalMs: 60000

    property var snap: null           // last good payload (crow-usage --json)
    property bool available: false    // last poll succeeded
    property string error: ""
    property real updatedAt: 0        // ms epoch of the last good payload

    // ── derived views ───────────────────────────────────────────────────────
    readonly property var limits: snap && snap.limits ? snap.limits : []
    readonly property var today: snap && snap.today ? snap.today : ({})
    readonly property var week: snap && snap.week ? snap.week : ({})
    readonly property var days: snap && snap.days ? snap.days : []
    readonly property var rtk: snap && snap.rtk ? snap.rtk : ({})
    readonly property var retros: snap && snap.retros ? snap.retros : ({})
    readonly property string todayKey: days.length ? days[days.length - 1].date : localDate(Date.now())

    // Sessions with a slice of today (`today` non-null), costliest today first.
    // Their cost/tokens in the panel are that slice, not the whole session.
    readonly property var todaySessions: {
        var list = (snap && snap.sessions ? snap.sessions : []).filter(s => s && s.today)
        return list.sort((a, b) => (b.today.cost_usd || 0) - (a.today.cost_usd || 0))
    }
    readonly property var topSessions: todaySessions.slice(0, 5)
    readonly property real todaySessionsCost: todaySessions.reduce((a, x) => a + (x.today.cost_usd || 0), 0)
    readonly property real todaySessionsTokens: todaySessions.reduce((a, x) => a + (x.today.tokens || 0), 0)

    // The account the pill follows: the one cdx marks active, else the account
    // of the most recent session, else the first listed.
    readonly property var current: {
        if (!limits.length) return null
        var act = limits.find(l => l.active)
        if (act) return act
        var all = snap && snap.sessions ? snap.sessions.slice() : []
        all.sort((a, b) => String(b.end || "").localeCompare(String(a.end || "")))
        for (var i = 0; i < all.length; i++) {
            var hit = limits.find(l => l.account === all[i].account)
            if (hit) return hit
        }
        return limits[0]
    }
    readonly property string currentAccount: current ? current.account : ""
    // More than Claude in the payload: accounts show their provider ("codex:work").
    readonly property bool mixed: limits.concat(snap && snap.sessions ? snap.sessions : [])
        .some(x => x.provider && x.provider !== "claude")
    function who(x) { return !x ? "" : mixed ? (x.provider || "?") + ":" + x.account : x.account }
    // Limits with the current account first.
    readonly property var sortedLimits: current
        ? [current].concat(limits.filter(l => l.account !== current.account)) : limits

    function configure(cfg) {
        if (!cfg) return
        if (cfg.command) command = cfg.command
        if (cfg.interval) intervalMs = Math.max(15, cfg.interval) * 1000
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

    function _sh(cmd) { return ["bash", "-lc", 'PATH="$HOME/.local/bin:$PATH"; ' + cmd] }

    // ── helpers shared by the views ─────────────────────────────────────────
    function pad2(n) { return (n < 10 ? "0" : "") + n }
    function localDate(ms) {
        var d = new Date(ms)
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    }
    function parseIso(iso) {
        if (!iso) return NaN
        return Date.parse(String(iso).replace(/(\.\d{3})\d+/, "$1"))
    }
    // ISO → local "HH:MM" ("" when missing or unparseable).
    function clock(iso) {
        var t = parseIso(iso)
        if (isNaN(t)) return ""
        var d = new Date(t)
        return pad2(d.getHours()) + ":" + pad2(d.getMinutes())
    }

    // "Oct 20 15:00" → "15:00" today, "Oct 26" otherwise.
    function shortReset(txt) {
        if (!txt) return "–"
        var p = String(txt).split(" ")
        if (p.length < 3) return txt
        var t = new Date(todayKey + "T00:00:00")
        var mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getMonth()]
        return (p[0] === mon && Number(p[1]) === t.getDate()) ? p[2] : p[0] + " " + p[1]
    }

    function human(n) {
        if (n === null || n === undefined || isNaN(n)) return "–"
        if (n >= 1e9) return (n / 1e9).toFixed(1) + "B"
        if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"
        if (n >= 1e3) return (n / 1e3).toFixed(1) + "k"
        return String(Math.round(n))
    }
    function money(v) { return v === null || v === undefined ? "–" : "$" + Number(v).toFixed(2) }
    // Short money for tight cells: $463, $49.2, $0.89.
    function moneyShort(v) {
        if (v === null || v === undefined) return "–"
        var n = Number(v)
        return "$" + (n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2))
    }

    // "claude-opus-5-5" → "opus-5-5"; synthetic placeholders dropped.
    function modelName(models) {
        var m = (models || []).filter(x => x && x.charAt(0) !== "<").map(x => x.replace(/^claude-/, ""))
        return m.length ? m.join("+") : "–"
    }

    function _ingest(text) {
        if (_repoll) return           // output of a superseded command
        var d
        try { d = JSON.parse(text) } catch (e) { d = null }
        if (!d || !Array.isArray(d.limits) || !d.today) {
            available = false
            error = "bad output from " + command
            return
        }
        snap = d
        available = true
        error = ""
        updatedAt = Date.now()
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
        stderr: StdioCollector { id: err }
        onExited: (code, status) => {
            if (store._repoll) { store._repoll = false; Qt.callLater(store.poll); return }
            if (code === 0) return
            var msg = err.text.trim().split("\n").pop()
            store.available = false
            store.error = (msg ? msg + " · " : "") + store.command + " exited " + code
        }
    }

    Timer {
        interval: store.intervalMs
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: store.poll()
    }
    onCommandChanged: poll()
}
