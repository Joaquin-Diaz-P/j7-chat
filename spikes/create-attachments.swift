import AppKit
import CoreGraphics

let directory = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "tests/fixtures/attachments"
try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
let image = NSImage(size: NSSize(width: 640, height: 240))
image.lockFocus()
NSColor.white.setFill()
NSRect(x: 0, y: 0, width: 640, height: 240).fill()
("J7 42" as NSString).draw(at: NSPoint(x: 100, y: 65), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 96), .foregroundColor: NSColor.black])
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: directory + "/j7-42.png"))
let url = URL(fileURLWithPath: directory + "/j7-30-pages.pdf")
var box = CGRect(x: 0, y: 0, width: 612, height: 792)
let context = CGContext(url as CFURL, mediaBox: &box, nil)!
for page in 1...30 {
    context.beginPDFPage(nil)
    let graphics = NSGraphicsContext(cgContext: context, flipped: false)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics
    let text = "J7 Chat - pagina \(page) de 30\nFrase secreta de prueba: El faro violeta cuenta 47 estrellas."
    (text as NSString).draw(in: NSRect(x: 48, y: 630, width: 510, height: 110), withAttributes: [.font: NSFont.systemFont(ofSize: 18), .foregroundColor: NSColor.black])
    NSGraphicsContext.restoreGraphicsState()
    context.endPDFPage()
}
context.closePDF()
print("PNG y PDF de 30 paginas generados en \(directory)")
