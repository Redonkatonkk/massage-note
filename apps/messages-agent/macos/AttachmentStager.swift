import Foundation

enum StagerError: LocalizedError {
    case invalidArguments
    case invalidJobID
    case invalidResultPath
    case invalidSource
    case invalidAttachment
    case conflictingDestination

    var errorDescription: String? {
        switch self {
        case .invalidArguments: return "usage: AttachmentStager --diagnose <result-json> | <source> <job-uuid> [closing.png|settlement-summary.png|settlement-details.pdf] [--reuse-existing] <result-json>"
        case .invalidJobID: return "invalid closing delivery job id"
        case .invalidResultPath: return "result must be the exact job result file in the Massage Note agent data directory"
        case .invalidSource: return "source must be the exact job PNG in the Massage Note agent outbox"
        case .invalidAttachment: return "source is not a valid PNG or PDF attachment"
        case .conflictingDestination: return "a different attachment already exists for this job"
        }
    }
}

let fileManager = FileManager.default
let home = fileManager.homeDirectoryForCurrentUser.standardizedFileURL
let messagesRoot = home
    .appendingPathComponent("Library/Messages/Attachments/MassageNote", isDirectory: true)
    .standardizedFileURL
let agentRoot = home
    .appendingPathComponent("Library/Application Support/Massage Note Messages Agent", isDirectory: true)
    .standardizedFileURL
let outboxRoot = agentRoot.appendingPathComponent("outbox", isDirectory: true)
let resultRoot = agentRoot.appendingPathComponent("stager-results", isDirectory: true)

func ensureDirectory(_ directory: URL) throws {
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
}

func validatedResultURL(_ argument: String, expectedStem: String) throws -> URL {
    try ensureDirectory(resultRoot)
    let supplied = URL(fileURLWithPath: argument).standardizedFileURL
    let expected = resultRoot.appendingPathComponent("\(expectedStem).json").standardizedFileURL
    guard supplied.path == expected.path else { throw StagerError.invalidResultPath }
    return expected
}

func writeResult(ok: Bool, path: String? = nil, error: String? = nil, to result: URL) throws {
    var payload: [String: Any] = ["ok": ok]
    if let path { payload["path"] = path }
    if let error { payload["error"] = error }
    let data = try JSONSerialization.data(withJSONObject: payload)
    try data.write(to: result, options: .atomic)
    try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: result.path)
}

func diagnose() throws {
    try ensureDirectory(messagesRoot)
    let probeDirectory = messagesRoot
        .appendingPathComponent("diagnose", isDirectory: true)
        .appendingPathComponent(UUID().uuidString.lowercased(), isDirectory: true)
    try ensureDirectory(probeDirectory)
    let probe = probeDirectory.appendingPathComponent("probe")
    try Data("ok".utf8).write(to: probe, options: .atomic)
    try fileManager.removeItem(at: probeDirectory)
}

func stage(sourceArgument: String, jobArgument: String, fileName: String, reuseExisting: Bool = false) throws -> String {
    guard let jobID = UUID(uuidString: jobArgument), jobID.uuidString.lowercased() == jobArgument.lowercased() else {
        throw StagerError.invalidJobID
    }
    let source = URL(fileURLWithPath: sourceArgument).standardizedFileURL
    let allowedNames = ["closing.png", "settlement-summary.png", "settlement-details.pdf"]
    guard allowedNames.contains(fileName) else { throw StagerError.invalidAttachment }
    let sourceName = fileName == "closing.png" ? "\(jobArgument).png" : "\(jobArgument)-\(fileName == "settlement-summary.png" ? "summary.png" : "details.pdf")"
    let expectedSource = outboxRoot.appendingPathComponent(sourceName).standardizedFileURL
    guard source.path == expectedSource.path else { throw StagerError.invalidSource }

    let data = try Data(contentsOf: source, options: .mappedIfSafe)
    let pngSignature = Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    let pdfSignature = Data("%PDF-".utf8)
    let valid = fileName.hasSuffix(".png") ? data.count >= pngSignature.count && data.prefix(pngSignature.count) == pngSignature : data.count >= pdfSignature.count && data.prefix(pdfSignature.count) == pdfSignature
    guard valid else { throw StagerError.invalidAttachment }

    try ensureDirectory(messagesRoot)
    let jobDirectory = messagesRoot
        .appendingPathComponent(String(jobArgument.prefix(2)).lowercased(), isDirectory: true)
        .appendingPathComponent(jobArgument.lowercased(), isDirectory: true)
    try ensureDirectory(jobDirectory)
    let destination = jobDirectory.appendingPathComponent(fileName)

    if fileManager.fileExists(atPath: destination.path) {
        let existing = try Data(contentsOf: destination, options: .mappedIfSafe)
        guard existing == data || (reuseExisting && fileName == "settlement-details.pdf") else {
            throw StagerError.conflictingDestination
        }
    } else {
        try data.write(to: destination, options: .atomic)
        try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: destination.path)
    }
    return destination.path
}

do {
    let arguments = Array(CommandLine.arguments.dropFirst())
    if arguments.count == 2, arguments[0] == "--diagnose" {
        let result = try validatedResultURL(arguments[1], expectedStem: "diagnose")
        do {
            try diagnose()
            try writeResult(ok: true, to: result)
        } catch {
            try? writeResult(ok: false, error: error.localizedDescription, to: result)
            throw error
        }
    } else if arguments.count == 3 || arguments.count == 4 || arguments.count == 5 {
        guard let jobID = UUID(uuidString: arguments[1]) else { throw StagerError.invalidJobID }
        let stem = jobID.uuidString.lowercased()
        let fileName = arguments.count >= 4 ? arguments[2] : "closing.png"
        let reuseExisting = arguments.count == 5 && arguments[3] == "--reuse-existing"
        guard arguments.count != 5 || (reuseExisting && fileName == "settlement-details.pdf") else {
            throw StagerError.invalidArguments
        }
        let result = try validatedResultURL(arguments[arguments.count - 1], expectedStem: stem)
        do {
            let destination = try stage(sourceArgument: arguments[0], jobArgument: arguments[1], fileName: fileName, reuseExisting: reuseExisting)
            try writeResult(ok: true, path: destination, to: result)
        } catch {
            try? writeResult(ok: false, error: error.localizedDescription, to: result)
            throw error
        }
    } else {
        throw StagerError.invalidArguments
    }
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
