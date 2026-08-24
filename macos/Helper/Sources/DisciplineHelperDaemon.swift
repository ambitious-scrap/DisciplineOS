import Foundation
import AppKit

@main
class DisciplineHelperDaemon {
    private var isRunning = true
    private var blockedBundleIds: Set<String> = ["com.apple.Chess", "com.riotgames.leagueoflegends"]
    private var blockedDomains: [String] = ["reddit.com", "twitter.com", "x.com", "youtube.com"]

    static func main() {
        let daemon = DisciplineHelperDaemon()
        daemon.start()
    }

    func start() {
        print("[DisciplineOS Helper] LaunchDaemon started with root privileges.")
        
        // Start process monitoring loop
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.checkRunningApplications()
        }

        // Keep runloop alive
        RunLoop.current.run()
    }

    private func checkRunningApplications() {
        let runningApps = NSWorkspace.shared.runningApplications
        for app in runningApps {
            if let bundleId = app.bundleIdentifier, blockedBundleIds.contains(bundleId) {
                print("[DisciplineOS Helper] Terminating blacklisted application: \(bundleId)")
                app.terminate()
            }
        }
    }

    func syncHostsFile() {
        let hostsPath = "/etc/hosts"
        guard let hostsContent = try? String(contentsOfFile: hostsPath, encoding: .utf8) else { return }

        var newEntries = "\n# DisciplineOS Block List\n"
        for domain in blockedDomains {
            newEntries += "127.0.0.1 \(domain)\n"
            newEntries += "127.0.0.1 www.\(domain)\n"
        }

        // Append or replace block list safely
        if !hostsContent.contains("# DisciplineOS Block List") {
            let updated = hostsContent + newEntries
            try? updated.write(toFile: hostsPath, atomically: true, encoding: .utf8)
        }
    }
}
