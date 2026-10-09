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
  assert.equal(raw.version, 2)
  const parsed = Game.parseState(text)
  same(parsed, {
    version: 2,
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
    leaderboard: []
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
  assert.equal(Game.parseState(raw({ version: 3 })), null)
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

test("parseState migrates version 1 to version 2", () => {
  const v1 = JSON.stringify({ version: 1, size: 4, cells: new Array(16).fill(0), score: 5, best: 5, moves: 2, status: "playing", keepPlaying: false })
  const parsed = Game.parseState(v1)
  assert.equal(parsed.version, 2)
  assert.equal(parsed.startedAt, 0)
  assert.equal(parsed.recorded, false)
  assert.equal(parsed.lastRank, 0)
  assert.equal(parsed.lastRecordedAt, 0)
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
