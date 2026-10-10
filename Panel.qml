import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Game2048.js" as Game

// 2048 game popup. Keyboard-driven panel under the bar. All rules and stored
// data live in Game2048.js; this file renders state and forwards input. The
// board persists under XDG state through the bounded helper below: reads and
// writes go through helpers/state_io.py, and the FileView here is only a
// change signal (it never loads the file's contents).
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
  // the user's shell.json, which must not happen on every move (§5.2). This
  // path is derived only so the change watcher below can observe the file; the
  // helper derives the same path itself and is never handed one in argv.
  readonly property string stateHome: {
    var xdg = Quickshell.env("XDG_STATE_HOME") || ""
    return xdg.charAt(0) === "/" ? xdg : Quickshell.env("HOME") + "/.local/state"
  }
  readonly property string statePath: root.stateHome + "/pwnsxb-2048/state.json"

  // Bundled Python 3 helper that owns the real state path and enforces the
  // 64 KiB read cap plus the no-symlink and owner-only rules.
  readonly property string helperPath: String(Qt.resolvedUrl("helpers/state_io.py")).replace(/^file:\/\//, "")

  // Write serialization: one helper write in flight; a newer state queued while
  // writing replaces the pending one (latest wins, never two writers).
  property string pendingWrite: ""
  property bool writeInFlight: false

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

  // Loaded by the read helper below. Never writes back (that would loop between
  // monitors): an unreadable or invalid file just starts a fresh game.
  function applyLoaded(text) {
    var parsed = Game.parseState(text)
    root.game = parsed ? parsed : Game.newGame(0, Math.random)
    root.setScoreInstantly(root.game.score)
    root.celebratedThisGame = false
  }

  // Written only after a user action that changed state. One write at a time; a
  // newer state queued while writing replaces the pending one (latest wins).
  function persist() {
    var text = Game.serializeState(root.game)
    if (root.writeInFlight) {
      root.pendingWrite = text
      return
    }
    root.startWrite(text)
  }

  function startWrite(text) {
    root.writeInFlight = true
    writeProcess.pendingData = text
    writeProcess.stdinEnabled = true
    writeProcess.running = true
  }

  // One read at a time, and never while a write is queued or in flight: a read
  // then would race the writer and could apply a superseded state.
  function requestRead() {
    if (readProcess.running || root.writeInFlight || root.pendingWrite !== "") return
    readProcess.running = true
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

  // The only state data path: a bounded read through the helper. The helper
  // caps stdout at 64 KiB, so QML never receives more; a non-zero exit or empty
  // output falls back to a fresh game, exactly as the FileView did before.
  Process {
    id: readProcess
    command: ["timeout", "-k", "1", "3", "python3", "-I", root.helperPath, "read"]
    running: true
    stdout: StdioCollector {
      id: readStdout
      waitForEnd: true
    }
    onExited: function(exitCode) {
      if (exitCode === 0) root.applyLoaded(String(readStdout.text))
      else root.applyLoaded("")
    }
  }

  // Owner-only atomic write through the helper. The serialized state travels on
  // stdin only, never in argv, and only one write runs at a time.
  Process {
    id: writeProcess
    property string pendingData: ""
    command: ["timeout", "-k", "1", "3", "python3", "-I", root.helperPath, "write"]
    stdinEnabled: false
    onStarted: {
      write(pendingData)
      pendingData = ""
      stdinEnabled = false
    }
    onExited: function(exitCode) {
      root.writeInFlight = false
      if (root.pendingWrite !== "") {
        var next = root.pendingWrite
        root.pendingWrite = ""
        root.startWrite(next)
      } else {
        // Reconcile: a watcher event that landed during the write was skipped,
        // so re-read the settled file now that the writer is idle.
        root.requestRead()
      }
    }
  }

  // Watch only. With preload: false and no text()/data() call, FileView sets up
  // the change watcher but never loads or parses the file, so no unbounded or
  // symlink-following read happens through it (Quickshell 0.3.1 FileView).
  // fileChanged fires for any monitor's rewrite and triggers a capped helper
  // read instead of reload().
  FileView {
    id: stateWatcher
    preload: false
    path: root.statePath
    watchChanges: true
    printErrors: false
    onFileChanged: root.requestRead()
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

        // Top margin so the gain label has room above the SCORE card.
        Item { width: 1; height: Style.space(24) }

        // 1. Header: wordmark on the left; a right group of four equal
        //    Style.space(44) tiles — SCORE, BEST, Top scores, New game — in one
        //    Row with equal Style.space(6) gaps. Same width as the board.
        Item {
          id: headerRow
          width: boardFrame.width
          anchors.horizontalCenter: parent.horizontalCenter
          height: Style.space(44)

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
            id: headerTiles
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(6)

            Rectangle {
              id: scoreCard
              width: Style.space(64)
              height: Style.space(44)
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

              // "+N" gain: centred over the SCORE card, starts just above the
              // card's top edge (bottom = card top - Style.space(2)) and floats
              // further up while fading, so it never covers the card content.
              Text {
                id: gainText
                anchors.horizontalCenter: parent.horizontalCenter
                property real baseY: -height - Style.space(2)
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
              height: Style.space(44)
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

            // Top scores tile: same look as the cards, hover lightens it.
            Rectangle {
              id: scoresButton
              width: Style.space(44)
              height: Style.space(44)
              radius: Style.cornerRadius > 0 ? Style.space(6) : 0
              color: scoresMouse.containsMouse
                ? Util.alpha(Color.foreground, 0.12)
                : Util.alpha(Color.foreground, 0.07)

              Text {
                anchors.centerIn: parent
                text: "\uF091"
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.icon
              }

              MouseArea {
                id: scoresMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                  keyCatcher.forceActiveFocus()
                  root.showScores = !root.showScores
                }
              }

              ToolTip {
                visible: scoresMouse.containsMouse
                text: "Top scores"
                delay: 400
                padding: 0
                background: BorderSurface {
                  color: Color.tooltip.background
                  borderSpec: Border.localOrSurfaceSpec("tooltip", "border", Color.tooltip.border, Color.tooltip.border, Math.max(1, Style.normalBorderWidth))
                  radius: 0
                }
                contentItem: Text {
                  text: "Top scores"
                  color: Color.tooltip.text
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                  leftPadding: Style.spacing.controlPaddingX
                  rightPadding: Style.spacing.controlPaddingX
                  topPadding: Style.spacing.controlPaddingY
                  bottomPadding: Style.spacing.controlPaddingY
                }
              }
            }

            // New game tile: same look as the cards, hover lightens it.
            Rectangle {
              id: newGameButton
              width: Style.space(44)
              height: Style.space(44)
              radius: Style.cornerRadius > 0 ? Style.space(6) : 0
              color: newGameMouse.containsMouse
                ? Util.alpha(Color.foreground, 0.12)
                : Util.alpha(Color.foreground, 0.07)

              Text {
                anchors.centerIn: parent
                text: "󰑐"
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.icon
              }

              MouseArea {
                id: newGameMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                  keyCatcher.forceActiveFocus()
                  root.newGame()
                }
              }

              ToolTip {
                visible: newGameMouse.containsMouse
                text: "New game"
                delay: 400
                padding: 0
                background: BorderSurface {
                  color: Color.tooltip.background
                  borderSpec: Border.localOrSurfaceSpec("tooltip", "border", Color.tooltip.border, Color.tooltip.border, Math.max(1, Style.normalBorderWidth))
                  radius: 0
                }
                contentItem: Text {
                  text: "New game"
                  color: Color.tooltip.text
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                  leftPadding: Style.spacing.controlPaddingX
                  rightPadding: Style.spacing.controlPaddingX
                  topPadding: Style.spacing.controlPaddingY
                  bottomPadding: Style.spacing.controlPaddingY
                }
              }
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

                Row {
                  anchors.horizontalCenter: parent.horizontalCenter
                  spacing: Style.space(8)

                  Button {
                    visible: root.game.status === Game.STATUS_WON
                    text: "Keep going"
                    foreground: Color.accent
                    onClicked: {
                      keyCatcher.forceActiveFocus()
                      root.keepGoing()
                    }
                  }

                  Button {
                    text: "New game"
                    foreground: root.game.status === Game.STATUS_OVER ? Color.accent : Color.foreground
                    onClicked: {
                      keyCatcher.forceActiveFocus()
                      root.newGame()
                    }
                  }
                }
              }
            }
          }

          MouseArea {
            id: boardDrag
            anchors.fill: parent
            property real pressX: 0
            property real pressY: 0

            onPressed: function(mouse) {
              pressX = mouse.x
              pressY = mouse.y
            }

            onReleased: function(mouse) {
              keyCatcher.forceActiveFocus()
              if (root.showScores) return
              if (root.game.status === Game.STATUS_WON || root.game.status === Game.STATUS_OVER) return
              var dir = Game.swipeDirection(mouse.x - pressX, mouse.y - pressY, Style.space(24))
              if (dir) root.doMove(dir)
            }
          }

          // First-move hint: subtle, fades out after the first move.
          Text {
            anchors.centerIn: parent
            text: "Swipe or use ↑↓←→"
            color: Color.foreground
            opacity: (root.game.moves === 0 && root.game.status === Game.STATUS_PLAYING && !root.showScores) ? 0.55 : 0
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            Behavior on opacity { NumberAnimation { duration: 300 } }
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

            readonly property int margin: Style.space(12)
            readonly property int rowPad: Style.space(6)   // row background padding
            readonly property int colGap: Style.space(8)   // rank <-> Score
            readonly property int numGap: Style.space(16)  // between numeric columns
            readonly property int rankW: Style.space(16)
            readonly property int scoreW: Style.space(56)
            readonly property int tileW: Style.space(60)
            readonly property int rowH: Style.space(22)
            readonly property int dateW: width - margin * 2 - rowPad * 2 - rankW - scoreW - tileW - colGap - numGap * 2
            readonly property color rowDim: Util.alpha(Color.foreground, 0.03)
            readonly property color latestDim: Util.alpha(Color.accent, 0.18)
            readonly property color headerInk: Util.alpha(Color.foreground, 0.6)

            Column {
              anchors.fill: parent
              anchors.margins: scoresView.margin
              // Spacing is explicit so the ten rows keep a tight, fixed stride.
              spacing: 0

              Text {
                text: "Top scores"
                color: Color.foreground
                font.family: Style.font.family
                font.bold: true
                font.pixelSize: Style.font.title
              }

              Item { width: 1; height: Style.space(4) }

              // Column headers: fixed-width columns with explicit gaps so the
              // labels never touch; right-aligned over their values and
              // vertically centred on the header row.
              Row {
                id: scoresHeader
                x: scoresView.rowPad
                width: parent.width - scoresView.rowPad * 2
                spacing: 0

                Text {
                  width: scoresView.rankW
                  height: scoresView.rowH
                  horizontalAlignment: Text.AlignHCenter
                  verticalAlignment: Text.AlignVCenter
                  text: "#"
                  color: scoresView.headerInk
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }

                Item { width: scoresView.colGap; height: 1 }

                Text {
                  width: scoresView.scoreW
                  height: scoresView.rowH
                  horizontalAlignment: Text.AlignRight
                  verticalAlignment: Text.AlignVCenter
                  text: "Score"
                  color: scoresView.headerInk
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }

                Item { width: scoresView.numGap; height: 1 }

                Text {
                  width: scoresView.tileW
                  height: scoresView.rowH
                  horizontalAlignment: Text.AlignRight
                  verticalAlignment: Text.AlignVCenter
                  text: "Best tile"
                  color: scoresView.headerInk
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }

                Item { width: scoresView.numGap; height: 1 }

                Text {
                  width: scoresView.dateW
                  height: scoresView.rowH
                  horizontalAlignment: Text.AlignRight
                  verticalAlignment: Text.AlignVCenter
                  text: "Date"
                  color: scoresView.headerInk
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }
              }

              Item { width: 1; height: Style.space(4) }

              Rectangle {
                width: parent.width
                height: 1
                color: Util.alpha(Color.foreground, 0.1)
              }

              Item { width: 1; height: Style.space(4) }

              Repeater {
                model: root.game.leaderboard

                Item {
                  id: scoreRowItem
                  required property var modelData
                  required property int index

                  width: parent.width
                  height: scoresView.rowH

                  // Records with no timestamp never match; otherwise the last
                  // recorded game is highlighted.
                  readonly property bool latest: modelData.endedAt !== 0
                    && modelData.endedAt === root.game.lastRecordedAt
                  readonly property color rowColor: latest ? Color.accent : Color.foreground

                  Rectangle {
                    anchors.fill: parent
                    radius: Style.space(4)
                    color: scoreRowItem.latest
                      ? scoresView.latestDim
                      : (scoreRowItem.index % 2 === 0 ? scoresView.rowDim : "transparent")
                  }

                  Row {
                    anchors.fill: parent
                    anchors.leftMargin: scoresView.rowPad
                    anchors.rightMargin: scoresView.rowPad
                    spacing: 0

                    // Rank: a filled circle for the podium (1-3), plain text after.
                    Item {
                      width: scoresView.rankW
                      height: parent.height

                      Rectangle {
                        visible: scoreRowItem.index < 3
                        anchors.centerIn: parent
                        width: Style.space(16)
                        height: width
                        radius: width / 2
                        color: Util.alpha(Color.accent,
                          scoreRowItem.index === 0 ? 0.9
                          : scoreRowItem.index === 1 ? 0.6 : 0.35)

                        Text {
                          anchors.centerIn: parent
                          text: scoreRowItem.index + 1
                          color: scoreRowItem.index === 0 ? Color.popups.background : Color.foreground
                          font.family: Style.font.family
                          font.bold: true
                          font.pixelSize: Style.font.bodySmall
                        }
                      }

                      Text {
                        visible: scoreRowItem.index >= 3
                        anchors.centerIn: parent
                        text: scoreRowItem.index + 1
                        color: scoreRowItem.rowColor
                        font.family: Style.font.family
                        font.pixelSize: Style.font.bodySmall
                      }
                    }

                    Item { width: scoresView.colGap; height: 1 }

                    Text {
                      width: scoresView.scoreW
                      height: parent.height
                      horizontalAlignment: Text.AlignRight
                      verticalAlignment: Text.AlignVCenter
                      text: scoreRowItem.modelData.score
                      color: scoreRowItem.rowColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.bodySmall
                    }

                    Item { width: scoresView.numGap; height: 1 }

                    Text {
                      width: scoresView.tileW
                      height: parent.height
                      horizontalAlignment: Text.AlignRight
                      verticalAlignment: Text.AlignVCenter
                      text: scoreRowItem.modelData.maxTile
                      color: scoreRowItem.rowColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.bodySmall
                    }

                    Item { width: scoresView.numGap; height: 1 }

                    Text {
                      width: scoresView.dateW
                      height: parent.height
                      horizontalAlignment: Text.AlignRight
                      verticalAlignment: Text.AlignVCenter
                      text: Game.formatEntryDate(scoreRowItem.modelData.endedAt, Date.now())
                      color: scoreRowItem.rowColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.bodySmall
                    }
                  }
                }
              }

              // Empty state.
              Column {
                visible: root.game.leaderboard.length === 0
                width: parent.width
                spacing: Style.space(6)

                Item { width: 1; height: Style.space(24) }

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: "\uF091"
                  color: Color.foreground
                  opacity: 0.3
                  font.family: Style.font.family
                  font.pixelSize: Style.font.title * 2
                }

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: "No finished games yet"
                  color: Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.body
                }
              }
            }
          }
        }

        Item { width: 1; height: Style.space(10) }

        // 5. Footer: centred key chips.
        Row {
          id: footerChips
          anchors.horizontalCenter: parent.horizontalCenter
          spacing: Style.space(6)

          Repeater {
            model: root.showScores
              ? [{ key: "T", label: "board" }, { key: "Esc", label: "back" }]
              : [{ key: "↑↓←→", label: "move" }, { key: "R", label: "new" },
                 { key: "T", label: "scores" }, { key: "Esc", label: "close" }]

            Rectangle {
              required property var modelData

              width: chipRow.implicitWidth + Style.space(6) * 2
              height: chipRow.implicitHeight + Style.space(2) * 2
              radius: Style.space(4)
              color: Util.alpha(Color.foreground, 0.06)

              Row {
                id: chipRow
                anchors.centerIn: parent
                spacing: Style.space(3)

                Text {
                  text: modelData.key
                  color: Color.foreground
                  font.family: Style.font.family
                  font.bold: true
                  font.pixelSize: Style.font.bodySmall
                }

                Text {
                  text: modelData.label
                  color: Color.foreground
                  opacity: 0.65
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }
              }
            }
          }
        }
      }
    }
  }
}
