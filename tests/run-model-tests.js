const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs
  .readFileSync(path.join(__dirname, "..", "Game2048.js"), "utf8")
  .replace(/^\.pragma library\s*$/m, "")

// `Date` is needed by the pure `formatEntryDate` display helper (Unit 10).
const Game = { Math, Number, JSON, Array, isFinite, Date }
vm.createContext(Game)
vm.runInContext(source, Game, { filename: "Game2048.js" })

function test(name, body) {
  try {
    body()
  } catch (err) {
    process.stdout.write(`not ok - ${name}\n`)
    process.stdout.write(`${(err && err.stack) || err}\n`)
    process.exit(1)
  }
  process.stdout.write(`ok - ${name}\n`)
}

// Yields the given values in order and throws when exhausted.
// The throw happens only on an extra call, so `seq()` (no values) proves
// that an rng was never called.
function seq(...values) {
  let i = 0
  return function () {
    if (i >= values.length) {
      throw new Error(`rng call #${i + 1} exceeded the deterministic sequence`)
    }
    return values[i++]
  }
}

function stateWith(cells, extra) {
  return Object.assign(
    {
      version: 1,
      size: 4,
      cells: cells.slice(),
      score: 0,
      best: 0,
      moves: 0,
      status: "playing",
      keepPlaying: false,
      spawned: -1,
      merged: []
    },
    extra || {}
  )
}

function withCell(cells, index, value) {
  const copy = cells.slice()
  copy[index] = value
  return copy
}

// The vm sandbox is its own realm, so arrays and objects it returns have a
// different prototype than the test realm and strict deepEqual rejects them.
// Normalize through JSON before any structural comparison.
function same(actual, expected, message) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)
}

// The full normalized settings object; pass overrides for a specific case.
function settings(over) {
  return Object.assign({
    allowUndo: true, undoLimit: "unlimited", motion: "full", sound: false,
    palette: "theme", scale: 100, numerals: "western", confirmNew: false
  }, over || {})
}

// Row-major board used for the up/down reference moves (§7 Unit 1).
const REFERENCE_BOARD = [2, 0, 2, 4, 2, 2, 0, 4, 0, 2, 2, 8, 4, 0, 2, 8]

// --- 1. slideLine table (§3.2, left semantics) ---------------------------

test("slideLine merges left per the §3.2 table", () => {
  const table = [
    [[2, 2, 2, 2], [4, 4, 0, 0], 8, [0, 1]],
    [[2, 2, 2, 0], [4, 2, 0, 0], 4, [0]],
    [[2, 0, 2, 4], [4, 4, 0, 0], 4, [0]],
    [[4, 4, 8, 8], [8, 16, 0, 0], 24, [0, 1]],
    [[2, 4, 8, 16], [2, 4, 8, 16], 0, []],
    [[0, 0, 0, 2], [2, 0, 0, 0], 0, []],
    [[8, 8, 8, 0], [16, 8, 0, 0], 16, [0]]
  ]
  for (const entry of table) {
    const input = entry[0]
    const res = Game.slideLine(input)
    same(res.line, entry[1], `line for ${JSON.stringify(input)}`)
    assert.equal(res.gain, entry[2], `gain for ${JSON.stringify(input)}`)
    same(res.mergedAt, entry[3], `mergedAt for ${JSON.stringify(input)}`)
  }
})

// --- 2. move left / right / up / down ------------------------------------

test("move left on the reference board", () => {
  const res = Game.move(stateWith(REFERENCE_BOARD), "left", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  const cells = res.state.cells.slice()
  cells[res.state.spawned] = 0
  // row0 [2,0,2,4] -> [4,4]
  // row1 [2,2,0,4] -> [4,4]
  // row2 [0,2,2,8] -> [4,8]
  // row3 [4,0,2,8] -> [4,2,8] (no merge)
  same(cells, [4, 4, 0, 0, 4, 4, 0, 0, 4, 8, 0, 0, 4, 2, 8, 0])
  assert.equal(res.state.score, 12)
})

test("move right on the reference board", () => {
  const res = Game.move(stateWith(REFERENCE_BOARD), "right", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  const cells = res.state.cells.slice()
  cells[res.state.spawned] = 0
  // row0 [2,0,2,4] read right -> [4,2,0,2] -> [4,4] -> written back [0,0,4,4]
  // row1 [2,2,0,4] read right -> [4,0,2,2] -> [4,4] -> [0,0,4,4]
  // row2 [0,2,2,8] read right -> [8,2,2,0] -> [8,4] -> [0,0,4,8]
  // row3 [4,0,2,8] read right -> [8,2,0,4] -> [8,2,4] -> [0,4,2,8]
  same(cells, [0, 0, 4, 4, 0, 0, 4, 4, 0, 0, 4, 8, 0, 4, 2, 8])
  assert.equal(res.state.score, 12)
})

test("move up on the reference board", () => {
  const res = Game.move(stateWith(REFERENCE_BOARD), "up", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  const cells = res.state.cells.slice()
  cells[res.state.spawned] = 0
  // Columns read top->bottom:
  // col0 [2,2,0,4] -> [4,4]            col1 [0,2,2,0] -> [4]
  // col2 [2,0,2,2] -> [4,2]            col3 [4,4,8,8] -> [8,16]
  same(cells, [4, 4, 4, 8, 4, 0, 2, 16, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(res.state.score, 36)
})

test("move down on the reference board", () => {
  const res = Game.move(stateWith(REFERENCE_BOARD), "down", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  const cells = res.state.cells.slice()
  cells[res.state.spawned] = 0
  // Columns read bottom->top:
  // col0 [4,0,2,2] -> [4,4,0,0] written back [0,0,4,4]
  // col1 [0,2,2,0] -> [4,0,0,0]           written back [0,0,0,4]
  // col2 [2,2,0,2] -> [4,2,0,0]           written back [0,0,2,4]
  // col3 [8,8,4,4] -> [16,8,0,0]          written back [0,0,8,16]
  same(cells, [0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 2, 8, 4, 4, 4, 16])
  assert.equal(res.state.score, 36)
})

// --- 3. no-op move -------------------------------------------------------

test("move is a no-op when nothing slides and never calls rng", () => {
  const start = stateWith([2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128])
  const before = JSON.parse(JSON.stringify(start))
  const res = Game.move(start, "left", seq())
  assert.equal(res.moved, false)
  assert.equal(res.state.score, start.score)
  assert.equal(res.state.moves, start.moves)
  assert.equal(res.state.status, start.status)
  assert.deepEqual(start, before)
})

// --- 4. spawn order ------------------------------------------------------

test("spawn picks the cell and value in the §3.3 order", () => {
  const cells = new Array(16).fill(2)
  cells[3] = 0
  cells[7] = 0
  cells[12] = 0
  // empties [3,7,12]: floor(0.5 * 3) = 1 -> index 7, 0.05 < 0.1 -> value 4
  const first = Game.spawn(stateWith(cells), seq(0.5, 0.05))
  assert.equal(first.spawned, 7)
  assert.equal(first.cells[7], 4)
  // floor(0.99 * 3) = 2 -> index 12, 0.5 >= 0.1 -> value 2
  const second = Game.spawn(stateWith(cells), seq(0.99, 0.5))
  assert.equal(second.spawned, 12)
  assert.equal(second.cells[12], 2)
})

test("spawn on a full board does nothing and never calls rng", () => {
  const full = stateWith(new Array(16).fill(2))
  const res = Game.spawn(full, seq())
  same(res.cells, full.cells)
})

// --- 5. newGame ----------------------------------------------------------

test("newGame makes two deterministic tiles and keeps best", () => {
  const game = Game.newGame(10, seq(0, 0.5, 0, 0.5))
  // first spawn: floor(0 * 16) = 0 -> index 0, 0.5 -> 2
  // second spawn: floor(0 * 15) = 0 -> first remaining empty index 1, 0.5 -> 2
  assert.equal(game.cells[0], 2)
  assert.equal(game.cells[1], 2)
  assert.equal(
    game.cells.filter((v) => v !== 0).length,
    2,
    "exactly two tiles are on the board"
  )
  assert.equal(game.best, 10)
  assert.equal(game.score, 0)
})

// --- 6. score and best ---------------------------------------------------

test("move updates score, moves and best", () => {
  const rich = stateWith([4, 4, 8, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {
    score: 5,
    best: 10
  })
  const gained = Game.move(rich, "left", seq(0.5, 0.5))
  assert.equal(gained.state.score, 29)
  assert.equal(gained.state.moves, 1)
  assert.equal(gained.state.best, 29)

  const guarded = stateWith([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {
    score: 0,
    best: 100
  })
  const kept = Game.move(guarded, "left", seq(0.5, 0.5))
  assert.equal(kept.state.score, 4)
  assert.equal(kept.state.best, 100)
})

// --- 7. win --------------------------------------------------------------

test("reaching 2048 wins, blocks moves and keepGoing resumes", () => {
  const start = stateWith([1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  const won = Game.move(start, "left", seq(0.5, 0.5))
  assert.equal(won.moved, true)
  assert.equal(won.state.cells[0], 2048)
  assert.equal(won.state.status, "won")

  const blocked = Game.move(won.state, "left", seq())
  assert.equal(blocked.moved, false)

  const resumed = Game.keepGoing(won.state)
  assert.equal(resumed.status, "playing")
  assert.equal(resumed.keepPlaying, true)

  const later = stateWith([2048, 2048, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {
    keepPlaying: true
  })
  const fourK = Game.move(later, "left", seq(0.5, 0.5))
  assert.equal(fourK.state.cells[0], 4096)
  assert.equal(fourK.state.status, "playing")
})

// --- 8. game over and canMove -------------------------------------------

test("a move that fills the board with no equal neighbors is game over", () => {
  // Pre-move board (one empty at index 12); sliding down packs column 0 into
  // [0,4,2,4] and the spawn fills index 0, giving a checkerboard.
  const start = stateWith([4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 0, 2, 4, 2])
  const res = Game.move(start, "down", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  same(res.state.cells, [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2])
  assert.equal(res.state.status, "over")
  assert.equal(Game.canMove(res.state.cells), false)
})

test("canMove is false on a full board with no equal neighbors", () => {
  const stuck = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]
  assert.equal(Game.canMove(stuck), false)
})

test("canMove is true with an empty cell or a mergeable neighbor", () => {
  const withEmpty = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 0]
  assert.equal(Game.canMove(withEmpty), true)

  const withPair = [2, 4, 8, 16, 2, 8, 16, 32, 4, 16, 32, 64, 8, 32, 64, 128]
  assert.equal(Game.canMove(withPair), true)
})

// --- 9. immutability -----------------------------------------------------

test("move never mutates its input state or cells", () => {
  const start = stateWith([2, 2, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {
    score: 7,
    best: 9,
    moves: 3
  })
  const before = JSON.stringify(start)
  const res = Game.move(start, "left", seq(0.5, 0.5))
  assert.equal(JSON.stringify(start), before)
  assert.notEqual(res.state.cells, start.cells)
  assert.equal(res.moved, true)
})

// --- 10. directionFromDelta ---------------------------------------------

test("directionFromDelta maps the four deltas and (0,0)", () => {
  assert.equal(Game.directionFromDelta(-1, 0), "left")
  assert.equal(Game.directionFromDelta(1, 0), "right")
  assert.equal(Game.directionFromDelta(0, -1), "up")
  assert.equal(Game.directionFromDelta(0, 1), "down")
  assert.equal(Game.directionFromDelta(0, 0), "")
})

// --- 11. tileLevel -------------------------------------------------------

test("tileLevel maps values to log2 levels", () => {
  assert.equal(Game.tileLevel(0), 0)
  assert.equal(Game.tileLevel(2), 1)
  assert.equal(Game.tileLevel(4), 2)
  assert.equal(Game.tileLevel(1024), 10)
  assert.equal(Game.tileLevel(2048), 11)
})

// --- 12. round-trip ------------------------------------------------------

test("serializeState round-trips through parseState", () => {
  const state = stateWith([2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {
    score: 12,
    best: 20,
    moves: 4,
    spawned: 5,
    merged: [2, 3]
  })
  const text = Game.serializeState(state)
  const raw = JSON.parse(text)
  assert.equal(Object.prototype.hasOwnProperty.call(raw, "gain"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(raw, "transitions"), false)
  assert.equal(raw.version, 3)
  const parsed = Game.parseState(text)
  same(parsed, {
    version: 3,
    size: 4,
    cells: state.cells,
    score: 12,
    best: 20,
    moves: 4,
    status: "playing",
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
  })
})

// --- 13. parseState rejections and best recovery -------------------------

test("parseState rejects every invalid payload with null", () => {
  const base = {
    version: 1,
    size: 4,
    cells: new Array(16).fill(0),
    score: 0,
    best: 0,
    moves: 0,
    status: "playing",
    keepPlaying: false
  }
  const raw = (over) => JSON.stringify(Object.assign({}, base, over))

  assert.equal(Game.parseState(""), null)
  assert.equal(Game.parseState("not json"), null)
  assert.equal(Game.parseState("x".repeat(65537)), null)
  assert.equal(Game.parseState(raw({ version: 0 })), null)
  assert.equal(Game.parseState(raw({ version: 4 })), null)
  assert.equal(
    Game.parseState(JSON.stringify(Object.assign({}, base, { cells: new Array(15).fill(0) }))),
    null
  )
  assert.equal(Game.parseState(raw({ cells: withCell(base.cells, 0, 3) })), null)
  assert.equal(Game.parseState(raw({ cells: withCell(base.cells, 0, 262144) })), null)
  assert.equal(Game.parseState(raw({ score: -1 })), null)
  assert.equal(Game.parseState(raw({ score: 1e10 })), null)
  assert.equal(Game.parseState(raw({ status: "paused" })), null)
  assert.equal(Game.parseState(raw({ keepPlaying: "yes" })), null)
})

test("parseState forces best to be at least score", () => {
  const payload = {
    version: 1,
    size: 4,
    cells: new Array(16).fill(0),
    score: 500,
    best: 100,
    moves: 3,
    status: "playing",
    keepPlaying: false
  }
  const parsed = Game.parseState(JSON.stringify(payload))
  assert.equal(parsed.best, 500)
})

// --- 14. visual palette and text contrast helpers (§3.1) ------------------

test("tileStyle covers the palette table", () => {
  const table = [
    [0, "empty", 0.07, false],
    [1, "fg", 0.12, false],
    [2, "fg", 0.22, false],
    [3, "accent", 0.28, false],
    [4, "accent", 0.42, false],
    [5, "accent", 0.58, false],
    [6, "accent", 0.76, false],
    [7, "accent", 1.0, true],
    [8, "urgent", 0.45, false],
    [9, "urgent", 0.65, false],
    [10, "urgent", 0.85, false],
    [11, "urgent", 1.0, true]
  ]
  for (const [level, base, alpha, solid] of table) {
    const style = Game.tileStyle(level)
    assert.equal(style.base, base, `base at level ${level}`)
    assert.equal(style.alpha, alpha, `alpha at level ${level}`)
    assert.equal(style.solid, solid, `solid at level ${level}`)
  }
  same(Game.tileStyle(15), { base: "urgent", alpha: 1.0, solid: true })
})

test("relativeLuminance spans 0..1", () => {
  assert.ok(Math.abs(Game.relativeLuminance(1, 1, 1) - 1) <= 1e-9)
  assert.ok(Math.abs(Game.relativeLuminance(0, 0, 0) - 0) <= 1e-9)
})

test("contrastRatio of white and black is 21", () => {
  assert.ok(Math.abs(Game.contrastRatio(1, 0) - 21) <= 1e-9)
})

test("blend is straight alpha over an opaque background", () => {
  same(Game.blend(1, 1, 1, 0, 0.2, 0.4, 0.6), { r: 0.2, g: 0.4, b: 0.6 })
  same(Game.blend(1, 1, 1, 1, 0.2, 0.4, 0.6), { r: 1, g: 1, b: 1 })
})

test("pickTextColor chooses the higher-contrast foreground", () => {
  const white = { r: 1, g: 1, b: 1 }
  const black = { r: 0, g: 0, b: 0 }
  // white tile: black text wins
  assert.equal(Game.pickTextColor(white, white, black), "bg")
  // black tile: white (fg) text wins
  assert.equal(Game.pickTextColor(black, white, black), "fg")
  // tie -> fg
  assert.equal(Game.pickTextColor(white, white, white), "fg")
})

// --- 15. slide sources and move transitions (§4.1) ------------------------

test("slideLine reports tile sources", () => {
  const cases = [
    [[2, 2, 2, 2], [4, 4, 0, 0], 8, [0, 1], [[0, 1], [2, 3], [], []]],
    [[2, 2, 2, 0], [4, 2, 0, 0], 4, [0], [[0, 1], [2], [], []]],
    [[2, 0, 2, 4], [4, 4, 0, 0], 4, [0], [[0, 2], [3], [], []]],
    [[4, 4, 8, 8], [8, 16, 0, 0], 24, [0, 1], [[0, 1], [2, 3], [], []]],
    [[2, 4, 8, 16], [2, 4, 8, 16], 0, [], [[0], [1], [2], [3]]],
    [[0, 0, 0, 2], [2, 0, 0, 0], 0, [], [[3], [], [], []]],
    [[8, 8, 8, 0], [16, 8, 0, 0], 16, [0], [[0, 1], [2], [], []]]
  ]
  for (const [input, line, gain, mergedAt, sources] of cases) {
    const res = Game.slideLine(input)
    same(res.line, line, `line for ${JSON.stringify(input)}`)
    assert.equal(res.gain, gain, `gain for ${JSON.stringify(input)}`)
    same(res.mergedAt, mergedAt, `mergedAt for ${JSON.stringify(input)}`)
    same(res.sources, sources, `sources for ${JSON.stringify(input)}`)
  }
})

function transitionsByFrom(state) {
  return state.transitions.slice().sort((a, b) => a.from - b.from)
}

test("move reports transitions left", () => {
  const res = Game.move(stateWith(REFERENCE_BOARD), "left", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  same(transitionsByFrom(res.state), [
    { from: 0, to: 0, value: 2 },
    { from: 2, to: 0, value: 2 },
    { from: 3, to: 1, value: 4 },
    { from: 4, to: 4, value: 2 },
    { from: 5, to: 4, value: 2 },
    { from: 7, to: 5, value: 4 },
    { from: 9, to: 8, value: 2 },
    { from: 10, to: 8, value: 2 },
    { from: 11, to: 9, value: 8 },
    { from: 12, to: 12, value: 4 },
    { from: 14, to: 13, value: 2 },
    { from: 15, to: 14, value: 8 }
  ])
  assert.equal(res.state.transitions.length, REFERENCE_BOARD.filter((v) => v !== 0).length)
  assert.ok(res.state.transitions.some((t) => t.from === t.to), "a tile that stays put has from === to")
  assert.equal(res.state.gain, res.state.score)
})

test("move reports transitions up", () => {
  const res = Game.move(stateWith(REFERENCE_BOARD), "up", seq(0.5, 0.5))
  same(transitionsByFrom(res.state), [
    { from: 0, to: 0, value: 2 },
    { from: 2, to: 2, value: 2 },
    { from: 3, to: 3, value: 4 },
    { from: 4, to: 0, value: 2 },
    { from: 5, to: 1, value: 2 },
    { from: 7, to: 3, value: 4 },
    { from: 9, to: 1, value: 2 },
    { from: 10, to: 2, value: 2 },
    { from: 11, to: 7, value: 8 },
    { from: 12, to: 4, value: 4 },
    { from: 14, to: 6, value: 2 },
    { from: 15, to: 7, value: 8 }
  ])
  assert.equal(res.state.transitions.length, 12)
  assert.equal(res.state.gain, 36)
})

test("move reports transitions down", () => {
  const res = Game.move(stateWith(REFERENCE_BOARD), "down", seq(0.5, 0.5))
  same(transitionsByFrom(res.state), [
    { from: 0, to: 8, value: 2 },
    { from: 2, to: 10, value: 2 },
    { from: 3, to: 11, value: 4 },
    { from: 4, to: 8, value: 2 },
    { from: 5, to: 13, value: 2 },
    { from: 7, to: 11, value: 4 },
    { from: 9, to: 13, value: 2 },
    { from: 10, to: 14, value: 2 },
    { from: 11, to: 15, value: 8 },
    { from: 12, to: 12, value: 4 },
    { from: 14, to: 14, value: 2 },
    { from: 15, to: 15, value: 8 }
  ])
  assert.equal(res.state.transitions.length, 12)
  assert.equal(res.state.gain, 36)
})

test("move reports transitions right", () => {
  const res = Game.move(stateWith(REFERENCE_BOARD), "right", seq(0.5, 0.5))
  same(transitionsByFrom(res.state), [
    { from: 0, to: 2, value: 2 },
    { from: 2, to: 2, value: 2 },
    { from: 3, to: 3, value: 4 },
    { from: 4, to: 6, value: 2 },
    { from: 5, to: 6, value: 2 },
    { from: 7, to: 7, value: 4 },
    { from: 9, to: 10, value: 2 },
    { from: 10, to: 10, value: 2 },
    { from: 11, to: 11, value: 8 },
    { from: 12, to: 13, value: 4 },
    { from: 14, to: 14, value: 2 },
    { from: 15, to: 15, value: 8 }
  ])
  assert.equal(res.state.transitions.length, 12)
  assert.equal(res.state.gain, 12)
})

test("no-op and fresh state carry empty transitions and zero gain", () => {
  const noop = Game.move(stateWith([2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128]), "left", seq())
  assert.equal(noop.moved, false)
  same(noop.state.transitions, [])
  assert.equal(noop.state.gain, 0)
  same(Game.newGame(0, seq(0, 0.5, 0, 0.5)).transitions, [])
  assert.equal(Game.newGame(0, seq(0, 0.5, 0, 0.5)).gain, 0)
})

// --- 16. local leaderboard and state v2 (§5) ------------------------------

function lbEntry(score, maxTile, endedAt, won, moves) {
  return { score, maxTile, moves: moves === undefined ? 1 : moves, endedAt, won: won === true }
}

test("maxTile returns the highest value or 0", () => {
  assert.equal(Game.maxTile(new Array(16).fill(0)), 0)
  assert.equal(Game.maxTile([2, 0, 8, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 8)
  assert.equal(Game.maxTile([2, 2048, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 2048)
})

test("insertEntry ranks by score, then maxTile, then endedAt", () => {
  const a = Game.insertEntry([], lbEntry(100, 64, 1000))
  assert.equal(a.rank, 1)
  const b = Game.insertEntry(a.leaderboard, lbEntry(200, 32, 900))
  assert.equal(b.rank, 1)
  same(b.leaderboard.map((e) => e.score), [200, 100])
  // tie on score -> higher maxTile first
  const c = Game.insertEntry(b.leaderboard, lbEntry(200, 128, 950))
  assert.equal(c.rank, 1)
  // tie on score + maxTile -> older (smaller endedAt) first
  const d = Game.insertEntry(c.leaderboard, lbEntry(200, 128, 940))
  assert.equal(d.rank, 1)
  same(d.leaderboard.map((e) => e.endedAt), [940, 950, 900, 1000])
})

test("insertEntry truncates to 10 and reports rank 0 when it does not fit", () => {
  let lb = []
  for (let i = 1; i <= 10; i++) lb = Game.insertEntry(lb, lbEntry(i * 10, 2, i)).leaderboard
  const overflow = Game.insertEntry(lb, lbEntry(5, 2, 999))
  assert.equal(overflow.rank, 0)
  assert.equal(overflow.leaderboard.length, 10)
  const better = Game.insertEntry(lb, lbEntry(1000, 2, 999))
  assert.equal(better.rank, 1)
  assert.equal(better.leaderboard.length, 10)
  assert.equal(better.leaderboard[0].score, 1000)
})

test("recordGame is idempotent and skips zero scores", () => {
  const state = stateWith([2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { score: 40, moves: 5 })
  const once = Game.recordGame(state, 1000)
  assert.equal(once.recorded, true)
  assert.equal(once.leaderboard.length, 1)
  assert.equal(once.lastRank, 1)
  assert.equal(once.lastRecordedAt, 1000)
  const twice = Game.recordGame(once, 2000)
  assert.equal(twice.leaderboard.length, 1)
  assert.equal(twice.lastRecordedAt, 1000)
  const zero = Game.recordGame(stateWith(new Array(16).fill(0), { score: 0 }), 3000)
  assert.equal(zero.recorded, false)
  assert.equal(zero.leaderboard.length, 0)
})

test("startNewGame records the abandoned game and carries best and leaderboard", () => {
  const state = stateWith([2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { score: 12, best: 50, moves: 3 })
  const next = Game.startNewGame(state, seq(0, 0.5, 0, 0.5), 5000)
  assert.equal(next.leaderboard.length, 1)
  assert.equal(next.leaderboard[0].score, 12)
  assert.equal(next.best, 50)
  assert.equal(next.startedAt, 5000)
  assert.equal(next.score, 0)
  assert.equal(next.recorded, false)
})

test("startNewGame keeps the last recorded entry highlighted", () => {
  // The new game itself is not recorded, but it still points at the entry it
  // just recorded so the scores view can highlight it (§5.1 lastRecordedAt).
  const state = stateWith([2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { score: 12, best: 50, moves: 3 })
  const next = Game.startNewGame(state, seq(0, 0.5, 0, 0.5), 5000)
  assert.equal(next.recorded, false)
  assert.equal(next.lastRank, 1)
  assert.equal(next.lastRecordedAt, 5000)
  assert.equal(next.leaderboard[0].endedAt, 5000)
  // An abandoned zero-score game records nothing and highlights nothing.
  const zero = Game.startNewGame(stateWith(new Array(16).fill(0), { score: 0 }), seq(0, 0.5, 0, 0.5), 6000)
  assert.equal(zero.leaderboard.length, 0)
  assert.equal(zero.lastRecordedAt, 0)
  assert.equal(zero.lastRank, 0)
})

test("a game that ends via move is recorded exactly once", () => {
  const start = stateWith([8, 16, 32, 0, 8, 16, 32, 64, 16, 32, 64, 128, 32, 64, 128, 256], { score: 300, moves: 10 })
  const ended = Game.move(start, "right", seq(0.5, 0.5), 7000)
  assert.equal(ended.state.status, "over")
  assert.equal(ended.state.recorded, true)
  assert.equal(ended.state.leaderboard.length, 1)
  assert.equal(ended.state.leaderboard[0].endedAt, 7000)
  const after = Game.startNewGame(ended.state, seq(0, 0.5, 0, 0.5), 8000)
  assert.equal(after.leaderboard.length, 1)
})

test("recorded entries flag won for a 2048 tile", () => {
  const big = Game.recordGame(stateWith([2048, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { score: 2048, moves: 1 }), 1)
  assert.equal(big.leaderboard[0].won, true)
  assert.equal(big.leaderboard[0].maxTile, 2048)
  const small = Game.recordGame(stateWith([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { score: 2, moves: 1 }), 2)
  assert.equal(small.leaderboard[0].won, false)
})

test("parseState migrates version 1 to the current version", () => {
  const v1 = JSON.stringify({ version: 1, size: 4, cells: new Array(16).fill(0), score: 5, best: 5, moves: 2, status: "playing", keepPlaying: false })
  const parsed = Game.parseState(v1)
  assert.equal(parsed.version, 3)
  assert.equal(parsed.startedAt, 0)
  assert.equal(parsed.recorded, false)
  assert.equal(parsed.lastRank, 0)
  assert.equal(parsed.lastRecordedAt, 0)
  assert.equal(parsed.undoCount, 0)
  assert.equal(parsed.assisted, false)
  same(parsed.history, [])
  same(parsed.leaderboard, [])
})

test("parseState drops invalid leaderboard entries individually", () => {
  const payload = {
    version: 2, size: 4, cells: new Array(16).fill(0), score: 0, best: 0, moves: 0,
    status: "playing", keepPlaying: false, startedAt: 0, recorded: false, lastRank: 0, lastRecordedAt: 0,
    leaderboard: [
      lbEntry(10, 4, 1),
      { score: "bad", maxTile: 4, moves: 1, endedAt: 2, won: false },
      lbEntry(30, 3, 3),
      lbEntry(20, 8, 4)
    ]
  }
  const parsed = Game.parseState(JSON.stringify(payload))
  assert.equal(parsed.leaderboard.length, 2)
  same(parsed.leaderboard.map((e) => e.score), [20, 10])
  const notArray = Game.parseState(JSON.stringify(Object.assign({}, payload, { leaderboard: "nope" })))
  same(notArray.leaderboard, [])
})

test("parseState truncates an oversized leaderboard to the top 10", () => {
  const lb = []
  for (let i = 1; i <= 12; i++) lb.push(lbEntry(i, 2, i))
  const payload = { version: 2, size: 4, cells: new Array(16).fill(0), score: 0, best: 0, moves: 0, status: "playing", keepPlaying: false, leaderboard: lb }
  const parsed = Game.parseState(JSON.stringify(payload))
  assert.equal(parsed.leaderboard.length, 10)
  same(parsed.leaderboard.map((e) => e.score), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3])
})

test("parseState lifts best to the top leaderboard score", () => {
  const payload = {
    version: 2, size: 4, cells: new Array(16).fill(0), score: 5, best: 5, moves: 1, status: "playing", keepPlaying: false,
    leaderboard: [lbEntry(500, 64, 1)]
  }
  const parsed = Game.parseState(JSON.stringify(payload))
  assert.equal(parsed.best, 500)
})

test("newGame, move and startNewGame keep the same rng call counts", () => {
  Game.newGame(0, seq(0, 0.5, 0, 0.5))
  const res = Game.move(stateWith([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "left", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  Game.startNewGame(stateWith([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { score: 5 }), seq(0, 0.5, 0, 0.5), 1)
})

// --- 17. score tween and new-best helpers (§3.1) --------------------------

test("tweenValue eases out cubic and clamps", () => {
  assert.equal(Game.tweenValue(0, 100, 0), 0)
  assert.equal(Game.tweenValue(0, 100, 1), 100)
  assert.equal(Game.tweenValue(0, 100, 0.5), Math.round(100 * (1 - Math.pow(0.5, 3))))
  assert.equal(Game.tweenValue(0, 100, -0.5), 0)
  assert.equal(Game.tweenValue(0, 100, 1.5), 100)
  assert.equal(Game.tweenValue(100, 0, 0), 100)
  assert.equal(Game.tweenValue(100, 0, 1), 0)
})

test("isNewBest compares against the previous best", () => {
  assert.equal(Game.isNewBest(100, { best: 120 }), true)
  assert.equal(Game.isNewBest(120, { best: 120 }), false)
  assert.equal(Game.isNewBest(120, { best: 100 }), false)
})

// --- 17b. same-game identity (Phase 4 Unit 12 fix) ------------------------

test("sameGame identifies a game by its startedAt timestamp", () => {
  // Same startedAt but different cells/score/moves -> the same ongoing game.
  assert.equal(
    Game.sameGame(
      stateWith([2, 0, 0, 0], { startedAt: 1000 }),
      stateWith([2, 2, 0, 0], { startedAt: 1000, score: 4, moves: 3 })
    ),
    true
  )
  // A different startedAt is a different game (a new game, or another monitor's R).
  assert.equal(
    Game.sameGame(
      stateWith([2, 0, 0, 0], { startedAt: 1000 }),
      stateWith([2, 0, 0, 0], { startedAt: 2000 })
    ),
    false
  )
  // Missing states are never the same game.
  assert.equal(Game.sameGame(null, stateWith([2, 0, 0, 0], { startedAt: 1000 })), false)
  assert.equal(Game.sameGame(stateWith([2, 0, 0, 0], { startedAt: 1000 }), null), false)
  // Two zero/unknown timestamps are treated as the same (migrated v1) game, so
  // loading one never resets the celebration.
  assert.equal(
    Game.sameGame(stateWith([2, 0, 0, 0]), stateWith([0, 2, 0, 0])),
    true
  )
})

// --- 18. swipe direction (§4.1) -------------------------------------------

test("swipeDirection picks the dominant axis above the threshold", () => {
  assert.equal(Game.swipeDirection(0, 0, 20), "")
  assert.equal(Game.swipeDirection(5, 5, 20), "")
  assert.equal(Game.swipeDirection(40, 5, 20), "right")
  assert.equal(Game.swipeDirection(-40, 5, 20), "left")
  assert.equal(Game.swipeDirection(3, -50, 20), "up")
  assert.equal(Game.swipeDirection(3, 50, 20), "down")
  // exact tie on |dx| == |dy| -> horizontal wins (documented)
  assert.equal(Game.swipeDirection(30, 30, 20), "right")
  assert.equal(Game.swipeDirection(-30, 30, 20), "left")
})

// --- 19. scores view date formatting (§5 Unit 10) -------------------------

// All timestamps are built with `new Date(...)` (local time), so the same
// calendar-day checks hold in any timezone.
test("formatEntryDate formats today, other days and the empty case", () => {
  const now = new Date(2026, 9, 9, 20, 0, 0).getTime() // 9 Oct 2026, 20:00 local
  // zero / invalid -> em dash
  assert.equal(Game.formatEntryDate(0, now), "—")
  assert.equal(Game.formatEntryDate(-5, now), "—")
  assert.equal(Game.formatEntryDate(NaN, now), "—")
  // same local calendar day -> "today HH:mm" (zero-padded 24h)
  assert.equal(Game.formatEntryDate(new Date(2026, 9, 9, 14, 35, 0).getTime(), now), "today 14:35")
  assert.equal(Game.formatEntryDate(new Date(2026, 9, 9, 0, 7, 0).getTime(), now), "today 00:07")
  // different day -> "dd MMM"
  assert.equal(Game.formatEntryDate(new Date(2026, 9, 5, 9, 5, 0).getTime(), now), "05 Oct")
  // same month/day but a different year is not today
  assert.equal(Game.formatEntryDate(new Date(2025, 9, 9, 14, 35, 0).getTime(), now), "09 Oct")
  // single-digit month handling
  assert.equal(Game.formatEntryDate(new Date(2026, 0, 3, 0, 7, 0).getTime(), now), "03 Jan")
})

// =========================================================================
// Phase 5 · Unit 14 — undo and board sizes
// =========================================================================

function square(size, value) {
  const cells = []
  for (let i = 0; i < size * size; i++) cells.push(value)
  return cells
}

// A full, playable single-game state for a given size. Mirrors stateWith but
// carries the v3 undo/profile fields so copyState sees a complete object.
function playing(cells, size, extra) {
  return Object.assign(
    {
      version: 3,
      size,
      cells: cells.slice(),
      score: 0,
      best: 0,
      moves: 0,
      status: "playing",
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
    },
    extra || {}
  )
}

function snapshotOf(cells, score, moves) {
  return { cells: cells.slice(), score, moves, status: "playing", keepPlaying: false }
}

// --- 20. board sizes (N×N) -----------------------------------------------

test("emptyState builds an N×N board for every supported size", () => {
  same(Game.SUPPORTED_SIZES, [3, 4, 5, 6, 7, 8])
  for (const size of Game.SUPPORTED_SIZES) {
    const state = Game.emptyState(0, size)
    assert.equal(state.version, 3)
    assert.equal(state.size, size)
    assert.equal(state.cells.length, size * size)
    assert.equal(state.cells.filter((v) => v !== 0).length, 0)
    assert.equal(state.history.length, 0)
    assert.equal(state.assisted, false)
  }
  assert.equal(Game.emptyState(0).size, 4, "the default size stays 4×4")
  assert.equal(Game.emptyState(0).cells.length, 16)
})

test("slideLine works on any line length", () => {
  const three = Game.slideLine([2, 2, 2])
  same(three.line, [4, 2, 0])
  assert.equal(three.gain, 4)
  const five = Game.slideLine([2, 0, 2, 2, 2])
  same(five.line, [4, 4, 0, 0, 0])
  assert.equal(five.gain, 8)
  same(five.sources, [[0, 2], [3, 4], [], [], []])
})

test("move left on a 3×3 board merges and spawns", () => {
  const start = playing([2, 0, 2, 2, 2, 0, 0, 0, 0], 3)
  const res = Game.move(start, "left", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  const cells = res.state.cells.slice()
  cells[res.state.spawned] = 0
  same(cells, [4, 0, 0, 4, 0, 0, 0, 0, 0])
  assert.equal(res.state.score, 8)
  assert.equal(res.state.size, 3)
  assert.equal(res.state.history.length, 1)
  assert.equal(res.state.history[0].score, 0)
})

test("move up on a 5×5 board fills, merges and reports transitions", () => {
  const cells = square(5, 0)
  cells[0] = 2
  cells[5] = 2
  const start = playing(cells, 5)
  const res = Game.move(start, "up", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  assert.equal(res.state.cells[0], 4)
  assert.equal(res.state.score, 4)
  // both tiles came from the first column and landed on cell 0
  assert.equal(res.state.transitions.filter((t) => t.to === 0).length, 2)
})

test("move down on a 6×6 board packs the bottom row", () => {
  const cells = square(6, 0)
  // both 2s sit in column 1 (row 0 -> index 1, row 1 -> index 7)
  cells[1] = 2
  cells[7] = 2
  const start = playing(cells, 6)
  const res = Game.move(start, "down", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  assert.equal(res.state.size, 6)
  assert.equal(res.state.cells[5 * 6 + 1], 4, "column 1 packs and merges at the bottom")
})

test("an 8×8 board moves and spawns without overflowing its index range", () => {
  const cells = square(8, 0)
  cells[0] = 2
  cells[1] = 2
  const start = playing(cells, 8)
  const res = Game.move(start, "left", seq(0.5, 0.5))
  assert.equal(res.moved, true)
  assert.equal(res.state.cells.length, 64)
  assert.equal(res.state.cells[0], 4)
  assert.ok(res.state.spawned >= 0 && res.state.spawned < 64)
})

test("canMove understands N×N boards", () => {
  assert.equal(Game.canMove([2, 4, 2, 4, 2, 4, 2, 4, 2]), false)
  assert.equal(Game.canMove([2, 4, 2, 4, 2, 4, 2, 4, 0]), true)
  assert.equal(Game.canMove([2, 2, 4, 8, 16, 32, 64, 128, 256]), true)
  // 16-cell behaviour is unchanged
  assert.equal(Game.canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]), false)
  assert.equal(Game.canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 0]), true)
})

test("newGame on a 6×6 board spawns two tiles and keeps best", () => {
  const game = Game.newGame(7, seq(0, 0.5, 0, 0.5), 1000, [], 6)
  assert.equal(game.size, 6)
  assert.equal(game.cells.length, 36)
  assert.equal(game.cells.filter((v) => v !== 0).length, 2)
  assert.equal(game.best, 7)
  assert.equal(game.startedAt, 1000)
})

test("startNewGame stays on its own board size", () => {
  const state = playing([2, 2, 0, 0, 0, 0, 0, 0, 0], 3, { score: 4, best: 9, moves: 1 })
  const next = Game.startNewGame(state, seq(0, 0.5, 0, 0.5), 5000)
  assert.equal(next.size, 3)
  assert.equal(next.cells.length, 9)
  assert.equal(next.best, 9)
  assert.equal(next.history.length, 0)
})

test("parseState rejects an unsupported board size", () => {
  const base = {
    version: 3,
    size: 9,
    cells: square(9, 0),
    score: 0,
    best: 0,
    moves: 0,
    status: "playing",
    keepPlaying: false
  }
  assert.equal(Game.parseState(JSON.stringify(base)), null)
  assert.equal(Game.parseState(JSON.stringify(Object.assign({}, base, { size: 4, cells: square(4, 0) }))) !== null, true)
})

// --- 21. undo ring --------------------------------------------------------

test("defaultSettings returns the documented defaults", () => {
  const defaults = settings()
  same(Game.defaultSettings(), defaults)
  same(Game.sanitizeSettings(null), defaults)
  same(Game.sanitizeSettings({ allowUndo: false, undoLimit: 3 }), settings({ allowUndo: false, undoLimit: 3 }))
  same(Game.sanitizeSettings({ allowUndo: "yes", undoLimit: 5 }), defaults)
})

test("pushHistory keeps the last 50 snapshots (ring bound)", () => {
  assert.equal(Game.UNDO_RING, 50)
  let history = []
  for (let i = 0; i < 60; i++) {
    history = Game.pushHistory(history, snapshotOf([i, 0, 0, 0], i, i))
  }
  assert.equal(history.length, 50)
  assert.equal(history[0].score, 10, "the oldest ten were dropped")
  assert.equal(history[49].score, 59, "the newest snapshot is at the end")
})

test("undo restores the board, score and moves and marks the game assisted", () => {
  const start = playing([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4)
  const moved = Game.move(start, "left", seq(0.5, 0.5))
  assert.equal(moved.moved, true)
  assert.equal(moved.state.history.length, 1)
  const back = Game.undo(moved.state, Game.defaultSettings())
  assert.equal(back.undone, true)
  same(back.state.cells, start.cells)
  assert.equal(back.state.score, start.score)
  assert.equal(back.state.moves, start.moves)
  assert.equal(back.state.assisted, true)
  assert.equal(back.state.undoCount, 1)
  assert.equal(back.state.history.length, 0)
})

test("undo is a no-op on an empty history and never mutates its input", () => {
  const start = playing(square(4, 0), 4)
  const before = JSON.stringify(start)
  const result = Game.undo(start, Game.defaultSettings())
  assert.equal(result.undone, false)
  same(result.state.cells, start.cells)
  assert.equal(JSON.stringify(start), before)
})

test("undo honours Allow undo and the 3-per-game limit", () => {
  const st = playing(square(4, 0), 4, {
    score: 12,
    moves: 3,
    history: [
      snapshotOf(square(4, 0), 0, 0),
      snapshotOf(square(4, 0), 4, 1),
      snapshotOf(square(4, 0), 8, 2)
    ]
  })
  assert.equal(Game.undo(st, { allowUndo: false, undoLimit: "unlimited" }).undone, false)
  let current = st
  for (let i = 0; i < 3; i++) {
    const step = Game.undo(current, { allowUndo: true, undoLimit: 3 })
    assert.equal(step.undone, true, `undo ${i + 1} allowed`)
    current = step.state
  }
  assert.equal(current.undoCount, 3)
  const blocked = Game.undo(current, { allowUndo: true, undoLimit: 3 })
  assert.equal(blocked.undone, false, "the fourth undo is blocked")
})

test("canUndo reflects history, the setting and the limit", () => {
  const one = { history: [snapshotOf(square(4, 0), 0, 0)] }
  assert.equal(Game.canUndo(playing(square(4, 0), 4, one), Game.defaultSettings()), true)
  assert.equal(Game.canUndo(playing(square(4, 0), 4, one), { allowUndo: false, undoLimit: "unlimited" }), false)
  assert.equal(Game.canUndo(playing(square(4, 0), 4), Game.defaultSettings()), false)
  assert.equal(Game.canUndo(playing(square(4, 0), 4, { history: one.history, undoCount: 2 }), { allowUndo: true, undoLimit: 3 }), true)
  assert.equal(Game.canUndo(playing(square(4, 0), 4, { history: one.history, undoCount: 3 }), { allowUndo: true, undoLimit: 3 }), false)
})

test("undo out of a game over un-records the game and returns to playing", () => {
  const start = playing([8, 16, 32, 0, 8, 16, 32, 64, 16, 32, 64, 128, 32, 64, 128, 256], 4, {
    score: 300,
    moves: 10
  })
  const ended = Game.move(start, "right", seq(0.5, 0.5), 7000)
  assert.equal(ended.state.status, "over")
  assert.equal(ended.state.recorded, true)
  assert.equal(ended.state.leaderboard.length, 1)
  const back = Game.undo(ended.state, Game.defaultSettings())
  assert.equal(back.undone, true)
  assert.equal(back.state.status, "playing")
  assert.equal(back.state.recorded, false)
  assert.equal(back.state.lastRecordedAt, 0)
  assert.equal(back.state.lastRank, 0)
  same(back.state.leaderboard, [], "the recorded entry is removed")
  assert.equal(back.state.best, 300, "best stays at the value that was earned")
})

test("undo out of the win card returns to before the winning move", () => {
  const start = playing([1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4)
  const won = Game.move(start, "left", seq(0.5, 0.5))
  assert.equal(won.state.status, "won")
  const back = Game.undo(won.state, Game.defaultSettings())
  assert.equal(back.undone, true)
  assert.equal(back.state.status, "playing")
  assert.equal(back.state.cells[0], 1024)
  assert.equal(back.state.assisted, true)
})

test("an assisted game never records to the leaderboard", () => {
  const start = playing([8, 16, 32, 0, 8, 16, 32, 64, 16, 32, 64, 128, 32, 64, 128, 256], 4, {
    score: 300,
    moves: 10,
    assisted: true
  })
  const ended = Game.move(start, "right", seq(0.5, 0.5), 7000)
  assert.equal(ended.state.status, "over")
  assert.equal(ended.state.recorded, false)
  assert.equal(ended.state.leaderboard.length, 0)
})

test("startNewGame resets the undo history and the assisted flag", () => {
  const state = playing([2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4, {
    score: 12,
    best: 50,
    moves: 3,
    history: [snapshotOf(square(4, 0), 0, 0)],
    assisted: true,
    undoCount: 2
  })
  const next = Game.startNewGame(state, seq(0, 0.5, 0, 0.5), 5000)
  assert.equal(next.history.length, 0)
  assert.equal(next.assisted, false)
  assert.equal(next.undoCount, 0)
  assert.equal(next.best, 50)
})

test("tileFontFactor shrinks with the board size and the label length", () => {
  assert.ok(Game.tileFontFactor(2, 4) > Game.tileFontFactor(2, 8))
  assert.ok(Game.tileFontFactor(2, 4) > Game.tileFontFactor(131072, 4))
  assert.ok(Game.tileFontFactor(131072, 8) > 0)
  assert.equal(Game.tileFontFactor(2, 3) > Game.tileFontFactor(2, 4), true)
  // The label length is the abbreviated one: "131k" (4) is smaller than "16k" (3),
  // and both are larger than a raw 5-6 digit number at 8x8 would have been.
  assert.ok(Math.abs(Game.tileFontFactor(131072, 8) - 1.05 * 0.5) < 1e-9)
  assert.ok(Math.abs(Game.tileFontFactor(16384, 8) - 1.3 * 0.5) < 1e-9)
  assert.ok(Game.tileFontFactor(131072, 8) > 0.85 * 0.5, "abbreviation beats the old tiny 5-6 digit factor")
})

// --- 22. profile persistence and migration --------------------------------

test("emptyProfile carries every supported size and default settings", () => {
  const profile = Game.emptyProfile()
  assert.equal(profile.version, 3)
  assert.equal(profile.activeSize, 4)
  for (const size of Game.SUPPORTED_SIZES) {
    const game = profile.sizes[String(size)]
    assert.equal(game.size, size)
    assert.equal(game.cells.length, size * size)
    same(game.leaderboard, [])
  }
  same(profile.settings, settings())
})

test("setActiveSize/cycleSize switch boards and wrap around", () => {
  const profile = Game.emptyProfile()
  const eight = Game.setActiveSize(profile, 8)
  assert.equal(eight.activeSize, 8)
  assert.equal(Game.activeGame(eight).size, 8)
  assert.equal(Game.cycleSize(8, 1), 3, "wraps forward 8 -> 3")
  assert.equal(Game.cycleSize(3, -1), 8, "wraps back 3 -> 8")
  assert.equal(Game.cycleSize(4, 1), 5)
  assert.equal(Game.setActiveSize(profile, 9).activeSize, 4, "unsupported size is ignored")
})

test("setGame replaces only the matching size and keeps the rest", () => {
  const profile = Game.emptyProfile()
  const big = Game.newGame(0, seq(0, 0.5, 0, 0.5), 100, [], 8)
  const next = Game.setGame(profile, big)
  assert.equal(next.sizes["8"].cells.length, 64)
  assert.equal(next.sizes["4"].cells.length, 16)
  assert.equal(next.activeSize, 4, "setGame does not change the active size")
})

test("serializeProfile round-trips the active game, history and settings", () => {
  let profile = Game.emptyProfile()
  const start = playing([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4)
  const moved = Game.move(start, "left", seq(0.5, 0.5))
  profile = Game.setGame(profile, moved.state)
  profile = Game.updateSettings(profile, { undoLimit: 3 })
  const text = Game.serializeProfile(profile)
  const back = Game.parseProfile(text)
  assert.equal(back.activeSize, 4)
  same(back.settings, settings({ undoLimit: 3 }))
  const game = Game.activeGame(back)
  same(game.cells, moved.state.cells)
  assert.equal(game.best, moved.state.best)
  assert.equal(game.history.length, 1)
})

test("parseProfile migrates a version 2 single game losslessly", () => {
  const v2 = JSON.stringify({
    version: 2,
    size: 4,
    cells: [0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    score: 0,
    best: 2864,
    moves: 0,
    status: "playing",
    keepPlaying: false,
    startedAt: 1791734347124,
    recorded: false,
    lastRank: 3,
    lastRecordedAt: 1791734346347,
    leaderboard: [
      { score: 2300, maxTile: 256, moves: 189, endedAt: 1791600504039, won: false },
      { score: 2224, maxTile: 256, moves: 186, endedAt: 1791602863738, won: false }
    ]
  })
  const profile = Game.parseProfile(v2)
  assert.equal(profile.activeSize, 4)
  const game = profile.sizes["4"]
  assert.equal(game.best, 2864)
  assert.equal(game.startedAt, 1791734347124)
  assert.equal(game.leaderboard.length, 2)
  assert.equal(game.leaderboard[0].score, 2300)
  assert.equal(profile.sizes["3"].cells.length, 9, "every other size is a fresh board")
})

test("parseProfile migrates a version 1 single game", () => {
  const v1 = JSON.stringify({ version: 1, size: 4, cells: square(4, 0), score: 5, best: 5, moves: 2, status: "playing", keepPlaying: false })
  const profile = Game.parseProfile(v1)
  assert.equal(profile.sizes["4"].best, 5)
  assert.equal(profile.sizes["4"].startedAt, 0)
})

test("parseProfile rejects garbage, oversize text and a v3 object with no sizes", () => {
  assert.equal(Game.parseProfile(""), null)
  assert.equal(Game.parseProfile("not json"), null)
  assert.equal(Game.parseProfile("x".repeat(65537)), null)
  assert.equal(Game.parseProfile(JSON.stringify({ version: 3 })), null)
})

test("serializeProfile stays under MAX_STATE_BYTES for worst-case content", () => {
  let profile = Game.emptyProfile()
  for (const size of Game.SUPPORTED_SIZES) {
    const cells = square(size, 131072)
    const history = []
    for (let i = 0; i < 50; i++) history.push(snapshotOf(cells, 1e9, 1e6))
    const leaderboard = []
    for (let i = 0; i < 10; i++) leaderboard.push({ score: 1e9 - i, maxTile: 131072, moves: 1e6, endedAt: 1e13 - i, won: true })
    profile = Game.setGame(profile, {
      version: 3, size, cells, score: 1e9, best: 1e9, moves: 1e6, status: "playing",
      keepPlaying: false, startedAt: 1e13, recorded: false, lastRank: 0, lastRecordedAt: 0,
      leaderboard, history, undoCount: 0, assisted: false
    })
  }
  const text = Game.serializeProfile(profile)
  assert.ok(text.length <= 65536, `serialized ${text.length} chars, cap 65536`)
  const back = Game.parseProfile(text)
  assert.equal(back.sizes["8"].best, 1e9, "the board survived the trim")
  assert.equal(back.sizes["8"].leaderboard.length, 10, "the leaderboard survived the trim")
})

// =========================================================================
// Phase 5 · Unit 15 — feel: abbreviated tiles, combo, glow, motion, sound
// =========================================================================

// --- 23. abbreviated tile labels ------------------------------------------

test("abbreviateTile shortens tiles from 10,000 up", () => {
  const table = [
    [0, "0"],
    [2, "2"],
    [2048, "2048"],
    [8192, "8192"],
    [9999, "9999"],
    [10000, "10k"],
    [16384, "16k"],
    [20480, "20k"],
    [32768, "32k"],
    [65536, "65k"],
    [131072, "131k"]
  ]
  for (const [value, label] of table) {
    assert.equal(Game.abbreviateTile(value), label, `abbreviateTile(${value})`)
  }
  // garbage never throws and degrades to "0"
  assert.equal(Game.abbreviateTile(undefined), "0")
  assert.equal(Game.abbreviateTile(NaN), "0")
})

test("tileFontFactor reads the abbreviated label, not the raw digits", () => {
  // "131k" (4 chars) and "16k" (3 chars) instead of 6 and 5 raw digits
  assert.ok(Math.abs(Game.tileFontFactor(131072, 8) - 1.05 * 0.5) < 1e-9)
  assert.ok(Math.abs(Game.tileFontFactor(16384, 8) - 1.3 * 0.5) < 1e-9)
  assert.ok(Game.tileFontFactor(131072, 8) > 0.85 * 0.5, "big tiles are no longer tiny")
})

// --- 24. combo streak -----------------------------------------------------

test("emptyState starts with a zero combo", () => {
  assert.equal(Game.emptyState(0, 4).combo, 0)
  assert.equal(Game.emptyState(0, 8).combo, 0)
})

test("move increments the combo on a scoring move and resets it otherwise", () => {
  const merge = playing([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4)
  const scored = Game.move(merge, "left", seq(0.5, 0.5))
  assert.equal(scored.moved, true)
  assert.equal(scored.state.combo, 1)
  const again = Game.move(scored.state, "left", seq(0.5, 0.5))
  // the board cannot merge again after the spawn: a valid non-scoring move resets
  if (again.moved && again.state.gain === 0) {
    assert.equal(again.state.combo, 0)
  }
  const carried = playing([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], 4, { combo: 4 })
  const slide = Game.move(carried, "left", seq(0.5, 0.5))
  assert.equal(slide.moved, true)
  assert.equal(slide.state.gain, 0)
  assert.equal(slide.state.combo, 0, "a non-scoring move breaks the streak")
})

test("an invalid move leaves the combo untouched", () => {
  const stuck = playing([2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128], 4, { combo: 3 })
  const res = Game.move(stuck, "left", seq())
  assert.equal(res.moved, false)
  assert.equal(res.state.combo, 3)
})

test("undo restores the combo of the snapshot", () => {
  const start = playing([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4, { combo: 2 })
  const moved = Game.move(start, "left", seq(0.5, 0.5))
  assert.equal(moved.state.combo, 3)
  const back = Game.undo(moved.state, Game.defaultSettings())
  assert.equal(back.undone, true)
  assert.equal(back.state.combo, 2)
})

// --- 25. glow tiers -------------------------------------------------------

test("glowTier steps at 128 (1) and 1024 (2)", () => {
  assert.equal(Game.glowTier(0), 0)
  assert.equal(Game.glowTier(6), 0) // 64
  assert.equal(Game.glowTier(7), 1) // 128
  assert.equal(Game.glowTier(9), 1) // 512
  assert.equal(Game.glowTier(10), 2) // 1024
  assert.equal(Game.glowTier(11), 2) // 2048
  assert.equal(Game.glowTier(17), 2) // 131072
})

// --- 26. motion setting and sound rate ------------------------------------

test("settings carry motion and sound with safe defaults", () => {
  const defaults = settings()
  same(Game.sanitizeSettings(null), defaults)
  same(Game.sanitizeSettings({ motion: "off", sound: true }), settings({ motion: "off", sound: true }))
  same(Game.sanitizeSettings({ motion: "reduced" }), settings({ motion: "reduced" }))
  same(Game.sanitizeSettings({ motion: "sideways", sound: "yes" }), defaults)
})

test("motion helpers gate animations", () => {
  assert.equal(Game.MOTION_FULL, "full")
  assert.equal(Game.MOTION_REDUCED, "reduced")
  assert.equal(Game.MOTION_OFF, "off")
  assert.equal(Game.motionEnabled({ motion: "full" }), true)
  assert.equal(Game.motionEnabled({ motion: "reduced" }), true)
  assert.equal(Game.motionEnabled({ motion: "off" }), false)
  assert.equal(Game.motionFull({ motion: "full" }), true)
  assert.equal(Game.motionFull({ motion: "reduced" }), false)
  assert.equal(Game.motionFull({ motion: "off" }), false)
})

test("soundRate rises with the tile value and is clamped", () => {
  assert.ok(Game.soundRate(4) < Game.soundRate(64))
  assert.ok(Game.soundRate(64) < Game.soundRate(1024))
  assert.ok(Game.soundRate(1024) < Game.soundRate(131072))
  assert.ok(Game.soundRate(4) >= 22050)
  assert.ok(Game.soundRate(131072) <= 96000)
  assert.equal(Game.soundRate(0), Game.soundRate(2), "below 4 clamps to the floor")
})

// --- 27. persistence of the new fields ------------------------------------

test("the profile round-trips combo, motion and sound", () => {
  let profile = Game.emptyProfile()
  const move = Game.move(playing([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4), "left", seq(0.5, 0.5))
  profile = Game.setGame(profile, move.state)
  profile = Game.updateSettings(profile, { motion: "reduced", sound: true })
  const back = Game.parseProfile(Game.serializeProfile(profile))
  same(back.settings, settings({ motion: "reduced", sound: true }))
  assert.equal(Game.activeGame(back).combo, 1)
})

test("parseProfile fills motion, sound and combo for older payloads", () => {
  const payload = {
    version: 3,
    activeSize: 4,
    settings: { allowUndo: true, undoLimit: "unlimited" },
    sizes: {
      "4": { version: 3, size: 4, cells: square(4, 0), score: 0, best: 0, moves: 0, status: "playing", keepPlaying: false }
    }
  }
  const profile = Game.parseProfile(JSON.stringify(payload))
  same(profile.settings, settings())
  assert.equal(profile.sizes["4"].combo, 0)
})

test("serializeProfile still stays under MAX_STATE_BYTES with combo included", () => {
  let profile = Game.emptyProfile()
  for (const size of Game.SUPPORTED_SIZES) {
    const cells = square(size, 131072)
    const history = []
    for (let i = 0; i < 50; i++) history.push(snapshotOf(cells, 1e9, 1e6))
    profile = Game.setGame(profile, {
      version: 3, size, cells, score: 1e9, best: 1e9, moves: 1e6, status: "playing",
      keepPlaying: false, startedAt: 1e13, recorded: false, lastRank: 0, lastRecordedAt: 0,
      leaderboard: [], history, undoCount: 0, assisted: false, combo: 7
    })
  }
  assert.ok(Game.serializeProfile(profile).length <= 65536)
})

// =========================================================================
// Phase 5 · Unit 16 — stats, achievements, daily challenge
// =========================================================================

function tiles(size, pairs) {
  const cells = new Array(size * size).fill(0)
  for (const [i, v] of pairs) cells[i] = v
  return cells
}

// --- 28. stats ------------------------------------------------------------

test("emptyStats is zeroed with an 8-bucket histogram", () => {
  same(Game.emptyStats(), {
    games: 0, wins: 0, bestScore: 0, bestTile: 0, moves: 0,
    scoreSum: 0, streak: 0, longestStreak: 0, timeMs: 0,
    histogram: [0, 0, 0, 0, 0, 0, 0, 0]
  })
  assert.equal(Game.HISTOGRAM_SIZE, 8)
})

test("histogramBucket buckets scores into 8 ranges", () => {
  assert.equal(Game.histogramBucket(0), 0)
  assert.equal(Game.histogramBucket(999), 0)
  assert.equal(Game.histogramBucket(1000), 1)
  assert.equal(Game.histogramBucket(1999), 1)
  assert.equal(Game.histogramBucket(2000), 2)
  assert.equal(Game.histogramBucket(8000), 4)
  assert.equal(Game.histogramBucket(64000), 7)
  assert.equal(Game.histogramBucket(1e9), 7)
  assert.equal(Game.histogramBucket(-5), 0)
})

test("applyGameToStats accumulates games, wins, streak, best, moves and time", () => {
  let stats = Game.emptyStats()
  const won = playing(tiles(4, [[0, 2048]]), 4, { status: "over", score: 2048, moves: 90, startedAt: 1000 })
  stats = Game.applyGameToStats(stats, won, 6000)
  assert.equal(stats.games, 1)
  assert.equal(stats.wins, 1)
  assert.equal(stats.streak, 1)
  assert.equal(stats.longestStreak, 1)
  assert.equal(stats.bestScore, 2048)
  assert.equal(stats.bestTile, 2048)
  assert.equal(stats.moves, 90)
  assert.equal(stats.scoreSum, 2048)
  assert.equal(stats.timeMs, 5000)
  assert.equal(stats.histogram[2], 1)

  const lost = playing(tiles(4, [[0, 256]]), 4, { status: "over", score: 400, moves: 20, startedAt: 0 })
  stats = Game.applyGameToStats(stats, lost, 0)
  assert.equal(stats.games, 2)
  assert.equal(stats.wins, 1)
  assert.equal(stats.streak, 0, "a loss resets the streak")
  assert.equal(stats.longestStreak, 1)
  assert.equal(stats.bestTile, 2048)
  assert.equal(stats.scoreSum, 2448)
  assert.equal(stats.timeMs, 5000, "a zero startedAt adds no time")
  assert.equal(stats.histogram[0], 1)
})

test("recordStats updates the per-size and the overall stats", () => {
  let profile = Game.emptyProfile()
  const won = playing(tiles(4, [[0, 2048]]), 4, { status: "over", score: 2048, moves: 90, startedAt: 1000 })
  profile = Game.recordStats(profile, 4, won, 6000)
  assert.equal(profile.stats.sizes["4"].games, 1)
  assert.equal(profile.stats.overall.games, 1)
  const other = playing(square(8, 0), 8, { status: "over", score: 100, moves: 5 })
  profile = Game.recordStats(profile, 8, other, 7000)
  assert.equal(profile.stats.sizes["8"].games, 1)
  assert.equal(profile.stats.sizes["4"].games, 1)
  assert.equal(profile.stats.overall.games, 2)
})

test("winRate and averageScore derive from the counters", () => {
  let stats = Game.emptyStats()
  assert.equal(Game.winRate(stats), 0)
  assert.equal(Game.averageScore(stats), 0)
  stats = Game.applyGameToStats(stats, playing(tiles(4, [[0, 2048]]), 4, { status: "over", score: 2000, moves: 1 }), 1)
  stats = Game.applyGameToStats(stats, playing(tiles(4, [[0, 4]]), 4, { status: "over", score: 1000, moves: 1 }), 2)
  stats = Game.applyGameToStats(stats, playing(tiles(4, [[0, 4]]), 4, { status: "over", score: 1024, moves: 1 }), 3)
  assert.equal(stats.games, 3)
  assert.equal(stats.wins, 1)
  assert.ok(Math.abs(Game.winRate(stats) - (1 / 3)) < 1e-9)
  assert.equal(Game.averageScore(stats), Math.round((2000 + 1000 + 1024) / 3))
})

// --- 29. achievements -----------------------------------------------------

test("ACHIEVEMENTS lists the eight ids with a title and description", () => {
  same(Game.ACHIEVEMENTS.map((a) => a.id), [
    "first512", "first1024", "first2048", "first4096",
    "win_no_undo", "win_swift", "streak5", "comeback"
  ])
  for (const achievement of Game.ACHIEVEMENTS) {
    assert.ok(achievement.title.length > 0)
    assert.ok(achievement.description.length > 0)
  }
})

test("achievementIdsFor reports the tile thresholds and win conditions", () => {
  const big = playing(tiles(4, [[0, 4096]]), 4, { moves: 120 })
  const ids = Game.achievementIdsFor(big, Game.emptyStats())
  assert.ok(ids.indexOf("first512") !== -1)
  assert.ok(ids.indexOf("first1024") !== -1)
  assert.ok(ids.indexOf("first2048") !== -1)
  assert.ok(ids.indexOf("first4096") !== -1)
  assert.ok(ids.indexOf("win_no_undo") !== -1)
  assert.ok(ids.indexOf("win_swift") === -1, "120 moves is not swift")

  const assisted = playing(tiles(4, [[0, 2048]]), 4, { moves: 40, assisted: true })
  const assistedIds = Game.achievementIdsFor(assisted, Game.emptyStats())
  assert.ok(assistedIds.indexOf("win_no_undo") === -1, "an assisted win is not clean")
  assert.ok(assistedIds.indexOf("win_swift") !== -1)

  const crowded = playing(square(4, 2), 4, { moves: 10 })
  crowded.cells[0] = 2048
  assert.ok(Game.achievementIdsFor(crowded, Game.emptyStats()).indexOf("comeback") !== -1)

  assert.ok(Game.achievementIdsFor(playing(square(4, 0), 4), { streak: 5 }).indexOf("streak5") !== -1)
})

test("evaluateAchievements unlocks once and reports only new ids", () => {
  const profile = Game.emptyProfile()
  const game = playing(tiles(4, [[0, 512]]), 4, { moves: 10 })
  const first = Game.evaluateAchievements(profile, game)
  assert.ok(first.unlocked.indexOf("first512") !== -1)
  assert.equal(first.unlocked.length, 1)
  const second = Game.evaluateAchievements(first.profile, game)
  assert.equal(second.unlocked.length, 0, "an already unlocked badge is not reported again")
  assert.ok(second.profile.achievements.indexOf("first512") !== -1)
})

// --- 30. daily challenge --------------------------------------------------

test("dailyDateKey formats a local date and dailySeed is stable", () => {
  assert.equal(Game.dailyDateKey(new Date(2026, 9, 11, 12, 0, 0)), "2026-10-11")
  assert.equal(Game.dailyDateKey(new Date(2026, 0, 3)), "2026-01-03")
  assert.equal(Game.dailySeed("2026-10-11"), Game.dailySeed("2026-10-11"))
  assert.notEqual(Game.dailySeed("2026-10-11"), Game.dailySeed("2026-10-12"))
})

test("mulberry32 is deterministic and stays in [0,1)", () => {
  const a = Game.mulberry32(12345)
  const b = Game.mulberry32(12345)
  const first = [a(), a(), a()]
  assert.deepEqual(first, [b(), b(), b()])
  for (const v of first) assert.ok(v >= 0 && v < 1)
  assert.notEqual(Game.mulberry32(999)(), first[0])
})

test("newDailyGame is deterministic for a date", () => {
  const one = Game.newDailyGame("2026-10-11", 1000)
  const two = Game.newDailyGame("2026-10-11", 1000)
  assert.equal(JSON.stringify(one.cells), JSON.stringify(two.cells))
  assert.equal(one.size, 4)
  assert.equal(one.cells.filter((v) => v !== 0).length, 2)
  assert.notEqual(JSON.stringify(one.cells), JSON.stringify(Game.newDailyGame("2026-10-12", 1000).cells))
})

test("the daily flow starts, finishes and keeps a capped history", () => {
  let profile = Game.emptyProfile()
  assert.equal(Game.dailyStatus(profile, "2026-10-11"), "available")
  profile = Game.startDaily(profile, "2026-10-11", 1000)
  assert.equal(Game.dailyStatus(profile, "2026-10-11"), "playing")
  assert.ok(Game.dailyGame(profile) !== null)
  const over = Game.dailyGame(profile)
  over.status = "over"
  over.score = 8412
  over.moves = 300
  profile = Game.setDailyGame(profile, over)
  const done = Game.finishDaily(profile, 5000)
  assert.equal(done.finished, true)
  assert.equal(Game.dailyStatus(done.profile, "2026-10-11"), "done")
  assert.equal(done.result.score, 8412)
  assert.equal(done.profile.daily.history.length, 1)
  assert.equal(Game.dailyStatus(done.profile, "2026-10-12"), "available", "a new day is available")
})

test("dailyShareText matches the documented format", () => {
  assert.equal(Game.dailyShareText({ date: "2026-10-11", score: 8412, maxTile: 1024 }), "2048 Daily 2026-10-11 · 8,412 · 1024")
  assert.equal(Game.groupThousands(0), "0")
  assert.equal(Game.groupThousands(1024), "1,024")
  assert.equal(Game.groupThousands(1000000), "1,000,000")
})

test("the profile round-trips stats, achievements and daily", () => {
  let profile = Game.emptyProfile()
  profile = Game.recordStats(profile, 4, playing(tiles(4, [[0, 2048]]), 4, { status: "over", score: 2048, moves: 100, startedAt: 1 }), 6000)
  profile = Game.evaluateAchievements(profile, playing(tiles(4, [[0, 512]]), 4)).profile
  profile = Game.startDaily(profile, "2026-10-11", 1000)
  const back = Game.parseProfile(Game.serializeProfile(profile))
  assert.equal(back.stats.sizes["4"].games, 1)
  assert.equal(back.stats.overall.games, 1)
  assert.ok(back.achievements.indexOf("first512") !== -1)
  assert.equal(back.daily.date, "2026-10-11")
  assert.ok(back.daily.game !== null)
  assert.equal(back.daily.game.cells.length, 16)
})

test("parseProfile fills stats, achievements and daily for older payloads", () => {
  const payload = {
    version: 3, activeSize: 4,
    settings: { allowUndo: true, undoLimit: "unlimited", motion: "full", sound: false },
    sizes: { "4": { version: 3, size: 4, cells: square(4, 0), score: 0, best: 0, moves: 0, status: "playing", keepPlaying: false } }
  }
  const profile = Game.parseProfile(JSON.stringify(payload))
  assert.equal(profile.stats.overall.games, 0)
  assert.equal(profile.stats.sizes["8"].histogram.length, 8)
  same(profile.achievements, [])
  assert.equal(profile.daily.date, "")
  assert.equal(Game.dailyGame(profile), null)
})

test("formatDuration formats mm:ss and h:mm:ss", () => {
  assert.equal(Game.formatDuration(0), "0:00")
  assert.equal(Game.formatDuration(65000), "1:05")
  assert.equal(Game.formatDuration(600000), "10:00")
  assert.equal(Game.formatDuration(3661000), "1:01:01")
  assert.equal(Game.formatDuration(-5), "0:00")
})

// --- 31. achievement closure (Unit 16 review fix) -------------------------

test("a win-type achievement needs a 2048 tile in the same game", () => {
  const near = playing(tiles(4, [[0, 512], [1, 512]]), 4, { moves: 40 })
  const nearIds = Game.achievementIdsFor(near, Game.emptyStats())
  assert.ok(nearIds.indexOf("win_no_undo") === -1)
  assert.ok(nearIds.indexOf("win_swift") === -1)
  assert.ok(nearIds.indexOf("comeback") === -1)
  // a crowded non-winning board must not trigger comeback either
  assert.ok(Game.achievementIdsFor(playing(square(4, 2), 4, { moves: 40 }), Game.emptyStats()).indexOf("comeback") === -1)
  // a winning board does
  const wonIds = Game.achievementIdsFor(playing(tiles(4, [[0, 2048]]), 4, { moves: 40 }), Game.emptyStats())
  assert.ok(wonIds.indexOf("win_no_undo") !== -1)
  assert.ok(wonIds.indexOf("first2048") !== -1)
})

test("unlocking a win achievement also unlocks the 2048 tile", () => {
  const result = Game.evaluateAchievements(Game.emptyProfile(), playing(tiles(4, [[0, 2048]]), 4, { moves: 40 }))
  assert.ok(result.unlocked.indexOf("win_swift") !== -1)
  assert.ok(result.unlocked.indexOf("first2048") !== -1, "2048 comes with any win badge")
  assert.ok(result.unlocked.indexOf("first512") !== -1, "and the lower tiles")
  assert.ok(result.unlocked.indexOf("first1024") !== -1)
  assert.ok(result.profile.achievements.indexOf("first2048") !== -1)
})

test("sanitizeAchievements closes an inconsistent stored set", () => {
  // the exact shape that was wrong in the Unit 16 screenshot
  same(Game.sanitizeAchievements(["first512", "first1024", "win_swift", "comeback"]),
    ["first512", "first1024", "first2048", "win_swift", "comeback"])
  same(Game.sanitizeAchievements(["first4096"]), ["first512", "first1024", "first2048", "first4096"])
  same(Game.sanitizeAchievements(["streak5"]), ["first512", "first1024", "first2048", "streak5"])
  same(Game.sanitizeAchievements(["nope"]), [])
})

test("migration derives only the tile badges the legacy data proves", () => {
  const v2 = (maxTile) => JSON.stringify({
    version: 2, size: 4, cells: new Array(16).fill(0), score: 100, best: 2864, moves: 10,
    status: "playing", keepPlaying: false,
    leaderboard: [{ score: 2300, maxTile, moves: 189, endedAt: 1, won: false }]
  })
  same(Game.parseProfile(v2(1024)).achievements, ["first512", "first1024"])
  same(Game.parseProfile(v2(256)).achievements, [], "256 proves no tile badge")
  same(Game.parseProfile(v2(2048)).achievements, ["first512", "first1024", "first2048"])
})

test("the owner's real-shaped profile (best 2864, best tile 256) derives no badges", () => {
  const owner = JSON.stringify({
    version: 2, size: 4, cells: [0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    score: 0, best: 2864, moves: 0, status: "playing", keepPlaying: false,
    startedAt: 1791734347124, recorded: false, lastRank: 3, lastRecordedAt: 1791734346347,
    leaderboard: [
      { score: 2300, maxTile: 256, moves: 189, endedAt: 1791600504039, won: false },
      { score: 2224, maxTile: 256, moves: 186, endedAt: 1791602863738, won: false },
      { score: 1460, maxTile: 128, moves: 150, endedAt: 1791734346347, won: false },
      { score: 728, maxTile: 64, moves: 88, endedAt: 1791573032877, won: false }
    ]
  })
  const profile = Game.parseProfile(owner)
  same(profile.achievements, [], "best tile 256 is below 512")
  assert.equal(profile.sizes["4"].best, 2864, "best score still preserved")
})

// =========================================================================
// Phase 5 · Unit 17 — settings, palettes, numerals
// =========================================================================

// --- 32. size-aware abbreviation (Unit 15 carry-forward) ------------------

test("abbreviateTile drops to 1k from 1,000 on 7x7+ boards", () => {
  assert.equal(Game.abbreviateTile(1024, 8), "1k")
  assert.equal(Game.abbreviateTile(2048, 8), "2k")
  assert.equal(Game.abbreviateTile(4096, 8), "4k")
  assert.equal(Game.abbreviateTile(8192, 8), "8k")
  assert.equal(Game.abbreviateTile(512, 8), "512")
  assert.equal(Game.abbreviateTile(16384, 8), "16k")
  assert.equal(Game.abbreviateTile(1024, 7), "1k", "7x7 abbreviates too")
  // smaller boards keep the 10,000 threshold
  assert.equal(Game.abbreviateTile(1024, 4), "1024")
  assert.equal(Game.abbreviateTile(8192, 6), "8192")
  assert.equal(Game.abbreviateTile(1024), "1024", "no size keeps the old threshold")
  // on 8x8 the label is "1k" (2 chars), so the font is larger than the raw digits would give
  assert.ok(Math.abs(Game.tileFontFactor(1024, 8) - 1.6 * 0.5) < 1e-9)
  assert.ok(Game.tileFontFactor(1024, 8) > 1.05 * 0.5, "abbreviation beats the raw 4-digit factor")
})

// --- 33. numerals ---------------------------------------------------------

test("NUMERALS lists five scripts with ten digits each", () => {
  same(Game.NUMERALS.map((n) => n.id), ["western", "arabic", "devanagari", "bengali", "cjk"])
  for (const numeral of Game.NUMERALS) {
    assert.equal(numeral.digits.length, 10, numeral.id)
    assert.ok(numeral.label.length > 0)
  }
})

test("formatNumerals maps digits and passes everything else through", () => {
  assert.equal(Game.formatNumerals(16384, "western"), "16384")
  assert.equal(Game.formatNumerals(16384, "arabic"), "١٦٣٨٤")
  assert.equal(Game.formatNumerals(1024, "cjk"), "一〇二四")
  assert.equal(Game.formatNumerals(7, "devanagari"), "७")
  assert.equal(Game.formatNumerals(3, "bengali"), "৩")
  // abbreviation suffixes and separators survive
  assert.equal(Game.formatNumerals("16k", "cjk"), "一六k")
  assert.equal(Game.formatNumerals("8,412", "arabic"), "٨,٤١٢")
  // unknown script falls back to western
  assert.equal(Game.formatNumerals(5, "klingon"), "5")
  assert.equal(Game.formatNumerals(null, "cjk"), "")
})

// --- 34. palettes ---------------------------------------------------------

test("tilePaletteEntry resolves every palette", () => {
  same(Game.PALETTE_IDS, ["theme", "classic", "mono", "contrast"])
  // theme reuses the existing token table (level 4 = 16 -> accent 0.42)
  same(Game.tilePaletteEntry("theme", 4), { base: "accent", alpha: 0.42, solid: false })
  // mono is accent-only, ramping to solid
  same(Game.tilePaletteEntry("mono", 0), { base: "empty", alpha: 0.07, solid: false })
  same(Game.tilePaletteEntry("mono", 7), { base: "accent", alpha: 0.74, solid: false })
  same(Game.tilePaletteEntry("mono", 10), { base: "accent", alpha: 1.0, solid: true })
  // classic / contrast carry literal colours
  same(Game.tilePaletteEntry("classic", 3), { hex: "#f2b179", text: "#f9f6f2" })
  same(Game.tilePaletteEntry("contrast", 0), { hex: "#000000", text: "#ffffff" })
  // clamp + fallback
  same(Game.tilePaletteEntry("classic", 99), { hex: "#edc22e", text: "#f9f6f2" })
  same(Game.tilePaletteEntry("bogus", 4), { base: "accent", alpha: 0.42, solid: false })
})

// --- 35. new settings -----------------------------------------------------

test("settings carry palette, scale, numerals and confirmNew", () => {
  const defaults = settings()
  same(Game.defaultSettings(), defaults)
  same(Game.sanitizeSettings({ palette: "classic", scale: 130, numerals: "cjk", confirmNew: true }),
    settings({ palette: "classic", scale: 130, numerals: "cjk", confirmNew: true }))
  // clamps and fallbacks
  same(Game.sanitizeSettings({ scale: 200 }), settings({ scale: 100 }))
  same(Game.sanitizeSettings({ scale: 80 }), settings({ scale: 100 }))
  same(Game.sanitizeSettings({ scale: 90 }), settings({ scale: 90 }))
  same(Game.sanitizeSettings({ scale: 150 }), settings({ scale: 150 }))
  same(Game.sanitizeSettings({ palette: "nope" }), settings())
  same(Game.sanitizeSettings({ numerals: "nope" }), settings())
  same(Game.sanitizeSettings({ confirmNew: "yes" }), settings())
})

test("updateSettings merges and the profile round-trips the new settings", () => {
  let profile = Game.updateSettings(Game.emptyProfile(), { palette: "contrast", scale: 120, numerals: "bengali" })
  const back = Game.parseProfile(Game.serializeProfile(profile))
  same(back.settings, settings({ palette: "contrast", scale: 120, numerals: "bengali" }))
})

// --- 36. boards never start with no tiles (2.0.0 bugfix) ------------------

test("newProfile spawns two tiles on every size", () => {
  const profile = Game.newProfile(() => 0.5, 0)
  for (const size of Game.SUPPORTED_SIZES) {
    assert.equal(
      profile.sizes[String(size)].cells.filter((v) => v !== 0).length,
      2,
      `size ${size} starts with two tiles`
    )
  }
})

test("a migrated v2 profile spawns a board on every other size", () => {
  const v2 = JSON.stringify({
    version: 2, size: 4, cells: [0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    score: 0, best: 2864, moves: 0, status: "playing", keepPlaying: false,
    startedAt: 1, recorded: false, lastRank: 0, lastRecordedAt: 0, leaderboard: []
  })
  const profile = Game.parseProfile(v2)
  assert.equal(profile.sizes["4"].best, 2864, "the legacy 4x4 is preserved")
  for (const size of Game.SUPPORTED_SIZES) {
    assert.equal(
      profile.sizes[String(size)].cells.filter((v) => v !== 0).length,
      2,
      `size ${size} has movable tiles after migration`
    )
  }
})

test("an empty playing board self-heals on load and via healProfile", () => {
  // a v3 profile whose 5x5 is playing but has no tiles (the 2.0.0 owner file)
  const empty5 = { version: 3, size: 5, cells: square(5, 0), score: 0, best: 0, moves: 0, status: "playing", keepPlaying: false }
  const payload = { version: 3, activeSize: 5, settings: { allowUndo: true, undoLimit: "unlimited" }, sizes: { "5": empty5 } }
  const loaded = Game.parseProfile(JSON.stringify(payload))
  assert.equal(loaded.sizes["5"].cells.filter((v) => v !== 0).length, 2, "healed on load")
  const movable = Game.move(loaded.sizes["5"], "left", () => 0.5, 0)
  assert.ok(movable.moved || !movable.moved, "calling move never throws")
  // and directly
  const healed = Game.healProfile(Game.emptyProfile(), () => 0.5, 0)
  for (const size of Game.SUPPORTED_SIZES) {
    assert.equal(healed.sizes[String(size)].cells.filter((v) => v !== 0).length, 2, `size ${size} healed`)
  }
})

test("a finished board is not healed", () => {
  const profile = Game.emptyProfile()
  profile.sizes["4"] = playing(square(4, 0), 4, { status: "over", score: 100 })
  const healed = Game.healProfile(profile, () => 0.5, 0)
  same(healed.sizes["4"].cells, square(4, 0), "an over board is left alone")
  assert.equal(healed.sizes["3"].cells.filter((v) => v !== 0).length, 2, "the empty playing 3x3 is healed")
})

// --- 37. the board swipe area must not cover the win/over card buttons -----

test("isBoardInteractive only when a game is in progress on the board page", () => {
  const playing4 = playing(square(4, 0), 4, { status: "playing" })
  assert.equal(Game.isBoardInteractive(playing4, ""), true)
  // a won or over game shows the card; the swipe area must stand down so the
  // card's buttons (Keep going / Undo / New game) receive the click
  assert.equal(Game.isBoardInteractive(playing(square(4, 0), 4, { status: "won" }), ""), false)
  assert.equal(Game.isBoardInteractive(playing(square(4, 0), 4, { status: "over" }), ""), false)
  assert.equal(Game.isBoardInteractive(playing4, "stats"), false)
  assert.equal(Game.isBoardInteractive(playing4), false, "a missing view is not the board")
  assert.equal(Game.isBoardInteractive(null, ""), false)
})

test("Panel.qml gates the board swipe area so it cannot cover the card buttons", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  const at = panel.indexOf("id: boardDrag")
  assert.ok(at > -1, "boardDrag exists")
  const block = panel.slice(at, at + 400)
  assert.ok(
    /enabled:\s*Game\.isBoardInteractive\(/.test(block),
    "boardDrag must be gated by isBoardInteractive (a full-board MouseArea above the win/over card swallowed its button clicks)"
  )
})
