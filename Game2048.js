.pragma library

var VERSION = 3
var SIZE = 4
// Board sizes the player can pick with `[` / `]` or the header badge. 4×4 is
// the default and the size every legacy state file was written for.
var SUPPORTED_SIZES = [3, 4, 5, 6, 8]
// Undo is a ring of the last 50 pre-move snapshots; the challenge setting caps
// how many undos a single game may use.
var UNDO_RING = 50
var UNDO_CHALLENGE_LIMIT = 3
var UNDO_UNLIMITED = "unlimited"
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
        assisted: false
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
        assisted: state.assisted === true
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
        keepPlaying: state.keepPlaying === true
    }
}

function copySnapshot(snap) {
    if (!snap || typeof snap !== "object" || !Array.isArray(snap.cells)) {
        return { cells: [], score: 0, moves: 0, status: STATUS_PLAYING, keepPlaying: false }
    }
    return {
        cells: snap.cells.slice(),
        score: normalizeCount(snap.score),
        moves: normalizeCount(snap.moves),
        status: snap.status,
        keepPlaying: snap.keepPlaying === true
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

// Multiplier for the tile label font: fewer pixels as the board grows and as
// the number gains digits, so text never overflows its cell. QML multiplies
// Style.font.title by this.
function tileFontFactor(value, size) {
    var n = isSupportedSize(size) ? Number(size) : SIZE
    var number = Number(value)
    if (!isFinite(number) || number < 0) number = 0
    var digits = String(Math.floor(number)).length
    var byDigits = digits <= 2 ? 1.6 : digits === 3 ? 1.3 : digits === 4 ? 1.05 : 0.85
    return byDigits * (4 / n)
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
        assisted: state.assisted === true
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
            keepPlaying: snap.keepPlaying === true
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
        assisted: data.assisted === true
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
    return { allowUndo: true, undoLimit: UNDO_UNLIMITED }
}

// Clamp arbitrary input to the known settings shape. A missing Allow undo is
// on; any Undo limit other than the challenge value is unlimited.
function sanitizeSettings(raw) {
    var source = raw && typeof raw === "object" ? raw : {}
    var limit = source.undoLimit === UNDO_CHALLENGE_LIMIT || source.undoLimit === String(UNDO_CHALLENGE_LIMIT)
        ? UNDO_CHALLENGE_LIMIT
        : UNDO_UNLIMITED
    return { allowUndo: source.allowUndo !== false, undoLimit: limit }
}

function mergeSettings(current, patch) {
    var base = sanitizeSettings(current)
    var source = patch && typeof patch === "object" ? patch : {}
    return sanitizeSettings({
        allowUndo: "allowUndo" in source ? source.allowUndo : base.allowUndo,
        undoLimit: "undoLimit" in source ? source.undoLimit : base.undoLimit
    })
}

// Every supported size gets its own board, best and leaderboard. Settings are
// shared by the whole profile.
function emptyProfile() {
    var sizes = {}
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
        var size = SUPPORTED_SIZES[i]
        sizes[String(size)] = emptyState(0, size)
    }
    return { version: VERSION, activeSize: SIZE, settings: defaultSettings(), sizes: sizes }
}

function copyProfile(profile) {
    var sizes = {}
    for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
        var size = SUPPORTED_SIZES[i]
        var key = String(size)
        var game = profile && profile.sizes ? profile.sizes[key] : null
        sizes[key] = game ? copyState(game) : emptyState(0, size)
    }
    return {
        version: VERSION,
        activeSize: profile && isSupportedSize(profile.activeSize) ? Number(profile.activeSize) : SIZE,
        settings: sanitizeSettings(profile ? profile.settings : null),
        sizes: sizes
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
        sizes: sizes
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
        var longestKey = null
        var longestLen = 0
        for (var i = 0; i < SUPPORTED_SIZES.length; i++) {
            var key = String(SUPPORTED_SIZES[i])
            var len = copy.sizes[key].history.length
            if (len > longestLen) {
                longestLen = len
                longestKey = key
            }
        }
        if (!longestKey) {
            break
        }
        copy.sizes[longestKey].history.shift()
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
        var migrated = emptyProfile()
        migrated.sizes[String(legacy.size)] = legacy
        migrated.activeSize = legacy.size
        return migrated
    }
    if (data.version !== VERSION) {
        return null
    }
    if (!data.sizes || typeof data.sizes !== "object") {
        return null
    }

    var profile = emptyProfile()
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
