pragma ComponentBehavior: Bound
import QtQuick
import "."

// Crow agents: one entry, two faces.
//   bar-zone      → pill: slot gauge + attention badge, hover summary, click opens the panel
//   panel-content → panel: a table of RUNS / SESSIONS / FINISHED, like `crow watch`
// The holder decides: a bar injects holderRoot (at creation), a panel host
// injects panelRoot. Neither is `required`, so one file serves both loaders.
// Data, polling and notifications live in the CrowStore singleton.
Item {
    id: root
    property var holderRoot: null
    property string widgetId: ""
    property var panelRoot: null
    property var config: ({})
    property var appearance
    readonly property var _a: appearance
    // Token groups, each null until the theme is injected. Nothing draws before
    // that (see `visible` below), so colour fallbacks are just "transparent".
    readonly property var _c: _a && _a.colors ? _a.colors : null
    readonly property var _f: _a && _a.font ? _a.font : null
    readonly property var _r: _a && _a.radius ? _a.radius : null
    readonly property var _s: _a && _a.spacing ? _a.spacing : null
    readonly property var _m: _a && _a.anim ? _a.anim : null

    readonly property bool panelMode: !holderRoot
    readonly property bool _horizontal: !holderRoot || holderRoot.horizontal !== false

    // Auto-compact: on a short bar (a vertical monitor) the pill drops the
    // busy/max count and keeps the gauge plus ◆n.
    readonly property int compactBelow: config && config.compactBelow !== undefined ? config.compactBelow : 1400
    readonly property real _barLength: !holderRoot ? 0
        : (holderRoot.horizontal !== false ? holderRoot.width : holderRoot.height)
    readonly property bool compact: _barLength > 0 && _barLength < compactBelow

    onConfigChanged: if (!panelMode) CrowStore.configure(config)
    // The loader injects `config` after creation: poll on the next tick so the
    // pill's command is in place (the store re-polls anyway if it changes).
    Component.onCompleted: { if (!panelMode) CrowStore.configure(config); Qt.callLater(CrowStore.poll) }

    // ── theme (semantic roles only) ─────────────────────────────────────────
    readonly property color cText:   _c ? _c.textPrimary   : "transparent"
    readonly property color cSub:    _c ? _c.textSecondary : "transparent"
    readonly property color cMuted:  _c ? _c.textMuted     : "transparent"
    readonly property color cAccent: _c ? _c.accent        : "transparent"
    readonly property color cOk:     _c ? _c.success       : "transparent"
    readonly property color cWarn:   _c ? _c.warning       : "transparent"
    readonly property color cErr:    _c ? _c.error         : "transparent"
    readonly property color cInfo:   _c ? _c.info          : "transparent"
    readonly property color cBorder: _c ? _c.borderSubtle  : "transparent"
    readonly property color cTrack:  _c ? _c.recessedTrack : "transparent"
    readonly property color cHover:  _c ? _c.stateHover    : "transparent"
    readonly property string fFamily: _f ? _f.family : "monospace"
    readonly property int fSm:   _f ? _f.sizeSm   : 11
    readonly property int fBase: _f ? _f.sizeBase : 12
    readonly property int fLg:   _f ? _f.sizeLg   : 14
    readonly property int s1: _s ? _s.s1 : 4
    readonly property int s2: _s ? _s.s2 : 8
    readonly property int s3: _s ? _s.s3 : 12
    readonly property int s4: _s ? _s.s4 : 16
    readonly property int rXs: _r ? _r.xs : 4

    // Glyphs: all present in FiraCode Nerd Font (no fallback-font sizes).
    readonly property var _styles: ({
        working: { glyph: "●", label: "working",   color: cOk },
        quiet:   { glyph: "◇", label: "quiet",     color: cWarn },
        waiting: { glyph: "◆", label: "needs you", color: cAccent },
        idle:    { glyph: "○", label: "idle",      color: cSub },
        done:    { glyph: "✓", label: "done",      color: cOk },
        failed:  { glyph: "×", label: "failed",    color: cErr },
        limit:   { glyph: "‖", label: "limit",     color: cWarn },
        lost:    { glyph: "?", label: "lost",      color: cSub }
    })
    function st(name) { return _styles[name] || { glyph: "?", label: name || "?", color: cSub } }
    // Context used → level: < 70 % fine, 70–85 % warning, > 85 % critical.
    function ctxColor(pct) { return pct > 85 ? cErr : pct >= 70 ? cWarn : cOk }

    visible: _c !== null
    implicitWidth:  panelMode ? 540 : pill.implicitWidth
    implicitHeight: panelMode ? 560 : 22

    // Panel footprint (manifest axisSize "auto"): width along a horizontal
    // holder, content height along a vertical one. implicitPerp drives the
    // depth where the holder honours it (strips); a bar dropdown uses `size`.
    readonly property bool _panelH: !panelRoot || panelRoot.horizontal !== false
    readonly property real _panelW: 680
    readonly property real _panelContentH: Math.max(320, panel.contentH)
    readonly property real implicitAxis: !panelMode ? 0 : _panelH ? _panelW : _panelContentH
    readonly property real implicitPerp: !panelMode ? 0 : _panelH ? _panelContentH : _panelW

    // One rounded cell per slot, filled = busy.
    component SlotGauge: Row {
        id: sg
        property int busy: 0
        property int slots: 2
        property bool live: true
        property int cellW: 8
        property int cellH: 12
        spacing: 3
        Repeater {
            model: Math.max(1, Math.min(sg.slots, 6))
            delegate: Rectangle {
                required property int index
                width: sg.cellW; height: sg.cellH
                radius: 2
                color: sg.live && index < sg.busy ? root.cOk : root.cBorder
            }
        }
    }

    // ════════════════════════════ bar pill ════════════════════════════════
    Item {
        id: pill
        visible: !root.panelMode
        anchors.fill: parent
        implicitWidth: pillRow.implicitWidth + root.s3
        opacity: CrowStore.available ? 1.0 : 0.45

        Rectangle {
            anchors.fill: parent
            radius: root._r ? root._r.sm : 6
            color: pillMa.containsMouse ? root.cHover : "transparent"
            Behavior on color { ColorAnimation { duration: root._m ? root._m.fast : 120 } }
        }

        Row {
            id: pillRow
            anchors.centerIn: parent
            spacing: root.s1 + 2
            SlotGauge {
                busy: CrowStore.busy
                slots: CrowStore.maxSlots
                live: CrowStore.available
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                visible: root._horizontal && !root.compact
                text: CrowStore.available ? CrowStore.busy + "/" + CrowStore.maxSlots : "–"
                color: root.cSub
                font.family: root.fFamily; font.pixelSize: root.fBase
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                visible: CrowStore.available && CrowStore.attention > 0
                text: "◆" + CrowStore.attention
                color: root.cAccent
                font.family: root.fFamily; font.pixelSize: root.fBase; font.bold: true
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        function popupLines() {
            if (!CrowStore.available)
                return { primary: "crow unavailable", secondary: CrowStore.error || CrowStore.command }
            var lines = []
            CrowStore.runs.concat(CrowStore.sessions).forEach(a => {
                if (a.state !== "working" && a.state !== "waiting") return
                var what = a.state === "waiting" ? "waiting for your reply"
                         : ((a.label || a.title) ? (a.label || a.title) + ": " : "") + (a.last_action || "")
                if (what.length > 72) what = what.slice(0, 71) + "…"
                lines.push(root.st(a.state).glyph + " " + a.project + "  " + what)
            })
            var head = CrowStore.busy + "/" + CrowStore.maxSlots + " runs busy"
            if (CrowStore.waiting > 0) head += " · " + CrowStore.waiting + " waiting on you"
            return { primary: head, secondary: lines.length ? lines.join("\n") : "no agent working" }
        }
        function showCard() {
            if (!root.holderRoot || !root._horizontal) return
            var p = popupLines()
            root.holderRoot.showPopup(pill, "CROW AGENTS", p.primary, p.secondary, "click: agents panel")
        }

        Connections {
            target: CrowStore
            function onSnapChanged() { if (pillMa.containsMouse) pill.showCard() }
            function onAvailableChanged() { if (pillMa.containsMouse) pill.showCard() }
        }

        MouseArea {
            id: pillMa
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onEntered: pill.showCard()
            onExited: if (root.holderRoot) root.holderRoot.hidePopup(pill)
            onClicked: {
                if (!root.holderRoot) return
                root.holderRoot.hidePopup(pill)
                root.holderRoot.dismissPopups()
                var c = pill.mapToItem(root.holderRoot, pill.width / 2, pill.height / 2)
                root.holderRoot.togglePanel(root.widgetId || "plugin:crow-agents", root.holderRoot.side,
                                            root._horizontal ? c.x : c.y)
            }
        }
    }

    // ════════════════════════════ panel ═══════════════════════════════════
    Item {
        id: panel
        visible: root.panelMode
        anchors.fill: parent
        anchors.margins: root.s4

        // Natural height (title + rows), for implicitAxis/Perp.
        readonly property real contentH: header.implicitHeight + 6 + list.implicitHeight + 2 * root.s4

        // Row model, grouped by what each agent asks of you (same order as crow watch):
        // Needs you (waiting, failed, stopped by a limit), Working, Finished, Idle.
        readonly property var rows: {
            var out = []
            function section(name, list, kind, always) {
                if (!list.length && !always) return
                out.push({ type: "head", text: name + (list.length ? "  " + list.length : "") })
                if (!list.length) out.push({ type: "none", text: kind === "need" ? "nothing waiting on you" : "none" })
                list.forEach(x => out.push({ type: x.run_id && !x.kind ? "fin" : x.conversation_id ? "intr" : "agent", d: x }))
            }
            section("NEEDS YOU", CrowStore.needsYou.concat(CrowStore.interrupted), "need", true)
            section("WORKING", CrowStore.working, "work", true)
            section("FINISHED", CrowStore.done, "done", false)
            section("IDLE", CrowStore.idle, "idle", false)
            return out
        }

        // Columns: glyph | project | task (flex) | what is happening | age | context (from 70 %)
        readonly property int wGlyph: 18
        readonly property int wProject: 104
        readonly property int wAge: 64
        readonly property int wCtx: 48
        readonly property int wDetail: Math.round((width - wGlyph - wProject - wAge - wCtx) * 0.5)
        readonly property int wTask: width - wGlyph - wProject - wDetail - wAge - wCtx
        readonly property int gap: root.s2

        component Cell: Text {
            color: root.cSub
            font.family: root.fFamily; font.pixelSize: root.fBase
            elide: Text.ElideRight
            verticalAlignment: Text.AlignVCenter
        }

        Column {
            id: header
            width: parent.width
            spacing: root.s2

            Item {
                width: parent.width
                height: Math.max(titleRow.implicitHeight, watchBtn.height)
                Row {
                    id: titleRow
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: root.s2 + 2
                    Text {
                        id: titleTxt
                        text: "󰚩  crow agents"
                        color: root.cAccent
                        font.family: root._f ? root._f.display : root.fFamily
                        font.pixelSize: root.fLg; font.bold: true
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    SlotGauge {
                        visible: CrowStore.available
                        busy: CrowStore.busy
                        slots: CrowStore.maxSlots
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Text {
                        text: !CrowStore.available ? "crow unavailable"
                              : CrowStore.busy + " of " + CrowStore.maxSlots + " run slots busy"
                        color: CrowStore.available ? root.cSub : root.cErr
                        font.family: root.fFamily; font.pixelSize: root.fSm
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Text {
                        visible: CrowStore.available && CrowStore.attention > 0
                        text: "◆ " + CrowStore.attention + " need" + (CrowStore.attention === 1 ? "s" : "") + " you"
                        color: root.cAccent
                        font.family: root.fFamily; font.pixelSize: root.fSm; font.bold: true
                        anchors.verticalCenter: parent.verticalCenter
                    }
                }
                Rectangle {
                    id: watchBtn
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    width: watchLbl.implicitWidth + 16
                    height: watchLbl.implicitHeight + 8
                    radius: root._r ? root._r.sm : 6
                    color: watchMa.containsMouse ? root.cHover : "transparent"
                    border.width: 1
                    border.color: watchMa.containsMouse ? root.cAccent : root.cBorder
                    Text {
                        id: watchLbl
                        anchors.centerIn: parent
                        text: "open crow watch"
                        color: watchMa.containsMouse ? root.cAccent : root.cSub
                        font.family: root.fFamily; font.pixelSize: root.fSm
                    }
                    MouseArea {
                        id: watchMa
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: CrowStore.openWatch()
                    }
                }
            }
            Text {
                visible: !CrowStore.available && CrowStore.error !== ""
                width: parent.width
                wrapMode: Text.WrapAnywhere
                text: CrowStore.error
                color: root.cSub
                font.family: root.fFamily; font.pixelSize: root.fSm
            }
        }

        Flickable {
            anchors.top: header.bottom
            anchors.topMargin: 2
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            clip: true
            contentHeight: list.implicitHeight
            boundsBehavior: Flickable.StopAtBounds

            Column {
                id: list
                width: parent.width
                spacing: 2

                Repeater {
                    model: panel.rows
                    delegate: Loader {
                        id: rowLoader
                        required property var modelData
                        width: list.width
                        sourceComponent: modelData.type === "head" ? headComp
                                       : modelData.type === "none" ? noneComp : rowComp
                        Binding {
                            target: rowLoader.item
                            property: "entry"
                            value: rowLoader.modelData
                            when: rowLoader.status === Loader.Ready
                        }
                    }
                }
            }
        }

        Component {
            id: headComp
            Item {
                id: headItem
                property var entry
                height: headTxt.implicitHeight + root.s2 + 2
                Text {
                    id: headTxt
                    anchors.bottom: parent.bottom
                    anchors.bottomMargin: 2
                    text: headItem.entry ? headItem.entry.text : ""
                    color: root.cText
                    font.family: root.fFamily; font.pixelSize: root.fSm; font.bold: true
                    font.letterSpacing: root._f ? root._f.trackingWide : 1
                }
            }
        }
        Component {
            id: noneComp
            Item {
                id: noneItem
                property var entry
                height: noneTxt.implicitHeight + 4
                Text {
                    id: noneTxt
                    x: panel.wGlyph
                    text: noneItem.entry ? noneItem.entry.text : ""
                    color: root.cMuted
                    font.family: root.fFamily; font.pixelSize: root.fSm
                }
            }
        }
        Component {
            id: rowComp
            Rectangle {
                id: row
                property var entry
                readonly property var d: entry ? entry.d : null
                readonly property string type: entry ? entry.type : ""
                readonly property bool isFin: type === "fin"
                readonly property bool isIntr: type === "intr"
                readonly property var s: root.st(!d ? "" : isIntr ? "limit" : isFin ? d.status : d.state)
                readonly property string rowId: !d ? "" : (d.run_id || d.session_id || d.conversation_id || "")
                readonly property bool copied: rowId !== "" && CrowStore.copiedId === rowId
                readonly property bool quiet: !!d && !isFin && !isIntr && d.state === "idle"

                readonly property string task: {
                    if (!d) return ""
                    if (d.label) return d.label
                    if (d.title) return d.title
                    if (isIntr) return String(d.first_prompt || "").split("\n")[0] || "session " + CrowStore.shortId(d.conversation_id)
                    if (isFin) return ""
                    return d.kind === "session" ? "session " + CrowStore.shortId(d.session_id) : "(not dispatched by crow)"
                }
                // What is happening, in words: the one column to read.
                readonly property string doing: {
                    if (!d) return ""
                    if (copied) return "copied " + CrowStore.shortId(rowId)
                    if (isIntr) {
                        const lim = d.limit === "five_hour" ? "5h limit" : d.limit === "seven_day" ? "weekly limit" : "usage limit"
                        const back = d.resets_at ? ", back " + Qt.formatTime(new Date(d.resets_at * 1000), "HH:mm") : ""
                        return d.account + " " + lim + back
                    }
                    if (isFin) {
                        const n = (d.commits || []).length
                        const parts = [d.status === "limit" ? "usage limit" : row.s.label]
                        if (n) parts.push(n + (n === 1 ? " commit" : " commits"))
                        if ((d.resumed_from || []).length) parts.push("resumed " + d.resumed_from.length + "×")
                        return parts.join(" · ")
                    }
                    return d.state === "waiting" ? "waiting for your reply" : String(d.last_action || "").split("\n")[0]
                }
                readonly property color doingColor: copied ? root.cAccent
                    : isIntr ? root.cWarn
                    : isFin ? row.s.color
                    : d && d.state === "waiting" ? root.cAccent
                    : quiet ? root.cSub : root.cInfo
                readonly property string ageText: {
                    if (!d) return ""
                    if (isIntr) {
                        const t = Date.parse(String(d.last_event).replace(/(\.\d{3})\d+/, "$1"))
                        return isNaN(t) ? "" : "at " + Qt.formatTime(new Date(t), "HH:mm")
                    }
                    return CrowStore.age(isFin ? CrowStore.since(d.ended_at) : d.last_activity_s) + (isFin ? " ago" : "")
                }
                readonly property int ctxPct: d && !isFin && !isIntr ? CrowStore.contextPct(d.context_tokens || 0) : 0

                height: root.fBase + 10
                radius: root.rXs
                color: rowMa.containsMouse ? root.cHover : "transparent"

                Row {
                    anchors.fill: parent
                    Cell { width: panel.wGlyph; height: parent.height; text: row.s.glyph; color: row.s.color; font.bold: true; elide: Text.ElideNone }
                    Cell {
                        width: panel.wProject; height: parent.height
                        text: row.d ? row.d.project : ""
                        color: row.quiet ? root.cSub : root.cText
                        font.bold: !row.quiet && !(row.isFin && row.d && row.d.status === "done")
                    }
                    Cell {
                        width: panel.wTask; height: parent.height; leftPadding: panel.gap
                        text: row.task
                        color: row.quiet || row.isFin ? root.cSub : root.cText
                    }
                    Cell {
                        width: panel.wDetail; height: parent.height; leftPadding: panel.gap
                        text: row.doing
                        color: row.doingColor
                        font.pixelSize: root.fSm
                        font.bold: row.d && !row.isFin && !row.isIntr && row.d.state === "waiting"
                    }
                    Cell {
                        width: panel.wAge; height: parent.height
                        horizontalAlignment: Text.AlignRight
                        text: row.ageText
                        font.pixelSize: root.fSm
                    }
                    // Context only once a session nears compaction.
                    Cell {
                        width: panel.wCtx; height: parent.height; rightPadding: root.s1
                        horizontalAlignment: Text.AlignRight
                        text: row.ctxPct >= 70 ? row.ctxPct + "%" : ""
                        color: root.ctxColor(row.ctxPct)
                        font.pixelSize: root.fSm; font.bold: true
                    }
                }

                MouseArea {
                    id: rowMa
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: row.rowId ? Qt.PointingHandCursor : Qt.ArrowCursor
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    // Left: open the session (a headless run or a stopped session has no window: copy its id).
                    // Right: copy the id.
                    onClicked: mouse => {
                        if (mouse.button === Qt.RightButton || !row.d || row.isFin || row.isIntr || row.d.kind === "run") CrowStore.copy(row.rowId)
                        else CrowStore.openSession(row.d)
                    }
                }
            }
        }
    }
}
