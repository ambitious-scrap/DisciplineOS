import SwiftUI

@main
struct DisciplineMenuBarApp: App {
    @StateObject private var stateManager = DisciplineStateManager()

    var body: some Scene {
        MenuBarExtra("DisciplineOS: \(stateManager.balanceMinutes)m", systemImage: "shield.fill") {
            VStack(alignment: .leading, spacing: 12) {
                // Header
                HStack {
                    Text("🛡️ DisciplineOS Focus")
                        .font(.headline)
                    Spacer()
                    Text("\(stateManager.balanceMinutes)m")
                        .font(.system(.title3, design: .monospaced))
                        .bold()
                        .foregroundColor(.cyan)
                }

                Divider()

                // Status
                if let activeSession = stateManager.activeSession {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Active Unlock:")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text("\(activeSession.identifier) (\(activeSession.remainingSeconds)s left)")
                            .font(.subheadline)
                            .bold()
                    }
                } else {
                    Text("No active distraction leases.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Divider()

                // Actions
                Button("Unlock 5 mins (5 points)") {
                    stateManager.requestUnlock(seconds: 300)
                }
                .disabled(stateManager.balanceMinutes < 5 || stateManager.activeSession != null)

                Button("Emergency Unlock (3x Penalty)") {
                    stateManager.requestEmergencyUnlock(seconds: 300)
                }
                .foregroundColor(.red)

                Divider()

                Button("Open Web Dashboard") {
                    if let url = URL(string: "http://localhost:5173") {
                        NSWorkspace.shared.open(url)
                    }
                }

                Button("Quit") {
                    NSApplication.shared.terminate(nil)
                }
            }
            .padding()
            .frame(width: 260)
        }
    }
}

class DisciplineStateManager: ObservableObject {
    @Published var balanceMinutes: Int = 60
    @Published var activeSession: (identifier: String, remainingSeconds: Int)? = nil

    func requestUnlock(seconds: Int) {
        // Sends spend command to Central Server / Helper
    }

    func requestEmergencyUnlock(seconds: Int) {
        // Sends emergency unlock command with 3x penalty
    }
}
