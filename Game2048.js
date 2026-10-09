.pragma library

var VERSION = 1
var SIZE = 4
var WIN_VALUE = 2048
var MAX_STATE_BYTES = 65536
var STATUS_PLAYING = "playing"
var STATUS_WON = "won"
var STATUS_OVER = "over"

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
        merged: []
    }
}

function newGame(best, rng) {
    var state = emptyState(best)
    state = spawn(state, rng)
    state = spawn(state, rng)
    return state
}

function slideLine(line) {
    var kept = []
    var i
    for (i = 0; i < 4; i++) {
        if (line[i] !== 0) {
            kept.push(line[i])
        }
    }
    var out = []
    var gain = 0
    var mergedAt = []
    i = 0
    while (i < kept.length) {
        if (i + 1 < kept.length && kept[i] === kept[i + 1]) {
            var merged = kept[i] * 2
            mergedAt.push(out.length)
            out.push(merged)
            gain += merged
            i += 2
        } else {
            out.push(kept[i])
            i += 1
        }
    }
    while (out.length < 4) {
        out.push(0)
    }
    return { line: out, gain: gain, mergedAt: mergedAt }
}

function move(state, direction, rng) {
    var dirs = ["left", "right", "up", "down"]
    var valid = false
    var k
    for (k = 0; k < 4; k++) {
        if (dirs[k] === direction) {
            valid = true
        }
    }

    var copy = {
        version: state.version,
        size: state.size,
        cells: state.cells.slice(),
        score: state.score,
        best: state.best,
        moves: state.moves,
        status: state.status,
        keepPlaying: state.keepPlaying,
        spawned: state.spawned,
        merged: state.merged.slice()
    }

    if (!valid || state.status !== STATUS_PLAYING) {
        return { state: copy, moved: false }
    }

    var cells = state.cells.slice()
    var gain = 0
    var merged = []
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
    }

    if (!moved) {
        return { state: copy, moved: false }
    }

    var score = state.score + gain
    var best = state.best
    if (score > best) {
        best = score
    }

    var next = {
        version: state.version,
        size: state.size,
        cells: cells,
        score: score,
        best: best,
        moves: state.moves + 1,
        status: state.status,
        keepPlaying: state.keepPlaying,
        spawned: -1,
        merged: merged
    }
    next = spawn(next, rng)
    var status = next.status
    if (!next.keepPlaying && hasValueAtLeast(next.cells, WIN_VALUE)) {
        status = STATUS_WON
    }
    if (!canMove(next.cells)) {
        status = STATUS_OVER
    }
    next.status = status
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
        return {
            version: state.version,
            size: state.size,
            cells: cells,
            score: state.score,
            best: state.best,
            moves: state.moves,
            status: state.status,
            keepPlaying: state.keepPlaying,
            spawned: -1,
            merged: state.merged.slice()
        }
    }
    var pick = empties[Math.min(empties.length - 1, Math.floor(rng() * empties.length))]
    cells[pick] = rng() < 0.1 ? 4 : 2
    return {
        version: state.version,
        size: state.size,
        cells: cells,
        score: state.score,
        best: state.best,
        moves: state.moves,
        status: state.status,
        keepPlaying: state.keepPlaying,
        spawned: pick,
        merged: state.merged.slice()
    }
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
    var next = {
        version: state.version,
        size: state.size,
        cells: state.cells.slice(),
        score: state.score,
        best: state.best,
        moves: state.moves,
        status: state.status,
        keepPlaying: state.keepPlaying,
        spawned: state.spawned,
        merged: state.merged.slice()
    }
    if (state.status === STATUS_WON) {
        next.status = STATUS_PLAYING
        next.keepPlaying = true
    }
    return next
}

function serializeState(state) {
    return JSON.stringify({
        version: state.version,
        size: state.size,
        cells: state.cells,
        score: state.score,
        best: state.best,
        moves: state.moves,
        status: state.status,
        keepPlaying: state.keepPlaying
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
    if (data.version !== VERSION || data.size !== SIZE) {
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
        merged: []
    }
}
