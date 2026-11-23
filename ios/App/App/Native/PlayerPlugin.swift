import AVFoundation
import Capacitor
import Foundation
import MediaPlayer
import UIKit

/// The web app's audio element on iOS, backed by AVPlayer so music keeps playing in the background,
/// with lock-screen / Control Center controls. Same events as Android: "state", "time", "error",
/// and "command" (next/previous, which the web app's queue handles).
@objc(PlayerPlugin)
public class PlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlayerPlugin"
    public let jsName = "Player"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
    ]

    private let player = AVPlayer()
    private var timeObserver: Any?
    private var observations: [NSKeyValueObservation] = []
    private var itemObservations: [NSKeyValueObservation] = []
    private var endObserver: NSObjectProtocol?
    private var ended = false
    private var nowPlaying: [String: Any] = [:]

    override public func load() {
        player.automaticallyWaitsToMinimizeStalling = true
        observations.append(player.observe(\.timeControlStatus) { [weak self] _, _ in self?.sendState() })
        observations.append(player.observe(\.rate) { [weak self] _, _ in
            self?.sendState()
            self?.updateNowPlayingTime()
        })
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] _ in
            guard let self, self.player.timeControlStatus == .playing else { return }
            self.notifyListeners("time", data: self.times())
        }
        setUpRemoteCommands()
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    }

    // MARK: state

    private func times() -> [String: Any] {
        let position = player.currentTime().seconds
        let duration = player.currentItem?.duration.seconds ?? 0
        return [
            "position": position.isFinite ? max(0, position) : 0,
            "duration": duration.isFinite ? duration : 0,
        ]
    }

    private func state() -> [String: Any] {
        var s = times()
        let status = player.timeControlStatus
        s["playing"] = status == .playing
        s["playWhenReady"] = status != .paused
        s["buffering"] = status == .waitingToPlayAtSpecifiedRate
        s["ready"] = player.currentItem?.status == .readyToPlay
        s["ended"] = ended
        return s
    }

    private func sendState() {
        DispatchQueue.main.async { self.notifyListeners("state", data: self.state()) }
    }

    // MARK: methods

    @objc func load(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("url is required")
            return
        }
        let userAgent = call.getString("userAgent")
        let startAt = call.getDouble("startAt") ?? 0
        let autoplay = call.getBool("autoplay") ?? true
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let album = call.getString("album") ?? ""
        let artwork = call.getString("artwork")
        DispatchQueue.main.async {
            self.activateSession()
            var options: [String: Any] = [:]
            if let userAgent { options["AVURLAssetHTTPHeaderFieldsKey"] = ["User-Agent": userAgent] }
            let item = AVPlayerItem(asset: AVURLAsset(url: url, options: options))
            self.watch(item)
            self.ended = false
            self.player.replaceCurrentItem(with: item)
            if startAt > 0 { self.player.seek(to: CMTime(seconds: startAt, preferredTimescale: 600)) }
            if autoplay { self.player.play() } else { self.player.pause() }
            self.setNowPlaying(title: title, artist: artist, album: album, artwork: artwork)
            call.resolve()
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.activateSession()
            if self.ended {
                self.ended = false
                self.player.seek(to: .zero)
            }
            self.player.play()
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.player.pause()
            call.resolve()
        }
    }

    @objc func seek(_ call: CAPPluginCall) {
        let position = max(0, call.getDouble("position") ?? 0)
        DispatchQueue.main.async {
            self.ended = false
            self.player.seek(to: CMTime(seconds: position, preferredTimescale: 600)) { _ in
                self.notifyListeners("time", data: self.times())
                self.updateNowPlayingTime()
            }
            call.resolve()
        }
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        let volume = Float(min(1, max(0, call.getDouble("volume") ?? 1)))
        DispatchQueue.main.async {
            self.player.volume = volume
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.player.pause()
            self.player.replaceCurrentItem(with: nil)
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            call.resolve()
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.state()) }
    }

    // MARK: item lifecycle

    private func watch(_ item: AVPlayerItem) {
        itemObservations = [
            item.observe(\.status) { [weak self] item, _ in
                guard let self else { return }
                if item.status == .failed {
                    let message = item.error?.localizedDescription ?? "Could not play this item"
                    DispatchQueue.main.async { self.notifyListeners("error", data: ["message": message, "code": -1]) }
                }
                self.sendState()
                self.updateNowPlayingTime()
            },
        ]
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.ended = true
            self?.sendState()
        }
    }

    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
    }

    @objc private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .ended,
              let opts = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt,
              AVAudioSession.InterruptionOptions(rawValue: opts).contains(.shouldResume)
        else { return }
        DispatchQueue.main.async { self.player.play() }
    }

    // MARK: lock screen

    private func setUpRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            self?.activateSession()
            self?.player.play()
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.player.pause()
            return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            if self.player.timeControlStatus == .paused { self.player.play() } else { self.player.pause() }
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            self?.notifyListeners("command", data: ["command": "next"])
            return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            self?.notifyListeners("command", data: ["command": "prev"])
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self, let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self.player.seek(to: CMTime(seconds: e.positionTime, preferredTimescale: 600)) { _ in
                self.updateNowPlayingTime()
                self.notifyListeners("time", data: self.times())
            }
            return .success
        }
    }

    private func setNowPlaying(title: String, artist: String, album: String, artwork: String?) {
        nowPlaying = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: artist,
            MPMediaItemPropertyAlbumTitle: album,
        ]
        updateNowPlayingTime()
        guard let artwork, let url = URL(string: artwork) else { return }
        let key = title
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                guard self.nowPlaying[MPMediaItemPropertyTitle] as? String == key else { return }
                self.nowPlaying[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlaying
            }
        }.resume()
    }

    private func updateNowPlayingTime() {
        DispatchQueue.main.async {
            guard !self.nowPlaying.isEmpty else { return }
            let t = self.times()
            self.nowPlaying[MPMediaItemPropertyPlaybackDuration] = t["duration"]
            self.nowPlaying[MPNowPlayingInfoPropertyElapsedPlaybackTime] = t["position"]
            self.nowPlaying[MPNowPlayingInfoPropertyPlaybackRate] = self.player.rate
            MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlaying
        }
    }
}
