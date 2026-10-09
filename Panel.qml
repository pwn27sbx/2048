import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "Game2048.js" as Game

// 2048 game popup. Keyboard-driven panel under the bar.
//
// No persistence yet (Unit 2): the game starts from Game.newGame(0, Math.random)
// and persist() is a stub; Unit 3 wires the FileView.
Panel {
  id: root
  moduleName: "pwnsxb.2048"
  ipcTarget: "pwnsxb.2048"
  manageIpc: false

  property var anchorItem: null

  // The bar tracks the widget mounted in its slot — BarWidget.qml — not this
  // nested panel. Everything the bar identifies a panel by has to be that
  // widget: the popout coordinator compares against `slot.activeItem`, and
  // switchPanelFrom looks the slot up the same way.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  property var game: Game.newGame(0, Math.random)

  readonly property int boardGap: Style.space(6)

  function open() {
    root.controller.show()
  }

  function close() {
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function doMove(direction) {
    if (!direction) return
    var result = Game.move(root.game, direction, Math.random)
    if (!result.moved) return
    root.game = result.state
    root.persist()
  }

  function newGame() {
    root.game = Game.newGame(root.game.best, Math.random)
    root.persist()
  }

  function keepGoing() {
    root.game = Game.keepGoing(root.game)
    root.persist()
  }

  function persist() {
    // Persistence lands in Unit 3 (§5.2).
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(340))
    contentHeight: panel.fittedContentHeight(contentColumn.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) { root.doMove(Game.directionFromDelta(dx, dy)) }
      onActivateRequested: {
        if (root.game.status === Game.STATUS_OVER) root.newGame()
        else if (root.game.status === Game.STATUS_WON) root.keepGoing()
      }
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) {
        var key = text.toLowerCase()
        if (key === "w") root.doMove("up")
        else if (key === "a") root.doMove("left")
        else if (key === "s") root.doMove("down")
        else if (key === "d") root.doMove("right")
        else if (key === "r") root.newGame()
        else if (key === "c" && root.game.status === Game.STATUS_WON) root.keepGoing()
      }

      Column {
        id: contentColumn
        width: parent.width
        spacing: Style.space(12)

        // 1. Header: score / best on the left, new game on the right.
        Item {
          width: parent.width
          height: Math.max(scoreRow.implicitHeight, newGameButton.implicitHeight)

          Row {
            id: scoreRow
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(22)

            Column {
              spacing: Style.space(2)

              Text {
                text: "SCORE"
                color: Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }

              Text {
                text: root.game.score
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.title
                font.bold: true
              }
            }

            Column {
              spacing: Style.space(2)

              Text {
                text: "BEST"
                color: Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }

              Text {
                text: root.game.best
                color: Color.accent
                font.family: Style.font.family
                font.pixelSize: Style.font.title
                font.bold: true
              }
            }
          }

          Button {
            id: newGameButton
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: Style.space(34)
            height: Style.space(34)
            iconText: "󰑐"
            iconSize: Style.font.icon
            tooltipText: "New game"
            foreground: Color.foreground
            onClicked: root.newGame()
          }
        }

        // 2. Board: a square grid of 16 cells.
        Item {
          id: boardFrame
          anchors.horizontalCenter: parent.horizontalCenter
          width: Math.min(parent.width, Style.space(300))
          height: width

          readonly property real cellSize: (width - root.boardGap * 3) / 4

          BorderSurface {
            anchors.fill: parent
            color: Util.alpha(Color.foreground, 0.03)
            borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.normalBorderWidth))
            radius: Style.cornerRadius

            Grid {
              anchors.fill: parent
              columns: 4
              spacing: root.boardGap

              Repeater {
                model: 16

                Item {
                  id: cellRoot
                  required property int index

                  width: boardFrame.cellSize
                  height: boardFrame.cellSize
                  readonly property int value: root.game.cells[index]
                  readonly property int level: Game.tileLevel(value)

                  // Empty slot.
                  Rectangle {
                    anchors.fill: parent
                    radius: Style.cornerRadius > 0 ? Style.space(6) : 0
                    color: Util.alpha(Color.foreground, 0.06)
                  }

                  // Tile (only meaningful when value > 0).
                  Rectangle {
                    id: tile
                    anchors.fill: parent
                    visible: cellRoot.value > 0
                    radius: Style.cornerRadius > 0 ? Style.space(6) : 0
                    color: {
                      var L = cellRoot.level
                      if (L <= 2) return Util.alpha(Color.foreground, 0.14 + 0.06 * (L - 1))
                      if (L <= 6) return Util.alpha(Color.accent, 0.30 + 0.12 * (L - 3))
                      if (L <= 10) return Color.accent
                      return Color.urgent
                    }

                    Text {
                      anchors.centerIn: parent
                      text: cellRoot.value
                      color: cellRoot.level >= 7 ? Color.background : Color.foreground
                      font.family: Style.font.family
                      font.bold: true
                      font.pixelSize: cellRoot.level <= 6 ? Style.font.title * 1.5
                        : cellRoot.level <= 9 ? Style.font.title * 1.25
                        : Style.font.title
                    }

                    SequentialAnimation {
                      running: root.game.spawned === cellRoot.index
                        || root.game.merged.indexOf(cellRoot.index) !== -1

                      NumberAnimation {
                        target: tile
                        property: "scale"
                        from: 0.85
                        to: 1.0
                        duration: 120
                        easing.type: Easing.OutBack
                      }
                    }
                  }
                }
              }
            }
          }

          // 3. Overlay for won / over. No debug hook to reach these: Unit 3
          //    drives them by editing the state file.
          Rectangle {
            anchors.fill: parent
            visible: root.game.status === Game.STATUS_WON || root.game.status === Game.STATUS_OVER
            color: Color.popups.background
            radius: Style.cornerRadius
            border.width: Math.max(1, Style.normalBorderWidth)
            border.color: Color.popups.border

            Column {
              anchors.centerIn: parent
              spacing: Style.space(8)

              Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: root.game.status === Game.STATUS_WON ? "You made 2048!" : "No moves left"
                color: Color.foreground
                font.family: Style.font.family
                font.bold: true
                font.pixelSize: Style.font.title
              }

              Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: root.game.status === Game.STATUS_WON ? "Enter: keep going · R: new game" : "Enter or R: new game"
                color: Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }
            }
          }

          MouseArea {
            anchors.fill: parent
            onClicked: keyCatcher.forceActiveFocus()
          }
        }

        // 4. Footer hint.
        Text {
          anchors.horizontalCenter: parent.horizontalCenter
          text: "Arrows / HJKL / WASD to move · R new game · Esc close"
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
        }
      }
    }
  }
}
