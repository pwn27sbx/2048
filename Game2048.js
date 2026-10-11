.pragma library

var VERSION = 3
var SIZE = 4
// Board sizes the player can pick with `[` / `]` or the header badge. 4×4 is
// the default and the size every legacy state file was written for.
var SUPPORTED_SIZES = [3, 4, 5, 6, 7, 8]
// Undo is a ring of the last 50 pre-move snapshots; the challenge setting caps
// how many undos a single game may use.
var UNDO_RING = 50
var UNDO_CHALLENGE_LIMIT = 3
var UNDO_UNLIMITED = "unlimited"
// Tile labels shorten from here up ("16384" -> "16k", "131072" -> "131k") so
// big boards never overflow, then the label length drives the font size.
var ABBREVIATE_FROM = 10000
// Glow-ring tiers: none, 128+, 1024+ (tile levels).
var GLOW_LEVEL_1 = 7
var GLOW_LEVEL_2 = 10
// Motion preference. Every animation is gated by it.
var MOTION_FULL = "full"
var MOTION_REDUCED = "reduced"
var MOTION_OFF = "off"
// Merge sound: one bundled WAV played through pw-play at a rate that rises
// with the merged tile's value (higher rate -> higher pitch).
var SOUND_BASE_RATE = 24000
var SOUND_RATE_STEP = 4000
var SOUND_MIN_RATE = 22050
var SOUND_MAX_RATE = 96000
// Stats / achievements / daily challenge (Unit 16).
var HISTOGRAM_BOUNDS = [1000, 2000, 4000, 8000, 16000, 32000, 64000]
var HISTOGRAM_SIZE = HISTOGRAM_BOUNDS.length + 1
var SWIFT_WIN_MOVES = 100
var STREAK_TARGET = 5
var COMEBACK_TILES = 15
var DAILY_HISTORY_MAX = 30
var ACHIEVEMENTS = [
    { id: "first512", title: "512", description: "Create a 512 tile." },
    { id: "first1024", title: "1K", description: "Create a 1024 tile." },
    { id: "first2048", title: "2048", description: "Create a 2048 tile." },
    { id: "first4096", title: "4096", description: "Create a 4096 tile." },
    { id: "win_no_undo", title: "Clean win", description: "Reach 2048 without using undo." },
    { id: "win_swift", title: "Swift win", description: "Reach 2048 in 100 moves or fewer." },
    { id: "streak5", title: "On fire", description: "Win 5 games in a row." },
    { id: "comeback", title: "Comeback", description: "Win from a board with 15 or more tiles." }
]
// A win-type badge is only possible once a 2048 tile was built, and every
// higher tile badge implies the lower ones. `closeAchievements` enforces that
// a stored badge set is always closed this way.
var TILE_ACHIEVEMENTS = ["first512", "first1024", "first2048", "first4096"]
var WIN_ACHIEVEMENTS = ["win_no_undo", "win_swift", "comeback", "streak5"]
// Digits above 10,000 shrink earlier on the big boards (7x7+): 1024 -> "1k".
var ABBREVIATE_FROM_BIG_BOARD = 1000
// Numerals (data only): the label digit set for each script. Digits not in the
// set (abbreviation suffixes, separators) pass through unchanged.
var NUMERALS = [
    { id: "western", label: "123", digits: "0123456789" },
    { id: "arabic", label: "١٢٣", digits: "٠١٢٣٤٥٦٧٨٩" },
    { id: "devanagari", label: "१२३", digits: "०१२३४५६७८९" },
    { id: "bengali", label: "১২৩", digits: "০১২৩৪৫৬৭৮৯" },
    { id: "cjk", label: "一二三", digits: "〇一二三四五六七八九" }
]
// Tile palettes. "theme" and "mono" carry a theme token + alpha that QML maps;
// "classic" and "contrast" carry literal colours (opt-in palettes only).
// The visible tab ring (Unit 19b). Help is an overlay, not a tab, so it is not
// in this list; digits 1-6 and T / Shift+T walk it and wrap around.
var TAB_IDS = ["", "scores", "stats", "achievements", "daily", "settings"]

var PALETTE_IDS = ["theme", "classic", "mono", "contrast"]
var PALETTE_CHOICES = [
    { id: "theme", label: "Theme" },
    { id: "classic", label: "Classic" },
    { id: "mono", label: "Mono" },
    { id: "contrast", label: "Contrast" }
]
var MONO_ALPHAS = [0.07, 0.10, 0.16, 0.24, 0.34, 0.46, 0.60, 0.74, 0.86, 0.94, 1.0, 1.0]
var CLASSIC_TILE_COLORS = [
    { hex: "#cdc1b4", text: "#776e65" },
    { hex: "#eee4da", text: "#776e65" },
    { hex: "#ede0c8", text: "#776e65" },
    { hex: "#f2b179", text: "#f9f6f2" },
    { hex: "#f59563", text: "#f9f6f2" },
    { hex: "#f67c5f", text: "#f9f6f2" },
    { hex: "#f65e3b", text: "#f9f6f2" },
    { hex: "#edcf72", text: "#f9f6f2" },
    { hex: "#edcc61", text: "#f9f6f2" },
    { hex: "#edc850", text: "#f9f6f2" },
    { hex: "#edc53f", text: "#f9f6f2" },
    { hex: "#edc22e", text: "#f9f6f2" }
]
var CONTRAST_TILE_COLORS = [
    { hex: "#000000", text: "#ffffff" },
    { hex: "#ffffff", text: "#000000" },
    { hex: "#ffffff", text: "#000000" },
    { hex: "#000000", text: "#ffffff" },
    { hex: "#000000", text: "#ffffff" },
    { hex: "#000000", text: "#ffffff" },
    { hex: "#000000", text: "#ffffff" },
    { hex: "#ffd400", text: "#000000" },
    { hex: "#ffd400", text: "#000000" },
    { hex: "#ffd400", text: "#000000" },
    { hex: "#ff7a00", text: "#000000" },
    { hex: "#ff2020", text: "#ffffff" }
]
var WIN_VALUE = 2048
var MAX_STATE_BYTES = 65536
// Keep profile writes a little under the helper's hard 64 KiB cap.
var SERIALIZE_LIMIT = MAX_STATE_BYTES - 512
var LEADERBOARD_SIZE = 10
var STATUS_PLAYING = "playing"
var STATUS_WON = "won"
var STATUS_OVER = "over"

// Tile style table, indexed by tile level (tileLevel(value)); level 0 is the
// empty cell and levels >= 11 (2048+) reuse the last row. `solid` marks a fully
// opaque fill; QML maps `base` to a theme color and `alpha` to its opacity.
var PALETTE = [
    { base: "empty", alpha: 0.07, solid: false }, // 0 empty
    { base: "fg", alpha: 0.12, solid: false },    // 1 2
    { base: "fg", alpha: 0.22, solid: false },    // 2 4
    { base: "accent", alpha: 0.28, solid: false },// 3 8
    { base: "accent", alpha: 0.42, solid: false },// 4 16
    { base: "accent", alpha: 0.58, solid: false },// 5 32
    { base: "accent", alpha: 0.76, solid: false },// 6 64
    { base: "accent", alpha: 1.0, solid: true },  // 7 128
    { base: "urgent", alpha: 0.45, solid: false },// 8 256
    { base: "urgent", alpha: 0.65, solid: false },// 9 512
    { base: "urgent", alpha: 0.85, solid: false },// 10 1024
    { base: "urgent", alpha: 1.0, solid: true }   // 11 2048+
]

// True for a board size the game supports (3, 4, 5, 6, 8).
function isSupportedSize(size) {
    return SUPPORTED_SIZES.indexOf(Number(size)) !== -1
}

// Recover the board size from a flat cell count; 0 when not a perfect square.
function sqrtSize(count) {
    var n = Math.round(Math.sqrt(count))
    return n > 0 && n * n === count ? n : 0
}

// A fresh board of `size`×`size` empty cells (defaults to the 4×4 SIZE).
function emptyCells(size) {
    var n = isSupportedSize(size) ? Number(size) : SIZE
    var cells = []
    for (var i = 0; i < n * n; i++) {
        cells.push(0)
    }
    return cells
}

function emptyState(best, size) {
    var n = isSupportedSize(size) ? Number(size) : SIZE
    var value = Number(best)
    if (!isFinite(value)) {
        value = 0
    }
    value = Math.floor(value)
    if (value < 0) {
        value = 0
    }
    return {
        version: VERSION,
        size: n,
        cells: emptyCells(n),
        score: 0,
        best: value,
        moves: 0,
        status: STATUS_PLAYING,
        keepPlaying: false,
        spawned: -1,
        merged: [],
        gain: 0,
        transitions: [],
        startedAt: 0,
        recorded: false,
        lastRank: 0,
        lastRecordedAt: 0,
        leaderboard: [],
        history: [],
        undoCount: 0,
        assisted: false,
        combo: 0
    }
}

// Shallow copy of every state field (arrays copied). Used by spawn/keepGoing/move
// so no field is ever dropped when a new object is built.
function copyState(state) {
    return {
        version: state.version,
        size: state.size,
        cells: state.cells.slice(),
        score: state.score,
        best: state.best,
        moves: state.moves,
        status: state.status,
        keepPlaying: state.keepPlaying,
        spawned: state.spawned,
        merged: (state.merged || []).slice(),
        gain: state.gain || 0,
        transitions: (state.transitions || []).slice(),
        startedAt: state.startedAt || 0,
        recorded: state.recorded === true,
        lastRank: state.lastRank || 0,
        lastRecordedAt: state.lastRecordedAt || 0,
        leaderboard: (state.leaderboard || []).slice(),
        history: copyHistory(state.history),
        undoCount: normalizeCount(state.undoCount),
        assisted: state.assisted === true,
        combo: normalizeCount(state.combo)
    }
}

function normalizeCount(value) {
    var n = Number(value)
    if (!isFinite(n) || n < 0) return 0
    return Math.floor(n)
}

// One undo snapshot: only what `undo` restores (cells, score, moves and the
// status flags). Transient animation fields are never stored.
function snapshot(state) {
    return {
        cells: state.cells.slice(),
        score: state.score,
        moves: state.moves,
        status: state.status,
        keepPlaying: state.keepPlaying === true,
        combo: normalizeCount(state.combo)
    }
}

function copySnapshot(snap) {
    if (!snap || typeof snap !== "object" || !Array.isArray(snap.cells)) {
        return { cells: [], score: 0, moves: 0, status: STATUS_PLAYING, keepPlaying: false, combo: 0 }
    }
    return {
        cells: snap.cells.slice(),
        score: normalizeCount(snap.score),
        moves: normalizeCount(snap.moves),
        status: snap.status,
        keepPlaying: snap.keepPlaying === true,
        combo: normalizeCount(snap.combo)
    }
}

function copyHistory(history) {
    var list = []
    if (Array.isArray(history)) {
        for (var i = 0; i < history.length; i++) {
            list.push(copySnapshot(history[i]))
        }
    }
    return list
}

// Append a snapshot and keep only the newest UNDO_RING entries (oldest drop).
function pushHistory(history, snap) {
    var list = Array.isArray(history) ? history.slice() : []
    list.push(snap)
    if (list.length > UNDO_RING) {
        list = list.slice(list.length - UNDO_RING)
    }
    return list
}

function normalizeMs(value) {
    var n = Number(value)
    if (!isFinite(n) || n < 0) return 0
    return Math.floor(n)
}

function newGame(best, rng, now, leaderboard, size) {
    var state = emptyState(best, size)
    state.startedAt = normalizeMs(now)
    state.leaderboard = Array.isArray(leaderboard) ? leaderboard.slice() : []
    state = spawn(state, rng)
    state = spawn(state, rng)
    return state
}

// Slide one row/column of any length toward index 0 (left / up semantics).
function slideLine(line) {
    var n = line.length
    var kept = []
    var positions = []
    var i
    for (i = 0; i < n; i++) {
        if (line[i] !== 0) {
            kept.push(line[i])
            positions.push(i)
        }
    }
    var out = []
    var gain = 0
    var mergedAt = []
    var sources = []
    i = 0
    while (i < kept.length) {
        if (i + 1 < kept.length && kept[i] === kept[i + 1]) {
            var merged = kept[i] * 2
            mergedAt.push(out.length)
            out.push(merged)
            gain += merged
            sources.push([positions[i], positions[i + 1]])
            i += 2
        } else {
            out.push(kept[i])
            sources.push([positions[i]])
            i += 1
        }
    }
    while (out.length < n) {
        out.push(0)
        sources.push([])
    }
    return { line: out, gain: gain, mergedAt: mergedAt, sources: sources }
}

function move(state, direction, rng, now) {
    if (now === undefined) now = 0
    var dirs = ["left", "right", "up", "down"]
    var valid = false
    var k
    for (k = 0; k < 4; k++) {
        if (dirs[k] === direction) {
            valid = true
        }
    }

    var n = isSupportedSize(state.size) ? state.size : SIZE
    var last = n - 1

    var copy = copyState(state)
    copy.gain = 0
    copy.transitions = []

    if (!valid || state.status !== STATUS_PLAYING) {
        return { state: copy, moved: false }
    }

    var cells = state.cells.slice()
    var gain = 0
    var merged = []
    var transitions = []
    var moved = false
    var line
    var result
    var i
    var j
    var target
    var pos

    for (i = 0; i < n; i++) {
        line = []
        for (j = 0; j < n; j++) {
            if (direction === "left") {
                line.push(cells[i * n + j])
            } else if (direction === "right") {
                line.push(cells[i * n + (last - j)])
            } else if (direction === "up") {
                line.push(cells[j * n + i])
            } else {
                line.push(cells[(last - j) * n + i])
            }
        }
        result = slideLine(line)
        gain += result.gain
        for (j = 0; j < n; j++) {
            if (direction === "left") {
                target = i * n + j
            } else if (direction === "right") {
                target = i * n + (last - j)
            } else if (direction === "up") {
                target = j * n + i
            } else {
                target = (last - j) * n + i
            }
            if (cells[target] !== result.line[j]) {
                moved = true
            }
            cells[target] = result.line[j]
        }
        for (j = 0; j < result.mergedAt.length; j++) {
            pos = result.mergedAt[j]
            if (direction === "left") {
                merged.push(i * n + pos)
            } else if (direction === "right") {
                merged.push(i * n + (last - pos))
            } else if (direction === "up") {
                merged.push(pos * n + i)
            } else {
                merged.push((last - pos) * n + i)
            }
        }
        // One transition per pre-move tile: where it came from, where it ended,
        // and its value before the move (same direction mapping as `merged`).
        for (j = 0; j < n; j++) {
            for (k = 0; k < result.sources[j].length; k++) {
                var srcPos = result.sources[j][k]
                var fromIndex
                var toIndex
                if (direction === "left") {
                    fromIndex = i * n + srcPos
                    toIndex = i * n + j
                } else if (direction === "right") {
                    fromIndex = i * n + (last - srcPos)
                    toIndex = i * n + (last - j)
                } else if (direction === "up") {
                    fromIndex = srcPos * n + i
                    toIndex = j * n + i
                } else {
                    fromIndex = (last - srcPos) * n + i
                    toIndex = (last - j) * n + i
                }
                transitions.push({ from: fromIndex, to: toIndex, value: state.cells[fromIndex] })
            }
        }
    }

    if (!moved) {
        return { state: copy, moved: false }
    }

    var score = state.score + gain
    var best = state.best
    if (score > best) {
        best = score
    }

    var next = copyState(state)
    next.cells = cells
    next.score = score
    next.best = best
    next.moves = state.moves + 1
    next.spawned = -1
    next.merged = merged
    next.gain = gain
    next.transitions = transitions
    // Record the pre-move board so `undo` can restore it (ring-capped).
    next.history = pushHistory(state.history, snapshot(state))
    // Combo: a scoring move extends the streak, any other valid move breaks it.
    next.combo = gain > 0 ? normalizeCount(state.combo) + 1 : 0
    next = spawn(next, rng)
    var status = next.status
    if (!next.keepPlaying && hasValueAtLeast(next.cells, WIN_VALUE)) {
        status = STATUS_WON
    }
    if (!canMove(next.cells)) {
        status = STATUS_OVER
    }
    next.status = status
    // A finished game is written to the leaderboard once, here.
    if (status === STATUS_OVER) {
        next = recordGame(next, now)
    }
    return { state: next, moved: true }
}

function spawn(state, rng) {
    var cells = state.cells.slice()
    var empties = []
    var i
    for (i = 0; i < cells.length; i++) {
        if (cells[i] === 0) {
            empties.push(i)
        }
    }
    if (empties.length === 0) {
        var full = copyState(state)
        full.cells = cells
        full.spawned = -1
        return full
    }
    var pick = empties[Math.min(empties.length - 1, Math.floor(rng() * empties.length))]
    cells[pick] = rng() < 0.1 ? 4 : 2
    var next = copyState(state)
    next.cells = cells
    next.spawned = pick
    return next
}

function canMove(cells) {
    var n = sqrtSize(cells.length)
    if (n === 0) {
        return false
    }
    var i
    for (i = 0; i < cells.length; i++) {
        if (cells[i] === 0) {
            return true
        }
    }
    var r
    var c
    for (r = 0; r < n; r++) {
        for (c = 0; c < n; c++) {
            var value = cells[r * n + c]
            if (c < n - 1 && value === cells[r * n + c + 1]) {
                return true
            }
            if (r < n - 1 && value === cells[(r + 1) * n + c]) {
                return true
            }
        }
    }
    return false
}

// The board's swipe MouseArea is only active on the board page while a game is
// in progress. Otherwise it sits above the win/over card and swallows the
// card's button clicks (Keep going / Undo / New game).
function isBoardInteractive(game, view) {
    if (view !== "") {
        return false
    }
    return !!game && game.status === STATUS_PLAYING
}

function hasValueAtLeast(cells, value) {
    var i
    for (i = 0; i < cells.length; i++) {
        if (cells[i] >= value) {
            return true
        }
    }
    return false
}

function directionFromDelta(dx, dy) {
    if (dx === -1 && dy === 0) {
        return "left"
    }
    if (dx === 1 && dy === 0) {
        return "right"
    }
    if (dx === 0 && dy === -1) {
        return "up"
    }
    if (dx === 0 && dy === 1) {
        return "down"
    }
    return ""
}

function tileLevel(value) {
    if (!value) {
        return 0
    }
    var level = 0
    var current = value
    while (current > 1) {
        current = current / 2
        level += 1
    }
    return level
}

// Short label for a tile: plain below the threshold, then "1k" / "16k" / "131k".
// On a 7x7+ board the threshold drops to 1,000 so the 4-digit tiles shrink too.
function abbreviateTile(value, size) {
    var n = Number(value)
    if (!isFinite(n) || n < 0) n = 0
    n = Math.floor(n)
    var from = (isSupportedSize(size) && Number(size) >= 7) ? ABBREVIATE_FROM_BIG_BOARD : ABBREVIATE_FROM
    if (n < from) return String(n)
    if (n < 1000000) return Math.floor(n / 1000) + "k"
    return Math.floor(n / 1000000) + "M"
}

// Multiplier for the tile label font: fewer pixels as the board grows and as
// the (abbreviated) label gains characters, so text never overflows its cell.
// QML multiplies Style.font.title by this.
function tileFontFactor(value, size) {
    var n = isSupportedSize(size) ? Number(size) : SIZE
    var digits = abbreviateTile(value, n).length
    var byDigits = digits <= 2 ? 1.6 : digits === 3 ? 1.3 : digits === 4 ? 1.05 : 0.85
    return byDigits * (4 / n)
}

// --- numerals (Phase 5 · Unit 17) -----------------------------------------

function numeralId(id) {
    for (var i = 0; i < NUMERALS.length; i++) {
        if (NUMERALS[i].id === id) return id
    }
    return "western"
}

// Map the ASCII digits of any value/text to the chosen numeral script.
function formatNumerals(value, numerals) {
    var text = (value === null || value === undefined) ? "" : String(value)
    var digits = NUMERALS[0].digits
    var wanted = numeralId(numerals)
    for (var i = 0; i < NUMERALS.length; i++) {
        if (NUMERALS[i].id === wanted) digits = NUMERALS[i].digits
    }
    if (digits === "0123456789") return text
    var out = ""
    for (i = 0; i < text.length; i++) {
        var code = text.charCodeAt(i) - 48
        out += (code >= 0 && code <= 9) ? digits.charAt(code) : text.charAt(i)
    }
    return out
}

// --- palettes (Phase 5 · Unit 17) -----------------------------------------

function isPaletteId(id) {
    return PALETTE_IDS.indexOf(id) !== -1
}

// Resolve one tile cell (level 0 = empty) for a palette. Theme/mono entries
// carry a theme token + alpha (QML maps them); classic/contrast carry a literal
// background and text colour.
function tilePaletteEntry(palette, level) {
    var l = clampLevel(level)
    var id = isPaletteId(palette) ? palette : "theme"
    if (id === "theme") return tileStyle(l)
    if (id === "mono") {
        return { base: (l === 0 ? "empty" : "accent"), alpha: MONO_ALPHAS[l], solid: l >= 10 }
    }
    if (id === "classic") return CLASSIC_TILE_COLORS[l]
    return CONTRAST_TILE_COLORS[l]
}

// Glow-ring tier for a tile level: 0 none, 1 at 128+, 2 at 1024+.
function glowTier(level) {
    var l = Math.floor(Number(level))
    if (!isFinite(l) || l < GLOW_LEVEL_1) return 0
    if (l >= GLOW_LEVEL_2) return 2
    return 1
}

// pw-play sample rate for a merge of `value`: rises with the tile so bigger
// merges sound higher, clamped to a sane range.
function soundRate(value) {
    var level = tileLevel(value)
    if (level < 1) level = 1
    var rate = SOUND_BASE_RATE + (level - 1) * SOUND_RATE_STEP
    if (rate < SOUND_MIN_RATE) rate = SOUND_MIN_RATE
    if (rate > SOUND_MAX_RATE) rate = SOUND_MAX_RATE
    return rate
}

function keepGoing(state) {
    var next = copyState(state)
    if (state.status === STATUS_WON) {
        next.status = STATUS_PLAYING
        next.keepPlaying = true
    }
    return next
}

// The wire shape of one game (shared by serializeState and the profile).
// `includeHistory` is false for non-active boards to keep writes smaller.
function gameToJson(state, includeHistory) {
    return {
        version: VERSION,
        size: state.size,
        cells: state.cells,
        score: state.score,
        best: state.best,
        moves: state.moves,
        status: state.status,
        keepPlaying: state.keepPlaying,
        startedAt: normalizeMs(state.startedAt),
        recorded: state.recorded === true,
        lastRank: state.lastRank || 0,
        lastRecordedAt: normalizeMs(state.lastRecordedAt),
        leaderboard: state.leaderboard || [],
        history: includeHistory === false ? [] : copyHistory(state.history),
        undoCount: normalizeCount(state.undoCount),
        assisted: state.assisted === true,
        combo: normalizeCount(state.combo)
    }
}

function serializeState(state) {
    return JSON.stringify(gameToJson(state, true))
}

// Keep only individually valid leaderboard entries, sorted and truncated.
function sanitizeLeaderboard(raw) {
    var leaderboard = []
    if (Array.isArray(raw)) {
        for (var i = 0; i < raw.length; i++) {
            var clean = sanitizeEntry(raw[i])
            if (clean) {
                leaderboard.push(clean)
            }
        }
        leaderboard.sort(compareEntries)
        if (leaderboard.length > LEADERBOARD_SIZE) {
            leaderboard = leaderboard.slice(0, LEADERBOARD_SIZE)
        }
    }
    return leaderboard
}

// Keep only snapshots whose board matches this size and whose numbers/status
// are valid; cap the ring like pushHistory does.
function sanitizeHistory(raw, size) {
    var list = []
    if (!Array.isArray(raw)) {
        return list
    }
    var count = size * size
    for (var i = 0; i < raw.length; i++) {
        var snap = raw[i]
        if (!snap || typeof snap !== "object") {
            continue
        }
        if (!Array.isArray(snap.cells) || snap.cells.length !== count) {
            continue
        }
        var ok = true
        for (var c = 0; c < count; c++) {
            if (!isPowerOfTwoOrZero(snap.cells[c])) {
                ok = false
                break
            }
        }
        if (!ok) continue
        if (!isIntIn(snap.score, 0, 1e9) || !isIntIn(snap.moves, 0, 1e9)) continue
        if (
            snap.status !== STATUS_PLAYING &&
            snap.status !== STATUS_WON &&
            snap.status !== STATUS_OVER
        ) continue
        list.push({
            cells: snap.cells.slice(),
            score: snap.score,
            moves: snap.moves,
            status: snap.status,
            keepPlaying: snap.keepPlaying === true,
            combo: normalizeCount(snap.combo)
        })
    }
    if (list.length > UNDO_RING) {
        list = list.slice(list.length - UNDO_RING)
    }
    return list
}

// Validate one already-parsed game object (any version) into a v3 state.
function parseGameObject(data) {
    if (!data || typeof data !== "object") {
        return null
    }
    if (data.version !== 1 && data.version !== 2 && data.version !== VERSION) {
        return null
    }
    if (!isSupportedSize(data.size)) {
        return null
    }
    var size = Number(data.size)
    var count = size * size
    if (!Array.isArray(data.cells) || data.cells.length !== count) {
        return null
    }
    var i
    for (i = 0; i < count; i++) {
        var cell = data.cells[i]
        if (cell === 0) {
            continue
        }
        if (typeof cell !== "number" || !isFinite(cell)) {
            return null
        }
        if (Math.floor(cell) !== cell || cell < 2 || cell > 131072) {
            return null
        }
        var reduced = cell
        while (reduced > 1 && reduced % 2 === 0) {
            reduced = reduced / 2
        }
        if (reduced !== 1) {
            return null
        }
    }
    var names = ["score", "best", "moves"]
    var f
    for (f = 0; f < 3; f++) {
        var number = data[names[f]]
        if (typeof number !== "number" || !isFinite(number) || Math.floor(number) !== number) {
            return null
        }
        if (number < 0 || number > 1e9) {
            return null
        }
    }
    if (
        data.status !== STATUS_PLAYING &&
        data.status !== STATUS_WON &&
        data.status !== STATUS_OVER
    ) {
        return null
    }
    if (typeof data.keepPlaying !== "boolean") {
        return null
    }
    var best = data.best
    if (data.score > best) {
        best = data.score
    }
    var leaderboard = sanitizeLeaderboard(data.leaderboard)
    if (leaderboard.length > 0 && leaderboard[0].score > best) {
        best = leaderboard[0].score
    }
    var legacy = data.version === 1
    return {
        version: VERSION,
        size: size,
        cells: data.cells.slice(),
        score: data.score,
        best: best,
        moves: data.moves,
        status: data.status,
        keepPlaying: data.keepPlaying,
        spawned: -1,
        merged: [],
        gain: 0,
        transitions: [],
        // Version 1 has none of these: migrate to the current defaults.
        startedAt: legacy ? 0 : normalizeMs(data.startedAt),
        recorded: !legacy && data.recorded === true,
        lastRank: !legacy && isRank(data.lastRank) ? data.lastRank : 0,
        lastRecordedAt: legacy ? 0 : normalizeMs(data.lastRecordedAt),
        leaderboard: leaderboard,
        history: sanitizeHistory(data.history, size),
        undoCount: normalizeCount(data.undoCount),
        assisted: data.assisted === true,
        combo: normalizeCount(data.combo)
    }
}

function parseState(text) {
    if (typeof text !== "string") {
        return null
    }
    if (text.length === 0 || text.length > MAX_STATE_BYTES) {
        return null
    }
    var data
    try {
        data = JSON.parse(text)
    } catch (error) {
        return null
    }
    return parseGameObject(data)
}

// --- local leaderboard (§5.2) ---------------------------------------------

function isIntIn(value, lo, hi) {
    return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= lo && value <= hi
}

function isPowerOfTwoOrZero(value) {
    if (value === 0) return true
    if (typeof value !== "number" || !isFinite(value) || Math.floor(value) !== value) return false
    if (value < 2 || value > 131072) return false
    var r = value
    while (r > 1 && r % 2 === 0) r = r / 2
    return r === 1
}

function isRank(value) {
    return isIntIn(value, 0, LEADERBOARD_SIZE)
}

// Validate one stored leaderboard entry; return a clean copy or null.
function sanitizeEntry(entry) {
    if (!entry || typeof entry !== "object") return null
    if (!isIntIn(entry.score, 0, 1e9)) return null
    if (!isPowerOfTwoOrZero(entry.maxTile)) return null
    if (!isIntIn(entry.moves, 0, 1e9)) return null
    if (!isIntIn(entry.endedAt, 0, 1e13)) return null
    if (typeof entry.won !== "boolean") return null
    return {
        score: entry.score,
        maxTile: entry.maxTile,
        moves: entry.moves,
        endedAt: entry.endedAt,
        won: entry.won
    }
}

function maxTile(cells) {
    var best = 0
    for (var i = 0; i < cells.length; i++) {
        if (cells[i] > best) best = cells[i]
    }
    return best
}

// score desc, then maxTile desc, then endedAt asc (older first on a tie).
function compareEntries(a, b) {
    if (a.score !== b.score) return b.score - a.score
    if (a.maxTile !== b.maxTile) return b.maxTile - a.maxTile
    return a.endedAt - b.endedAt
}

// Insert one entry, sort, truncate to LEADERBOARD_SIZE; rank 1..10 or 0.
function insertEntry(leaderboard, entry) {
    var list = []
    for (var i = 0; i < leaderboard.length; i++) list.push(leaderboard[i])
    list.push(entry)
    list.sort(compareEntries)
    var rank = 0
    for (i = 0; i < list.length; i++) {
        if (list[i] === entry) { rank = i + 1; break }
    }
    if (list.length > LEADERBOARD_SIZE) list = list.slice(0, LEADERBOARD_SIZE)
    if (rank > LEADERBOARD_SIZE) rank = 0
    return { leaderboard: list, rank: rank }
}

// Record the current game once. No-op copy when already recorded, when the
// score is 0, or when the game used undo (an assisted game never counts).
function recordGame(state, now) {
    var copy = copyState(state)
    if (state.recorded === true || state.score === 0 || state.assisted === true) {
        return copy
    }
    var top = maxTile(state.cells)
    var entry = {
        score: state.score,
        maxTile: top,
        moves: state.moves,
        endedAt: normalizeMs(now),
        won: top >= WIN_VALUE
    }
    var result = insertEntry(state.leaderboard || [], entry)
    copy.recorded = true
    copy.lastRank = result.rank
    copy.lastRecordedAt = normalizeMs(now)
    copy.leaderboard = result.leaderboard
    var best = state.best
    if (entry.score > best) best = entry.score
    if (result.leaderboard.length > 0 && result.leaderboard[0].score > best) best = result.leaderboard[0].score
    copy.best = best
    return copy
}

// Record the current game (if any) then start a fresh one carrying best and
// leaderboard. The new state also points at the entry just recorded
// (lastRank/lastRecordedAt) so the scores view can highlight it; the new game
// itself is not flagged as recorded.
function startNewGame(state, rng, now) {
    var recorded = recordGame(state, now)
    var next = newGame(recorded.best, rng, now, recorded.leaderboard, state.size)
    next.lastRank = recorded.lastRank
    next.lastRecordedAt = recorded.lastRecordedAt
    return next
}

// --- settings, profiles and undo (Phase 5 · Unit 14) ----------------------

function defaultSettings() {
    return {
        allowUndo: true, undoLimit: UNDO_UNLIMITED, motion: MOTION_FULL, sound: false,
        palette: "theme", scale: 100, numerals: "western", confirmNew: false
    }
}

// Clamp arbitrary input to the known settings shape. A missing Allow undo is
// on, any Undo limit other than the challenge value is unlimited, an unknown
// motion falls back to full and sound is off unless true.
function sanitizeSettings(raw) {
    var source = raw && typeof raw === "object" ? raw : {}
    var limit = source.undoLimit === UNDO_CHALLENGE_LIMIT || source.undoLimit === String(UNDO_CHALLENGE_LIMIT)
        ? UNDO_CHALLENGE_LIMIT
        : UNDO_UNLIMITED
    var motion = (source.motion === MOTION_FULL || source.motion === MOTION_REDUCED || source.motion === MOTION_OFF)
        ? source.motion
        : MOTION_FULL
    var scale = normalizeCount(source.scale)
    if (scale < 90 || scale > 150) scale = 100
    return {
        allowUndo: source.allowUndo !== false,
        undoLimit: limit,
        motion: motion,
        sound: source.sound === true,
        palette: isPaletteId(source.palette) ? source.palette : "theme",
        scale: scale,
        numerals: numeralId(source.numerals),
        confirmNew: source.confirmNew === true
    }
}

function mergeSettings(current, patch) {
    var base = sanitizeSettings(current)
    var source = patch && typeof patch === "object" ? patch : {}
    return sanitizeSettings({
        allowUndo: "allowUndo" in source ? source.allowUndo : base.allowUndo,
        undoLimit: "undoLimit" in source ? source.undoLimit : base.undoLimit,
        motion: "motion" in source ? source.motion : base.motion,
        sound: "sound" in source ? source.sound : base.sound,
        palette: "palette" in source ? source.palette : base.palette,
        scale: "scale" in source ? source.scale : base.scale,
        numerals: "numerals" in source ? source.numerals : base.numerals,
        confirmNew: "confirmNew" in source ? source.confirmNew : base.confirmNew
    })
}

// Animation gates used by Panel.qml: off disables, reduced shortens.
function motionEnabled(settings) {
    return sanitizeSettings(settings).motion !== MOTION_OFF
}

function motionFull(settings) {
    return sanitizeSettings(settings).motion === MOTION_FULL
}

// A fresh, spawned board for one size (two tiles), ready to play.
function newGameForSize(size, rng, now) {
    var n = isSupportedSize(size) ? Number(size) : SIZE
    return newGame(0, typeof rng === "function" ? rng : Math.random, normalizeMs(now), [], n)
}

// Every supported size gets its own board, best and leaderboard. Settings are
// shared by the whole profile. The size boards start EMPTY here (a template);
// `newProfile` spawns the first tiles and `healProfile` fixes any empty board.
function emptyProfile() {
    var sizes = {}
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
        var size = SUPPORTED_SIZES[i]
        sizes[String(size)] = emptyState(0, size)
    }
    return {
        version: VERSION,
        activeSize: SIZE,
        settings: defaultSettings(),
        sizes: sizes,
        stats: emptyStatsBundle(),
        achievements: [],
        achievementsSeen: [],
        daily: emptyDaily()
    }
}

// A playable profile: every size starts with a fresh game (two tiles).
function newProfile(rng, now) {
    var next = emptyProfile()
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
        var size = SUPPORTED_SIZES[i]
        next.sizes[String(size)] = newGameForSize(size, rng, now)
    }
    return next
}

// Spawn two tiles onto a "playing" board that has none — the empty default the
// old profile builders wrote, or a corrupt/legacy file — keeping its best,
// leaderboard and startedAt. A finished (won/over) board, or one with tiles, is
// returned unchanged.
function healGame(game, rng) {
    if (!game || game.status !== STATUS_PLAYING || occupiedCount(game.cells) > 0) {
        return game
    }
    var roll = typeof rng === "function" ? rng : Math.random
    return spawn(spawn(game, roll), roll)
}

function healProfile(profile, rng) {
    var next = copyProfile(profile)
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
        var key = String(SUPPORTED_SIZES[i])
        next.sizes[key] = healGame(next.sizes[key], rng)
    }
    return next
}

function copyProfile(profile) {
    var sizes = {}
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
        var size = SUPPORTED_SIZES[i]
        var key = String(size)
        var game = profile && profile.sizes ? profile.sizes[key] : null
        sizes[key] = game ? copyState(game) : newGameForSize(size)
    }
    return {
        version: VERSION,
        activeSize: profile && isSupportedSize(profile.activeSize) ? Number(profile.activeSize) : SIZE,
        settings: sanitizeSettings(profile ? profile.settings : null),
        sizes: sizes,
        stats: copyStatsBundle(profile ? profile.stats : null),
        achievements: sanitizeAchievements(profile ? profile.achievements : null),
        achievementsSeen: sanitizeAchievementsSeen(profile ? profile.achievementsSeen : null),
        daily: copyDaily(profile ? profile.daily : null)
    }
}

function activeGame(profile) {
    if (!profile || !profile.sizes) {
        return emptyState(0, SIZE)
    }
    return profile.sizes[String(profile.activeSize)] || emptyState(0, profile.activeSize)
}

// Replace one board in the profile, leaving the active size untouched.
function setGame(profile, game) {
    var next = copyProfile(profile)
    if (game && isSupportedSize(game.size)) {
        next.sizes[String(game.size)] = copyState(game)
    }
    return next
}

function setActiveSize(profile, size) {
    var next = copyProfile(profile)
    if (isSupportedSize(size)) {
        next.activeSize = Number(size)
    }
    return next
}

// Next supported size in `step` direction, wrapping around.
function cycleSize(size, step) {
    var n = isSupportedSize(size) ? Number(size) : SIZE
    var dir = Number(step) < 0 ? -1 : 1
    var index = SUPPORTED_SIZES.indexOf(n)
    if (index === -1) {
        index = SUPPORTED_SIZES.indexOf(SIZE)
    }
    return SUPPORTED_SIZES[(index + dir + SUPPORTED_SIZES.length) % SUPPORTED_SIZES.length]
}

function updateSettings(profile, patch) {
    var next = copyProfile(profile)
    next.settings = mergeSettings(next.settings, patch)
    return next
}

// --- stats (Phase 5 · Unit 16) --------------------------------------------

function histogramBucket(score) {
    var value = Number(score)
    if (!isFinite(value) || value < 0) value = 0
    for (var i = 0; i < HISTOGRAM_BOUNDS.length; i++) {
        if (value < HISTOGRAM_BOUNDS[i]) return i
    }
    return HISTOGRAM_BOUNDS.length
}

function emptyStats() {
    var histogram = []
    for (var i = 0; i < HISTOGRAM_SIZE; i++) histogram.push(0)
    return {
        games: 0, wins: 0, bestScore: 0, bestTile: 0, moves: 0,
        scoreSum: 0, streak: 0, longestStreak: 0, timeMs: 0, histogram: histogram
    }
}

function copyStats(stats) {
    var source = stats && typeof stats === "object" ? stats : {}
    var histogram = []
    var raw = Array.isArray(source.histogram) ? source.histogram : []
    for (var i = 0; i < HISTOGRAM_SIZE; i++) histogram.push(normalizeCount(raw[i]))
    return {
        games: normalizeCount(source.games),
        wins: normalizeCount(source.wins),
        bestScore: normalizeCount(source.bestScore),
        bestTile: normalizeCount(source.bestTile),
        moves: normalizeCount(source.moves),
        scoreSum: normalizeCount(source.scoreSum),
        streak: normalizeCount(source.streak),
        longestStreak: normalizeCount(source.longestStreak),
        timeMs: normalizeCount(source.timeMs),
        histogram: histogram
    }
}

function emptyStatsBundle() {
    var sizes = {}
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) sizes[String(SUPPORTED_SIZES[i])] = emptyStats()
    return { overall: emptyStats(), sizes: sizes }
}

function copyStatsBundle(bundle) {
    var source = bundle && typeof bundle === "object" ? bundle : {}
    var sourceSizes = source.sizes && typeof source.sizes === "object" ? source.sizes : {}
    var sizes = {}
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
        sizes[String(SUPPORTED_SIZES[i])] = copyStats(sourceSizes[String(SUPPORTED_SIZES[i])])
    }
    return { overall: copyStats(source.overall), sizes: sizes }
}

// Fold one finished game into a stats object. A win is a board that reached
// 2048; a loss resets the streak.
function applyGameToStats(stats, game, endedAt) {
    var next = copyStats(stats)
    var top = maxTile(game.cells)
    var won = top >= WIN_VALUE
    next.games += 1
    if (won) {
        next.wins += 1
        next.streak += 1
    } else {
        next.streak = 0
    }
    if (next.streak > next.longestStreak) next.longestStreak = next.streak
    if (normalizeCount(game.score) > next.bestScore) next.bestScore = normalizeCount(game.score)
    if (top > next.bestTile) next.bestTile = top
    next.moves += normalizeCount(game.moves)
    next.scoreSum += normalizeCount(game.score)
    var start = normalizeMs(game.startedAt)
    var end = normalizeMs(endedAt)
    if (start > 0 && end > start) next.timeMs += (end - start)
    next.histogram[histogramBucket(game.score)] += 1
    return next
}

// Update a size's stats and the overall stats with one finished game.
function recordStats(profile, size, game, endedAt) {
    var next = copyProfile(profile)
    var n = isSupportedSize(size) ? Number(size) : game.size
    var key = String(n)
    var end = normalizeMs(endedAt)
    next.stats.sizes[key] = applyGameToStats(next.stats.sizes[key], game, end)
    next.stats.overall = applyGameToStats(next.stats.overall, game, end)
    return next
}

function winRate(stats) {
    var games = normalizeCount(stats && stats.games)
    if (games <= 0) return 0
    return normalizeCount(stats.wins) / games
}

function averageScore(stats) {
    var games = normalizeCount(stats && stats.games)
    if (games <= 0) return 0
    return Math.round(normalizeCount(stats.scoreSum) / games)
}

function occupiedCount(cells) {
    var count = 0
    for (var i = 0; i < (cells || []).length; i++) {
        if (cells[i] !== 0) count += 1
    }
    return count
}

// --- achievements (Phase 5 · Unit 16) -------------------------------------

// Drop unknown ids, then close the set: a higher tile badge implies the lower
// ones, and any win-type badge implies the 2048 tile (and so 512/1024). This
// is the migration guard that stops an inconsistent stored/legacy set (e.g.
// "win_swift" without "first2048").
function sanitizeAchievements(raw) {
    var owned = []
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
        var id = ACHIEVEMENTS[i].id
        if (Array.isArray(raw) && raw.indexOf(id) !== -1) owned.push(id)
    }
    return closeAchievements(owned)
}

function closeAchievements(ids) {
    var want = {}
    var list = Array.isArray(ids) ? ids : []
    var i
    for (i = 0; i < list.length; i++) want[list[i]] = true
    if (want["first4096"]) want["first2048"] = true
    for (i = 0; i < WIN_ACHIEVEMENTS.length; i++) {
        if (want[WIN_ACHIEVEMENTS[i]]) want["first2048"] = true
    }
    if (want["first2048"]) want["first1024"] = true
    if (want["first1024"]) want["first512"] = true
    var out = []
    for (i = 0; i < ACHIEVEMENTS.length; i++) {
        if (want[ACHIEVEMENTS[i].id]) out.push(ACHIEVEMENTS[i].id)
    }
    return out
}

// Tile badges proven by a board that reached `bestTile`; never a win badge.
function derivedTileAchievements(bestTile) {
    var ids = []
    if (bestTile >= 512) ids.push("first512")
    if (bestTile >= 1024) ids.push("first1024")
    if (bestTile >= 2048) ids.push("first2048")
    if (bestTile >= 4096) ids.push("first4096")
    return closeAchievements(ids)
}

// Best tile a legacy game proves: its board or any recorded leaderboard entry.
function gameBestTile(game) {
    var best = maxTile(game.cells)
    var leaderboard = game.leaderboard || []
    for (var i = 0; i < leaderboard.length; i++) {
        if (normalizeCount(leaderboard[i].maxTile) > best) best = normalizeCount(leaderboard[i].maxTile)
    }
    return best
}

// Ids currently satisfied by this game (and the accumulated stats streak).
function achievementIdsFor(game, stats) {
    var ids = []
    if (!game || !Array.isArray(game.cells)) return ids
    var top = maxTile(game.cells)
    if (top >= 512) ids.push("first512")
    if (top >= 1024) ids.push("first1024")
    if (top >= 2048) ids.push("first2048")
    if (top >= 4096) ids.push("first4096")
    var won = top >= WIN_VALUE
    if (won && game.assisted !== true) ids.push("win_no_undo")
    if (won && normalizeCount(game.moves) <= SWIFT_WIN_MOVES) ids.push("win_swift")
    if (won && occupiedCount(game.cells) >= COMEBACK_TILES) ids.push("comeback")
    if (normalizeCount(stats && stats.streak) >= STREAK_TARGET) ids.push("streak5")
    return ids
}

// Merge newly satisfied achievements into the profile; return the ids that were
// unlocked by this evaluation only (including any closure-added ones, e.g. the
// 2048 badge implied by a win badge, so its toast fires too).
function evaluateAchievements(profile, game) {
    var stats = profile && profile.stats ? profile.stats.overall : null
    var ids = achievementIdsFor(game, stats)
    var owned = (profile && Array.isArray(profile.achievements)) ? profile.achievements : []
    var merged = closeAchievements(owned.concat(ids))
    var unlocked = []
    for (var i = 0; i < merged.length; i++) {
        if (owned.indexOf(merged[i]) === -1) unlocked.push(merged[i])
    }
    if (unlocked.length === 0) return { profile: profile, unlocked: [] }
    var next = copyProfile(profile)
    next.achievements = merged
    return { profile: next, unlocked: unlocked }
}

// --- tabs, seen badges and reset (Phase 5 · Unit 19b) ---------------------

// Index of a page in the tab ring, or -1 when it is not a tab (the board is
// index 0; "help" and unknown names are not tabs).
function tabIndex(view) {
    return TAB_IDS.indexOf(typeof view === "string" ? view : "")
}

// Next / previous tab in `step` direction, wrapping. A page that is not a tab
// (e.g. the help overlay) steps to the first tab.
function nextTab(view, step) {
    var index = tabIndex(view)
    if (index === -1) return TAB_IDS[0]
    var dir = Number(step) < 0 ? -1 : 1
    return TAB_IDS[(index + dir + TAB_IDS.length) % TAB_IDS.length]
}

// True while today's daily has not been started (drives the Daily tab dot).
function dailyAvailable(profile, dateKey) {
    return dailyStatus(profile, dateKey) === "available"
}

// Known achievement ids, in table order, from an arbitrary stored list.
function sanitizeAchievementsSeen(raw) {
    var out = []
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
        if (Array.isArray(raw) && raw.indexOf(ACHIEVEMENTS[i].id) !== -1) out.push(ACHIEVEMENTS[i].id)
    }
    return out
}

// Unlocked badges the player has not looked at yet (drives the Awards tab dot).
function unseenAchievements(profile) {
    var owned = (profile && Array.isArray(profile.achievements)) ? profile.achievements : []
    var seen = (profile && Array.isArray(profile.achievementsSeen)) ? profile.achievementsSeen : []
    var out = []
    for (var i = 0; i < owned.length; i++) {
        if (seen.indexOf(owned[i]) === -1) out.push(owned[i])
    }
    return out
}

// Mark every currently unlocked badge as seen (opening the Awards tab).
function markAchievementsSeen(profile) {
    var next = copyProfile(profile)
    var owned = next.achievements
    next.achievementsSeen = closeAchievements(
        sanitizeAchievementsSeen(next.achievementsSeen).concat(owned)
    )
    return next
}

// Clear the aggregate and per-size stats plus every badge, keeping bests,
// leaderboards, settings and the daily history (Settings -> Advanced).
function resetStats(profile) {
    var next = copyProfile(profile)
    next.stats = emptyStatsBundle()
    next.achievements = []
    next.achievementsSeen = []
    return next
}

// --- daily challenge (Phase 5 · Unit 16) ----------------------------------

function emptyDaily() {
    return { date: "", game: null, done: false, result: null, history: [] }
}

function sanitizeDailyResult(raw) {
    if (!raw || typeof raw !== "object") return null
    if (typeof raw.date !== "string" || raw.date.length === 0) return null
    return {
        date: raw.date,
        score: normalizeCount(raw.score),
        maxTile: isPowerOfTwoOrZero(raw.maxTile) ? raw.maxTile : 0,
        moves: normalizeCount(raw.moves),
        won: raw.won === true
    }
}

function copyDaily(raw) {
    var source = raw && typeof raw === "object" ? raw : {}
    var history = []
    if (Array.isArray(source.history)) {
        for (var i = 0; i < source.history.length; i++) {
            var clean = sanitizeDailyResult(source.history[i])
            if (clean) history.push(clean)
        }
        if (history.length > DAILY_HISTORY_MAX) history = history.slice(history.length - DAILY_HISTORY_MAX)
    }
    var game = null
    if (source.game) {
        game = parseGameObject(source.game)
    }
    return {
        date: typeof source.date === "string" ? source.date : "",
        game: game,
        done: source.done === true,
        result: sanitizeDailyResult(source.result),
        history: history
    }
}

function dailyToJson(daily) {
    var source = daily && typeof daily === "object" ? daily : emptyDaily()
    var history = []
    for (var i = 0; i < (source.history || []).length; i++) {
        var result = sanitizeDailyResult(source.history[i])
        if (result) history.push(result)
    }
    return {
        date: typeof source.date === "string" ? source.date : "",
        game: source.game ? gameToJson(source.game, true) : null,
        done: source.done === true,
        result: sanitizeDailyResult(source.result),
        history: history
    }
}

// Local calendar date as "YYYY-MM-DD".
function dailyDateKey(date) {
    var d = (date instanceof Date) ? date : new Date(date)
    if (!isFinite(d.getTime())) d = new Date()
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
}

// Seed derived from the date digits (stable across machines/timezones).
function dailySeed(dateKey) {
    var digits = String(dateKey).replace(/[^0-9]/g, "")
    var seed = 0
    for (var i = 0; i < digits.length; i++) {
        seed = (seed * 10 + (digits.charCodeAt(i) - 48)) % 2147483647
    }
    return seed
}

// Small, fast, deterministic PRNG (mulberry32) used only for the daily board.
function mulberry32(seed) {
    var state = (Number(seed) || 0) >>> 0
    return function () {
        state = (state + 0x6D2B79F5) >>> 0
        var t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// The same board for the same date on every machine.
function newDailyGame(dateKey, now) {
    return newGame(0, mulberry32(dailySeed(dateKey)), now, [], SIZE)
}

// "available" (new day), "playing" (today's attempt in progress), "done".
function dailyStatus(profile, dateKey) {
    var daily = profile ? profile.daily : null
    if (!daily || daily.date !== dateKey) return "available"
    if (daily.done) return "done"
    return "playing"
}

function startDaily(profile, dateKey, now) {
    var next = copyProfile(profile)
    var history = next.daily ? next.daily.history : []
    next.daily = { date: dateKey, game: newDailyGame(dateKey, now), done: false, result: null, history: history }
    return next
}

function dailyGame(profile) {
    return (profile && profile.daily && profile.daily.game) ? profile.daily.game : null
}

function setDailyGame(profile, game) {
    var next = copyProfile(profile)
    if (!next.daily) next.daily = emptyDaily()
    next.daily.game = game ? copyState(game) : null
    return next
}

// Record a finished daily attempt (game over or win) into the daily history.
function finishDaily(profile, now) {
    var daily = profile ? profile.daily : null
    if (!daily || !daily.game) return { profile: profile, finished: false, result: null }
    var game = daily.game
    if (game.status !== STATUS_OVER && game.status !== STATUS_WON) {
        return { profile: profile, finished: false, result: null }
    }
    var top = maxTile(game.cells)
    var result = { date: daily.date, score: normalizeCount(game.score), maxTile: top, moves: normalizeCount(game.moves), won: top >= WIN_VALUE }
    var history = (daily.history || []).slice()
    history.push(result)
    if (history.length > DAILY_HISTORY_MAX) history = history.slice(history.length - DAILY_HISTORY_MAX)
    var next = copyProfile(profile)
    next.daily = { date: daily.date, game: null, done: true, result: result, history: history }
    return { profile: next, finished: true, result: result }
}

// "0:00", "1:05", "1:01:01".
function formatDuration(ms) {
    var totalSeconds = Math.floor(normalizeCount(ms) / 1000)
    var hours = Math.floor(totalSeconds / 3600)
    var minutes = Math.floor((totalSeconds % 3600) / 60)
    var seconds = totalSeconds % 60
    if (hours > 0) return hours + ":" + pad2(minutes) + ":" + pad2(seconds)
    return minutes + ":" + pad2(seconds)
}

function groupThousands(value) {
    var text = String(normalizeCount(value))
    var out = ""
    var count = 0
    for (var i = text.length - 1; i >= 0; i--) {
        out = text.charAt(i) + out
        count += 1
        if (count % 3 === 0 && i > 0) out = "," + out
    }
    return out
}

// "2048 Daily 2026-10-11 · 8,412 · 1024"
function dailyShareText(result) {
    if (!result) return ""
    return "2048 Daily " + result.date + " · " + groupThousands(result.score) + " · " + normalizeCount(result.maxTile)
}

// Undo is available only with a snapshot left, Allow undo on and the challenge
// limit not yet reached.
function canUndo(state, settings) {
    if (!state) {
        return false
    }
    var opts = sanitizeSettings(settings)
    if (!opts.allowUndo) {
        return false
    }
    if (opts.undoLimit === UNDO_CHALLENGE_LIMIT && normalizeCount(state.undoCount) >= UNDO_CHALLENGE_LIMIT) {
        return false
    }
    return Array.isArray(state.history) && state.history.length > 0
}

// Drop the entry a game just recorded, matched by its score and timestamp.
function removeLeaderboardEntry(leaderboard, score, endedAt) {
    var out = []
    var removed = false
    for (var i = 0; i < (leaderboard || []).length; i++) {
        var entry = leaderboard[i]
        if (!removed && entry.score === score && entry.endedAt === endedAt) {
            removed = true
            continue
        }
        out.push(entry)
    }
    return out
}

// Restore the previous snapshot. Undo never raises `best` and never lowers it
// either; an undone (assisted) game is pulled off the leaderboard.
function undo(state, settings) {
    var copy = copyState(state)
    if (!canUndo(state, settings)) {
        return { state: copy, undone: false }
    }
    var history = state.history
    var prev = copySnapshot(history[history.length - 1])
    var next = copyState(state)
    next.cells = prev.cells
    next.score = prev.score
    next.moves = prev.moves
    next.status = prev.status
    next.keepPlaying = prev.keepPlaying
    next.combo = normalizeCount(prev.combo)
    next.history = history.slice(0, history.length - 1)
    next.undoCount = normalizeCount(state.undoCount) + 1
    next.assisted = true
    next.spawned = -1
    next.merged = []
    next.gain = 0
    next.transitions = []
    if (state.recorded === true) {
        next.recorded = false
        next.leaderboard = removeLeaderboardEntry(state.leaderboard, state.score, state.lastRecordedAt)
        next.lastRank = 0
        next.lastRecordedAt = 0
    }
    return { state: next, undone: true }
}

function profileToJson(profile) {
    var sizes = {}
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
        var size = SUPPORTED_SIZES[i]
        var game = profile.sizes[String(size)]
        sizes[String(size)] = gameToJson(game ? game : emptyState(0, size), true)
    }
    return {
        version: VERSION,
        activeSize: profile.activeSize,
        settings: sanitizeSettings(profile.settings),
        sizes: sizes,
        stats: copyStatsBundle(profile.stats),
        achievements: sanitizeAchievements(profile.achievements),
        achievementsSeen: sanitizeAchievementsSeen(profile.achievementsSeen),
        daily: dailyToJson(profile.daily)
    }
}

// Serialize the whole profile. If the histories would push the payload past
// the helper's 64 KiB cap, drop the oldest snapshot from the longest history
// and retry until it fits (the boards, bests and leaderboards always survive).
function serializeProfile(profile) {
    var copy = copyProfile(profile)
    var text = JSON.stringify(profileToJson(copy))
    var guard = 0
    while (text.length > SERIALIZE_LIMIT && guard < 1000) {
        var target = null
        var longestLen = 0
        for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
            var history = copy.sizes[String(SUPPORTED_SIZES[i])].history
            if (history.length > longestLen) {
                longestLen = history.length
                target = history
            }
        }
        if (copy.daily && copy.daily.game && copy.daily.game.history.length > longestLen) {
            longestLen = copy.daily.game.history.length
            target = copy.daily.game.history
        }
        if (!target || longestLen === 0) {
            break
        }
        target.shift()
        text = JSON.stringify(profileToJson(copy))
        guard += 1
    }
    return text
}

// Parse a profile, migrating a legacy v1/v2 single game into the 4×4 board.
function parseProfile(text) {
    if (typeof text !== "string") {
        return null
    }
    if (text.length === 0 || text.length > MAX_STATE_BYTES) {
        return null
    }
    var data
    try {
        data = JSON.parse(text)
    } catch (error) {
        return null
    }
    if (!data || typeof data !== "object") {
        return null
    }

    if (data.version === 1 || data.version === 2) {
        var legacy = parseGameObject(data)
        if (!legacy) {
            return null
        }
        // A fresh, spawned board on every size; the legacy game replaces its own.
        var migrated = newProfile()
        migrated.sizes[String(legacy.size)] = legacy
        migrated.activeSize = legacy.size
        // Credit only the tile badges the legacy data actually proves (its board
        // or its leaderboard entries); a legacy file has no safe record to
        // justify a win badge, so none is derived.
        migrated.achievements = derivedTileAchievements(gameBestTile(legacy))
        return healProfile(migrated)
    }
    if (data.version !== VERSION) {
        return null
    }
    if (!data.sizes || typeof data.sizes !== "object") {
        return null
    }

    // Spawn a fresh board on every size first, then let the stored games replace
    // theirs; a missing size keeps its fresh board and an empty "playing" board
    // is healed below.
    var profile = newProfile()
    profile.activeSize = isSupportedSize(data.activeSize) ? Number(data.activeSize) : SIZE
    profile.settings = sanitizeSettings(data.settings)
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
        var size = SUPPORTED_SIZES[i]
        var raw = data.sizes[String(size)]
        var parsed = raw ? parseGameObject(raw) : null
        if (parsed && parsed.size === size) {
            profile.sizes[String(size)] = parsed
        }
    }
    profile.stats = copyStatsBundle(data.stats)
    profile.achievements = sanitizeAchievements(data.achievements)
    profile.achievementsSeen = sanitizeAchievementsSeen(data.achievementsSeen)
    profile.daily = copyDaily(data.daily)
    profile = healProfile(profile)
    return profile
}

// --- display helpers (§3.1) -----------------------------------------------

// Integer interpolation with ease-out cubic. t is clamped to [0, 1].
function tweenValue(from, to, t) {
    var clamped = Number(t)
    if (!isFinite(clamped)) clamped = 0
    if (clamped < 0) clamped = 0
    if (clamped > 1) clamped = 1
    var eased = 1 - Math.pow(1 - clamped, 3)
    return Math.round(from + (to - from) * eased)
}

// True when this state's best beats the previous best.
function isNewBest(prevBest, state) {
    return state.best > prevBest
}

// True when both states belong to the same game instance. `startedAt` is set
// once per game (newGame/startNewGame) and survives every move, so two states
// that share it are the same ongoing game while a fresh game always has a
// different one. A missing/zero startedAt is treated as one shared "unknown"
// game (e.g. a migrated v1 file), so loading it never resets the celebration.
function sameGame(a, b) {
    if (!a || !b) return false
    return normalizeMs(a.startedAt) === normalizeMs(b.startedAt)
}

// Direction of a drag: "" below the threshold, else the dominant axis.
// On an exact |dx| == |dy| tie, the horizontal axis wins.
function swipeDirection(dx, dy, threshold) {
    var adx = Math.abs(dx)
    var ady = Math.abs(dy)
    if (Math.max(adx, ady) < threshold) return ""
    if (adx >= ady) return dx < 0 ? "left" : "right"
    return dy < 0 ? "up" : "down"
}

// Clamp any level into the palette's 0..11 range.
function clampLevel(level) {
    var n = Math.floor(Number(level))
    if (!isFinite(n) || n < 0) return 0
    if (n > 11) return 11
    return n
}

function tileStyle(level) {
    var entry = PALETTE[clampLevel(level)]
    return { base: entry.base, alpha: entry.alpha, solid: entry.solid }
}

// WCAG sRGB channel linearization and relative luminance (0..1).
function channelLuminance(c) {
    if (c <= 0.03928) return c / 12.92
    return Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(r, g, b) {
    return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

function contrastRatio(l1, l2) {
    var hi = Math.max(l1, l2)
    var lo = Math.min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)
}

// Straight alpha compositing of a foreground over an opaque background.
function blend(fr, fg, fb, alpha, br, bg, bb) {
    return {
        r: alpha * fr + (1 - alpha) * br,
        g: alpha * fg + (1 - alpha) * bg,
        b: alpha * fb + (1 - alpha) * bb
    }
}

// Pick the readable text color on a tile: whichever of fg/bg contrasts more.
// A tie resolves to "fg".
function pickTextColor(tile, fg, bg) {
    var tileLum = relativeLuminance(tile.r, tile.g, tile.b)
    var fgLum = relativeLuminance(fg.r, fg.g, fg.b)
    var bgLum = relativeLuminance(bg.r, bg.g, bg.b)
    var fgContrast = contrastRatio(tileLum, fgLum)
    var bgContrast = contrastRatio(tileLum, bgLum)
    return bgContrast > fgContrast ? "bg" : "fg"
}

// --- scores view date formatting (§5 Unit 10) -----------------------------

var MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function pad2(value) {
    return value < 10 ? "0" + value : "" + value
}

// Same local calendar day (uses the host timezone through Date).
function sameLocalDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate()
}

// Human date for one leaderboard entry: "today HH:mm" for the current local
// day, "dd MMM" otherwise, and "—" for an unknown (0) timestamp.
function formatEntryDate(endedAt, now) {
    var t = Number(endedAt)
    if (!isFinite(t) || t <= 0) {
        return "—"
    }
    var date = new Date(t)
    var nowMs = Number(now)
    if (!isFinite(nowMs)) {
        nowMs = 0
    }
    if (sameLocalDay(date, new Date(nowMs))) {
        return "today " + pad2(date.getHours()) + ":" + pad2(date.getMinutes())
    }
    return pad2(date.getDate()) + " " + MONTH_ABBR[date.getMonth()]
}
