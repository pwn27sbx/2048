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

  // The profile carries every board size (its own game, best and leaderboard)
  // plus the shared settings. `game` is the active board, derived from it, so
  // the rendering code keeps reading root.game as before.
  property var profile: Game.newProfile(Math.random, Date.now())
  // While a daily attempt is in progress the board is that seeded game; every
  // other moment it is the active size's game.
  readonly property var dailyGameState: Game.dailyGame(root.profile)
  readonly property var game: root.playingDaily && root.dailyGameState
    ? root.dailyGameState
    : Game.activeGame(root.profile)
  readonly property var gameSettings: root.profile.settings
  readonly property bool canUndo: Game.canUndo(root.game, root.gameSettings)

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

  // Bundled merge blip, played with pw-play at a rate that rises with the
  // merged tile. Only runs when the sound setting is on (off by default).
  readonly property string soundPath: String(Qt.resolvedUrl("assets/merge.wav")).replace(/^file:\/\//, "")

  // Write serialization: one helper write in flight; a newer state queued while
  // writing replaces the pending one (latest wins, never two writers).
  property string pendingWrite: ""
  property bool writeInFlight: false

  // The serialized text this panel last wrote or loaded. A read that returns
  // exactly this is our own state echoed back, so applyLoaded ignores it:
  // re-applying would cut the score count-up short and re-arm the celebration.
  property string lastStateText: ""

  // Local-change revision. Bumped on every local write; a read captures it when
  // it starts and drops its result if the revision moved meanwhile, so a read
  // still in flight when the user moves can never revert the board.
  property int localRevision: 0
  property int readRevision: 0

  // Gutter shrinks a little on bigger boards so the cells keep room.
  readonly property int boardGap: Math.max(Style.space(2), Math.round(Style.space(6) * 4 / Math.max(1, root.game.size)))

  // Motion preference gate: `off` makes every animation instant, `reduced`
  // shortens the core ones. Every animation in this panel checks one of these.
  readonly property bool motionOn: Game.motionEnabled(root.gameSettings)
  readonly property bool motionFull: Game.motionFull(root.gameSettings)

  // Slide animation + score-gain timings (§4.2), scaled by motion.
  readonly property int slideMs: root.motionOn ? (root.motionFull ? 90 : 45) : 1
  readonly property int popMs: root.motionOn ? (root.motionFull ? 120 : 60) : 1
  readonly property int gainMs: root.motionOn ? (root.motionFull ? 600 : 300) : 1

  // Transient animation state. `ghosts` mirrors the last move's transitions;
  // it is never persisted and is cleared when the slide ends.
  property var ghosts: []
  property bool sliding: false
  property int gainValue: 0

  // Panel entrance (slide + scale), gated by motion.
  property real entranceT: 1

  // Confetti particles for a 2048 (small) / 4096 (big) burst.
  property var confetti: []

  // Which page is shown: "" (board), "scores", "stats", "achievements",
  // "daily". Not persisted; cycled with `t` / the header button, or opened by
  // the bar widget's `page` IPC.
  property string view: ""
  readonly property bool onBoard: root.view === ""
  // Playing today's seeded daily challenge (its own game, kept separate).
  property bool playingDaily: false
  // Stats page size filter: 0 = overall, else 3/4/5/6/8.
  property int statsSize: 0
  // Scores page size filter: 0 = follow the active board, else 3/4/5/6/8.
  property int scoresSize: 0
  // Every page, in cycle order.
  readonly property var pageList: ["", "scores", "stats", "achievements", "daily", "settings", "help"]
  // Window scale factor (90-150 %).
  readonly property real uiScale: root.gameSettings.scale / 100
  // Confirm-new-game prompt is open.
  property bool confirmNew: false
  // Reset-stats confirm prompt is open (Settings -> Advanced).
  property bool confirmReset: false
  // Inline board-size picker (under the header chip).
  property bool sizePickerOpen: false
  property int sizePickIndex: 0
  property real sizePickerX: 0
  property real sizePickerY: 0
  // Motion-gated fade when a tab changes.
  property real pageT: 1
  // True while the score is ahead of (or just beat) the best, for the ▲ mark.
  readonly property bool beatBest: root.bestCardCelebrate > 0 || root.game.score > root.game.best
  // Today's daily is unplayed (drives the Board hint and the Daily tab dot).
  readonly property bool dailyReady: Game.dailyAvailable(root.profile, Game.dailyDateKey(Date.now()))
  // Queue of achievement ids waiting to be shown as toasts.
  property var toastQueue: []
  property string toastId: ""

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
    if (!root.motionOn) {
      root.setScoreInstantly(to)
      return
    }
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
    if (!root.onBoard) return
    // Fast input: finish any in-flight slide instantly, then apply normally.
    // State is always applied immediately; animation is cosmetic only.
    if (root.sliding) root.finishSlide()
    var prevScore = root.game.score
    var prevBest = root.game.best
    var prevMax = Game.maxTile(root.game.cells)
    var wasRecorded = root.game.recorded === true
    var result = Game.move(root.game, direction, Math.random, Date.now())
    if (!result.moved) {
      // A direction that changes nothing: shake the board (motion permitting).
      if (root.game.status === Game.STATUS_PLAYING) root.shakeBoard()
      return
    }
    if (root.motionOn) {
      root.ghosts = result.state.transitions
      root.sliding = true
      slideTimer.restart()
    } else {
      root.ghosts = []
      root.sliding = false
    }
    root.applyGame(result.state)
    // A game that just ended is folded into the stats and achievements.
    if (result.state.recorded === true && !wasRecorded)
      root.foldStats(result.state, result.state.lastRecordedAt)
    root.checkAchievements(root.game)
    root.finishDailyIfDone()
    root.persist()
    if (result.state.gain > 0) root.pulseGain(result.state.gain)
    if (result.state.score !== prevScore) root.animateScore(prevScore, result.state.score)
    else root.setScoreInstantly(result.state.score)
    if (Game.isNewBest(prevBest, result.state) && !root.celebratedThisGame) {
      root.celebratedThisGame = true
      if (root.motionOn) bestCelebrate.restart()
    }
    // Confetti when a tier is reached for the first time.
    var newMax = Game.maxTile(result.state.cells)
    if (prevMax < Game.WIN_VALUE && newMax >= Game.WIN_VALUE) root.burstConfetti(false)
    if (prevMax < 4096 && newMax >= 4096) root.burstConfetti(true)
    // Sound on a merge, pitch from the biggest merged tile.
    if (result.state.merged.length > 0) {
      var biggest = 0
      for (var mi = 0; mi < result.state.merged.length; mi++) {
        var mergedValue = result.state.cells[result.state.merged[mi]]
        if (mergedValue > biggest) biggest = mergedValue
      }
      root.playMerge(biggest)
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
    return Style.font.title * Game.tileFontFactor(value, root.game.size)
  }

  function pulseGain(value) {
    root.gainValue = value
    if (!root.motionOn) return
    gainText.opacity = 1
    gainText.y = gainText.baseY
    gainAnim.restart()
  }

  // Short shake of the board on a direction that changes nothing.
  function shakeBoard() {
    if (!root.motionOn) return
    boardShake.restart()
  }

  // Confetti burst on first reaching 2048 (small) or 4096 (big).
  function burstConfetti(big) {
    if (!root.motionOn) return
    var count = big ? 90 : 48
    var speed = big ? 150 : 95
    var parts = []
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2
      var reach = speed + Math.random() * speed
      parts.push({
        dx: Math.cos(angle) * reach,
        dy: Math.sin(angle) * reach,
        size: 3 + Math.random() * 4,
        rot: Math.random() * 720 - 360,
        accent: (i % 2) === 0,
        delay: Math.random() * 120
      })
    }
    root.confetti = parts
  }

  // Play the merge blip, pitch set by the biggest tile in the merge.
  function playMerge(value) {
    if (!root.gameSettings.sound) return
    if (mergeSound.running) return
    mergeSound.rate = Game.soundRate(value)
    mergeSound.running = true
  }

  // Panel entrance: slide down + scale up from 0.97, gated by motion.
  function playEntrance() {
    if (!root.motionOn) {
      root.entranceT = 1
      return
    }
    entranceAnim.duration = root.motionFull ? 220 : 120
    root.entranceT = 0
    entranceAnim.restart()
  }

  function newGame() {
    if (root.sliding) root.finishSlide()
    // In the daily, R leaves the challenge instead of starting a new game.
    if (root.playingDaily) {
      root.leaveDaily()
      return
    }
    // Records the current game (if any) to the leaderboard, then starts fresh.
    var previous = root.game
    var next = Game.startNewGame(previous, Math.random, Date.now())
    root.profile = Game.setGame(root.profile, next)
    if (previous.recorded !== true && previous.score > 0 && next.lastRecordedAt > previous.lastRecordedAt)
      root.foldStats(previous, next.lastRecordedAt)
    root.checkAchievements(previous)
    root.persist()
    root.setScoreInstantly(next.score)
    root.celebratedThisGame = false
    root.confetti = []
  }

  // R / New game honours the "confirm new game" setting.
  function requestNewGame() {
    if (root.playingDaily) {
      root.leaveDaily()
      return
    }
    if (root.gameSettings.confirmNew && root.game.status === Game.STATUS_PLAYING && root.game.moves > 0) {
      root.confirmNew = true
      return
    }
    root.newGame()
  }

  function keepGoing() {
    var next = Game.keepGoing(root.game)
    root.profile = Game.setGame(root.profile, next)
    root.persist()
    root.setScoreInstantly(next.score)
  }

  // Undo the last move. Also leaves a game over or the win card; the restored
  // board is marked assisted so it never reaches the leaderboard.
  function undo() {
    if (!root.onBoard) return
    var result = Game.undo(root.game, root.gameSettings)
    if (!result.undone) return
    if (root.sliding) root.finishSlide()
    root.ghosts = []
    root.sliding = false
    root.applyGame(result.state)
    root.persist()
    root.setScoreInstantly(result.state.score)
  }

  // Switch to the next/previous board size. Every size keeps its own saved
  // game, best and leaderboard.
  function switchSize(step) {
    if (root.sliding) root.finishSlide()
    var nextSize = Game.cycleSize(root.game.size, step)
    if (nextSize === root.game.size) return
    root.profile = Game.setActiveSize(root.profile, nextSize)
    // Self-heal any empty playing board before it is shown (pre-fix files).
    root.profile = Game.healProfile(root.profile, Math.random)
    root.persist()
    root.ghosts = []
    root.sliding = false
    root.setScoreInstantly(Game.activeGame(root.profile).score)
    root.celebratedThisGame = false
    root.confetti = []
  }

  // Route a game result to the daily held game or the active size's game.
  function applyGame(next) {
    if (root.playingDaily) root.profile = Game.setDailyGame(root.profile, next)
    else root.profile = Game.setGame(root.profile, next)
  }

  // Fold a freshly recorded game into the profile stats (never for the daily).
  function foldStats(game, endedAt) {
    if (root.playingDaily) return
    root.profile = Game.recordStats(root.profile, game.size, game, endedAt)
  }

  // Unlock any newly satisfied achievements and queue their toasts.
  function checkAchievements(game) {
    var result = Game.evaluateAchievements(root.profile, game)
    if (result.unlocked.length > 0) {
      root.profile = result.profile
      root.enqueueToasts(result.unlocked)
    }
  }

  function enqueueToasts(ids) {
    var queue = (root.toastQueue || []).slice()
    for (var i = 0; i < ids.length; i++) queue.push(ids[i])
    root.toastQueue = queue
    if (root.toastId === "") root.showNextToast()
  }

  function showNextToast() {
    if (!root.toastQueue || root.toastQueue.length === 0) {
      root.toastId = ""
      return
    }
    var queue = root.toastQueue.slice()
    root.toastId = queue.shift()
    root.toastQueue = queue
    toastTimer.restart()
  }

  function achievementById(id) {
    for (var i = 0; i < Game.ACHIEVEMENTS.length; i++) {
      if (Game.ACHIEVEMENTS[i].id === id) return Game.ACHIEVEMENTS[i]
    }
    return null
  }

  // The tab ring shown by the tab bar: page id, glyph, short label and a
  // "something new" dot (Daily available, unseen badges). Help is not a tab.
  function tabs() {
    return [
      { page: "", icon: "\u25A6", label: "Board", dot: false },
      { page: "scores", icon: "\u265B", label: "Scores", dot: false },
      { page: "stats", icon: "\u25A4", label: "Stats", dot: false },
      { page: "achievements", icon: "\u2605", label: "Awards",
        dot: Game.unseenAchievements(root.profile).length > 0 },
      { page: "daily", icon: "\u25F7", label: "Daily", dot: root.dailyReady },
      { page: "settings", icon: "\u2699", label: "Setup", dot: false }
    ]
  }

  // Open a page from a tab, the digit keys, `t`, or the bar widget's `page`
  // IPC. Opening the Awards tab clears its unseen dot (persisted).
  function openPage(name) {
    if (root.pageList.indexOf(name) === -1) return
    root.view = name
    if (name === "achievements") root.markAwardsSeen()
    if (!root.opened) root.open()
    root.pulsePage()
  }

  // T / Shift+T walk the six-tab ring (the board is index 0).
  function cycleTab(step) {
    root.openPage(Game.nextTab(root.view, step))
  }

  // Mark every unlocked badge seen so the Awards dot clears after viewing.
  function markAwardsSeen() {
    if (Game.unseenAchievements(root.profile).length === 0) return
    root.profile = Game.markAchievementsSeen(root.profile)
    root.persist()
  }

  // Short motion-gated fade when the shown tab changes.
  function pulsePage() {
    if (!root.motionOn) {
      root.pageT = 1
      return
    }
    pageFade.duration = root.motionFull ? 120 : 60
    root.pageT = 0
    pageFade.restart()
  }

  // ---- inline board-size picker ----
  function toggleSizePicker() {
    if (root.sizePickerOpen) root.closeSizePicker()
    else root.openSizePicker()
  }

  function openSizePicker() {
    var index = Game.SUPPORTED_SIZES.indexOf(root.game.size)
    root.sizePickIndex = index === -1 ? 0 : index
    root.sizePickerOpen = true
    // Anchor the overlay under the header chip (after layout settles).
    Qt.callLater(function() {
      var origin = sizeChipButton.mapToItem(contentColumn, 0, sizeChipButton.height + Style.space(4))
      root.sizePickerX = origin.x
      root.sizePickerY = origin.y
    })
  }

  function closeSizePicker() {
    root.sizePickerOpen = false
  }

  function moveSizePick(step) {
    var count = Game.SUPPORTED_SIZES.length
    root.sizePickIndex = (root.sizePickIndex + step + count) % count
  }

  function chooseSizePick() {
    var size = Game.SUPPORTED_SIZES[root.sizePickIndex]
    root.closeSizePicker()
    root.setSize(size)
  }

  // ---- reset stats (Settings -> Advanced) ----
  function requestResetStats() {
    root.confirmReset = true
  }

  function doResetStats() {
    root.confirmReset = false
    root.profile = Game.resetStats(root.profile)
    root.persist()
    root.toastId = ""
    root.toastQueue = []
  }

  // Merge a settings patch into the profile and persist it.
  function setSetting(patch) {
    root.profile = Game.updateSettings(root.profile, patch)
    root.persist()
  }

  // Jump straight to a board size (used by the settings page).
  function setSize(size) {
    if (!Game.isSupportedSize(size) || size === root.game.size) return
    if (root.sliding) root.finishSlide()
    root.profile = Game.setActiveSize(root.profile, size)
    // Self-heal any empty playing board before it is shown (pre-fix files).
    root.profile = Game.healProfile(root.profile, Math.random)
    root.persist()
    root.ghosts = []
    root.sliding = false
    root.setScoreInstantly(Game.activeGame(root.profile).score)
    root.celebratedThisGame = false
    root.confetti = []
  }

  // Tile label with the active abbreviation and numerals.
  function numeralLabel(value) {
    return Game.formatNumerals(Game.abbreviateTile(value, root.game.size), root.gameSettings.numerals)
  }

  // Any other number (scores, best, leaderboard) in the active numerals.
  function numeral(value) {
    return Game.formatNumerals(value, root.gameSettings.numerals)
  }

  // ---- daily challenge ----
  function startDailyPlay() {
    var dateKey = Game.dailyDateKey(Date.now())
    if (Game.dailyStatus(root.profile, dateKey) === "done") return
    if (Game.dailyStatus(root.profile, dateKey) === "available")
      root.profile = Game.startDaily(root.profile, dateKey, Date.now())
    root.playingDaily = true
    root.view = ""
    root.ghosts = []
    root.sliding = false
    root.celebratedThisGame = false
    root.confetti = []
    root.persist()
    root.setScoreInstantly(root.game.score)
  }

  function leaveDaily() {
    root.playingDaily = false
    root.view = "daily"
  }

  function finishDailyIfDone() {
    var game = root.game
    if (!game || (game.status !== Game.STATUS_OVER && game.status !== Game.STATUS_WON)) return
    var finished = Game.finishDaily(root.profile, Date.now())
    if (finished.finished) {
      root.profile = finished.profile
      root.playingDaily = false
      root.view = "daily"
      root.persist()
    }
  }

  function copyDailyShare() {
    var result = root.profile.daily ? root.profile.daily.result : null
    var text = Game.dailyShareText(result)
    if (!text) return
    clipboard.pending = text
    clipboard.running = false
    clipboard.running = true
  }

  // Short, per-page footer key chips (the full list lives in Help, `?`).
  function footerChips() {
    if (root.view === "help") return [{ key: "Esc", label: "close" }]
    if (root.playingDaily)
      return [{ key: "↑↓←→", label: "move" }, { key: "Esc", label: "leave" }]
    if (root.view === "daily")
      return [{ key: "Enter", label: "play" }, { key: "1-6", label: "pages" }, { key: "?", label: "help" }]
    if (root.view !== "")
      return [{ key: "1-6", label: "pages" }, { key: "T", label: "next" }, { key: "?", label: "help" }]
    return [{ key: "↑↓←→", label: "move" }, { key: "U", label: "undo" },
            { key: "R", label: "new" }, { key: "?", label: "help" }]
  }

  // ---- scores page helpers ----
  // The size whose leaderboard is shown (0 follows the active board).
  readonly property int scoresSizeValue: root.scoresSize === 0 ? root.game.size : root.scoresSize
  function scoresLeaderboard() {
    var g = root.profile.sizes[String(root.scoresSizeValue)]
    return g && g.leaderboard ? g.leaderboard : []
  }
  // Only the active size's latest game can be highlighted.
  function scoresLatest() {
    return root.scoresSizeValue === root.game.size ? root.game.lastRecordedAt : 0
  }

  // ---- stats page helpers ----
  function statsFor() {
    if (root.statsSize === 0) return root.profile.stats.overall
    return root.profile.stats.sizes[String(root.statsSize)]
  }

  function statsRows() {
    var s = root.statsFor()
    if (!s) return []
    return [
      ["Games", String(s.games)],
      ["Wins", String(s.wins)],
      ["Win rate", Math.round(Game.winRate(s) * 100) + "%"],
      ["Best score", String(s.bestScore)],
      ["Best tile", String(s.bestTile)],
      ["Total moves", String(s.moves)],
      ["Avg score", String(Game.averageScore(s))],
      ["Best streak", String(s.longestStreak)],
      ["Time played", Game.formatDuration(s.timeMs)]
    ]
  }

  function statsHistogramMax() {
    var histogram = root.statsFor().histogram
    var max = 1
    for (var i = 0; i < histogram.length; i++) if (histogram[i] > max) max = histogram[i]
    return max
  }

  // ---- daily page helpers ----
  function dailyHistory() {
    var history = root.profile.daily ? root.profile.daily.history : []
    var out = []
    for (var i = history.length - 1; i >= 0 && out.length < 5; i--) out.push(history[i])
    return out
  }

  // Loaded by the read helper below. Never writes back (that would loop between
  // monitors): an unreadable or invalid file just starts a fresh game.
  function applyLoaded(text) {
    // Our own write (or a prior load) echoed back: nothing changed, and
    // re-applying would cut the score count-up and re-arm the celebration.
    if (text === root.lastStateText) return
    var parsed = Game.parseProfile(text)
    var next = parsed ? parsed : Game.newProfile(Math.random, Date.now())
    var nextGame = Game.activeGame(next)
    // Only a genuinely different game re-arms the once-per-game celebration;
    // another monitor's move in the same game keeps it spent.
    var differentGame = !Game.sameGame(root.game, nextGame)
    root.profile = next
    root.lastStateText = text
    if (differentGame) root.celebratedThisGame = false
    root.setScoreInstantly(nextGame.score)
    root.confetti = []
  }

  // Written only after a user action that changed state. One write at a time; a
  // newer state queued while writing replaces the pending one (latest wins).
  function persist() {
    var text = Game.serializeProfile(root.profile)
    root.lastStateText = text
    root.localRevision += 1
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
    root.readRevision = root.localRevision
    readProcess.running = true
  }

  // Map a tile level to its fill for the active palette. The theme/mono
  // palettes resolve a theme token + alpha (no hex literals); classic and
  // contrast are opt-in literal-colour palettes.
  function tileColor(level) {
    var entry = Game.tilePaletteEntry(root.gameSettings.palette, level)
    if (entry.hex) return entry.hex
    var base = entry.base === "accent" ? Color.accent
      : entry.base === "urgent" ? Color.urgent
      : Color.foreground
    return Util.alpha(base, entry.alpha)
  }

  // Readable text color on a tile: a literal palette supplies its own, else
  // composite the fill over the popup background and let WCAG pick.
  function tileTextColor(level) {
    var entry = Game.tilePaletteEntry(root.gameSettings.palette, level)
    if (entry.text) return entry.text
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
      // A local move landed while this read was in flight: the result is stale,
      // so drop it and never revert the board.
      if (root.readRevision !== root.localRevision) return
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

  // Panel entrance (slide + scale) and the invalid-move shake.
  NumberAnimation {
    id: entranceAnim
    target: root
    property: "entranceT"
    from: 0
    to: 1
    duration: 220
    easing.type: Easing.OutCubic
  }

  // Motion-gated fade when a tab changes (page rectangles bind to root.pageT).
  NumberAnimation {
    id: pageFade
    target: root
    property: "pageT"
    from: 0
    to: 1
    duration: 120
    easing.type: Easing.OutCubic
  }

  SequentialAnimation {
    id: boardShake
    NumberAnimation { target: boardShakeTx; property: "x"; to: -Style.space(5); duration: 40; easing.type: Easing.OutQuad }
    NumberAnimation { target: boardShakeTx; property: "x"; to: Style.space(5); duration: 60; easing.type: Easing.InOutQuad }
    NumberAnimation { target: boardShakeTx; property: "x"; to: -Style.space(3); duration: 50; easing.type: Easing.InOutQuad }
    NumberAnimation { target: boardShakeTx; property: "x"; to: 0; duration: 40; easing.type: Easing.OutQuad }
  }

  Connections {
    target: root
    function onOpenedChanged() { if (root.opened) root.playEntrance() }
  }

  // Optional merge sound: one bundled WAV, fixed argv, pitch rising with the
  // tile through --rate. Off by default; only started when sound is on.
  Process {
    id: mergeSound
    property int rate: 48000
    command: ["pw-play", "--rate", "" + rate, root.soundPath]
    running: false
  }

  // Copy the daily share text to the clipboard: wl-copy reads the text on
  // stdin, fixed argv, no shell.
  Process {
    id: clipboard
    property string pending: ""
    command: ["wl-copy"]
    stdinEnabled: false
    onStarted: {
      write(pending)
      pending = ""
      stdinEnabled = false
    }
  }

  // How long one achievement toast stays on screen.
  Timer {
    id: toastTimer
    interval: 2600
    onTriggered: root.showNextToast()
  }

  // Ctrl+Z is a standard undo accelerator. A window Shortcut handles it; the
  // PanelKeyCatcher only reports single-character text keys.
  Shortcut {
    sequence: "Ctrl+Z"
    enabled: root.opened
    onActivated: root.undo()
  }

  // A small selectable chip used by the settings page.
  component SettingChip: Rectangle {
    id: chip
    required property string chipLabel
    property bool active: false
    signal tapped()
    width: chipText.implicitWidth + Style.space(12)
    height: Style.space(18)
    radius: Style.cornerRadius > 0 ? Style.space(4) : 0
    color: chip.active ? Util.alpha(Color.accent, 0.22) : Util.alpha(Color.foreground, 0.06)
    Text {
      id: chipText
      anchors.centerIn: parent
      text: chip.chipLabel
      color: chip.active ? Color.accent : Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }
    MouseArea {
      anchors.fill: parent
      cursorShape: Qt.PointingHandCursor
      onClicked: chip.tapped()
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
    contentWidth: panel.fittedContentWidth(Style.space(340) * root.uiScale)
    contentHeight: panel.fittedContentHeight(contentColumn.implicitHeight * root.uiScale)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) {
        if (root.sizePickerOpen) {
          root.moveSizePick(dy !== 0 ? (dy < 0 ? -1 : 1) : (dx < 0 ? -1 : 1))
          return
        }
        root.doMove(Game.directionFromDelta(dx, dy))
      }
      onActivateRequested: {
        if (root.sizePickerOpen) { root.chooseSizePick(); return }
        if (root.confirmNew) { root.confirmNew = false; root.newGame(); return }
        if (root.confirmReset) { root.doResetStats(); return }
        if (root.view === "daily") { root.startDailyPlay(); return }
        if (!root.onBoard) return
        if (root.game.status === Game.STATUS_OVER) root.requestNewGame()
        else if (root.game.status === Game.STATUS_WON) root.keepGoing()
      }
      onCloseRequested: {
        // Esc steps back: picker/confirm -> cancel, a page -> the board, the
        // daily -> its page, else close.
        if (root.sizePickerOpen) root.closeSizePicker()
        else if (root.confirmNew) root.confirmNew = false
        else if (root.confirmReset) root.confirmReset = false
        else if (root.view === "help") root.view = ""
        else if (!root.onBoard) root.view = ""
        else if (root.playingDaily) root.leaveDaily()
        else root.close()
      }
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) {
        var key = text.toLowerCase()
        if (root.sizePickerOpen) {
          if (key === "[") root.switchSize(-1)
          else if (key === "]") root.switchSize(1)
          return
        }
        if (root.confirmNew || root.confirmReset) return
        // Digits 1-6 jump straight to a tab.
        if (text >= "1" && text <= "6") {
          root.openPage(Game.TAB_IDS[Number(text) - 1])
          return
        }
        if (key === "?") { root.openPage("help"); return }
        if (root.view === "help") return
        if (text === "T") { root.cycleTab(-1); return }
        if (key === "t") { root.cycleTab(1); return }
        if (!root.onBoard) return
        if (key === "w" || key === "k") root.doMove("up")
        else if (key === "a" || key === "h") root.doMove("left")
        else if (key === "s" || key === "j") root.doMove("down")
        else if (key === "d" || key === "l") root.doMove("right")
        else if (key === "r") root.requestNewGame()
        else if (key === "u") root.undo()
        else if (key === "[") root.switchSize(-1)
        else if (key === "]") root.switchSize(1)
        else if (key === "c" && root.game.status === Game.STATUS_WON) root.keepGoing()
      }

      Column {
        id: contentColumn
        width: parent.width
        spacing: 0
        // Window scale times the entrance (slide down + scale up), gated by motion.
        opacity: root.entranceT
        y: (1 - root.entranceT) * -Style.space(12) * root.uiScale
        scale: root.uiScale * (0.97 + 0.03 * root.entranceT)
        transformOrigin: Item.Top

        // Top margin so the gain label has room above the header.
        Item { width: 1; height: Style.space(8) }

        // 1. Header: the live score is the hero; the size chip opens the inline
        //    picker and the action group (undo / new game) sits on the right.
        Item {
          id: headerRow
          width: boardFrame.width
          anchors.horizontalCenter: parent.horizontalCenter
          height: headerColumn.implicitHeight

          Column {
            id: headerColumn
            width: parent.width
            spacing: Style.space(2)

            // Row 1: brand + size chip on the left, actions on the right.
            Item {
              id: headerTopRow
              width: parent.width
              height: Style.space(26)

              Row {
                id: brandRow
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                Text {
                  anchors.verticalCenter: parent.verticalCenter
                  text: "2048"
                  color: Color.accent
                  font.family: Style.font.family
                  font.bold: true
                  font.pixelSize: Style.font.title * 1.2
                }

                // Size chip: a real button with a caret; opens the inline picker.
                Rectangle {
                  id: sizeChipButton
                  anchors.verticalCenter: parent.verticalCenter
                  width: sizeChipText.implicitWidth + Style.space(14)
                  height: Style.space(22)
                  radius: Style.cornerRadius > 0 ? Style.space(5) : 0
                  color: (sizeChipMouse.containsMouse || root.sizePickerOpen)
                    ? Util.alpha(Color.accent, 0.22)
                    : Util.alpha(Color.foreground, 0.08)
                  border.width: Math.max(1, Style.normalBorderWidth)
                  border.color: root.sizePickerOpen ? Color.accent : Util.alpha(Color.foreground, 0.15)

                  Text {
                    id: sizeChipText
                    anchors.centerIn: parent
                    text: root.game.size + "×" + root.game.size + "  \u25BE"
                    color: root.sizePickerOpen ? Color.accent : Color.foreground
                    font.family: Style.font.family
                    font.bold: true
                    font.pixelSize: Style.font.bodySmall
                  }

                  MouseArea {
                    id: sizeChipMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      keyCatcher.forceActiveFocus()
                      root.toggleSizePicker()
                    }
                  }

                  ToolTip {
                    visible: sizeChipMouse.containsMouse
                    text: "Board size — click or [ ]"
                    delay: 400
                    padding: 0
                    background: BorderSurface {
                      color: Color.tooltip.background
                      borderSpec: Border.localOrSurfaceSpec("tooltip", "border", Color.tooltip.border, Color.tooltip.border, Math.max(1, Style.normalBorderWidth))
                      radius: 0
                    }
                    contentItem: Text {
                      text: "Board size — click or [ ]"
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

              // Action group: undo (dim when unavailable) and new game.
              Row {
                id: actionsRow
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(6)

                Rectangle {
                  id: undoButton
                  width: Style.space(30)
                  height: Style.space(26)
                  radius: Style.cornerRadius > 0 ? Style.space(6) : 0
                  opacity: root.canUndo ? 1 : 0.4
                  color: undoMouse.containsMouse && root.canUndo
                    ? Util.alpha(Color.foreground, 0.14)
                    : Util.alpha(Color.foreground, 0.07)

                  Text {
                    anchors.centerIn: parent
                    text: "\u21BA"
                    color: Color.foreground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.icon
                  }

                  MouseArea {
                    id: undoMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      keyCatcher.forceActiveFocus()
                      root.undo()
                    }
                  }

                  ToolTip {
                    visible: undoMouse.containsMouse
                    text: "Undo — U"
                    delay: 400
                    padding: 0
                    background: BorderSurface {
                      color: Color.tooltip.background
                      borderSpec: Border.localOrSurfaceSpec("tooltip", "border", Color.tooltip.border, Color.tooltip.border, Math.max(1, Style.normalBorderWidth))
                      radius: 0
                    }
                    contentItem: Text {
                      text: "Undo — U"
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

                Rectangle {
                  id: newGameButton
                  width: Style.space(30)
                  height: Style.space(26)
                  radius: Style.cornerRadius > 0 ? Style.space(6) : 0
                  color: newGameMouse.containsMouse
                    ? Util.alpha(Color.foreground, 0.14)
                    : Util.alpha(Color.foreground, 0.07)

                  Text {
                    anchors.centerIn: parent
                    text: "\uFF0B"
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
                      root.requestNewGame()
                    }
                  }

                  ToolTip {
                    visible: newGameMouse.containsMouse
                    text: "New game — R"
                    delay: 400
                    padding: 0
                    background: BorderSurface {
                      color: Color.tooltip.background
                      borderSpec: Border.localOrSurfaceSpec("tooltip", "border", Color.tooltip.border, Color.tooltip.border, Math.max(1, Style.normalBorderWidth))
                      radius: 0
                    }
                    contentItem: Text {
                      text: "New game — R"
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

            // Row 2: the live score is the hero; best is a small secondary.
            Item {
              id: heroRow
              width: parent.width
              height: heroColumn.implicitHeight

              Column {
                id: heroColumn
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: 0

                Text {
                  id: heroScoreText
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: root.numeral(root.displayScore)
                  color: Color.foreground
                  font.family: Style.font.family
                  font.bold: true
                  font.pixelSize: Style.font.displayLarge

                  // "+N" gain: floats up above the hero score while fading.
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

                Row {
                  anchors.horizontalCenter: parent.horizontalCenter
                  spacing: Style.space(6)

                  Text {
                    text: "SCORE"
                    color: Color.foreground
                    opacity: 0.6
                    font.family: Style.font.family
                    font.pixelSize: Style.font.caption
                    font.letterSpacing: 1
                  }

                  Text {
                    visible: root.beatBest
                    text: "\u25B2"
                    color: Color.accent
                    font.family: Style.font.family
                    font.pixelSize: Style.font.caption
                  }

                  Text {
                    text: "BEST " + root.numeral(root.game.best)
                    color: root.beatBest ? Color.accent : Color.muted
                    font.family: Style.font.family
                    font.pixelSize: Style.font.caption
                  }
                }
              }
            }
          }
        }

        Item { width: 1; height: Style.space(8) }

        // 1b. Tab bar: six visible tabs (Board · Scores · Stats · Awards ·
        //     Daily · Setup). The active tab is tinted; a dot marks news
        //     (Daily available, unseen badges).
        Row {
          id: tabBar
          width: boardFrame.width
          anchors.horizontalCenter: parent.horizontalCenter
          height: Style.space(34)
          spacing: Style.space(2)

          Repeater {
            model: root.tabs()

            Rectangle {
              id: tabItem
              required property var modelData
              readonly property bool active: root.view === modelData.page
              width: (tabBar.width - Style.space(2) * 5) / 6
              height: tabBar.height
              radius: Style.cornerRadius > 0 ? Style.space(6) : 0
              color: tabItem.active ? Util.alpha(Color.accent, 0.20)
                : (tabMouse.containsMouse ? Util.alpha(Color.foreground, 0.08) : "transparent")
              border.width: tabItem.active ? Math.max(1, Style.normalBorderWidth) : 0
              border.color: Color.accent

              Column {
                anchors.centerIn: parent
                spacing: Style.space(1)

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: modelData.icon
                  color: tabItem.active ? Color.accent : Color.foreground
                  opacity: tabItem.active ? 1 : 0.75
                  font.family: Style.font.family
                  font.pixelSize: Style.font.icon
                }

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: modelData.label
                  color: tabItem.active ? Color.accent : Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }

              // "Something new" dot.
              Rectangle {
                visible: modelData.dot === true
                anchors.top: parent.top
                anchors.right: parent.right
                anchors.margins: Style.space(4)
                width: Style.space(6)
                height: Style.space(6)
                radius: width / 2
                color: Color.urgent
              }

              MouseArea {
                id: tabMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                  keyCatcher.forceActiveFocus()
                  root.openPage(modelData.page)
                }
              }
            }
          }
        }

        Item { width: 1; height: Style.space(10) }

        // 1c. Inline board-size picker: an overlay under the header chip.
        //     `[`/`]` cycle without it; ↑/↓ move, Enter picks, Esc closes.
        Rectangle {
          id: sizePicker
          visible: root.sizePickerOpen
          z: 60
          x: Math.max(Style.space(0), Math.min(boardFrame.width - width, root.sizePickerX))
          y: root.sizePickerY
          width: Style.space(104)
          height: sizePickColumn.implicitHeight + Style.space(8)
          color: Color.popups.background
          radius: Style.cornerRadius
          border.width: Math.max(1, Style.normalBorderWidth)
          border.color: Color.popups.border

          Column {
            id: sizePickColumn
            width: parent.width - Style.space(8)
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: Style.space(4)
            spacing: 0

            Text {
              text: "Board size"
              color: Color.muted
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }

            Repeater {
              model: Game.SUPPORTED_SIZES

              Rectangle {
                required property var modelData
                required property int index

                width: parent.width
                height: Style.space(20)
                radius: Style.cornerRadius > 0 ? Style.space(4) : 0
                color: index === root.sizePickIndex ? Util.alpha(Color.accent, 0.22) : "transparent"

                Text {
                  anchors.left: parent.left
                  anchors.leftMargin: Style.space(6)
                  anchors.verticalCenter: parent.verticalCenter
                  text: (root.game.size === modelData ? "\u2713 " : "   ") + modelData + "×" + modelData
                  color: root.game.size === modelData ? Color.accent : Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }

                MouseArea {
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onEntered: root.sizePickIndex = index
                  onClicked: {
                    keyCatcher.forceActiveFocus()
                    root.sizePickIndex = index
                    root.chooseSizePick()
                  }
                }
              }
            }
          }
        }

        Item { width: 1; height: Style.space(10) }

        // 2. Board: a square grid of 16 cells, single (borderless) surface.
        Item {
          id: boardFrame
          anchors.horizontalCenter: parent.horizontalCenter
          width: Math.min(parent.width, Style.space(300))
          height: width

          // Invalid-move shake writes here (a Translate keeps the anchors intact).
          transform: Translate { id: boardShakeTx }

          readonly property int gridSize: root.game.size
          readonly property real cellSize: (width - root.boardGap * (gridSize + 1)) / gridSize

          Rectangle {
            anchors.fill: parent
            color: Util.alpha(Color.foreground, 0.04)
            radius: Style.cornerRadius > 0 ? Style.space(8) : 0

            Grid {
              anchors.fill: parent
              anchors.margins: root.boardGap
              columns: boardFrame.gridSize
              spacing: root.boardGap

              Repeater {
                model: boardFrame.gridSize * boardFrame.gridSize

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
                      text: root.numeralLabel(cellRoot.value)
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

                  // Glow ring on a big merge: 128+ (tier 1), stronger at 1024+
                  // (tier 2). Driven from the same events as the pop.
                  Rectangle {
                    id: glowRing
                    anchors.fill: parent
                    anchors.margins: -Style.space(2)
                    z: 5
                    radius: Style.cornerRadius > 0 ? Style.space(7) : 0
                    color: "transparent"
                    border.color: Color.accent
                    border.width: opacity > 0
                      ? (tier >= 2 ? Math.max(2, Style.normalBorderWidth + 1) : Math.max(1, Style.normalBorderWidth))
                      : 0
                    opacity: 0
                    visible: opacity > 0
                    readonly property int tier: Game.glowTier(cellRoot.level)

                    ParallelAnimation {
                      id: glowAnim
                      onStopped: { glowRing.scale = 1.0 }
                      NumberAnimation {
                        target: glowRing; property: "opacity"; from: 0.9; to: 0
                        duration: glowRing.tier >= 2 ? 650 : 450; easing.type: Easing.OutCubic
                      }
                      NumberAnimation {
                        target: glowRing; property: "scale"; from: 1.0
                        to: glowRing.tier >= 2 ? 1.28 : 1.16
                        duration: glowRing.tier >= 2 ? 650 : 450; easing.type: Easing.OutCubic
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
                      if (root.motionOn && glowRing.tier > 0
                          && root.game.merged.indexOf(cellRoot.index) !== -1)
                        glowAnim.restart()
                    }

                    function onPopRequested() {
                      if (root.game.spawned === cellRoot.index
                          || root.game.merged.indexOf(cellRoot.index) !== -1)
                        popAnim.restart()
                      if (root.motionOn && glowRing.tier > 0
                          && root.game.merged.indexOf(cellRoot.index) !== -1)
                        glowAnim.restart()
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
                  readonly property int gridSize: boardFrame.gridSize

                  width: boardFrame.cellSize
                  height: boardFrame.cellSize
                  radius: Style.cornerRadius > 0 ? Style.space(6) : 0
                  color: root.tileColor(Game.tileLevel(modelData.value))

                  Text {
                    anchors.centerIn: parent
                    text: root.numeralLabel(ghost.modelData.value)
                    color: root.tileTextColor(Game.tileLevel(ghost.modelData.value))
                    font.family: Style.font.family
                    font.bold: true
                    font.pixelSize: root.tileFontSize(ghost.modelData.value)
                  }

                  NumberAnimation on x {
                    from: (ghost.modelData.from % ghost.gridSize) * ghost.step
                    to: (ghost.modelData.to % ghost.gridSize) * ghost.step
                    duration: root.slideMs
                    easing.type: Easing.OutCubic
                  }

                  NumberAnimation on y {
                    from: Math.floor(ghost.modelData.from / ghost.gridSize) * ghost.step
                    to: Math.floor(ghost.modelData.to / ghost.gridSize) * ghost.step
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
                  text: "Score " + root.numeral(root.game.score) + " · Best tile " + root.numeral(Game.maxTile(root.game.cells))
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
                    visible: root.canUndo
                    text: "Undo"
                    foreground: Color.foreground
                    onClicked: {
                      keyCatcher.forceActiveFocus()
                      root.undo()
                    }
                  }

                  Button {
                    text: "New game"
                    foreground: root.game.status === Game.STATUS_OVER ? Color.accent : Color.foreground
                    onClicked: {
                      keyCatcher.forceActiveFocus()
                      root.requestNewGame()
                    }
                  }
                }
              }
            }
          }

          MouseArea {
            id: boardDrag
            anchors.fill: parent
            // Only grab the board while a game is in progress on the board page,
            // so it never covers the win/over card's buttons.
            enabled: Game.isBoardInteractive(root.game, root.view)
            property real pressX: 0
            property real pressY: 0

            onPressed: function(mouse) {
              pressX = mouse.x
              pressY = mouse.y
            }

            onReleased: function(mouse) {
              keyCatcher.forceActiveFocus()
              if (!root.onBoard) return
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
            opacity: (root.game.moves === 0 && root.game.status === Game.STATUS_PLAYING && root.onBoard) ? 0.55 : 0
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            Behavior on opacity { NumberAnimation { duration: 300 } }
          }

          // 4. Local leaderboard. Occupies exactly the board's frame so the
          //    panel never jumps when the view is toggled.
          Rectangle {
            id: scoresView
            anchors.fill: parent
            visible: root.view === "scores"
            opacity: root.pageT
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

              Row {
                width: parent.width
                spacing: Style.space(4)

                Text {
                  text: "Top scores"
                  color: Color.foreground
                  font.family: Style.font.family
                  font.bold: true
                  font.pixelSize: Style.font.title
                }

                // Size selector: glance at another size's leaderboard without
                // leaving the page (0 follows the active board is not offered).
                Repeater {
                  model: [3, 4, 5, 6, 7, 8]

                  Rectangle {
                    required property var modelData
                    width: scoreSizeLabel.implicitWidth + Style.space(8)
                    height: Style.space(16)
                    radius: Style.cornerRadius > 0 ? Style.space(4) : 0
                    color: root.scoresSizeValue === modelData
                      ? Util.alpha(Color.accent, 0.22)
                      : Util.alpha(Color.foreground, 0.05)

                    Text {
                      id: scoreSizeLabel
                      anchors.centerIn: parent
                      text: modelData
                      color: root.scoresSizeValue === modelData ? Color.accent : Color.foreground
                      font.family: Style.font.family
                      font.pixelSize: Style.font.caption
                    }

                    MouseArea {
                      anchors.fill: parent
                      cursorShape: Qt.PointingHandCursor
                      onClicked: {
                        keyCatcher.forceActiveFocus()
                        root.scoresSize = modelData
                      }
                    }
                  }
                }
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
                model: root.scoresLeaderboard()

                Item {
                  id: scoreRowItem
                  required property var modelData
                  required property int index

                  width: parent.width
                  height: scoresView.rowH

                  // Records with no timestamp never match; otherwise the last
                  // recorded game of the shown size is highlighted.
                  readonly property bool latest: modelData.endedAt !== 0
                    && modelData.endedAt === root.scoresLatest()
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
                      text: root.numeral(scoreRowItem.modelData.score)
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
                      text: root.numeral(scoreRowItem.modelData.maxTile)
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
                visible: root.scoresLeaderboard().length === 0
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

          // ---- Stats page (per size and overall) ----
          Rectangle {
            visible: root.view === "stats"
            opacity: root.pageT
            anchors.fill: parent
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
                text: "Stats"
                color: Color.foreground
                font.family: Style.font.family
                font.bold: true
                font.pixelSize: Style.font.title
              }

              Row {
                spacing: Style.space(4)

                Repeater {
                  model: [{ label: "All", size: 0 }, { label: "3", size: 3 }, { label: "4", size: 4 },
                          { label: "5", size: 5 }, { label: "6", size: 6 }, { label: "7", size: 7 },
                          { label: "8", size: 8 }]

                  Rectangle {
                    required property var modelData
                    width: statsChipLabel.implicitWidth + Style.space(10)
                    height: Style.space(18)
                    radius: Style.cornerRadius > 0 ? Style.space(4) : 0
                    color: root.statsSize === modelData.size
                      ? Util.alpha(Color.accent, 0.22)
                      : Util.alpha(Color.foreground, 0.06)

                    Text {
                      id: statsChipLabel
                      anchors.centerIn: parent
                      text: modelData.label
                      color: root.statsSize === modelData.size ? Color.accent : Color.foreground
                      font.family: Style.font.family
                      font.pixelSize: Style.font.caption
                    }

                    MouseArea {
                      anchors.fill: parent
                      cursorShape: Qt.PointingHandCursor
                      onClicked: {
                        keyCatcher.forceActiveFocus()
                        root.statsSize = modelData.size
                      }
                    }
                  }
                }
              }

              Grid {
                width: parent.width
                columns: 2
                columnSpacing: Style.space(10)
                rowSpacing: Style.space(3)

                Repeater {
                  model: root.statsRows()

                  Row {
                    required property var modelData
                    spacing: Style.space(4)

                    Text {
                      text: modelData[0]
                      width: Style.space(84)
                      elide: Text.ElideRight
                      color: Color.muted
                      font.family: Style.font.family
                      font.pixelSize: Style.font.bodySmall
                    }
                    Text {
                      text: modelData[1]
                      color: Color.foreground
                      font.family: Style.font.family
                      font.bold: true
                      font.pixelSize: Style.font.bodySmall
                    }
                  }
                }
              }

              Item { width: 1; height: Style.space(2) }

              Text {
                text: "Score histogram"
                color: Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
              }

              Row {
                id: histogramRow
                width: parent.width
                height: Style.space(46)
                spacing: Style.space(3)

                Repeater {
                  model: root.statsFor().histogram

                  Item {
                    required property var modelData
                    width: (histogramRow.width - Style.space(3) * 7) / 8
                    height: histogramRow.height

                    Rectangle {
                      anchors.bottom: parent.bottom
                      width: parent.width
                      height: Math.max(2, (parent.height - Style.space(12)) * modelData / root.statsHistogramMax())
                      radius: Style.cornerRadius > 0 ? Style.space(2) : 0
                      color: Util.alpha(Color.accent, 0.7)
                    }

                    Text {
                      anchors.horizontalCenter: parent.horizontalCenter
                      anchors.bottom: parent.bottom
                      anchors.bottomMargin: Style.space(1)
                      text: modelData
                      color: Color.foreground
                      font.family: Style.font.family
                      font.pixelSize: Style.font.caption
                    }
                  }
                }
              }
            }
          }

          // ---- Achievements page ----
          Rectangle {
            visible: root.view === "achievements"
            opacity: root.pageT
            anchors.fill: parent
            color: Color.popups.background
            radius: Style.cornerRadius
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.popups.border
            clip: true

            Column {
              anchors.fill: parent
              anchors.margins: Style.space(12)
              spacing: Style.space(6)

              Row {
                width: parent.width
                spacing: Style.space(6)

                Text {
                  text: "Achievements"
                  color: Color.foreground
                  font.family: Style.font.family
                  font.bold: true
                  font.pixelSize: Style.font.title
                }

                Item { width: parent.width - Style.space(110) - Style.space(6); height: 1 }

                Text {
                  text: root.profile.achievements.length + " / " + Game.ACHIEVEMENTS.length + " unlocked"
                  color: Color.muted
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }

              Grid {
                id: achievementGrid
                width: parent.width
                columns: 2
                columnSpacing: Style.space(6)
                rowSpacing: Style.space(6)

                Repeater {
                  model: Game.ACHIEVEMENTS

                  Rectangle {
                    required property var modelData
                    readonly property bool unlocked: root.profile.achievements.indexOf(modelData.id) !== -1
                    width: (achievementGrid.width - Style.space(6)) / 2
                    height: Style.space(48)
                    radius: Style.cornerRadius > 0 ? Style.space(5) : 0
                    color: unlocked ? Util.alpha(Color.accent, 0.18) : Util.alpha(Color.foreground, 0.05)
                    border.width: Math.max(1, Style.normalBorderWidth)
                    border.color: unlocked ? Color.accent : Util.alpha(Color.foreground, 0.15)

                    Column {
                      anchors.centerIn: parent
                      width: parent.width - Style.space(8)
                      spacing: Style.space(1)

                      Text {
                        width: parent.width
                        text: (unlocked ? "★ " : "☆ ") + modelData.title
                        color: unlocked ? Color.accent : Color.muted
                        font.family: Style.font.family
                        font.bold: true
                        font.pixelSize: Style.font.bodySmall
                      }
                      Text {
                        width: parent.width
                        text: modelData.description
                        color: Color.muted
                        wrapMode: Text.WordWrap
                        maximumLineCount: 2
                        elide: Text.ElideRight
                        font.family: Style.font.family
                        font.pixelSize: Style.font.caption
                      }
                    }
                  }
                }
              }
            }
          }

          // ---- Daily challenge page ----
          Rectangle {
            id: dailyPage
            visible: root.view === "daily"
            opacity: root.pageT
            anchors.fill: parent
            color: Color.popups.background
            radius: Style.cornerRadius
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.popups.border
            clip: true

            readonly property string dateKey: Game.dailyDateKey(Date.now())
            readonly property string status: Game.dailyStatus(root.profile, dateKey)
            readonly property var result: root.profile.daily ? root.profile.daily.result : null

            Column {
              anchors.fill: parent
              anchors.margins: Style.space(12)
              spacing: Style.space(6)

              Text {
                text: "Daily challenge"
                color: Color.foreground
                font.family: Style.font.family
                font.bold: true
                font.pixelSize: Style.font.title
              }

              Text {
                text: dailyPage.dateKey
                color: Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.body
              }

              Text {
                visible: dailyPage.status === "available"
                width: parent.width
                wrapMode: Text.WordWrap
                text: "A seeded 4×4 board, the same for everyone. One attempt today."
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }

              Text {
                visible: dailyPage.status === "playing"
                text: "Today's attempt is in progress."
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }

              Button {
                visible: dailyPage.status !== "done"
                text: dailyPage.status === "playing" ? "Resume" : "Play daily"
                foreground: Color.accent
                onClicked: {
                  keyCatcher.forceActiveFocus()
                  root.startDailyPlay()
                }
              }

              Column {
                visible: dailyPage.status === "done" && dailyPage.result !== null
                width: parent.width
                spacing: Style.space(4)

                Text {
                  text: "Score " + (dailyPage.result ? dailyPage.result.score : 0)
                    + " · Best tile " + (dailyPage.result ? dailyPage.result.maxTile : 0)
                    + ((dailyPage.result && dailyPage.result.won) ? " · won" : "")
                  color: Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.body
                }

                Button {
                  text: "Copy share text"
                  foreground: Color.foreground
                  onClicked: {
                    keyCatcher.forceActiveFocus()
                    root.copyDailyShare()
                  }
                }
              }

              Text {
                visible: root.dailyHistory().length > 0
                text: "Recent days"
                color: Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
              }

              Repeater {
                model: root.dailyHistory()

                Text {
                  required property var modelData
                  text: modelData.date + "   " + modelData.score + "   " + modelData.maxTile
                  color: Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }
              }
            }
          }

          // ---- Settings page ----
          Rectangle {
            visible: root.view === "settings"
            opacity: root.pageT
            anchors.fill: parent
            color: Color.popups.background
            radius: Style.cornerRadius
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.popups.border
            clip: true

            Column {
              anchors.fill: parent
              anchors.margins: Style.space(10)
              spacing: Style.space(6)

              Text {
                text: "Settings"
                color: Color.foreground
                font.family: Style.font.family
                font.bold: true
                font.pixelSize: Style.font.title
              }

              Row {
                width: parent.width
                spacing: Style.space(6)
                Text {
                  text: "Board"; width: Style.space(54); color: Color.muted
                  font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
                }
                Row {
                  width: parent.width - Style.space(54) - Style.space(6)
                  spacing: Style.space(4)
                  Repeater {
                    model: [3, 4, 5, 6, 7, 8]
                    SettingChip {
                      required property var modelData
                      chipLabel: modelData + "×" + modelData
                      active: root.game.size === modelData && !root.playingDaily
                      onTapped: { keyCatcher.forceActiveFocus(); root.setSize(modelData) }
                    }
                  }
                }
              }

              Row {
                width: parent.width
                spacing: Style.space(6)
                Text {
                  text: "Palette"; width: Style.space(54); color: Color.muted
                  font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
                }
                Row {
                  width: parent.width - Style.space(54) - Style.space(6)
                  spacing: Style.space(4)
                  Repeater {
                    model: Game.PALETTE_CHOICES
                    SettingChip {
                      required property var modelData
                      chipLabel: modelData.label
                      active: root.gameSettings.palette === modelData.id
                      onTapped: { keyCatcher.forceActiveFocus(); root.setSetting({ palette: modelData.id }) }
                    }
                  }
                }
              }

              Row {
                width: parent.width
                spacing: Style.space(6)
                Text {
                  text: "Motion"; width: Style.space(54); color: Color.muted
                  font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
                }
                Row {
                  width: parent.width - Style.space(54) - Style.space(6)
                  spacing: Style.space(4)
                  Repeater {
                    model: [{ id: "full", label: "Full" }, { id: "reduced", label: "Reduced" }, { id: "off", label: "Off" }]
                    SettingChip {
                      required property var modelData
                      chipLabel: modelData.label
                      active: root.gameSettings.motion === modelData.id
                      onTapped: { keyCatcher.forceActiveFocus(); root.setSetting({ motion: modelData.id }) }
                    }
                  }
                }
              }

              Row {
                width: parent.width
                spacing: Style.space(6)
                Text {
                  text: "Numerals"; width: Style.space(54); color: Color.muted
                  font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
                }
                Row {
                  width: parent.width - Style.space(54) - Style.space(6)
                  spacing: Style.space(4)
                  Repeater {
                    model: Game.NUMERALS
                    SettingChip {
                      required property var modelData
                      chipLabel: modelData.label
                      active: root.gameSettings.numerals === modelData.id
                      onTapped: { keyCatcher.forceActiveFocus(); root.setSetting({ numerals: modelData.id }) }
                    }
                  }
                }
              }

              Row {
                width: parent.width
                spacing: Style.space(6)
                Text {
                  text: "Undo"; width: Style.space(54); color: Color.muted
                  font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
                }
                Row {
                  width: parent.width - Style.space(54) - Style.space(6)
                  spacing: Style.space(4)
                  Repeater {
                    model: [{ v: true, label: "On" }, { v: false, label: "Off" }]
                    SettingChip {
                      required property var modelData
                      chipLabel: modelData.label
                      active: root.gameSettings.allowUndo === modelData.v
                      onTapped: { keyCatcher.forceActiveFocus(); root.setSetting({ allowUndo: modelData.v }) }
                    }
                  }
                }
              }

              Row {
                width: parent.width
                spacing: Style.space(6)
                Text {
                  text: "Limit"; width: Style.space(54); color: Color.muted
                  font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
                }
                Row {
                  width: parent.width - Style.space(54) - Style.space(6)
                  spacing: Style.space(4)
                  Repeater {
                    model: [{ v: "unlimited", label: "∞" }, { v: 3, label: "3 / game" }]
                    SettingChip {
                      required property var modelData
                      chipLabel: modelData.label
                      active: root.gameSettings.undoLimit === modelData.v
                      onTapped: { keyCatcher.forceActiveFocus(); root.setSetting({ undoLimit: modelData.v }) }
                    }
                  }
                }
              }

              Row {
                width: parent.width
                spacing: Style.space(6)
                Text {
                  text: "Sound"; width: Style.space(54); color: Color.muted
                  font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
                }
                Row {
                  width: parent.width - Style.space(54) - Style.space(6)
                  spacing: Style.space(4)
                  Repeater {
                    model: [{ v: true, label: "On" }, { v: false, label: "Off" }]
                    SettingChip {
                      required property var modelData
                      chipLabel: modelData.label
                      active: root.gameSettings.sound === modelData.v
                      onTapped: { keyCatcher.forceActiveFocus(); root.setSetting({ sound: modelData.v }) }
                    }
                  }
                }
              }

              Row {
                width: parent.width
                spacing: Style.space(6)
                Text {
                  text: "Scale"; width: Style.space(54); color: Color.muted
                  font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
                }
                Row {
                  width: parent.width - Style.space(54) - Style.space(6)
                  spacing: Style.space(4)
                  Repeater {
                    model: [90, 100, 110, 125, 150]
                    SettingChip {
                      required property var modelData
                      chipLabel: modelData + "%"
                      active: root.gameSettings.scale === modelData
                      onTapped: { keyCatcher.forceActiveFocus(); root.setSetting({ scale: modelData }) }
                    }
                  }
                }
              }

              Row {
                width: parent.width
                spacing: Style.space(6)
                Text {
                  text: "Confirm"; width: Style.space(54); color: Color.muted
                  font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
                }
                Row {
                  width: parent.width - Style.space(54) - Style.space(6)
                  spacing: Style.space(4)
                  Repeater {
                    model: [{ v: true, label: "On" }, { v: false, label: "Off" }]
                    SettingChip {
                      required property var modelData
                      chipLabel: modelData.label
                      active: root.gameSettings.confirmNew === modelData.v
                      onTapped: { keyCatcher.forceActiveFocus(); root.setSetting({ confirmNew: modelData.v }) }
                    }
                  }
                }
              }
            }
          }

          // ---- Keyboard help page ----
          Rectangle {
            visible: root.view === "help"
            opacity: root.pageT
            anchors.fill: parent
            color: Color.popups.background
            radius: Style.cornerRadius
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.popups.border
            clip: true

            Column {
              anchors.fill: parent
              anchors.margins: Style.space(12)
              spacing: Style.space(4)

              Text {
                text: "Keyboard"
                color: Color.foreground
                font.family: Style.font.family
                font.bold: true
                font.pixelSize: Style.font.title
              }

              Repeater {
                model: [
                  ["← ↑ → ↓ / H J K L", "Move"],
                  ["W A S D", "Move"],
                  ["Drag / swipe", "Move"],
                  ["U / Ctrl+Z", "Undo"],
                  ["R", "New game"],
                  ["[ / ]", "Board size"],
                  ["T", "Next page"],
                  ["Enter / Space", "Keep going / new game"],
                  ["Esc", "Back / close"],
                  ["?", "This help"],
                  ["Tab", "Next bar panel"]
                ]
                Row {
                  required property var modelData
                  spacing: Style.space(6)
                  Text {
                    text: modelData[0]; width: Style.space(126); color: Color.accent
                    font.family: Style.font.family; font.pixelSize: Style.font.caption
                  }
                  Text {
                    text: modelData[1]; color: Color.foreground
                    font.family: Style.font.family; font.pixelSize: Style.font.caption
                  }
                }
              }
            }
          }

          // Confirm-new-game prompt (setting "Confirm").
          Rectangle {
            anchors.fill: parent
            visible: root.confirmNew
            color: Util.alpha(Color.popups.background, 0.9)
            radius: Style.cornerRadius
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.popups.border
            z: 50

            Rectangle {
              anchors.centerIn: parent
              color: Color.popups.background
              radius: Style.cornerRadius
              border.width: Math.max(1, Style.normalBorderWidth)
              border.color: Color.popups.border
              implicitWidth: confirmColumn.implicitWidth + Style.space(12) * 2
              implicitHeight: confirmColumn.implicitHeight + Style.space(12) * 2

              Column {
                id: confirmColumn
                anchors.centerIn: parent
                spacing: Style.space(8)

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: "Start a new game?"
                  color: Color.foreground
                  font.family: Style.font.family
                  font.bold: true
                  font.pixelSize: Style.font.title
                }

                Row {
                  anchors.horizontalCenter: parent.horizontalCenter
                  spacing: Style.space(8)

                  Button {
                    text: "New game"
                    foreground: Color.accent
                    onClicked: {
                      keyCatcher.forceActiveFocus()
                      root.confirmNew = false
                      root.newGame()
                    }
                  }
                  Button {
                    text: "Cancel"
                    foreground: Color.foreground
                    onClicked: {
                      keyCatcher.forceActiveFocus()
                      root.confirmNew = false
                    }
                  }
                }
              }
            }
          }

          // Achievement toast: one at a time, queued, gated by motion.
          Rectangle {
            id: toast
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            anchors.bottomMargin: Style.space(10)
            z: 40
            visible: root.toastId !== ""
            width: Math.min(parent.width - Style.space(16), toastText.implicitWidth + Style.space(20))
            height: Style.space(22)
            radius: Style.cornerRadius > 0 ? Style.space(6) : 0
            color: Color.popups.background
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.accent

            Text {
              id: toastText
              anchors.centerIn: parent
              width: parent.width - Style.space(12)
              horizontalAlignment: Text.AlignHCenter
              elide: Text.ElideRight
              text: {
                var achievement = root.achievementById(root.toastId)
                return achievement ? ("★ " + achievement.title + " unlocked") : ""
              }
              color: Color.accent
              font.family: Style.font.family
              font.bold: true
              font.pixelSize: Style.font.caption
            }
          }

          // Assisted marker: a small undo chip shown while a game that used
          // undo is in play, so the player knows it will not be ranked.
          Rectangle {
            id: assistedBadge
            anchors.top: parent.top
            anchors.right: parent.right
            anchors.margins: Style.space(6)
            visible: root.game.assisted === true
              && root.game.status === Game.STATUS_PLAYING
              && root.onBoard
            width: assistedLabel.implicitWidth + Style.space(10)
            height: Style.space(16)
            radius: Style.cornerRadius > 0 ? Style.space(8) : 0
            color: Color.popups.background
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.accent

            Text {
              id: assistedLabel
              anchors.centerIn: parent
              text: "↺ assisted"
              color: Color.accent
              font.family: Style.font.family
              font.bold: true
              font.pixelSize: Style.font.caption
            }

            MouseArea {
              id: assistedMouse
              anchors.fill: parent
              hoverEnabled: true
            }

            ToolTip {
              visible: assistedMouse.containsMouse
              text: "Undo used — this game won't be ranked"
              delay: 400
              padding: 0
              background: BorderSurface {
                color: Color.tooltip.background
                borderSpec: Border.localOrSurfaceSpec("tooltip", "border", Color.tooltip.border, Color.tooltip.border, Math.max(1, Style.normalBorderWidth))
                radius: 0
              }
              contentItem: Text {
                text: "Undo used — this game won't be ranked"
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

          // Combo badge: a streak of 3+ scoring moves in a row.
          Rectangle {
            id: comboBadge
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.margins: Style.space(6)
            visible: root.game.combo >= 3
              && root.game.status === Game.STATUS_PLAYING
              && root.onBoard
            width: comboLabel.implicitWidth + Style.space(10)
            height: Style.space(16)
            radius: Style.cornerRadius > 0 ? Style.space(8) : 0
            color: Color.popups.background
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.urgent

            Text {
              id: comboLabel
              anchors.centerIn: parent
              text: "×" + root.game.combo + " combo"
              color: Color.urgent
              font.family: Style.font.family
              font.bold: true
              font.pixelSize: Style.font.caption
            }

            Connections {
              target: root
              function onGameChanged() {
                if (root.motionOn && root.game.combo >= 3) comboPop.restart()
              }
            }

            SequentialAnimation {
              id: comboPop
              NumberAnimation { target: comboBadge; property: "scale"; from: 1.0; to: 1.18; duration: 90; easing.type: Easing.OutCubic }
              NumberAnimation { target: comboBadge; property: "scale"; from: 1.18; to: 1.0; duration: 140; easing.type: Easing.OutCubic }
            }
          }

          // Confetti on 2048 (small) / 4096 (big). Gated by motion and cleared
          // on a new game; each particle flies out and fades.
          Item {
            id: confettiLayer
            anchors.fill: parent
            z: 30
            visible: root.confetti.length > 0

            Repeater {
              model: root.confetti

              Item {
                id: particle
                required property var modelData
                readonly property real originX: confettiLayer.width / 2
                readonly property real originY: confettiLayer.height / 2
                width: modelData.size
                height: modelData.size * 1.6
                y: originY
                opacity: 0

                Rectangle {
                  anchors.fill: parent
                  radius: 1
                  color: particle.modelData.accent ? Color.accent : Color.foreground
                }

                SequentialAnimation {
                  id: particleAnim
                  PauseAnimation { duration: particle.modelData.delay }
                  ParallelAnimation {
                    NumberAnimation { target: particle; property: "x"; from: particle.originX; to: particle.originX + particle.modelData.dx; duration: 720; easing.type: Easing.OutCubic }
                    NumberAnimation { target: particle; property: "y"; from: particle.originY; to: particle.originY + particle.modelData.dy + Style.space(24); duration: 720; easing.type: Easing.OutCubic }
                    NumberAnimation { target: particle; property: "rotation"; to: particle.modelData.rot; duration: 720 }
                    SequentialAnimation {
                      NumberAnimation { target: particle; property: "opacity"; from: 0; to: 1; duration: 60 }
                      NumberAnimation { target: particle; property: "opacity"; to: 0; duration: 660 }
                    }
                  }
                }

                Component.onCompleted: particleAnim.start()
              }
            }
          }
        }

        // Board hint: today's daily is unplayed (never a modal).
        Text {
          anchors.horizontalCenter: parent.horizontalCenter
          visible: root.onBoard && !root.playingDaily && root.dailyReady
          text: "Daily ready · press 5"
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Item { width: 1; height: Style.space(10) }

        // 5. Footer: centred key chips.
        Row {
          id: footerChips
          anchors.horizontalCenter: parent.horizontalCenter
          spacing: Style.space(6)

          Repeater {
            model: root.footerChips()

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
