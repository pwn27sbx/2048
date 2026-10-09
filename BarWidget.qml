import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

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
  }

  // Four rounded tiles in a 2x2 grid, one in the theme accent, echoing a 2048
  // board without any game state behind it. Sized off the icon canvas so it
  // scales with the button.
  Component {
    id: tileGlyph

    Item {
      anchors.fill: parent

      readonly property real cell: Math.max(1, Math.min(width, height) * 0.40)
      readonly property real spacing: Math.max(1, Math.min(width, height) * 0.12)
      readonly property real gridSize: cell * 2 + spacing
      readonly property real originX: (width - gridSize) / 2
      readonly property real originY: (height - gridSize) / 2
      readonly property real tileRadius: Style.cornerRadius > 0 ? Math.max(1, Math.round(cell * 0.22)) : 0

      Rectangle {
        x: parent.originX
        y: parent.originY
        width: parent.cell
        height: parent.cell
        radius: parent.tileRadius
        color: button.foreground
      }

      Rectangle {
        x: parent.originX + parent.cell + parent.spacing
        y: parent.originY
        width: parent.cell
        height: parent.cell
        radius: parent.tileRadius
        color: button.foreground
      }

      Rectangle {
        x: parent.originX
        y: parent.originY + parent.cell + parent.spacing
        width: parent.cell
        height: parent.cell
        radius: parent.tileRadius
        color: button.foreground
      }

      Rectangle {
        x: parent.originX + parent.cell + parent.spacing
        y: parent.originY + parent.cell + parent.spacing
        width: parent.cell
        height: parent.cell
        radius: parent.tileRadius
        color: Color.accent
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
