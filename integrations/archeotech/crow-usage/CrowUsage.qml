pragma ComponentBehavior: Bound
import QtQuick
import "."

// Crow usage: one entry, two faces.
//   bar-zone      → pill: current account's 5h remaining gauge + today's cost
//   panel-content → panel: limits, today, 7-day cost, top sessions, savings
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

    // Auto-compact: on a short bar (a vertical monitor) the pill keeps only the
    // gauge and %; the cost moves to the hover card.
    readonly property int compactBelow: config && config.compactBelow !== undefined ? config.compactBelow : 1400
    readonly property real _barLength: !holderRoot ? 0
        : (holderRoot.horizontal !== false ? holderRoot.width : holderRoot.height)
    readonly property bool compact: _barLength > 0 && _barLength < compactBelow

    onConfigChanged: if (!panelMode) CrowUsageStore.configure(config)
    // The loader injects `config` after creation: poll on the next tick so the
    // pill's command is in place (the store re-polls anyway if it changes).
    Component.onCompleted: { if (!panelMode) CrowUsageStore.configure(config); Qt.callLater(CrowUsageStore.poll) }

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

    // Remaining → semantic level: normal > 50, warning 20–50, critical < 20.
    function levelColor(pct) {
        if (pct === null || pct === undefined) return cSub
        return pct > 50 ? cOk : pct >= 20 ? cWarn : cErr
    }
    function pctText(pct) { return pct === null || pct === undefined ? "–" : pct + "%" }
    // "▼ 18%/h · empty ~15:40" for an account whose 5h window runs out before reset.
    function burnText(l) {
        if (!l || !l.empty_at) return ""
        var b = l.burn_5h_pct_per_h
        return "▼ " + (b !== null && b !== undefined ? Math.round(b) + "%/h · " : "")
               + "empty ~" + CrowUsageStore.clock(l.empty_at)
    }

    visible: _c !== null
    implicitWidth:  panelMode ? 620 : pill.implicitWidth
    implicitHeight: panelMode ? 720 : 22

    // Panel footprint (manifest axisSize "auto"): width along a horizontal
    // holder, content height along a vertical one. implicitPerp drives the
    // depth where the holder honours it (strips); a bar dropdown uses `size`.
    readonly property bool _panelH: !panelRoot || panelRoot.horizontal !== false
    readonly property real _panelW: 620
    readonly property real _panelContentH: Math.max(240, body.implicitHeight + 2 * s4)
    readonly property real implicitAxis: !panelMode ? 0 : _panelH ? _panelW : _panelContentH
    readonly property real implicitPerp: !panelMode ? 0 : _panelH ? _panelContentH : _panelW

    // A limit gauge, same look as crow watch: a thick bar on a solid track
    // (no outline), fill proportional to %, level colour.
    component Gauge: Rectangle {
        id: g
        property var pct: null
        property bool live: true
        implicitWidth: 40
        height: 9
        radius: 2
        color: root.cBorder
        Rectangle {
            readonly property real f: g.pct === null || g.pct === undefined ? 0 : Math.max(0, Math.min(100, g.pct)) / 100
            visible: g.live && f > 0
            width: Math.max(g.radius * 2, g.width * f)
            height: g.height
            radius: g.radius
            color: root.levelColor(g.pct)
        }
    }

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
            Gauge {
                width: root._horizontal ? 36 : 14
                pct: pill.pct
                live: CrowUsageStore.available
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                visible: root._horizontal
                text: CrowUsageStore.available ? root.pctText(pill.pct) : "–"
                color: CrowUsageStore.available ? root.levelColor(pill.pct) : root.cSub
                font.family: root.fFamily; font.pixelSize: root.fBase; font.bold: true
                anchors.verticalCenter: parent.verticalCenter
            }
            // Thin divider between the limit and the spend.
            Rectangle {
                visible: root._horizontal && !root.compact && CrowUsageStore.available
                width: 1; height: root.fBase
                color: root.cBorder
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                visible: root._horizontal && !root.compact && CrowUsageStore.available
                text: CrowUsageStore.money(CrowUsageStore.today.cost_usd)
                color: root.cSub
                font.family: root.fFamily; font.pixelSize: root.fBase
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        function popupLines() {
            if (!CrowUsageStore.available)
                return { primary: "crow usage unavailable", secondary: CrowUsageStore.error || CrowUsageStore.command }
            var c = pill.cur, t = CrowUsageStore.today
            var head = c ? CrowUsageStore.who(c) + ": " + root.pctText(c.remaining_5h_pct) + " 5h (reset " + CrowUsageStore.shortReset(c.reset_5h_at)
                           + ") · " + root.pctText(c.remaining_week_pct) + " week"
                         : "no limits (cdx status failed)"
            var sub = "today " + CrowUsageStore.money(t.cost_usd) + " · " + CrowUsageStore.human(t.tokens) + " tok · "
                      + (t.sessions || 0) + " sessions"
            var burn = root.burnText(c)
            if (burn) sub = burn + "\n" + sub
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

        readonly property int rowH: root.fBase + 7
        // limits: mark | account | (tag gauge pct reset) ×2
        readonly property int wMark: 16
        readonly property int wName: 72
        readonly property int wTag: 24
        readonly property int wPct: 40
        readonly property int wReset: 54
        readonly property int wHalf: Math.floor((width - wMark - wName) / 2)
        readonly property int wGauge: wHalf - wTag - wPct - wReset - 4 * root.s2   // 3 gaps + the 2nd half's lead
        // top sessions: mark | title (flex) | project | tokens | cost
        readonly property int wProject: 104
        readonly property int wTok: 64
        readonly property int wCost: 68
        readonly property int wTitle: width - wMark - wProject - wTok - wCost

        readonly property bool hasData: CrowUsageStore.snap !== null
        readonly property var days: CrowUsageStore.days
        readonly property real maxDay: Math.max.apply(null, days.map(d => d.cost_usd || 0).concat([0.01]))
        readonly property real weekCost: days.reduce((a, d) => a + (d.cost_usd || 0), 0)
        readonly property var t: CrowUsageStore.today

        component Head: Text {
            color: root.cText
            font.family: root.fFamily; font.pixelSize: root.fSm; font.bold: true
            font.letterSpacing: root._f ? root._f.trackingWide : 1
            topPadding: root.s3
            bottomPadding: 2
        }
        component Cell: Text {
            color: root.cSub
            font.family: root.fFamily; font.pixelSize: root.fBase
            elide: Text.ElideRight
            verticalAlignment: Text.AlignVCenter
            height: panel.rowH
        }

        Flickable {
            anchors.fill: parent
            clip: true
            contentHeight: body.implicitHeight
            boundsBehavior: Flickable.StopAtBounds

            Column {
                id: body
                width: parent.width
                spacing: 2

                // ── title ──
                Item {
                    width: parent.width
                    height: titleTxt.implicitHeight + root.s1
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
                        color: CrowUsageStore.available ? root.cSub : root.cErr
                        font.family: root.fFamily; font.pixelSize: root.fSm
                    }
                }
                Text {
                    visible: !CrowUsageStore.available
                    width: parent.width
                    wrapMode: Text.WrapAnywhere
                    text: CrowUsageStore.error || CrowUsageStore.command
                    color: root.cSub
                    font.family: root.fFamily; font.pixelSize: root.fSm
                    bottomPadding: root.s1
                }
                Rectangle { width: parent.width; height: 1; color: root.cBorder }

                // ── limits (current account first) ──
                Head { text: "LIMITS"; visible: panel.hasData }
                Cell {
                    visible: panel.hasData && CrowUsageStore.limits.length === 0
                    x: panel.wMark
                    text: "no limits (cdx status failed)"
                }
                Repeater {
                    model: panel.hasData ? CrowUsageStore.sortedLimits : []
                    delegate: Column {
                        id: acct
                        required property var modelData
                        readonly property bool cur: modelData.account === CrowUsageStore.currentAccount
                        readonly property string burn: cur ? root.burnText(modelData) : ""
                        Row {
                            Cell { width: panel.wMark; text: acct.cur ? "●" : ""; color: root.cAccent; elide: Text.ElideNone }
                            Cell {
                                width: panel.wName; text: CrowUsageStore.who(acct.modelData)
                                color: acct.cur ? root.cText : root.cSub; font.bold: acct.cur
                            }
                            Repeater {
                                model: [
                                    { tag: "5h", pct: acct.modelData.remaining_5h_pct, reset: acct.modelData.reset_5h_at },
                                    { tag: "wk", pct: acct.modelData.remaining_week_pct, reset: acct.modelData.reset_week_at }
                                ]
                                delegate: Row {
                                    id: half
                                    required property var modelData
                                    required property int index
                                    width: panel.wHalf
                                    spacing: root.s2
                                    leftPadding: half.index > 0 ? root.s2 : 0
                                    Cell { width: panel.wTag; text: half.modelData.tag; color: root.cSub }
                                    Gauge {
                                        width: panel.wGauge
                                        pct: half.modelData.pct
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                    Cell {
                                        width: panel.wPct; horizontalAlignment: Text.AlignRight
                                        text: root.pctText(half.modelData.pct)
                                        color: root.levelColor(half.modelData.pct); font.bold: true
                                        elide: Text.ElideNone
                                    }
                                    Cell { width: panel.wReset; text: CrowUsageStore.shortReset(half.modelData.reset); elide: Text.ElideNone }
                                }
                            }
                        }
                        Cell {
                            visible: acct.burn !== ""
                            x: panel.wMark + panel.wName
                            text: acct.burn
                            color: root.cWarn; font.bold: true; font.pixelSize: root.fSm
                            height: root.fSm + 6
                            verticalAlignment: Text.AlignTop
                        }
                    }
                }

                // ── today ──
                Head { text: "TODAY"; visible: panel.hasData }
                Item {
                    visible: panel.hasData
                    width: parent.width
                    height: todayCost.implicitHeight
                    Row {
                        x: panel.wMark
                        spacing: root.s2
                        Text {
                            id: todayCost
                            text: CrowUsageStore.money(panel.t.cost_usd)
                            color: root.cText
                            font.family: root.fFamily; font.pixelSize: root.fLg + 2; font.bold: true
                        }
                        Text {
                            anchors.baseline: todayCost.baseline
                            text: CrowUsageStore.human(panel.t.tokens) + " tok · " + (panel.t.sessions || 0) + " sessions"
                                  + (panel.t.unpriced > 0 ? " · " + panel.t.unpriced + " unpriced" : "")
                            color: root.cSub
                            font.family: root.fFamily; font.pixelSize: root.fBase
                        }
                    }
                    Text {
                        id: weekCostTxt
                        anchors.right: parent.right
                        y: todayCost.baselineOffset - baselineOffset   // share the big cost's baseline
                        text: CrowUsageStore.money(panel.weekCost)
                        color: root.cText
                        font.family: root.fFamily; font.pixelSize: root.fBase; font.bold: true
                    }
                    Text {
                        anchors.right: weekCostTxt.left
                        anchors.rightMargin: root.s1 + 2
                        anchors.baseline: weekCostTxt.baseline
                        text: "7 days"
                        color: root.cSub
                        font.family: root.fFamily; font.pixelSize: root.fBase
                    }
                }
                // ── 7-day cost bars ──
                Item {
                    visible: panel.hasData
                    width: parent.width
                    height: weekHead.implicitHeight
                    Head { id: weekHead; text: "LAST " + panel.days.length + " DAYS" }
                    Text {
                        anchors.right: parent.right
                        anchors.baseline: weekHead.baseline
                        text: CrowUsageStore.human(CrowUsageStore.week.tokens) + " tok · max "
                              + CrowUsageStore.money(panel.maxDay > 0.01 ? panel.maxDay : 0)
                        color: root.cSub
                        font.family: root.fFamily; font.pixelSize: root.fSm
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
                                    radius: root.rXs
                                    color: dayCol.isToday ? root.cAccent : root.cInfo
                                    opacity: dayCol.isToday ? 1.0 : 0.7
                                }
                            }
                            Text {
                                width: spark.barW
                                horizontalAlignment: Text.AlignHCenter
                                // a day with nothing priced is unknown ("–"), not $0.00
                                text: dayCol.modelData.cost_usd === null ? CrowUsageStore.money(null)
                                    : dayCol.cost >= 10 ? "$" + Math.round(dayCol.cost) : CrowUsageStore.money(dayCol.cost)
                                color: dayCol.isToday ? root.cText : root.cSub
                                font.family: root.fFamily; font.pixelSize: root.fSm; font.bold: dayCol.isToday
                            }
                            Text {
                                width: spark.barW
                                horizontalAlignment: Text.AlignHCenter
                                text: Qt.formatDate(new Date(dayCol.modelData.date + "T12:00:00"), "ddd")
                                color: dayCol.isToday ? root.cAccent : root.cSub
                                font.family: root.fFamily; font.pixelSize: root.fSm
                            }
                        }
                    }
                }

                // ── top sessions today (today's slice of each session) ──
                Head { text: "TOP SESSIONS TODAY"; visible: panel.hasData }
                Cell {
                    visible: panel.hasData && CrowUsageStore.topSessions.length === 0
                    x: panel.wMark
                    text: "none"
                    color: root.cMuted
                }
                Repeater {
                    model: panel.hasData ? CrowUsageStore.topSessions : []
                    delegate: Row {
                        id: sess
                        required property var modelData
                        readonly property string glyph: modelData.active ? "●" : modelData.kind === "run" ? "◇" : "✓"
                        Cell {
                            width: panel.wMark; text: sess.glyph; elide: Text.ElideNone
                            color: sess.modelData.active ? root.cOk : root.cSub
                        }
                        Cell {
                            width: panel.wTitle; rightPadding: root.s2
                            text: sess.modelData.title || CrowUsageStore.modelName(sess.modelData.models)
                            color: root.cText
                        }
                        Cell { width: panel.wProject; rightPadding: root.s1; text: sess.modelData.project }
                        Cell {
                            width: panel.wTok; horizontalAlignment: Text.AlignRight
                            text: CrowUsageStore.human(sess.modelData.today.tokens)
                        }
                        Cell {
                            width: panel.wCost; horizontalAlignment: Text.AlignRight
                            text: CrowUsageStore.money(sess.modelData.today.cost_usd)
                            color: root.cText; font.bold: true
                        }
                    }
                }
                // Total over all of today's sessions, under a hairline.
                Rectangle {
                    visible: panel.hasData && CrowUsageStore.todaySessions.length > 0
                    x: panel.wMark; width: parent.width - panel.wMark; height: 1
                    color: root.cBorder
                }
                Row {
                    visible: panel.hasData && CrowUsageStore.todaySessions.length > 0
                    Cell {
                        width: panel.wMark + panel.wTitle + panel.wProject; leftPadding: panel.wMark
                        text: "all " + CrowUsageStore.todaySessions.length + " sessions today"
                    }
                    Cell {
                        width: panel.wTok; horizontalAlignment: Text.AlignRight
                        text: CrowUsageStore.human(CrowUsageStore.todaySessionsTokens)
                        color: root.cText
                    }
                    Cell {
                        width: panel.wCost; horizontalAlignment: Text.AlignRight
                        text: CrowUsageStore.money(CrowUsageStore.todaySessionsCost)
                        color: root.cText; font.bold: true
                    }
                }

                // ── savings today: one line; the explanations live in crow watch (History tab) ──
                Head { text: "SAVINGS TODAY"; visible: panel.hasData }
                Row {
                    visible: panel.hasData
                    x: panel.wMark
                    spacing: root.s2
                    Cell { text: "rtk"; elide: Text.ElideNone }
                    Cell { text: CrowUsageStore.human(CrowUsageStore.rtk.today_saved_tokens) + " tok"; color: root.cOk; font.bold: true; elide: Text.ElideNone }
                    Cell { text: "·  cache"; elide: Text.ElideNone }
                    Cell { text: CrowUsageStore.moneyShort(panel.t.cache_saved_usd || 0); color: root.cOk; font.bold: true; elide: Text.ElideNone }
                    Cell { text: "·  routing"; elide: Text.ElideNone }
                    Cell { text: CrowUsageStore.moneyShort(panel.t.routing_saved_usd || 0); color: root.cOk; font.bold: true; elide: Text.ElideNone }
                    Cell { text: "·  " + (CrowUsageStore.retros.today || 0) + " retros"; elide: Text.ElideNone }
                }
                // A retro suggestion waiting for an OK is something to act on: its own line, in the accent.
                Cell {
                    visible: panel.hasData && (CrowUsageStore.retros.pending_proposals || 0) > 0
                    x: panel.wMark
                    text: "◆ " + (CrowUsageStore.retros.pending_proposals || 0)
                          + ((CrowUsageStore.retros.pending_proposals || 0) === 1 ? " retro suggestion" : " retro suggestions") + " waiting for your OK"
                    color: root.cAccent; font.bold: true
                }
            }
        }
    }
}
