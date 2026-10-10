.pragma library

var VERSION = 2
var SIZE = 4
var WIN_VALUE = 2048
var MAX_STATE_BYTES = 65536
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

function emptyState(best) {
    var n = Number(best)
    if (!isFinite(n)) {
        n = 0
    }
    n = Math.floor(n)
    if (n < 0) {
        n = 0
    }
    return {
        version: VERSION,
        size: SIZE,
        cells: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        score: 0,
        best: n,
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
        leaderboard: []
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
        leaderboard: (state.leaderboard || []).slice()
    }
}

function normalizeMs(value) {
    var n = Number(value)
    if (!isFinite(n) || n < 0) return 0
    return Math.floor(n)
}

function newGame(best, rng, now, leaderboard) {
    var state = emptyState(best)
    state.startedAt = normalizeMs(now)
    state.leaderboard = Array.isArray(leaderboard) ? leaderboard.slice() : []
    state = spawn(state, rng)
    state = spawn(state, rng)
    return state
}

function slideLine(line) {
    var kept = []
    var positions = []
    var i
    for (i = 0; i < 4; i++) {
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
    while (out.length < 4) {
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

    for (i = 0; i < 4; i++) {
        line = []
        for (j = 0; j < 4; j++) {
            if (direction === "left") {
                line.push(cells[i * 4 + j])
            } else if (direction === "right") {
                line.push(cells[i * 4 + (3 - j)])
            } else if (direction === "up") {
                line.push(cells[j * 4 + i])
            } else {
                line.push(cells[(3 - j) * 4 + i])
            }
        }
        result = slideLine(line)
        gain += result.gain
        for (j = 0; j < 4; j++) {
            if (direction === "left") {
                target = i * 4 + j
            } else if (direction === "right") {
                target = i * 4 + (3 - j)
            } else if (direction === "up") {
                target = j * 4 + i
            } else {
                target = (3 - j) * 4 + i
            }
            if (cells[target] !== result.line[j]) {
                moved = true
            }
            cells[target] = result.line[j]
        }
        for (j = 0; j < result.mergedAt.length; j++) {
            pos = result.mergedAt[j]
            if (direction === "left") {
                merged.push(i * 4 + pos)
            } else if (direction === "right") {
                merged.push(i * 4 + (3 - pos))
            } else if (direction === "up") {
                merged.push(pos * 4 + i)
            } else {
                merged.push((3 - pos) * 4 + i)
            }
        }
        // One transition per pre-move tile: where it came from, where it ended,
        // and its value before the move (same direction mapping as `merged`).
        for (j = 0; j < 4; j++) {
            for (k = 0; k < result.sources[j].length; k++) {
                var srcPos = result.sources[j][k]
                var fromIndex
                var toIndex
                if (direction === "left") {
                    fromIndex = i * 4 + srcPos
                    toIndex = i * 4 + j
                } else if (direction === "right") {
                    fromIndex = i * 4 + (3 - srcPos)
                    toIndex = i * 4 + (3 - j)
                } else if (direction === "up") {
                    fromIndex = srcPos * 4 + i
                    toIndex = j * 4 + i
                } else {
                    fromIndex = (3 - srcPos) * 4 + i
                    toIndex = (3 - j) * 4 + i
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
    var i
    for (i = 0; i < 16; i++) {
        if (cells[i] === 0) {
            return true
        }
    }
    var r
    var c
    for (r = 0; r < 4; r++) {
        for (c = 0; c < 4; c++) {
            var value = cells[r * 4 + c]
            if (c < 3 && value === cells[r * 4 + c + 1]) {
                return true
            }
            if (r < 3 && value === cells[(r + 1) * 4 + c]) {
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

function keepGoing(state) {
    var next = copyState(state)
    if (state.status === STATUS_WON) {
        next.status = STATUS_PLAYING
        next.keepPlaying = true
    }
    return next
}

function serializeState(state) {
    return JSON.stringify({
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
        leaderboard: state.leaderboard || []
    })
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
    if (!data || typeof data !== "object") {
        return null
    }
    if (data.version !== 1 && data.version !== 2) {
        return null
    }
    if (data.size !== SIZE) {
        return null
    }
    if (!Array.isArray(data.cells) || data.cells.length !== 16) {
        return null
    }
    var i
    for (i = 0; i < 16; i++) {
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
    // Leaderboard: keep only individually valid entries, sorted and truncated.
    var leaderboard = []
    if (Array.isArray(data.leaderboard)) {
        for (var li = 0; li < data.leaderboard.length; li++) {
            var clean = sanitizeEntry(data.leaderboard[li])
            if (clean) {
                leaderboard.push(clean)
            }
        }
        leaderboard.sort(compareEntries)
        if (leaderboard.length > LEADERBOARD_SIZE) {
            leaderboard = leaderboard.slice(0, LEADERBOARD_SIZE)
        }
    }
    if (leaderboard.length > 0 && leaderboard[0].score > best) {
        best = leaderboard[0].score
    }
    return {
        version: VERSION,
        size: SIZE,
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
        // Version 1 has none of these: migrate to the v2 defaults.
        startedAt: data.version === 2 ? normalizeMs(data.startedAt) : 0,
        recorded: data.version === 2 && data.recorded === true,
        lastRank: data.version === 2 && isRank(data.lastRank) ? data.lastRank : 0,
        lastRecordedAt: data.version === 2 ? normalizeMs(data.lastRecordedAt) : 0,
        leaderboard: leaderboard
    }
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

// Record the current game once. No-op copy when already recorded or score 0.
function recordGame(state, now) {
    var copy = copyState(state)
    if (state.recorded === true || state.score === 0) {
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
    var next = newGame(recorded.best, rng, now, recorded.leaderboard)
    next.lastRank = recorded.lastRank
    next.lastRecordedAt = recorded.lastRecordedAt
    return next
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
