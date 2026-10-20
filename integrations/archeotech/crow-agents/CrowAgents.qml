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
    readonly property real _panelW: 620
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
                radius: Math.min(root.rXs, 3)
                color: sg.live && index < sg.busy ? root.cOk : root.cTrack
                border.width: sg.live && index < sg.busy ? 0 : 1
                border.color: root.cBorder
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
                visible: CrowStore.available && CrowStore.waiting > 0
                text: "◆" + CrowStore.waiting
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

        // Natural height (title + table header + rows), for implicitAxis/Perp.
        readonly property real contentH: header.implicitHeight + 6 + list.implicitHeight + 2 * root.s4

        // Row model: section headers, agent/finished rows, "none" placeholders.
        readonly property var rows: {
            var out = []
            function section(name, list, kind) {
                out.push({ type: "head", text: name + " (" + list.length + ")" })
                if (!list.length) out.push({ type: "none" })
                list.forEach(x => out.push({ type: kind, d: x }))
            }
            section("RUNS", CrowStore.runs, "agent")
            section("SESSIONS", CrowStore.sessions, "agent")
            section("FINISHED", CrowStore.finished, "fin")
            return out
        }

        // Columns: glyph | project | task / session (flex) | state | context | commits
        readonly property int wGlyph: 18
        readonly property int wProject: 110
        readonly property int wState: 84
        readonly property int wCtx: 84
        readonly property int wCom: 60
        readonly property int wTask: width - wGlyph - wProject - wState - wCtx - wCom
        readonly property int gap: root.s2

        component Cell: Text {
            color: root.cSub
            font.family: root.fFamily; font.pixelSize: root.fBase
            elide: Text.ElideRight
            verticalAlignment: Text.AlignVCenter
        }
        component HeadCell: Text {
            color: root.cSub
            font.family: root.fFamily; font.pixelSize: root.fSm; font.bold: true
            verticalAlignment: Text.AlignVCenter
            height: parent ? parent.height : implicitHeight
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
                              : CrowStore.busy + "/" + CrowStore.maxSlots + " runs busy"
                        color: CrowStore.available ? root.cSub : root.cErr
                        font.family: root.fFamily; font.pixelSize: root.fSm
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Text {
                        visible: CrowStore.available && CrowStore.waiting > 0
                        text: "◆" + CrowStore.waiting + " waiting"
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

            // Table header: a recessed band with one label per column.
            Rectangle {
                width: parent.width
                height: root.fSm + 12
                radius: root.rXs
                color: root.cTrack
                border.width: 1
                border.color: root.cBorder
                Row {
                    anchors.fill: parent
                    HeadCell { width: panel.wGlyph + panel.wProject; leftPadding: panel.wGlyph; text: "project" }
                    HeadCell { width: panel.wTask; leftPadding: panel.gap; text: "task / session" }
                    HeadCell { width: panel.wState; leftPadding: panel.gap; text: "state" }
                    HeadCell { width: panel.wCtx; leftPadding: panel.gap; text: "context" }
                    HeadCell { width: panel.wCom; rightPadding: root.s2; horizontalAlignment: Text.AlignRight; text: "commits" }
                }
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
                property var entry
                height: noneTxt.implicitHeight + 4
                Text {
                    id: noneTxt
                    x: panel.wGlyph
                    text: "none"
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
                readonly property bool isFin: !!entry && entry.type === "fin"
                readonly property var s: root.st(d ? (isFin ? d.status : d.state) : "")
                readonly property string rowId: !d ? "" : (d.run_id || d.session_id || "")
                readonly property bool copied: rowId !== "" && CrowStore.copiedId === rowId
                readonly property bool live: !isFin && !!d && (d.state === "working" || d.state === "waiting")

                readonly property string task: {
                    if (!d) return ""
                    if (d.label) return d.label
                    if (d.title) return d.title
                    if (isFin) return ""
                    return d.kind === "session" ? "session " + CrowStore.shortId(d.session_id) : "(not dispatched by crow)"
                }
                readonly property string doing: {
                    if (!d) return ""
                    if (copied) return "copied " + rowId
                    if (isFin) {
                        const n = (d.resumed_from || []).length
                        return n > 0 ? "resumed " + n + "×" : ""
                    }
                    return d.state === "waiting" ? "waiting for your reply" : (d.last_action || "")
                }
                readonly property color doingColor: copied ? root.cAccent
                    : d && !isFin && d.state === "waiting" ? root.cAccent : root.cInfo
                readonly property string ageText: !d ? ""
                    : CrowStore.age(isFin ? CrowStore.since(d.ended_at) : d.last_activity_s) + " ago"
                readonly property int ctxPct: d && !isFin ? CrowStore.contextPct(d.context_tokens || 0) : 0
                readonly property bool hasCtx: !!d && !isFin && (d.context_tokens || 0) > 0

                height: rowCol.implicitHeight + 6
                radius: root.rXs
                color: rowMa.containsMouse ? root.cHover : "transparent"

                Column {
                    id: rowCol
                    y: 3
                    width: parent.width
                    spacing: 1
                    Row {
                        height: root.fBase + 6
                        Cell { width: panel.wGlyph; text: row.s.glyph; color: row.s.color; font.bold: true; elide: Text.ElideNone; height: parent.height }
                        Cell {
                            width: panel.wProject; height: parent.height
                            text: row.d ? row.d.project : ""
                            color: root.cText; font.bold: !row.isFin
                        }
                        Cell {
                            width: panel.wTask; height: parent.height; leftPadding: panel.gap
                            text: row.task
                            color: row.isFin ? root.cSub : root.cText
                        }
                        Cell {
                            width: panel.wState; height: parent.height; leftPadding: panel.gap
                            text: row.s.label
                            color: row.live || row.isFin ? row.s.color : root.cSub
                            font.bold: row.live
                        }
                        // Context used: a bar against the 1M window plus the % number.
                        Item {
                            width: panel.wCtx; height: parent.height
                            Rectangle {
                                id: ctxTrack
                                visible: row.hasCtx
                                x: panel.gap
                                anchors.verticalCenter: parent.verticalCenter
                                width: parent.width - panel.gap - ctxNum.width - root.s1
                                height: 6
                                radius: 3
                                color: root.cTrack
                                border.width: 1
                                border.color: root.cBorder
                                Rectangle {
                                    width: Math.max(height, parent.width * row.ctxPct / 100)
                                    height: parent.height
                                    radius: parent.radius
                                    color: root.ctxColor(row.ctxPct)
                                }
                            }
                            Text {
                                id: ctxNum
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                width: 32
                                horizontalAlignment: Text.AlignRight
                                text: row.isFin ? "" : row.hasCtx ? row.ctxPct + "%" : "–"
                                color: row.hasCtx ? root.ctxColor(row.ctxPct) : root.cSub
                                font.family: root.fFamily; font.pixelSize: root.fSm; font.bold: row.hasCtx
                            }
                        }
                        Cell {
                            width: panel.wCom; height: parent.height; rightPadding: root.s2
                            horizontalAlignment: Text.AlignRight
                            text: !row.d || (!row.isFin && row.d.kind !== "run") ? "" : String((row.d.commits || []).length)
                            color: (row.d && (row.d.commits || []).length > 0) ? root.cInfo : root.cSub
                        }
                    }
                    Row {
                        Text { width: panel.wGlyph; text: ""; font.pixelSize: root.fSm }
                        Text {
                            id: arrow
                            visible: row.doing !== ""
                            text: "↳ "; color: root.cMuted
                            font.family: root.fFamily; font.pixelSize: root.fSm
                        }
                        Text {
                            width: panel.wProject + panel.wTask - (arrow.visible ? arrow.implicitWidth : 0)
                            elide: Text.ElideRight
                            text: row.doing
                            color: row.doingColor
                            font.family: root.fFamily; font.pixelSize: root.fSm
                        }
                        Text {
                            width: panel.wState
                            leftPadding: panel.gap
                            text: row.ageText
                            color: root.cSub
                            font.family: root.fFamily; font.pixelSize: root.fSm
                        }
                    }
                }

                MouseArea {
                    id: rowMa
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: row.rowId ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: CrowStore.copy(row.rowId)
                }
            }
        }
    }
}
