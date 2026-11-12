import CoreGraphics
import Foundation
// Real OS mouse drag: drag.swift x0 y0 x1 y1 steps — presses at (x0,y0), moves to (x1,y1), releases.
let a = CommandLine.arguments.dropFirst().compactMap { Double($0) }
let (x0, y0, x1, y1, steps) = (a[0], a[1], a[2], a[3], Int(a[4]))
func post(_ type: CGEventType, _ x: Double, _ y: Double) {
  CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)?.post(tap: .cghidEventTap)
}
post(.mouseMoved, x0, y0); usleep(150_000)
post(.leftMouseDown, x0, y0); usleep(80_000)
for i in 1...steps { let t = Double(i) / Double(steps); post(.leftMouseDragged, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); usleep(8_000) }
usleep(80_000); post(.leftMouseUp, x1, y1); usleep(150_000)
