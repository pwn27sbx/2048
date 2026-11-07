import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "helpers/icon_grid.js" as IconGrid

// Bar slot for the 2048 game. Unit 0 is scaffold only: the slot draws a 2x2
// tile glyph and toggles the popup, but carries no board or game state yet.
//
// Shape contract for the bar host: expose opened/open/close and host the
// nested Panel.qml, mirroring the first-party popup widgets.
BarWidget {
  id: root
  moduleName: "pwnsxb.2048"

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  // The open-panel indicator follows the painted icon button rather than the
  // whole slot the widget occupies.
  readonly property real openPanelIndicatorWidth: button.implicitWidth
  readonly property real openPanelIndicatorHeight: Math.max(Style.space(10), Math.round(Style.bar.iconSlot * 0.55))

  // Forwarded so this widget can stand in for the panel as the bar's popout
  // identity: Bar.requestPopout prefers closeForPopoutSwitch over close, and
  // KeyboardPanel reads popoutSwitchClosing back off its owner.
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  // Best score read from the loaded panel, used by the tooltip.
  readonly property int bestScore: panelLoader.item && panelLoader.item.game ? panelLoader.item.game.best : 0

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  IpcHandler {
    target: "pwnsxb.2048"

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    // Open a page: empty, scores, stats, achievements or daily.
    function page(name: string): void {
      if (panelLoader.item && typeof panelLoader.item.openPage === "function")
        panelLoader.item.openPage(name)
    }
    // Open the inline board-size picker.
    function picker(): void {
      if (panelLoader.item && typeof panelLoader.item.openSizePicker === "function")
        panelLoader.item.openSizePicker()
    }
  }

  // Four equal square tiles in a 2x2 grid, one in the theme accent, echoing a
  // 2048 board without any game state behind it.
  //
  // Since Omarchy 4.5 the bar measures a custom icon's painted bounds and fits
  // them to Style.bar.iconSize, so drawing fractional cells there shears the
  // glyph into unequal tiles and a wider gap. The glyph therefore declares a
  // box exactly as large as the target icon and draws whole-pixel tiles inside
  // it: the fit scale lands on 1 and every edge stays on a pixel.
  Component {
    id: tileGlyph

    Rectangle {
      id: glyph
      readonly property var grid: IconGrid.grid(Style.bar.iconSize)
      readonly property int tileRadius: Style.cornerRadius > 0 ? Math.max(1, Math.round(grid.tile * 0.2)) : 0

      // The box is the optical footprint the bar measures; it stays transparent
      // so the tiles carry all the ink.
      width: grid.size
      height: grid.size
      color: "transparent"

      Repeater {
        model: glyph.grid.rects

        delegate: Rectangle {
          required property var modelData
          required property int index
          x: modelData.x
          y: modelData.y
          width: modelData.w
          height: modelData.h
          radius: glyph.tileRadius
          color: index === 3 ? Color.accent : button.foreground
        }
      }
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    active: root.opened
    iconComponent: tileGlyph
    tooltipText: root.bestScore > 0 ? "2048 · Best " + root.bestScore : "2048"
    onPressed: root.togglePanel()
  }
}
