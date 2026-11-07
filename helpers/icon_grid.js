.pragma library

// Geometry for the bar glyph: a 2x2 board of equal square tiles with a 1px gap.
//
// Omarchy 4.5 fits a bar icon component's painted bounds to Style.bar.iconSize,
// so a component that draws fractional cells gets resampled into uneven tiles
// and a wider gap. This helper returns whole-pixel rectangles inside an
// iconSize box, which keeps the fit scale at exactly 1: the tiles stay square,
// equal and separated by one pixel at any bar size.
//
// `extent` is the target icon size in pixels; `gap` is the space between tiles.
// The grid is centred and leaves at most one spare pixel, because two equal
// whole-pixel tiles plus an odd gap can never fill an even extent exactly.
function grid(extent, gap) {
  var size = Math.max(3, Math.floor(extent))
  var spacing = Math.max(1, Math.floor(gap === undefined ? 1 : gap))
  var tile = Math.max(1, Math.floor((size - spacing) / 2))
  var span = tile * 2 + spacing
  var origin = Math.floor((size - span) / 2)
  var rects = []
  for (var row = 0; row < 2; row++) {
    for (var col = 0; col < 2; col++) {
      rects.push({
        x: origin + col * (tile + spacing),
        y: origin + row * (tile + spacing),
        w: tile,
        h: tile
      })
    }
  }
  return { size: size, tile: tile, gap: spacing, span: span, origin: origin, rects: rects }
}
