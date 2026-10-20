pragma ComponentBehavior: Bound
import QtQuick
import "."

// Crow usage: one entry, two faces.
//   bar-zone      → pill: current account's 5h remaining gauge + today's cost
//   panel-content → panel: limits per account, today, 7-day cost, top sessions
// A bar injects holderRoot, a panel host injects panelRoot; neither is
// `required`, so one file serves both loaders. Data lives in CrowUsageStore.
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

    onConfigChanged: if (!panelMode) CrowUsageStore.configure(config)
    Component.onCompleted: { if (!panelMode) CrowUsageStore.configure(config); CrowUsageStore.poll() }

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

    // Remaining → semantic level: normal > 50, warning 20–50, critical < 20.
    function levelColor(pct) {
        if (pct === null || pct === undefined) return cMuted
        return pct > 50 ? cOk : pct >= 20 ? cWarn : cErr
    }
    function gauge(pct, cells) {
        var on = pct === null || pct === undefined ? 0 : Math.round(Math.max(0, Math.min(100, pct)) * cells / 100), s = ""
        for (var i = 0; i < cells; i++) s += i < on ? "▰" : "▱"
        return s
    }
    function pctText(pct) { return pct === null || pct === undefined ? "–" : pct + "%" }

    visible: _c !== null
    implicitWidth:  panelMode ? 540 : pill.implicitWidth
    implicitHeight: panelMode ? 480 : 22

    // ════════════════════════════ bar pill ════════════════════════════════
    Item {
        id: pill
        visible: !root.panelMode
        anchors.fill: parent
        implicitWidth: pillRow.implicitWidth + root.s3
        opacity: CrowUsageStore.available ? 1.0 : 0.45

        readonly property var cur: CrowUsageStore.current
        readonly property var pct: cur ? cur.remaining_5h_pct : null

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
            Text {
                text: root.gauge(pill.pct, 5)
                color: CrowUsageStore.available ? root.levelColor(pill.pct) : root.cMuted
                font.family: root.fFamily; font.pixelSize: root.fBase
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                visible: root._horizontal
                text: CrowUsageStore.available
                      ? root.pctText(pill.pct) + " · " + CrowUsageStore.money(CrowUsageStore.today.cost_usd)
                      : "–"
                color: CrowUsageStore.available ? root.cText : root.cSub
                font.family: root.fFamily; font.pixelSize: root.fBase
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        function popupLines() {
            if (!CrowUsageStore.available)
                return { primary: "crow usage unavailable", secondary: CrowUsageStore.error || CrowUsageStore.command }
            var c = pill.cur, t = CrowUsageStore.today
            var head = c ? c.account + ": " + root.pctText(c.remaining_5h_pct) + " 5h (reset " + CrowUsageStore.shortReset(c.reset_5h_at)
                           + ") · " + root.pctText(c.remaining_week_pct) + " week"
                         : "no limits (cdx status failed)"
            var sub = "today " + CrowUsageStore.money(t.cost_usd) + " · " + CrowUsageStore.human(t.tokens) + " tok · "
                      + (t.sessions || 0) + " sessions"
            return { primary: head, secondary: sub }
        }
        function showCard() {
            if (!root.holderRoot || !root._horizontal) return
            var p = popupLines()
            root.holderRoot.showPopup(pill, "CROW USAGE", p.primary, p.secondary, "click: usage panel")
        }

        Connections {
            target: CrowUsageStore
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
                root.holderRoot.togglePanel(root.widgetId || "plugin:crow-usage", root.holderRoot.side,
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

        // Column widths (monospace at sizeBase ≈ 7.5 px/char)
        readonly property int wMark: 16
        readonly property int wName: 66
        readonly property int wTag: 22
        readonly property int wGauge: 66
        readonly property int wPct: 40
        readonly property int wReset: Math.floor((width - wMark - wName) / 2) - wTag - wGauge - wPct
        // top sessions: project / model / tokens, cost takes the rest
        readonly property int wProject: Math.floor((width - wMark) * 0.38)
        readonly property int wModel: Math.floor((width - wMark) * 0.30)
        readonly property int wTok: Math.floor((width - wMark) * 0.16)

        readonly property bool hasData: CrowUsageStore.snap !== null
        readonly property var days: CrowUsageStore.days
        readonly property real maxDay: Math.max.apply(null, days.map(d => d.cost_usd || 0).concat([0.01]))
        readonly property real weekCost: days.reduce((a, d) => a + (d.cost_usd || 0), 0)

        component Head: Text {
            color: root.cText
            font.family: root.fFamily; font.pixelSize: root.fSm; font.bold: true
            font.letterSpacing: root._f ? root._f.trackingWide : 1
            topPadding: root.s2
        }
        component Cell: Text {
            color: root.cSub
            font.family: root.fFamily; font.pixelSize: root.fBase
            elide: Text.ElideRight
        }

        Flickable {
            anchors.fill: parent
            clip: true
            contentHeight: body.implicitHeight
            boundsBehavior: Flickable.StopAtBounds

            Column {
                id: body
                width: parent.width
                spacing: root.s1

                // ── title ──
                Item {
                    width: parent.width
                    height: titleTxt.implicitHeight
                    Text {
                        id: titleTxt
                        text: "󰊚  crow usage"
                        color: root.cAccent
                        font.family: root._f ? root._f.display : root.fFamily
                        font.pixelSize: root.fLg; font.bold: true
                    }
                    Text {
                        anchors.right: parent.right
                        anchors.baseline: titleTxt.baseline
                        text: CrowUsageStore.available
                              ? "updated " + Qt.formatTime(new Date(CrowUsageStore.updatedAt), "HH:mm")
                              : panel.hasData ? "stale · last poll failed" : "crow usage unavailable"
                        color: CrowUsageStore.available ? root.cMuted : root.cErr
                        font.family: root.fFamily; font.pixelSize: root.fSm
                    }
                }
                Text {
                    visible: !CrowUsageStore.available
                    width: parent.width
                    wrapMode: Text.WrapAnywhere
                    text: CrowUsageStore.error || CrowUsageStore.command
                    color: root.cMuted
                    font.family: root.fFamily; font.pixelSize: root.fSm
                }
                Rectangle { width: parent.width; height: 1; color: root.cBorder }

                // ── limits ──
                Head { text: "LIMITS"; visible: panel.hasData }
                Cell {
                    visible: panel.hasData && CrowUsageStore.limits.length === 0
                    x: panel.wMark
                    text: "no limits (cdx status failed)"
                    color: root.cMuted; font.pixelSize: root.fSm
                }
                Repeater {
                    model: CrowUsageStore.limits
                    delegate: Row {
                        id: acct
                        required property var modelData
                        readonly property bool cur: modelData.account === CrowUsageStore.currentAccount
                        Cell { width: panel.wMark; text: acct.cur ? "●" : ""; color: root.cAccent }
                        Cell {
                            width: panel.wName; text: acct.modelData.account
                            color: acct.cur ? root.cText : root.cSub; font.bold: acct.cur
                        }
                        Cell { width: panel.wTag; text: "5h"; color: root.cMuted }
                        Cell { width: panel.wGauge; elide: Text.ElideNone; text: root.gauge(acct.modelData.remaining_5h_pct, 5); color: root.levelColor(acct.modelData.remaining_5h_pct) }
                        Cell { width: panel.wPct; horizontalAlignment: Text.AlignRight; text: root.pctText(acct.modelData.remaining_5h_pct); color: root.levelColor(acct.modelData.remaining_5h_pct) }
                        Cell { width: panel.wReset; leftPadding: root.s1 + 2; text: CrowUsageStore.shortReset(acct.modelData.reset_5h_at); color: root.cMuted }
                        Cell { width: panel.wTag; text: "wk"; color: root.cMuted }
                        Cell { width: panel.wGauge; elide: Text.ElideNone; text: root.gauge(acct.modelData.remaining_week_pct, 5); color: root.levelColor(acct.modelData.remaining_week_pct) }
                        Cell { width: panel.wPct; horizontalAlignment: Text.AlignRight; text: root.pctText(acct.modelData.remaining_week_pct); color: root.levelColor(acct.modelData.remaining_week_pct) }
                        Cell { width: panel.wReset; leftPadding: root.s1 + 2; text: CrowUsageStore.shortReset(acct.modelData.reset_week_at); color: root.cMuted }
                    }
                }

                // ── today ──
                Head { text: "TODAY"; visible: panel.hasData }
                Row {
                    visible: panel.hasData
                    x: panel.wMark
                    spacing: root.s2
                    Text {
                        id: todayCost
                        text: CrowUsageStore.money(CrowUsageStore.today.cost_usd)
                        color: root.cText
                        font.family: root.fFamily; font.pixelSize: root.fLg; font.bold: true
                    }
                    Cell {
                        anchors.baseline: todayCost.baseline
                        text: CrowUsageStore.human(CrowUsageStore.today.tokens) + " tok · "
                              + (CrowUsageStore.today.cache_pct ?? "–") + "% cache · "
                              + (CrowUsageStore.today.sessions || 0) + " sessions"
                    }
                }

                // ── 7-day cost sparkline ──
                Item {
                    visible: panel.hasData
                    width: parent.width
                    height: weekHead.implicitHeight
                    Head { id: weekHead; text: "LAST " + panel.days.length + " DAYS" }
                    Cell {
                        anchors.right: parent.right
                        anchors.baseline: weekHead.baseline
                        text: CrowUsageStore.money(panel.weekCost) + " total · max " + CrowUsageStore.money(panel.maxDay > 0.01 ? panel.maxDay : 0)
                        color: root.cMuted; font.pixelSize: root.fSm
                    }
                }
                Row {
                    id: spark
                    visible: panel.hasData
                    x: panel.wMark
                    spacing: root.s1
                    readonly property int barW: Math.floor((body.width - panel.wMark - spacing * 6) / 7)
                    readonly property int barH: 36
                    Repeater {
                        model: panel.days
                        delegate: Column {
                            id: dayCol
                            required property var modelData
                            readonly property bool isToday: modelData.date === CrowUsageStore.todayKey
                            readonly property real cost: modelData.cost_usd || 0
                            spacing: 2
                            Item {
                                width: spark.barW
                                height: spark.barH
                                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: root.cBorder }
                                Rectangle {
                                    anchors.bottom: parent.bottom
                                    width: parent.width
                                    height: dayCol.cost > 0 ? Math.max(2, Math.round(spark.barH * dayCol.cost / panel.maxDay)) : 0
                                    radius: root._r ? root._r.xs : 4
                                    color: dayCol.isToday ? root.cAccent : root.cInfo
                                    opacity: dayCol.isToday ? 1.0 : 0.7
                                }
                            }
                            Text {
                                width: spark.barW
                                horizontalAlignment: Text.AlignHCenter
                                text: dayCol.cost >= 10 ? "$" + Math.round(dayCol.cost) : CrowUsageStore.money(dayCol.cost)
                                color: dayCol.isToday ? root.cText : root.cSub
                                font.family: root.fFamily; font.pixelSize: root.fSm; font.bold: dayCol.isToday
                            }
                            Text {
                                width: spark.barW
                                horizontalAlignment: Text.AlignHCenter
                                text: Qt.formatDate(new Date(dayCol.modelData.date + "T12:00:00"), "ddd")
                                color: dayCol.isToday ? root.cAccent : root.cMuted
                                font.family: root.fFamily; font.pixelSize: root.fSm
                            }
                        }
                    }
                }

                // ── top sessions today ──
                Head { text: "TOP SESSIONS TODAY (" + CrowUsageStore.todaySessions.length + ")"; visible: panel.hasData }
                Cell {
                    visible: panel.hasData && CrowUsageStore.topSessions.length === 0
                    x: panel.wMark
                    text: "none"
                    color: root.cMuted; font.pixelSize: root.fSm
                }
                Repeater {
                    model: CrowUsageStore.topSessions
                    delegate: Row {
                        id: sess
                        required property var modelData
                        readonly property string glyph: modelData.active ? "●" : modelData.kind === "run" ? "⚙" : "✓"
                        Cell { width: panel.wMark; text: sess.glyph; color: sess.modelData.active ? root.cOk : root.cMuted }
                        Cell { width: panel.wProject; text: sess.modelData.project; color: root.cText }
                        Cell { width: panel.wModel; text: CrowUsageStore.modelName(sess.modelData.models) }
                        Cell { width: panel.wTok; horizontalAlignment: Text.AlignRight; text: CrowUsageStore.human(sess.modelData.tokens); color: root.cMuted }
                        Cell {
                            width: body.width - panel.wMark - panel.wProject - panel.wModel - panel.wTok
                            horizontalAlignment: Text.AlignRight
                            text: CrowUsageStore.money(sess.modelData.cost_usd)
                            color: root.cText; font.bold: true
                        }
                    }
                }

                // ── footer ──
                Rectangle { visible: panel.hasData; width: parent.width; height: 1; color: root.cBorder; opacity: 0.6 }
                Row {
                    visible: panel.hasData
                    x: panel.wMark
                    spacing: root.s1
                    Cell { text: "rtk"; color: root.cMuted }
                    Cell {
                        text: "saved " + CrowUsageStore.human(CrowUsageStore.rtk.saved_tokens) + " tok"
                              + (CrowUsageStore.rtk.saved_pct !== null && CrowUsageStore.rtk.saved_pct !== undefined
                                 ? " (" + Math.round(CrowUsageStore.rtk.saved_pct) + "%)" : "")
                        color: root.cOk
                    }
                }
                Row {
                    visible: panel.hasData
                    x: panel.wMark
                    spacing: root.s1
                    readonly property int pending: CrowUsageStore.retros.pending_proposals || 0
                    Cell { text: "retros"; color: root.cMuted }
                    Cell { text: (CrowUsageStore.retros.today ?? "–") + " today ·"; color: root.cText }
                    Cell {
                        text: (CrowUsageStore.retros.pending_proposals ?? "–") + " proposals pending"
                        color: parent.pending > 0 ? root.cAccent : root.cText
                        font.bold: parent.pending > 0
                    }
                }
            }
        }
    }
}
