pragma ComponentBehavior: Bound
import QtQuick
import "."

// Crow agents: one entry, two faces.
//   bar-zone      → pill: slot gauge + attention badge, hover summary, click opens the panel
//   panel-content → panel: RUNS / SESSIONS / FINISHED rows, like `crow watch`
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
    // Token groups, each null until the theme is injected (guard per group).
    readonly property var _c: _a && _a.colors ? _a.colors : null
    readonly property var _f: _a && _a.font ? _a.font : null
    readonly property var _r: _a && _a.radius ? _a.radius : null
    readonly property var _m: _a && _a.anim ? _a.anim : null

    readonly property bool panelMode: !holderRoot
    readonly property bool _horizontal: !holderRoot || holderRoot.horizontal !== false

    onConfigChanged: if (!panelMode) CrowStore.configure(config)
    Component.onCompleted: { if (!panelMode) CrowStore.configure(config); CrowStore.poll() }

    // ── theme (semantic roles only; literals are fallbacks until injection) ──
    readonly property color cText:    _c ? _c.textPrimary   : "#cdd6f4"
    readonly property color cSub:     _c ? _c.textSecondary : "#bac2de"
    readonly property color cMuted:   _c ? _c.textMuted     : "#7f849c"
    readonly property color cAccent:  _c ? _c.accent        : "#cba6f7"
    readonly property color cOk:      _c ? _c.success       : "#a6e3a1"
    readonly property color cWarn:    _c ? _c.warning       : "#f9e2af"
    readonly property color cErr:     _c ? _c.error         : "#f38ba8"
    readonly property color cInfo:    _c ? _c.info          : "#89dceb"
    readonly property color cBorder:  _c ? _c.borderSubtle  : "#45475a"
    readonly property color cHover:   _c ? _c.stateHover    : "#313244"
    readonly property string fFamily: _f ? _f.family : "monospace"
    readonly property int fSm:   _f ? _f.sizeSm   : 11
    readonly property int fBase: _f ? _f.sizeBase : 13
    readonly property int fLg:   _f ? _f.sizeLg   : 15

    readonly property var _styles: ({
        working: { glyph: "●", label: "working",     color: cOk },
        quiet:   { glyph: "◌", label: "quiet",       color: cWarn },
        waiting: { glyph: "◆", label: "needs you",   color: cAccent },
        idle:    { glyph: "○", label: "idle",        color: cMuted },
        done:    { glyph: "✓", label: "done",        color: cOk },
        failed:  { glyph: "✗", label: "failed",      color: cErr },
        limit:   { glyph: "⏸", label: "usage limit", color: cWarn },
        lost:    { glyph: "?", label: "lost",        color: cMuted }
    })
    function st(name) { return _styles[name] || { glyph: "?", label: name || "?", color: cMuted } }

    function gauge(busy, max) {
        var n = Math.max(1, Math.min(max, 6)), s = ""
        for (var i = 0; i < n; i++) s += i < busy ? "▰" : "▱"
        return s
    }

    implicitWidth:  panelMode ? 540 : pill.implicitWidth
    implicitHeight: panelMode ? 560 : 22

    // ════════════════════════════ bar pill ════════════════════════════════
    Item {
        id: pill
        visible: !root.panelMode
        anchors.fill: parent
        implicitWidth: pillRow.implicitWidth + 14
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
            spacing: 6
            Text {
                text: root.gauge(CrowStore.busy, CrowStore.maxSlots)
                color: CrowStore.busy > 0 ? root.cOk : root.cMuted
                font.family: root.fFamily; font.pixelSize: root.fBase
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                visible: root._horizontal
                text: CrowStore.available ? CrowStore.busy + "/" + CrowStore.maxSlots : "–"
                color: CrowStore.busy > 0 ? root.cText : root.cSub
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
            CrowStore.agents.forEach(a => {
                if (a.state !== "working" && a.state !== "waiting") return
                var what = a.state === "waiting" ? "waiting for your reply"
                         : (a.label ? a.label + ": " : "") + (a.last_action || "")
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
        anchors.margins: 16

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

        // Column widths (FiraCode-ish monospace at sizeBase ≈ 8 px/char)
        readonly property int wGlyph: 18
        readonly property int wProject: 132
        readonly property int wAge: 46
        readonly property int wCtx: 46
        readonly property int wCom: 34

        Column {
            id: header
            width: parent.width
            spacing: 8

            Item {
                width: parent.width
                height: titleRow.implicitHeight
                Row {
                    id: titleRow
                    spacing: 10
                    Text {
                        id: titleTxt
                        text: "󰚩  crow agents"
                        color: root.cAccent
                        font.family: root._f ? root._f.display : root.fFamily
                        font.pixelSize: root.fLg; font.bold: true
                    }
                    Text {
                        anchors.baseline: titleTxt.baseline
                        text: CrowStore.available
                              ? root.gauge(CrowStore.busy, CrowStore.maxSlots) + " " + CrowStore.busy + "/" + CrowStore.maxSlots
                                + (CrowStore.waiting > 0 ? "   ◆" + CrowStore.waiting : "")
                              : "crow unavailable"
                        color: CrowStore.available ? root.cSub : root.cErr
                        font.family: root.fFamily; font.pixelSize: root.fBase
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

            Row {
                x: panel.wGlyph
                Text { width: panel.wProject; text: "project"; color: root.cMuted; font.family: root.fFamily; font.pixelSize: root.fSm }
                Text { width: panel.wAge; horizontalAlignment: Text.AlignRight; text: "active"; color: root.cMuted; font.family: root.fFamily; font.pixelSize: root.fSm }
                Text { width: panel.wCtx; horizontalAlignment: Text.AlignRight; text: "ctx"; color: root.cMuted; font.family: root.fFamily; font.pixelSize: root.fSm }
                Text { width: panel.wCom; horizontalAlignment: Text.AlignRight; text: "com"; color: root.cMuted; font.family: root.fFamily; font.pixelSize: root.fSm }
                Text { leftPadding: 10; text: "task  ↳ doing now"; color: root.cMuted; font.family: root.fFamily; font.pixelSize: root.fSm }
            }
            Rectangle { width: parent.width; height: 1; color: root.cBorder }
        }

        Flickable {
            anchors.top: header.bottom
            anchors.topMargin: 6
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
                height: headTxt.implicitHeight + 10
                Text {
                    id: headTxt
                    anchors.bottom: parent.bottom
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

                readonly property string task: {
                    if (!d) return ""
                    if (d.label) return d.label
                    if (isFin) return ""
                    return d.kind === "session" ? "session " + CrowStore.shortId(d.session_id) : "(not dispatched by crow)"
                }
                readonly property string doing: {
                    if (!d) return ""
                    if (copied) return "copied " + rowId
                    if (isFin) {
                        var n = (d.resumed_from || []).length
                        return s.label + (n > 0 ? " · resumed " + n + "×" : "")
                    }
                    return d.state === "waiting" ? "waiting for your reply" : (d.last_action || "")
                }
                readonly property color doingColor: copied ? root.cAccent
                    : isFin ? s.color : (d && d.state === "waiting" ? root.cAccent : root.cInfo)
                readonly property int ctxK: d && !isFin && d.context_tokens ? Math.floor(d.context_tokens / 1000) : 0

                height: rowCol.implicitHeight + 6
                radius: root._r ? root._r.xs : 4
                color: rowMa.containsMouse ? root.cHover : "transparent"

                Column {
                    id: rowCol
                    y: 3
                    width: parent.width
                    spacing: 1
                    Row {
                        Text { width: panel.wGlyph; text: row.s.glyph; color: row.s.color; font.family: root.fFamily; font.pixelSize: root.fBase; font.bold: true }
                        Text {
                            width: panel.wProject; elide: Text.ElideRight
                            text: row.d ? row.d.project : ""
                            color: root.cText; font.family: root.fFamily; font.pixelSize: root.fBase; font.bold: !row.isFin
                        }
                        Text {
                            width: panel.wAge; horizontalAlignment: Text.AlignRight
                            text: !row.d ? "" : CrowStore.age(row.isFin ? CrowStore.since(row.d.ended_at) : row.d.last_activity_s)
                            color: (!row.isFin && row.d && (row.d.state === "working" || row.d.state === "waiting")) ? row.s.color : root.cMuted
                            font.family: root.fFamily; font.pixelSize: root.fBase
                        }
                        Text {
                            width: panel.wCtx; horizontalAlignment: Text.AlignRight
                            text: row.isFin ? "" : (row.ctxK > 0 ? row.ctxK + "k" : "–")
                            color: row.ctxK >= 400 ? root.cErr : row.ctxK >= 150 ? root.cWarn : row.ctxK > 0 ? root.cOk : root.cMuted
                            font.family: root.fFamily; font.pixelSize: root.fBase; font.bold: row.ctxK >= 400
                        }
                        Text {
                            width: panel.wCom; horizontalAlignment: Text.AlignRight
                            text: !row.d || (!row.isFin && row.d.kind !== "run") ? "" : String((row.d.commits || []).length)
                            color: root.cInfo; font.family: root.fFamily; font.pixelSize: root.fBase
                        }
                        Text {
                            leftPadding: 10
                            width: row.width - panel.wGlyph - panel.wProject - panel.wAge - panel.wCtx - panel.wCom
                            elide: Text.ElideRight
                            text: row.task
                            color: root.cSub; font.family: root.fFamily; font.pixelSize: root.fBase
                        }
                    }
                    Row {
                        x: panel.wGlyph
                        Text { id: arrow; text: "↳ "; color: root.cMuted; font.family: root.fFamily; font.pixelSize: root.fSm }
                        Text {
                            width: row.width - panel.wGlyph - arrow.implicitWidth - 4
                            elide: Text.ElideRight
                            text: row.doing
                            color: row.doingColor
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
