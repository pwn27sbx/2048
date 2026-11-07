const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs
  .readFileSync(path.join(__dirname, "..", "helpers", "icon_grid.js"), "utf8")
  .replace(/^\.pragma library\s*$/m, "")

const IconGrid = { Math, Number, Array, JSON, isFinite }
vm.createContext(IconGrid)
vm.runInContext(source, IconGrid, { filename: "icon_grid.js" })

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

function isWhole(value) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value
}

test("the bar glyph is four equal whole-pixel tiles with a 1px gap", () => {
  const grid = IconGrid.grid(12)
  assert.equal(grid.tile, 5)
  assert.equal(grid.gap, 1)
  assert.equal(grid.span, 11)
  assert.equal(grid.rects.length, 4)
  for (const rect of grid.rects) {
    assert.equal(rect.w, grid.tile)
    assert.equal(rect.h, grid.tile)
    assert.ok(isWhole(rect.x) && isWhole(rect.y), `tile at ${rect.x},${rect.y} is not on a whole pixel`)
  }
  // Same column pair, same row pair: no unequal rows or columns.
  assert.equal(grid.rects[0].x, grid.rects[2].x)
  assert.equal(grid.rects[1].x, grid.rects[3].x)
  assert.equal(grid.rects[0].y, grid.rects[1].y)
  assert.equal(grid.rects[2].y, grid.rects[3].y)
  // One pixel between the columns and one between the rows.
  assert.equal(grid.rects[1].x - (grid.rects[0].x + grid.rects[0].w), 1)
  assert.equal(grid.rects[2].y - (grid.rects[0].y + grid.rects[0].h), 1)
})

test("the grid is tight: it fills the icon size with at most one spare pixel", () => {
  for (let extent = 3; extent <= 32; extent++) {
    const grid = IconGrid.grid(extent)
    assert.ok(isWhole(grid.tile), `tile ${grid.tile} at extent ${extent} is fractional`)
    assert.ok(isWhole(grid.origin), `origin ${grid.origin} at extent ${extent} is fractional`)
    assert.equal(grid.span, grid.tile * 2 + grid.gap)
    assert.ok(grid.span <= extent, `grid ${grid.span} overflows extent ${extent}`)
    assert.ok(extent - grid.span <= 1, `grid ${grid.span} leaves ${extent - grid.span}px loose in ${extent}px`)
    for (const rect of grid.rects) {
      assert.ok(rect.x >= 0 && rect.y >= 0, `tile at ${rect.x},${rect.y} leaves extent ${extent}`)
      assert.ok(rect.x + rect.w <= extent && rect.y + rect.h <= extent, `tile at ${rect.x},${rect.y} overflows ${extent}`)
    }
  }
})

test("the accent tile is the bottom-right one", () => {
  const grid = IconGrid.grid(12)
  const accent = grid.rects[3]
  assert.ok(accent.x > grid.rects[0].x)
  assert.ok(accent.y > grid.rects[0].y)
  assert.equal(accent.x + accent.w, Math.max(...grid.rects.map((r) => r.x + r.w)))
  assert.equal(accent.y + accent.h, Math.max(...grid.rects.map((r) => r.y + r.h)))
})

test("an unusable extent still yields a drawable grid", () => {
  const grid = IconGrid.grid(1)
  assert.ok(grid.tile >= 1)
  assert.equal(grid.rects.length, 4)
  for (const rect of grid.rects) {
    assert.ok(isWhole(rect.x) && isWhole(rect.y) && rect.w >= 1 && rect.h >= 1)
  }
})
