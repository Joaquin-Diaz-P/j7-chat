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
    func cancel() {
        timer?.invalidate(); timer = nil
        if active { emit(["event": "holdCancel"]) }
        down = false; active = false
    }
    func event(_ type: CGEventType, _ event: CGEvent) {
        let key = event.getIntegerValueField(.keyboardEventKeycode)
        if type == .keyDown || key != code { cancel(); return }
        // Device-specific bits distinguish left and right while both are held.
        let masks: [Int64: UInt64] = [58:0x20,61:0x40,55:0x08,54:0x10,56:0x02,60:0x04,59:0x01,62:0x2000,63:0x800000]
        let pressed = event.flags.rawValue & (masks[code] ?? 0) != 0
        if pressed && !down {
            down = true
            timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: false) { [weak self] _ in
                guard let self = self, self.down else { return }
                self.active = true; emit(["event":"holdStart"])
            }
        } else if !pressed {
            timer?.invalidate(); down = false
            if active { emit(["event":"holdEnd"]) }; active = false
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
    test.event(.flagsChanged, flags(61,0x40))
    RunLoop.main.run(until:Date(timeIntervalSinceNow:0.1))
    precondition(!test.active)
    test.event(.keyDown,flags(18,0x40))
    RunLoop.main.run(until:Date(timeIntervalSinceNow:0.15))
    precondition(!test.active)
    test.event(.flagsChanged,flags(61,0x40))
    RunLoop.main.run(until:Date(timeIntervalSinceNow:0.25))
    precondition(test.active)
    test.event(.flagsChanged,flags(61,0))
    precondition(!test.active)
    test.event(.flagsChanged,flags(61,0x40))
    RunLoop.main.run(until:Date(timeIntervalSinceNow:0.25))
    precondition(test.active)
    test.event(.keyDown,flags(18,0x40))
    precondition(!test.active)
    print("hold self-test passed"); exit(0)
}
let hold = Hold()
var tap: CFMachPort?
func installTap() -> Bool {
    if tap != nil { return true }
    tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
        eventsOfInterest: (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue),
        callback: { _, type, event, _ in
            if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                if let tap = tap { CGEvent.tapEnable(tap: tap, enable: true) }
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
        case "permissions":
            if message["request"] as? Bool == true {
                if !CGPreflightScreenCaptureAccess() { CGRequestScreenCaptureAccess() }
                if IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) != kIOHIDAccessTypeGranted { IOHIDRequestAccess(kIOHIDRequestTypeListenEvent) }
            }
            emit(["id":id,"ok":true,"screen":CGPreflightScreenCaptureAccess(),"input":IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted])
        case "watchModifier":
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
