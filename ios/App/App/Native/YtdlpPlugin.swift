import Capacitor
import Foundation

/// yt-dlp for TuneBox on iOS, running in the embedded Python (see tunebox_bridge.py). Same
/// interface as the Android plugin: start, update (newest yt-dlp without an app update), run with
/// progress lines, cancel, plus tag (cover art and tags, since iOS has no ffmpeg).
@objc(YtdlpPlugin)
public class YtdlpPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "YtdlpPlugin"
    public let jsName = "Ytdlp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "run", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tag", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selfTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "jscCheck", returnType: CAPPluginReturnPromise),
    ]

    private let python = PythonRuntime.shared
    private let jobs = DispatchQueue(label: "tunebox.ytdlp", qos: .userInitiated, attributes: .concurrent)

    override public func load() {
        python.onLine = { [weak self] job, line in
            self?.notifyListeners("progress", data: ["id": job, "line": line, "progress": -1, "eta": -1])
        }
    }

    static var musicDir: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docs.appendingPathComponent("Music", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static var supportDir: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func background(_ call: CAPPluginCall, _ work: @escaping () throws -> Void) {
        jobs.async {
            do {
                try work()
            } catch {
                NSLog("TuneBox: %@ failed: %@", call.methodName, error.localizedDescription)
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        background(call) {
            let began = Date()
            NSLog("TuneBox: starting Python")
            let version = try self.python.call("setup", [YtdlpPlugin.supportDir.appendingPathComponent("yt-dlp").path])
            NSLog("TuneBox: yt-dlp %@ ready in %.1fs", version, Date().timeIntervalSince(began))
            call.resolve([
                "version": version,
                "musicDir": YtdlpPlugin.musicDir.path,
                "cacheDir": FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].path,
            ])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        background(call) {
            let json = try self.python.call("update")
            call.resolve(try Self.object(json))
        }
    }

    @objc func run(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let args = call.getArray("args", String.self) else {
            call.reject("id and args are required")
            return
        }
        background(call) {
            let argsJson = String(data: try JSONSerialization.data(withJSONObject: args), encoding: .utf8) ?? "[]"
            let result = try Self.object(try self.python.call("run", [id, argsJson]))
            if result["canceled"] as? Bool == true {
                call.reject("Canceled", "CANCELED")
                return
            }
            call.resolve([
                "exitCode": result["exitCode"] as? Int ?? 1,
                "out": result["out"] as? String ?? "",
                "err": result["err"] as? String ?? "",
            ])
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        background(call) {
            let canceled = try self.python.call("cancel", [id])
            call.resolve(["canceled": canceled == "True"])
        }
    }

    @objc func tag(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let tags = call.getObject("tags") else {
            call.reject("path and tags are required")
            return
        }
        let cover = call.getString("cover") ?? ""
        background(call) {
            let tagsJson = String(data: try JSONSerialization.data(withJSONObject: tags), encoding: .utf8) ?? "{}"
            _ = try self.python.call("tag", [path, tagsJson, cover])
            call.resolve()
        }
    }

    /// Whether the app was launched for the automated check (CI passes -tunebox-selftest).
    @objc func selfTest(_ call: CAPPluginCall) {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        call.resolve([
            "requested": ProcessInfo.processInfo.arguments.contains("-tunebox-selftest"),
            "results": docs.appendingPathComponent("selftest.json").path,
        ])
    }

    /// Solves a real YouTube challenge in JavaScriptCore (for the self-test).
    @objc func jscCheck(_ call: CAPPluginCall) {
        background(call) {
            call.resolve(try Self.object(try self.python.call("jsc_check")))
        }
    }

    private static func object(_ json: String) throws -> [String: Any] {
        guard let data = json.data(using: .utf8),
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { throw TuneBoxError("Unexpected reply from Python: \(json.prefix(200))") }
        return object
    }
}
