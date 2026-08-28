import Foundation

enum StagerError: LocalizedError {
    case invalidArguments
    case invalidJobID
    case invalidSource
    case invalidPNG
    case conflictingDestination

    var errorDescription: String? {
        switch self {
        case .invalidArguments: return "usage: AttachmentStager --diagnose | <source-png> <job-uuid>"
        case .invalidJobID: return "invalid closing delivery job id"
        case .invalidSource: return "source must be the exact job PNG in the Massage Note agent outbox"
        case .invalidPNG: return "source is not a valid non-empty PNG"
        case .conflictingDestination: return "a different attachment already exists for this job"
        }
    }
}

let fileManager = FileManager.default
let home = fileManager.homeDirectoryForCurrentUser.standardizedFileURL
let messagesRoot = home
    .appendingPathComponent("Library/Messages/Attachments/MassageNote", isDirectory: true)
    .standardizedFileURL
let outboxRoot = home
    .appendingPathComponent("Library/Application Support/Massage Note Messages Agent/outbox", isDirectory: true)
    .standardizedFileURL

func ensureMessagesRoot() throws {
    try fileManager.createDirectory(at: messagesRoot, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
}

func diagnose() throws {
    try ensureMessagesRoot()
    let probe = messagesRoot.appendingPathComponent(".diagnose-\(UUID().uuidString)")
    try Data("ok".utf8).write(to: probe, options: .atomic)
    try fileManager.removeItem(at: probe)
    print("ready")
}

func stage(sourceArgument: String, jobArgument: String) throws {
    guard let jobID = UUID(uuidString: jobArgument), jobID.uuidString.lowercased() == jobArgument.lowercased() else {
        throw StagerError.invalidJobID
    }
    let source = URL(fileURLWithPath: sourceArgument).standardizedFileURL
    let expectedSource = outboxRoot.appendingPathComponent("\(jobArgument).png").standardizedFileURL
    guard source.path == expectedSource.path else { throw StagerError.invalidSource }

    let data = try Data(contentsOf: source, options: .mappedIfSafe)
    let pngSignature = Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    guard data.count >= pngSignature.count, data.prefix(pngSignature.count) == pngSignature else {
        throw StagerError.invalidPNG
    }

    try ensureMessagesRoot()
    let jobDirectory = messagesRoot
        .appendingPathComponent(String(jobArgument.prefix(2)).lowercased(), isDirectory: true)
        .appendingPathComponent(jobArgument.lowercased(), isDirectory: true)
    try fileManager.createDirectory(at: jobDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    let destination = jobDirectory.appendingPathComponent("closing.png")

    if fileManager.fileExists(atPath: destination.path) {
        let existing = try Data(contentsOf: destination, options: .mappedIfSafe)
        guard existing == data else { throw StagerError.conflictingDestination }
    } else {
        try data.write(to: destination, options: .atomic)
        try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: destination.path)
    }
    print(destination.path)
}

do {
    let arguments = Array(CommandLine.arguments.dropFirst())
    if arguments == ["--diagnose"] {
        try diagnose()
    } else if arguments.count == 2 {
        try stage(sourceArgument: arguments[0], jobArgument: arguments[1])
    } else {
        throw StagerError.invalidArguments
    }
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
