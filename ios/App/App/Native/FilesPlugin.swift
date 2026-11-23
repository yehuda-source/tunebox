import Capacitor
import Foundation
import UIKit

/// File operations for the phone library (same interface as the Android plugin). iOS has no
/// ffmpeg, so cover art is made square here (squareCover) and tags are written by Python.
@objc(FilesPlugin)
public class FilesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FilesPlugin"
    public let jsName = "Files"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "dirs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "existing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mkdirs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "move", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "squareCover", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ffmpeg", returnType: CAPPluginReturnPromise),
    ]

    private let fm = FileManager.default
    private let queue = DispatchQueue(label: "tunebox.files", qos: .userInitiated, attributes: .concurrent)

    private func background(_ call: CAPPluginCall, _ work: @escaping () throws -> Void) {
        queue.async {
            do {
                try work()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func path(_ call: CAPPluginCall, _ key: String = "path") throws -> String {
        guard let p = call.getString(key), !p.isEmpty else { throw TuneBoxError("\(key) is required") }
        return p
    }

    private func makeParent(_ p: String) throws {
        let parent = (p as NSString).deletingLastPathComponent
        try fm.createDirectory(atPath: parent, withIntermediateDirectories: true)
    }

    @objc func dirs(_ call: CAPPluginCall) {
        let support = YtdlpPlugin.supportDir.path
        call.resolve([
            "files": support,
            "cache": fm.urls(for: .cachesDirectory, in: .userDomainMask)[0].path,
            // Covers and other app data stay out of the Files app (unlike the songs in Documents).
            "external": support,
        ])
    }

    @objc func readText(_ call: CAPPluginCall) {
        background(call) {
            let p = try self.path(call)
            guard self.fm.fileExists(atPath: p) else {
                call.resolve(["text": NSNull()])
                return
            }
            call.resolve(["text": try String(contentsOfFile: p, encoding: .utf8)])
        }
    }

    @objc func writeText(_ call: CAPPluginCall) {
        background(call) {
            let p = try self.path(call)
            try self.makeParent(p)
            // Atomic: written to a temporary file, then moved into place.
            try (call.getString("text") ?? "").write(toFile: p, atomically: true, encoding: .utf8)
            call.resolve()
        }
    }

    @objc func stat(_ call: CAPPluginCall) {
        background(call) {
            let p = try self.path(call)
            var isDir: ObjCBool = false
            let exists = self.fm.fileExists(atPath: p, isDirectory: &isDir)
            let size = (try? self.fm.attributesOfItem(atPath: p)[.size] as? NSNumber)?.intValue ?? 0
            call.resolve(["exists": exists, "size": size, "dir": isDir.boolValue])
        }
    }

    @objc func existing(_ call: CAPPluginCall) {
        let paths = call.getArray("paths", String.self) ?? []
        background(call) {
            call.resolve(["paths": paths.filter { self.fm.fileExists(atPath: $0) }])
        }
    }

    @objc func list(_ call: CAPPluginCall) {
        background(call) {
            let names = (try? self.fm.contentsOfDirectory(atPath: try self.path(call))) ?? []
            call.resolve(["names": names])
        }
    }

    @objc func mkdirs(_ call: CAPPluginCall) {
        background(call) {
            try self.fm.createDirectory(atPath: try self.path(call), withIntermediateDirectories: true)
            call.resolve()
        }
    }

    @objc func move(_ call: CAPPluginCall) {
        background(call) {
            let from = try self.path(call, "from")
            let to = try self.path(call, "to")
            try self.makeParent(to)
            if self.fm.fileExists(atPath: to) { try self.fm.removeItem(atPath: to) }
            try self.fm.moveItem(atPath: from, toPath: to)
            call.resolve()
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        background(call) {
            let p = try self.path(call)
            if self.fm.fileExists(atPath: p) { try self.fm.removeItem(atPath: p) }
            // Tidy up folders the removal left empty, up to (not including) the given root.
            if let stop = call.getString("pruneUpTo") {
                var dir = (p as NSString).deletingLastPathComponent
                while dir.hasPrefix(stop) && dir != stop,
                      let kids = try? self.fm.contentsOfDirectory(atPath: dir), kids.isEmpty {
                    try? self.fm.removeItem(atPath: dir)
                    dir = (dir as NSString).deletingLastPathComponent
                }
            }
            call.resolve()
        }
    }

    private func fetch(_ urlString: String) throws -> Data {
        guard let url = URL(string: urlString) else { throw TuneBoxError("Bad URL") }
        let done = DispatchSemaphore(value: 0)
        var result: Result<Data, Error> = .failure(TuneBoxError("No response"))
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error {
                result = .failure(error)
            } else if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                result = .failure(TuneBoxError("HTTP \(http.statusCode)"))
            } else {
                result = .success(data ?? Data())
            }
            done.signal()
        }.resume()
        done.wait()
        return try result.get()
    }

    @objc func download(_ call: CAPPluginCall) {
        background(call) {
            let to = try self.path(call)
            let data = try self.fetch(call.getString("url") ?? "")
            try self.makeParent(to)
            try data.write(to: URL(fileURLWithPath: to))
            call.resolve(["size": data.count])
        }
    }

    /// Downloads an image and saves it as a centered square JPEG (at most 1200 px) for album art.
    @objc func squareCover(_ call: CAPPluginCall) {
        background(call) {
            let to = try self.path(call)
            let data = try self.fetch(call.getString("url") ?? "")
            guard let image = UIImage(data: data), let cg = image.cgImage else { throw TuneBoxError("Not an image") }
            let side = min(cg.width, cg.height)
            let crop = CGRect(x: (cg.width - side) / 2, y: (cg.height - side) / 2, width: side, height: side)
            guard let square = cg.cropping(to: crop) else { throw TuneBoxError("Could not crop the cover") }
            let target = CGFloat(min(side, 1200))
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            let jpeg = UIGraphicsImageRenderer(size: CGSize(width: target, height: target), format: format).jpegData(withCompressionQuality: 0.9) { _ in
                UIImage(cgImage: square).draw(in: CGRect(x: 0, y: 0, width: target, height: target))
            }
            try self.makeParent(to)
            try jpeg.write(to: URL(fileURLWithPath: to))
            call.resolve(["size": jpeg.count])
        }
    }

    @objc func ffmpeg(_ call: CAPPluginCall) {
        call.unavailable("ffmpeg is not available on iOS")
    }
}
