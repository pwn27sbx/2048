const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs
  .readFileSync(path.join(__dirname, "..", "Game2048.js"), "utf8")
  .replace(/^\.pragma library\s*$/m, "")

const Game = { Math, Number, JSON, Array, isFinite }
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
  const parsed = Game.parseState(Game.serializeState(state))
  same(parsed, {
    version: 1,
    size: 4,
    cells: state.cells,
    score: 12,
    best: 20,
    moves: 4,
    status: "playing",
    keepPlaying: false,
    spawned: -1,
    merged: []
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
  assert.equal(Game.parseState(raw({ version: 2 })), null)
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
    [0, "empty", 0.04, false],
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
