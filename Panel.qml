import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Game2048.js" as Game

// 2048 game popup. Keyboard-driven panel under the bar. All rules and stored
// data live in Game2048.js; this file renders state and forwards input. The
// board persists under XDG state through the FileView below.
Panel {
  id: root
  moduleName: "pwnsxb.2048"
  ipcTarget: "pwnsxb.2048"
  manageIpc: false

  property var anchorItem: null

  // The bar tracks the widget mounted in its slot — BarWidget.qml — not this
  // nested panel. Everything the bar identifies a panel by has to be that
  // widget: the popout coordinator compares against `slot.activeItem`, and
  // switchPanelFrom looks the slot up the same way.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  property var game: Game.newGame(0, Math.random)

  // Per-user state under XDG state, not shell.json: updateEntryInline rewrites
  // the user's shell.json, which must not happen on every move (§5.2).
  readonly property string statePath: Quickshell.env("HOME") + "/.local/state/pwnsxb-2048/state.json"

  readonly property int boardGap: Style.space(6)

  // Slide animation + score-gain timings (§4.2).
  readonly property int slideMs: 90
  readonly property int popMs: 120
  readonly property int gainMs: 600

  // Transient animation state. `ghosts` mirrors the last move's transitions;
  // it is never persisted and is cleared when the slide ends.
  property var ghosts: []
  property bool sliding: false
  property int gainValue: 0

  // Which view is shown. Not persisted; toggled with `t` / the header button.
  property bool showScores: false

  // Score count-up + best celebration (§3.2).
  property int scoreFrom: 0
  property int scoreTo: 0
  property real scoreT: 1
  readonly property int displayScore: Game.tweenValue(root.scoreFrom, root.scoreTo, root.scoreT)
  property real bestCardCelebrate: 0
  property bool celebratedThisGame: false

  // Emitted by the slide timer so cells pop once the slide has finished.
  signal popRequested()

  // Drive the score text: animate between values, or set it instantly.
  function animateScore(from, to) {
    root.scoreFrom = from
    root.scoreTo = to
    root.scoreT = 0
    scoreCountUp.restart()
  }

  function setScoreInstantly(value) {
    scoreCountUp.stop()
    root.scoreFrom = value
    root.scoreTo = value
    root.scoreT = 1
  }

  function open() {
    root.controller.show()
  }

  function close() {
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function doMove(direction) {
    if (!direction) return
    if (root.showScores) return
    // Fast input: finish any in-flight slide instantly, then apply normally.
    // State is always applied immediately; animation is cosmetic only.
    if (root.sliding) root.finishSlide()
    var prevScore = root.game.score
    var prevBest = root.game.best
    var result = Game.move(root.game, direction, Math.random, Date.now())
    if (!result.moved) return
    root.ghosts = result.state.transitions
    root.sliding = true
    root.game = result.state
    root.persist()
    slideTimer.restart()
    if (result.state.gain > 0) root.pulseGain(result.state.gain)
    if (result.state.score !== prevScore) root.animateScore(prevScore, result.state.score)
    else root.setScoreInstantly(result.state.score)
    if (Game.isNewBest(prevBest, result.state) && !root.celebratedThisGame) {
      root.celebratedThisGame = true
      bestCelebrate.restart()
    }
  }

  function finishSlide() {
    slideTimer.stop()
    root.sliding = false
    root.ghosts = []
  }

  // True for a cell that receives a sliding tile (hidden while the ghost moves).
  function isSlideTarget(index) {
    if (!root.sliding) return false
    for (var i = 0; i < root.ghosts.length; i++) {
      if (root.ghosts[i].to === index) return true
    }
    return false
  }

  function tileFontSize(value) {
    var digits = String(value).length
    if (digits <= 2) return Style.font.title * 1.6
    if (digits === 3) return Style.font.title * 1.3
    if (digits === 4) return Style.font.title * 1.05
    return Style.font.title * 0.85
  }

  function pulseGain(value) {
    root.gainValue = value
    gainText.opacity = 1
    gainText.y = gainText.baseY
    gainAnim.restart()
  }

  function newGame() {
    if (root.sliding) root.finishSlide()
    // Records the current game (if any) to the leaderboard, then starts fresh.
    root.game = Game.startNewGame(root.game, Math.random, Date.now())
    root.persist()
    root.setScoreInstantly(root.game.score)
    root.celebratedThisGame = false
  }

  function keepGoing() {
    root.game = Game.keepGoing(root.game)
    root.persist()
    root.setScoreInstantly(root.game.score)
  }

  // Loaded by the FileView below. Never writes back (that would loop between
  // monitors): an unreadable or invalid file just starts a fresh game.
  function applyLoaded(text) {
    var parsed = Game.parseState(text)
    root.game = parsed ? parsed : Game.newGame(0, Math.random)
    root.setScoreInstantly(root.game.score)
    root.celebratedThisGame = false
  }

  // Written only after a user action that changed state.
  function persist() {
    if (!stateFile) return
    stateFile.setText(Game.serializeState(root.game))
  }

  // Map a tile level to its themed fill color (§3.2). No hex literals.
  function tileColor(level) {
    var style = Game.tileStyle(level)
    var base = style.base === "accent" ? Color.accent
      : style.base === "urgent" ? Color.urgent
      : Color.foreground
    return Util.alpha(base, style.alpha)
  }

  // Readable text color on a tile: composite the tile fill over the popup
  // background, then let the WCAG contrast pick foreground or background.
  function tileTextColor(level) {
    var fill = tileColor(level)
    var bg = Color.popups.background
    var over = Game.blend(fill.r, fill.g, fill.b, fill.a, bg.r, bg.g, bg.b)
    return Game.pickTextColor(over, Color.foreground, bg) === "bg" ? bg : Color.foreground
  }

  FileView {
    id: stateFile
    path: root.statePath
    watchChanges: true
    blockAllReads: true
    atomicWrites: true
    printErrors: false
    onLoaded: root.applyLoaded(stateFile.text())
    onLoadFailed: root.applyLoaded("")
    onFileChanged: reload()
  }

  // Single-shot slide timer: when it fires the slide is over and the spawned /
  // merged cells pop. The only timer in the panel; it runs per move, never idle.
  Timer {
    id: slideTimer
    interval: root.slideMs
    repeat: false
    onTriggered: {
      root.sliding = false
      root.ghosts = []
      root.popRequested()
    }
  }

  // Score count-up (250 ms) and best-card celebration (600 ms, once per game).
  NumberAnimation {
    id: scoreCountUp
    target: root
    property: "scoreT"
    from: 0
    to: 1
    duration: 250
    easing.type: Easing.Linear
  }

  SequentialAnimation {
    id: bestCelebrate
    NumberAnimation {
      target: root
      property: "bestCardCelebrate"
      from: 0
      to: 1
      duration: 300
      easing.type: Easing.OutCubic
    }
    NumberAnimation {
      target: root
      property: "bestCardCelebrate"
      from: 1
      to: 0
      duration: 300
      easing.type: Easing.InCubic
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(340))
    contentHeight: panel.fittedContentHeight(contentColumn.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) { root.doMove(Game.directionFromDelta(dx, dy)) }
      onActivateRequested: {
        if (root.showScores) return
        if (root.game.status === Game.STATUS_OVER) root.newGame()
        else if (root.game.status === Game.STATUS_WON) root.keepGoing()
      }
      onCloseRequested: {
        // In the scores view, Esc returns to the board instead of closing.
        if (root.showScores) root.showScores = false
        else root.close()
      }
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) {
        var key = text.toLowerCase()
        if (root.showScores) {
          if (key === "t") root.showScores = false
          return
        }
        if (key === "w") root.doMove("up")
        else if (key === "a") root.doMove("left")
        else if (key === "s") root.doMove("down")
        else if (key === "d") root.doMove("right")
        else if (key === "r") root.newGame()
        else if (key === "t") root.showScores = true
        else if (key === "c" && root.game.status === Game.STATUS_WON) root.keepGoing()
      }

      Column {
        id: contentColumn
        width: parent.width
        spacing: 0

        // 1. Header: wordmark, equal stat cards, actions.
        Item {
          width: parent.width
          height: Math.max(wordmark.implicitHeight, headerRow.implicitHeight)

          Text {
            id: wordmark
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: "2048"
            color: Color.accent
            font.family: Style.font.family
            font.bold: true
            font.pixelSize: Style.font.title * 1.4
          }

          Row {
            id: headerRow
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(8)

            Rectangle {
              id: scoreCard
              width: Style.space(64)
              height: scoreColumn.implicitHeight + Style.space(4) * 2
              color: Util.alpha(Color.foreground, 0.07)
              radius: Style.cornerRadius > 0 ? Style.space(6) : 0

              Column {
                id: scoreColumn
                width: parent.width
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(2)

                Text {
                  width: parent.width
                  horizontalAlignment: Text.AlignHCenter
                  text: "SCORE"
                  color: Color.foreground
                  opacity: 0.7
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                  font.letterSpacing: 1
                }

                Text {
                  width: parent.width
                  horizontalAlignment: Text.AlignHCenter
                  text: root.displayScore
                  color: Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.title
                  font.bold: true
                }
              }

              // "+N" gain: centred over the SCORE card, floats up and fades.
              Text {
                id: gainText
                anchors.horizontalCenter: parent.horizontalCenter
                property real baseY: 0
                y: baseY
                z: 10
                text: "+" + root.gainValue
                color: Color.accent
                font.family: Style.font.family
                font.bold: true
                font.pixelSize: Style.font.body
                opacity: 0

                ParallelAnimation {
                  id: gainAnim
                  NumberAnimation {
                    target: gainText
                    property: "y"
                    from: gainText.baseY
                    to: gainText.baseY - Style.space(12)
                    duration: root.gainMs
                    easing.type: Easing.OutCubic
                  }
                  NumberAnimation {
                    target: gainText
                    property: "opacity"
                    from: 1
                    to: 0
                    duration: root.gainMs
                  }
                }
              }
            }

            Rectangle {
              id: bestCard
              width: Style.space(64)
              height: bestColumn.implicitHeight + Style.space(4) * 2
              color: Util.alpha(root.bestCardCelebrate > 0 ? Color.accent : Color.foreground,
                                0.07 + 0.28 * root.bestCardCelebrate)
              radius: Style.cornerRadius > 0 ? Style.space(6) : 0

              Column {
                id: bestColumn
                width: parent.width
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(2)

                Text {
                  width: parent.width
                  horizontalAlignment: Text.AlignHCenter
                  text: "BEST"
                  color: Color.foreground
                  opacity: 0.7
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                  font.letterSpacing: 1
                }

                Text {
                  width: parent.width
                  horizontalAlignment: Text.AlignHCenter
                  text: root.game.best
                  color: Color.accent
                  font.family: Style.font.family
                  font.pixelSize: Style.font.title
                  font.bold: true
                }
              }
            }

            Button {
              id: scoresButton
              width: Style.space(34)
              height: Style.space(34)
              iconText: "\uF091"
              iconSize: Style.font.icon
              tooltipText: "Top scores"
              foreground: Color.foreground
              onClicked: root.showScores = !root.showScores
            }

            Button {
              id: newGameButton
              width: Style.space(34)
              height: Style.space(34)
              iconText: "󰑐"
              iconSize: Style.font.icon
              tooltipText: "New game"
              foreground: Color.foreground
              onClicked: root.newGame()
            }
          }
        }

        Item { width: 1; height: Style.space(14) }

        // 2. Board: a square grid of 16 cells, single (borderless) surface.
        Item {
          id: boardFrame
          anchors.horizontalCenter: parent.horizontalCenter
          width: Math.min(parent.width, Style.space(300))
          height: width

          readonly property real cellSize: (width - root.boardGap * 5) / 4

          Rectangle {
            anchors.fill: parent
            color: Util.alpha(Color.foreground, 0.04)
            radius: Style.cornerRadius > 0 ? Style.space(8) : 0

            Grid {
              anchors.fill: parent
              anchors.margins: root.boardGap
              columns: 4
              spacing: root.boardGap

              Repeater {
                model: 16

                Item {
                  id: cellRoot
                  required property int index

                  width: boardFrame.cellSize
                  height: boardFrame.cellSize
                  readonly property int value: root.game.cells[index]
                  readonly property int level: Game.tileLevel(value)

                  // Empty slot: always visible so the grid never flashes on a
                  // move. Only the tile Rectangle above it may be hidden.
                  Rectangle {
                    anchors.fill: parent
                    radius: Style.cornerRadius > 0 ? Style.space(6) : 0
                    color: root.tileColor(0)
                  }

                  // Tile: the only thing hidden while its tile slides in.
                  Rectangle {
                    id: tile
                    anchors.fill: parent
                    visible: cellRoot.value > 0
                    opacity: (root.sliding
                      && (root.isSlideTarget(cellRoot.index) || root.game.spawned === cellRoot.index)) ? 0 : 1
                    radius: Style.cornerRadius > 0 ? Style.space(6) : 0
                    color: root.tileColor(cellRoot.level)

                    Text {
                      anchors.centerIn: parent
                      visible: cellRoot.value > 0
                      text: cellRoot.value
                      color: root.tileTextColor(cellRoot.level)
                      font.family: Style.font.family
                      font.bold: true
                      font.pixelSize: root.tileFontSize(cellRoot.value)
                    }

                    // Explicit pop: restarted from the handler below when this
                    // cell is the spawn target or received a merged tile. The
                    // previous `running:` binding was the bug — a new move that
                    // flipped the binding off mid-flight froze the tile at 0.85.
                    // onStopped pins scale back to 1.0 so an interrupted run can
                    // never leave a tile shrunk.
                    SequentialAnimation {
                      id: popAnim
                      onStopped: tile.scale = 1.0

                      NumberAnimation {
                        target: tile
                        property: "scale"
                        from: 0.85
                        to: 1.0
                        duration: root.popMs
                        easing.type: Easing.OutBack
                      }
                    }
                  }

                  // Trigger on the whole game object changing, not on a bool that
                  // can stay true across moves, so consecutive pops on the same
                  // cell still restart.
                  Connections {
                    target: root

                    function onGameChanged() {
                      // A slide owns the movement; the slide timer pops after it.
                      if (root.sliding) return
                      if (root.game.spawned === cellRoot.index
                          || root.game.merged.indexOf(cellRoot.index) !== -1)
                        popAnim.restart()
                    }

                    function onPopRequested() {
                      if (root.game.spawned === cellRoot.index
                          || root.game.merged.indexOf(cellRoot.index) !== -1)
                        popAnim.restart()
                    }
                  }
                }
              }
            }

            // Sliding tiles: ghosts drawn above the grid, in the same
            // coordinate system (the cell step includes the board padding).
            Item {
              id: ghostLayer
              anchors.fill: parent
              anchors.margins: root.boardGap

              Repeater {
                model: root.sliding ? root.ghosts : []

                Rectangle {
                  id: ghost
                  required property var modelData

                  readonly property real step: boardFrame.cellSize + root.boardGap

                  width: boardFrame.cellSize
                  height: boardFrame.cellSize
                  radius: Style.cornerRadius > 0 ? Style.space(6) : 0
                  color: root.tileColor(Game.tileLevel(modelData.value))

                  Text {
                    anchors.centerIn: parent
                    text: ghost.modelData.value
                    color: root.tileTextColor(Game.tileLevel(ghost.modelData.value))
                    font.family: Style.font.family
                    font.bold: true
                    font.pixelSize: root.tileFontSize(ghost.modelData.value)
                  }

                  NumberAnimation on x {
                    from: (ghost.modelData.from % 4) * ghost.step
                    to: (ghost.modelData.to % 4) * ghost.step
                    duration: root.slideMs
                    easing.type: Easing.OutCubic
                  }

                  NumberAnimation on y {
                    from: Math.floor(ghost.modelData.from / 4) * ghost.step
                    to: Math.floor(ghost.modelData.to / 4) * ghost.step
                    duration: root.slideMs
                    easing.type: Easing.OutCubic
                  }
                }
              }
            }
          }

          // 3. Overlay for won / over: translucent so the final board stays
          //    visible. Reached by editing the state file, not debug code.
          Rectangle {
            anchors.fill: parent
            visible: root.game.status === Game.STATUS_WON || root.game.status === Game.STATUS_OVER
            color: Util.alpha(Color.popups.background, 0.88)
            radius: Style.cornerRadius
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.popups.border

            // Opaque card behind the text so board numbers can't show through
            // and make the lines hard to read.
            Rectangle {
              anchors.centerIn: parent
              color: Color.popups.background
              radius: Style.cornerRadius
              border.width: Math.max(1, Style.normalBorderWidth)
              border.color: Color.popups.border
              implicitWidth: overlayColumn.implicitWidth + Style.space(12) * 2
              implicitHeight: overlayColumn.implicitHeight + Style.space(12) * 2

              Column {
                id: overlayColumn
                anchors.centerIn: parent
                spacing: Style.space(8)

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: root.game.status === Game.STATUS_WON ? "You made 2048!" : "No moves left"
                  color: Color.foreground
                  font.family: Style.font.family
                  font.bold: true
                  font.pixelSize: Style.font.title
                }

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: "Score " + root.game.score + " · Best tile " + Game.maxTile(root.game.cells)
                  color: Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.body
                }

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  visible: root.game.lastRank > 0
                  text: root.game.lastRank === 1 ? "New record!" : "Rank #" + root.game.lastRank + " in your top 10"
                  color: root.game.lastRank === 1 ? Color.accent : Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.body
                }

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: root.game.status === Game.STATUS_WON ? "Enter: keep going · R: new game" : "Enter or R: new game"
                  color: Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }
              }
            }
          }

          MouseArea {
            anchors.fill: parent
            onClicked: keyCatcher.forceActiveFocus()
          }

          // 4. Local leaderboard. Occupies exactly the board's frame so the
          //    panel never jumps when the view is toggled.
          Rectangle {
            id: scoresView
            anchors.fill: parent
            visible: root.showScores
            color: Color.popups.background
            radius: Style.cornerRadius
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.popups.border
            clip: true

            Column {
              anchors.fill: parent
              anchors.margins: Style.space(12)
              spacing: Style.space(5)

              Text {
                text: "Top scores"
                color: Color.foreground
                font.family: Style.font.family
                font.bold: true
                font.pixelSize: Style.font.title
              }

              Row {
                spacing: Style.space(8)

                Text {
                  width: Style.space(18)
                  text: "#"
                  color: Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }

                Text {
                  width: Style.space(56)
                  text: "Score"
                  color: Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }

                Text {
                  width: Style.space(46)
                  text: "Tile"
                  color: Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }

                Text {
                  text: "Date"
                  color: Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }
              }

              Repeater {
                model: root.game.leaderboard

                Row {
                  id: scoreRowItem
                  required property var modelData
                  required property int index

                  readonly property color rowColor: modelData.endedAt === root.game.lastRecordedAt
                    ? Color.accent : Color.foreground

                  spacing: Style.space(8)

                  Text {
                    width: Style.space(18)
                    text: scoreRowItem.index + 1
                    color: scoreRowItem.rowColor
                    font.family: Style.font.family
                    font.pixelSize: Style.font.bodySmall
                  }

                  Text {
                    width: Style.space(56)
                    text: scoreRowItem.modelData.score
                    color: scoreRowItem.rowColor
                    font.family: Style.font.family
                    font.pixelSize: Style.font.bodySmall
                  }

                  Text {
                    width: Style.space(46)
                    text: scoreRowItem.modelData.maxTile
                    color: scoreRowItem.rowColor
                    font.family: Style.font.family
                    font.pixelSize: Style.font.bodySmall
                  }

                  Text {
                    text: scoreRowItem.modelData.endedAt === 0
                      ? "—" : Qt.formatDateTime(new Date(scoreRowItem.modelData.endedAt), "yyyy-MM-dd")
                    color: scoreRowItem.rowColor
                    font.family: Style.font.family
                    font.pixelSize: Style.font.bodySmall
                  }
                }
              }

              Text {
                visible: root.game.leaderboard.length === 0
                text: "No finished games yet"
                color: Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }
            }
          }
        }

        Item { width: 1; height: Style.space(10) }

        // 5. Footer hint. One line, inside the panel border.
        Text {
          width: parent.width
          horizontalAlignment: Text.AlignHCenter
          wrapMode: Text.NoWrap
          elide: Text.ElideRight
          text: root.showScores
            ? "T board · Esc back"
            : "↑↓←→ move · R new · T scores · Esc close"
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }
      }
    }
  }
}
