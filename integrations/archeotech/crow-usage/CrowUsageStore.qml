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
    readonly property var days: snap && snap.days ? snap.days : []
    readonly property var rtk: snap && snap.rtk ? snap.rtk : ({})
    readonly property var retros: snap && snap.retros ? snap.retros : ({})
    readonly property string todayKey: days.length ? days[days.length - 1].date : localDate(Date.now())

    // Sessions touched today (local date of their last activity), costliest first.
    readonly property var todaySessions: {
        var list = (snap && snap.sessions ? snap.sessions : []).filter(s => sessionDate(s) === todayKey)
        return list.sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0))
    }
    readonly property var topSessions: todaySessions.slice(0, 5)

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

    function configure(cfg) {
        if (!cfg) return
        if (cfg.command) command = cfg.command
        if (cfg.interval) intervalMs = Math.max(15, cfg.interval) * 1000
    }

    function poll() {
        if (proc.running) return       // re-run guard: never stack polls
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
    function sessionDate(s) {
        var t = parseIso(s.end || s.start)
        return isNaN(t) ? "" : localDate(t)
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

    // "claude-opus-5-5" → "opus-5-5"; synthetic placeholders dropped.
    function modelName(models) {
        var m = (models || []).filter(x => x && x.charAt(0) !== "<").map(x => x.replace(/^claude-/, ""))
        return m.length ? m.join("+") : "–"
    }

    function _ingest(text) {
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
        command: store._sh(store.command)
        stdout: StdioCollector {
            id: out
            onStreamFinished: store._ingest(out.text)
        }
        stderr: StdioCollector { id: err }
        onExited: (code, status) => {
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
