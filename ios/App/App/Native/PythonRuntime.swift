import Foundation
import JavaScriptCore

struct TuneBoxError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

/// The embedded Python interpreter (Python.xcframework) running tunebox_bridge.py, plus the
/// JavaScriptCore evaluator that yt-dlp uses for YouTube's challenges.
final class PythonRuntime {
    static let shared = PythonRuntime()

    /// Output lines of running yt-dlp jobs: (job id, line).
    var onLine: ((String, String) -> Void)?

    private let startLock = NSLock()
    private var started = false
    private var startError: String?

    func ensureStarted() throws {
        startLock.lock()
        defer { startLock.unlock() }
        if started {
            if let e = startError { throw TuneBoxError(e) }
            return
        }
        started = true
        guard let resources = Bundle.main.resourcePath else {
            startError = "App resources not found"
            throw TuneBoxError(startError!)
        }
        tb_set_callbacks(jsEvalCallback, emitCallback)
        if let err = tb_python_start("\(resources)/python", "\(resources)/python-app") {
            startError = "Could not start Python: \(String(cString: err))"
            free(err)
            throw TuneBoxError(startError!)
        }
    }

    /// Calls tunebox_bridge.<function>(*args). Safe from any thread; blocks until it returns.
    func call(_ function: String, _ args: [String] = []) throws -> String {
        try ensureStarted()
        let copies = args.map { strdup($0) }
        defer { copies.forEach { free($0) } }
        let pointers: [UnsafePointer<CChar>?] = copies.map { UnsafePointer($0) }
        var failed: Int32 = 0
        let result = pointers.withUnsafeBufferPointer { buffer in
            tb_python_call(function, buffer.baseAddress, Int32(args.count), &failed)
        }
        let text = String(cString: result)
        free(result)
        if failed != 0 { throw TuneBoxError(text) }
        return text
    }

    /// Runs a script in a fresh JavaScriptCore context and returns what it logged.
    static func evaluate(_ script: String) -> Result<String, TuneBoxError> {
        guard let context = JSContext() else { return .failure(TuneBoxError("Could not create a JavaScript context")) }
        var output = ""
        var errors = ""
        let log: @convention(block) () -> Void = {
            let parts = (JSContext.currentArguments() as? [JSValue] ?? []).map { $0.toString() ?? "" }
            output += parts.joined(separator: " ") + "\n"
        }
        let logError: @convention(block) () -> Void = {
            let parts = (JSContext.currentArguments() as? [JSValue] ?? []).map { $0.toString() ?? "" }
            errors += parts.joined(separator: " ") + "\n"
        }
        let console = JSValue(newObjectIn: context)
        console?.setObject(log, forKeyedSubscript: "log" as NSString)
        console?.setObject(log, forKeyedSubscript: "info" as NSString)
        console?.setObject(logError, forKeyedSubscript: "warn" as NSString)
        console?.setObject(logError, forKeyedSubscript: "error" as NSString)
        context.setObject(console, forKeyedSubscript: "console" as NSString)
        var exception: String?
        context.exceptionHandler = { _, value in
            exception = value?.toString() ?? "JavaScript exception"
        }
        context.evaluateScript(script)
        if let exception { return .failure(TuneBoxError(exception)) }
        if output.isEmpty && !errors.isEmpty { return .failure(TuneBoxError(errors)) }
        return .success(output)
    }
}

private let jsEvalCallback: TBJsEvalCallback = { script, error in
    switch PythonRuntime.evaluate(String(cString: script)) {
    case .success(let output):
        return strdup(output)
    case .failure(let failure):
        error.pointee = strdup(failure.message)
        return nil
    }
}

private let emitCallback: TBEmitCallback = { job, line in
    PythonRuntime.shared.onLine?(String(cString: job), String(cString: line))
}
