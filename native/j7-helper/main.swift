#if canImport(FoundationModels)
import FoundationModels
import NaturalLanguage
#endif
import Cocoa
import ScreenCaptureKit
import IOKit.hid

func emit(_ object: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) {
        print(line); fflush(stdout)
    }
}
final class Hold {
    var code: Int64 = 61
    var down = false
    var active = false
    var timer: Timer?
    var pressedAt: Date?
    var lastTap: Date?
    var last = ""
    func send(_ name: String) { last = name; emit(["event": name]) }
    func cancel() {
        timer?.invalidate(); timer = nil
        if active { send("holdCancel") }
        down = false; active = false; pressedAt = nil; lastTap = nil
    }
    func event(_ type: CGEventType, _ event: CGEvent) {
        let key = event.getIntegerValueField(.keyboardEventKeycode)
        if type == .keyDown || key != code { cancel(); return }
        // Device-specific bits distinguish left and right while both are held.
        let masks: [Int64: UInt64] = [58:0x20,61:0x40,55:0x08,54:0x10,56:0x02,60:0x04,59:0x01,62:0x2000,63:0x800000]
        let pressed = event.flags.rawValue & (masks[code] ?? 0) != 0
        if pressed && !down {
            down = true; pressedAt = Date()
            timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: false) { [weak self] _ in
                guard let self = self, self.down else { return }
                self.active = true; self.lastTap = nil; self.send("holdStart")
            }
        } else if !pressed {
            timer?.invalidate(); down = false
            if active { send("holdEnd") }
            else if let start = pressedAt, Date().timeIntervalSince(start) < 0.2 {
                // Two quick taps with nothing in between lock a recording, like Hex.
                if let tap = lastTap, Date().timeIntervalSince(tap) < 0.35 { lastTap = nil; send("doubleTap") }
                else { lastTap = Date(); send("tap") }
            }
            active = false; pressedAt = nil
        }
    }
}
// Poll only during an opening shortcut press. This also observes releases while
// another app owns focus, without consuming keys used for dragging or screenshots.
final class ShortcutRelease {
    var timer: Timer?
    var keys: Set<CGKeyCode> = []
    var modifiers: UInt64 = 0
    var active = false
    let pressedKeys: () -> Set<CGKeyCode>
    let flags: () -> UInt64
    let released: () -> Void
    init(pressedKeys: @escaping () -> Set<CGKeyCode> = {
        let modifierKeys: Set<CGKeyCode> = [54,55,56,57,58,59,60,61,62,63]
        return Set((0..<128).map { CGKeyCode($0) }.filter {
            !modifierKeys.contains($0) && CGEventSource.keyState(.combinedSessionState, key: $0)
        })
    }, flags: @escaping () -> UInt64 = { CGEventSource.flagsState(.combinedSessionState).rawValue },
       released: @escaping () -> Void = { emit(["event":"shortcutReleased"]) }) {
        self.pressedKeys = pressedKeys; self.flags = flags; self.released = released
    }
    func start(_ names: [String]) {
        timer?.invalidate()
        let masks: [String: UInt64] = ["alt":CGEventFlags.maskAlternate.rawValue, "option":CGEventFlags.maskAlternate.rawValue,
            "command":CGEventFlags.maskCommand.rawValue, "cmd":CGEventFlags.maskCommand.rawValue,
            "commandorcontrol":CGEventFlags.maskCommand.rawValue,
            "control":CGEventFlags.maskControl.rawValue, "ctrl":CGEventFlags.maskControl.rawValue,
            "shift":CGEventFlags.maskShift.rawValue]
        modifiers = names.reduce(0) { $0 | (masks[$1.lowercased()] ?? 0) }
        keys = pressedKeys(); active = true
        check()
        if active {
            let next = Timer(timeInterval: 0.016, repeats: true) { [weak self] _ in self?.check() }
            timer = next; RunLoop.main.add(next, forMode: .common)
        }
    }
    func check() {
        guard active else { return }
        if keys.isEmpty || !keys.isSubset(of: pressedKeys()) || flags() & modifiers != modifiers {
            active = false; timer?.invalidate(); timer = nil; released()
        }
    }
}
if CommandLine.arguments.contains("--self-test") {
    let test = Hold()
    func flags(_ code: Int64, _ mask: UInt64) -> CGEvent {
        let event = CGEvent(keyboardEventSource:nil, virtualKey:CGKeyCode(code), keyDown:true)!
        event.setIntegerValueField(.keyboardEventKeycode, value:code)
        event.flags = CGEventFlags(rawValue:mask)
        return event
    }
    func wait(_ seconds: Double) { RunLoop.main.run(until:Date(timeIntervalSinceNow:seconds)) }
    test.event(.flagsChanged, flags(61,0x40))
    wait(0.1)
    precondition(!test.active)
    test.event(.keyDown,flags(18,0x40))
    wait(0.15)
    precondition(!test.active)
    test.event(.flagsChanged,flags(61,0x40))
    wait(0.25)
    precondition(test.active)
    test.event(.flagsChanged,flags(61,0))
    precondition(!test.active)
    test.event(.flagsChanged,flags(61,0x40))
    wait(0.25)
    precondition(test.active)
    test.event(.keyDown,flags(18,0x40))
    precondition(!test.active)
    test.event(.flagsChanged,flags(61,0)); test.cancel()
    // Double tap.
    test.event(.flagsChanged,flags(61,0x40)); wait(0.05); test.event(.flagsChanged,flags(61,0))
    precondition(test.last == "tap")
    wait(0.1)
    test.event(.flagsChanged,flags(61,0x40)); wait(0.05); test.event(.flagsChanged,flags(61,0))
    precondition(test.last == "doubleTap")
    // A key between the taps (⌥ 2) breaks the double tap.
    test.event(.flagsChanged,flags(61,0x40)); wait(0.05); test.event(.flagsChanged,flags(61,0))
    test.event(.keyDown,flags(19,0))
    test.event(.flagsChanged,flags(61,0x40)); wait(0.05); test.event(.flagsChanged,flags(61,0))
    precondition(test.last == "tap")
    // Taps too far apart are two single taps.
    wait(0.4)
    test.event(.flagsChanged,flags(61,0x40)); wait(0.05); test.event(.flagsChanged,flags(61,0))
    precondition(test.last == "tap")
    // The opening shortcut ends on either key or modifier release. Additional
    // screenshot keys must not end the hold, and an already-released tap ends immediately.
    var keys: Set<CGKeyCode> = [49]
    var mask = CGEventFlags.maskAlternate.rawValue
    var releases = 0
    let shortcut = ShortcutRelease(pressedKeys: { keys }, flags: { mask }, released: { releases += 1 })
    shortcut.start(["Alt"]); precondition(shortcut.active)
    keys.insert(18); shortcut.check(); precondition(shortcut.active)
    keys.remove(49); shortcut.check(); precondition(!shortcut.active && releases == 1)
    keys = [49]; shortcut.start(["Option"])
    mask = 0; shortcut.check(); precondition(!shortcut.active && releases == 2)
    keys = []; shortcut.start(["Alt"]); precondition(!shortcut.active && releases == 3)
    keys = [0]; mask = CGEventFlags.maskCommand.rawValue | CGEventFlags.maskShift.rawValue
    shortcut.start(["Command", "Shift"]); precondition(shortcut.active)
    mask = CGEventFlags.maskCommand.rawValue; shortcut.check(); precondition(!shortcut.active && releases == 4)
    print("hold self-test passed"); exit(0)
}
let hold = Hold()
let shortcutRelease = ShortcutRelease()
var tap: CFMachPort?
var spaceObserver: NSObjectProtocol?
let parentPID = getppid()
let helperPID = getpid()
var previousApplication: NSRunningApplication?
let applicationObserver = NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
) { notification in
    guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
          application.processIdentifier != parentPID,
          application.processIdentifier != helperPID else { return }
    previousApplication = application
}
func installTap() -> Bool {
    if tap != nil { return true }
    tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
        eventsOfInterest: (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)
            | (1 << CGEventType.leftMouseDown.rawValue) | (1 << CGEventType.rightMouseDown.rawValue) | (1 << CGEventType.otherMouseDown.rawValue),
        callback: { _, type, event, _ in
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                if let tap = tap { CGEvent.tapEnable(tap: tap, enable: true) }
            } else if type == .leftMouseDown || type == .rightMouseDown || type == .otherMouseDown {
                emit(["event":"pointerDown", "x":event.location.x, "y":event.location.y])
            } else { hold.event(type, event) }
            return Unmanaged.passUnretained(event)
        }, userInfo: nil)
    guard let tap = tap else { return false }
    CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0), .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    return true
}
func command(_ message: [String: Any]) async {
    let id = message["id"] ?? NSNull()
    do {
        switch message["command"] as? String {
        case "generateTitle":
#if canImport(FoundationModels)
            if #available(macOS 26.0, *) {
                guard case .available = SystemLanguageModel.default.availability else {
                    emit(["id":id,"ok":false,"reason":"unavailable"]); return
                }
                let text = message["text"] as? String ?? ""
                let recognizer = NLLanguageRecognizer(); recognizer.languageHints = [.spanish: 0.5, .english: 0.5]; recognizer.processString(text)
                // Short questions are ambiguous; fall back to Spanish unless the guess is confident.
                let code = recognizer.languageHypotheses(withMaximum: 1).first.map { $0.value >= 0.6 ? $0.key.rawValue : "es" } ?? "es"
                let language = Locale(identifier: "en").localizedString(forLanguageCode: code) ?? "Spanish"
                let session = LanguageModelSession(instructions:"You write short titles for chat conversations. The title is 3 to 6 words, written in \(language), with no quotation marks and no trailing period.")
                let result = try await session.respond(to:"Do not answer the question. Write only the \(language) title for this question:\n\n" + text)
                emit(["id":id,"ok":true,"title":result.content])
            } else { emit(["id":id,"ok":false,"reason":"unavailable"]) }
#else
            emit(["id":id,"ok":false,"reason":"unavailable"])
#endif
        case "activatePreviousApp":
            if let application = previousApplication, !application.isTerminated {
                let activated = application.activate()
                emit(["id":id,"ok":true,"activated":activated])
            } else {
                emit(["id":id,"ok":true,"activated":false])
            }
        case "permissions":
            if message["request"] as? Bool == true {
                if !CGPreflightScreenCaptureAccess() { CGRequestScreenCaptureAccess() }
                if IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) != kIOHIDAccessTypeGranted { IOHIDRequestAccess(kIOHIDRequestTypeListenEvent) }
            }
            emit(["id":id,"ok":true,"screen":CGPreflightScreenCaptureAccess(),"input":IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted])
        case "watchShortcutRelease":
            shortcutRelease.start(message["modifiers"] as? [String] ?? [])
            emit(["id":id,"ok":true])
        case "watchModifier":
            if spaceObserver == nil {
                spaceObserver = NSWorkspace.shared.notificationCenter.addObserver(
                    forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main
                ) { _ in emit(["event":"spaceChanged"]) }
            }
            hold.cancel(); hold.code = (message["keyCode"] as? NSNumber)?.int64Value ?? 61
            emit(["id":id,"ok":installTap()])
        case "captureDisplayUnderMouse":
            guard let path = message["path"] as? String, let pid = message["pid"] as? Int32 else { throw NSError(domain:"arguments",code:1) }
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            let point = NSEvent.mouseLocation
            guard let screen = NSScreen.screens.first(where: { NSMouseInRect(point, $0.frame, false) }),
                  let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber,
                  let display = content.displays.first(where: { $0.displayID == number.uint32Value }) else { throw NSError(domain:"display",code:1) }
            let filter = SCContentFilter(display: display, excludingApplications: content.applications.filter { $0.processID == pid }, exceptingWindows: [])
            let config = SCStreamConfiguration()
            config.width = Int(screen.frame.width * screen.backingScaleFactor)
            config.height = Int(screen.frame.height * screen.backingScaleFactor)
            config.showsCursor = false
            let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
            let bitmap = NSBitmapImageRep(cgImage:image)
            guard let png = bitmap.representation(using:.png, properties:[:]) else { throw NSError(domain:"png",code:1) }
            try png.write(to:URL(fileURLWithPath:path))
            emit(["id":id,"ok":true,"path":path,"displayId":display.displayID])
        default: throw NSError(domain:"command",code:1)
        }
    } catch { emit(["id":id,"ok":false,"error":String(describing:error)]) }
}
DispatchQueue.global().async {
    while let line = readLine() {
        guard let data = line.data(using:.utf8), let message = try? JSONSerialization.jsonObject(with:data) as? [String:Any] else { continue }
        Task { @MainActor in await command(message) }
    }
    exit(0)
}
RunLoop.main.run()
