// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DisciplineOSMac",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "DisciplineMenuBar", targets: ["DisciplineMenuBar"]),
        .executable(name: "DisciplineHelper", targets: ["DisciplineHelper"])
    ],
    targets: [
        .executableTarget(
            name: "DisciplineMenuBar",
            path: "Agent/Sources"
        ),
        .executableTarget(
            name: "DisciplineHelper",
            path: "Helper/Sources"
        )
    ]
)
