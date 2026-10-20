import Foundation
import Carbon

enum StagerError: LocalizedError {
    case invalidArguments
    case invalidJobID
    case invalidResultPath
    case invalidSource
    case invalidAttachment
    case conflictingDestination
    case invalidRecipient
    case missingScript
    case messagesScript(String)

    var errorDescription: String? {
        switch self {
        case .invalidArguments: return "usage: AttachmentStager --diagnose <result-json> | --send <phone> <job-uuid> <filename> <kind> <result-json> | --status <phone> <job-uuid> <filename> <result-json> | <source> <job-uuid> [closing.png|settlement-details.jpg] [--reuse-existing] <result-json>"
        case .invalidJobID: return "invalid closing delivery job id"
        case .invalidResultPath: return "result must be the exact job result file in the Massage Note agent data directory"
        case .invalidSource: return "source must be the exact job PNG in the Massage Note agent outbox"
        case .invalidAttachment: return "source is not a valid PNG or JPEG attachment"
        case .conflictingDestination: return "a different attachment already exists for this job"
        case .invalidRecipient: return "invalid Messages recipient"
        case .missingScript: return "bundled Messages AppleScript is missing"
        case .messagesScript(let message): return message
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

func writeResult(ok: Bool, path: String? = nil, service: String? = nil, previousMessageGuid: String? = nil, delivery: [String: Any]? = nil, error: String? = nil, to result: URL) throws {
    var payload: [String: Any] = ["ok": ok]
    if let path { payload["path"] = path }
    if let service { payload["service"] = service }
    if let previousMessageGuid { payload["previousMessageGuid"] = previousMessageGuid }
    if let delivery { payload["delivery"] = delivery }
    if let error { payload["error"] = error }
    let data = try JSONSerialization.data(withJSONObject: payload)
    try data.write(to: result, options: .atomic)
    try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: result.path)
}

func runMessagesScript(_ arguments: [String]) throws -> String {
    guard let scriptURL = Bundle.main.url(forResource: "messages", withExtension: "applescript") else {
        throw StagerError.missingScript
    }
    let source = try String(contentsOf: scriptURL, encoding: .utf8)
    guard let script = NSAppleScript(source: source) else { throw StagerError.missingScript }
    let parameters = NSAppleEventDescriptor.list()
    for (index, argument) in arguments.enumerated() {
        parameters.insert(NSAppleEventDescriptor(string: argument), at: index + 1)
    }
    let event = NSAppleEventDescriptor(
        eventClass: AEEventClass(kCoreEventClass), eventID: AEEventID(kAEOpenApplication),
        targetDescriptor: nil, returnID: AEReturnID(kAutoGenerateReturnID),
        transactionID: AETransactionID(kAnyTransactionID)
    )
    event.setParam(parameters, forKeyword: AEKeyword(keyDirectObject))
    var error: NSDictionary?
    let response = script.executeAppleEvent(event, error: &error)
    if let error {
        let message = error[NSAppleScript.errorMessage] as? String ?? "Messages AppleScript failed"
        let code = error[NSAppleScript.errorNumber] as? Int ?? -1
        throw StagerError.messagesScript("\(message) (\(code))")
    }
    guard let service = response.stringValue, !service.isEmpty else {
        throw StagerError.messagesScript("Messages did not confirm an accepted service")
    }
    return service
}

func diagnose() throws {
    try ensureDirectory(messagesRoot)
    let probeDirectory = messagesRoot
        .appendingPathComponent("diagnose", isDirectory: true)
        .appendingPathComponent(UUID().uuidString.lowercased(), isDirectory: true)
    try ensureDirectory(probeDirectory)
    defer { try? fileManager.removeItem(at: probeDirectory) }
    let probe = probeDirectory.appendingPathComponent("probe")
    try Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).write(to: probe, options: .atomic)
    // Exercise the same App identity and AppleScript file access as a real send,
    // without addressing a recipient or executing a send command.
    _ = try runMessagesScript(["", "", probe.path, "DIAGNOSE"])
    let database = try MessagesDeliveryDatabase(url: home.appendingPathComponent("Library/Messages/chat.db"))
    _ = try database.observation(attachment: probe, phone: "+10000000000", home: home)
}

func taskAttachment(phone: String, job: String, fileName: String) throws -> URL {
    guard phone.range(of: "^\\+[1-9][0-9]{7,14}$", options: .regularExpression) != nil else {
        throw StagerError.invalidRecipient
    }
    guard let jobID = UUID(uuidString: job), jobID.uuidString.lowercased() == job else {
        throw StagerError.invalidJobID
    }
    guard ["closing.png", "settlement-details.jpg"].contains(fileName) else { throw StagerError.invalidArguments }
    let file = messagesRoot.appendingPathComponent(String(job.prefix(2)), isDirectory: true)
        .appendingPathComponent(job, isDirectory: true).appendingPathComponent(fileName)
    guard file.resolvingSymlinksInPath().path == file.path else { throw StagerError.invalidSource }
    return file
}

func send(phone: String, job: String, fileName: String, kind: String) throws -> (String, String?) {
    guard ["IMAGE", "CONVERSATION_IMAGE"].contains(kind) else { throw StagerError.invalidArguments }
    let file = try taskAttachment(phone: phone, job: job, fileName: fileName)
    let data = try Data(contentsOf: file, options: .mappedIfSafe)
    let signature = fileName == "closing.png"
        ? Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) : Data([0xff, 0xd8, 0xff])
    guard data.count >= signature.count, data.prefix(signature.count) == signature else {
        throw StagerError.invalidAttachment
    }
    // Record the previous message before dispatch, so a retry cannot mistake its
    // previous attempt's status for the result of the new send.
    let database = try MessagesDeliveryDatabase(url: home.appendingPathComponent("Library/Messages/chat.db"))
    let previous = try database.observation(attachment: file, phone: phone, home: home)
    let phoneHandle = phone.hasPrefix("+1") && phone.count == 12 ? String(phone.dropFirst(2)) : phone
    return (try runMessagesScript([phoneHandle, phone, file.path, kind]), previous.messageGuid)
}

func stage(sourceArgument: String, jobArgument: String, fileName: String, reuseExisting: Bool = false) throws -> String {
    guard let jobID = UUID(uuidString: jobArgument), jobID.uuidString.lowercased() == jobArgument.lowercased() else {
        throw StagerError.invalidJobID
    }
    let source = URL(fileURLWithPath: sourceArgument).standardizedFileURL
    let allowedNames = ["closing.png", "settlement-details.jpg"]
    guard allowedNames.contains(fileName) else { throw StagerError.invalidAttachment }
    let sourceName = fileName == "closing.png" ? "\(jobArgument).png" : "\(jobArgument)-details.jpg"
    let expectedSource = outboxRoot.appendingPathComponent(sourceName).standardizedFileURL
    guard source.path == expectedSource.path else { throw StagerError.invalidSource }

    let data = try Data(contentsOf: source, options: .mappedIfSafe)
    let pngSignature = Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    let jpegSignature = Data([0xff, 0xd8, 0xff])
    let valid = fileName.hasSuffix(".png")
        ? data.count >= pngSignature.count && data.prefix(pngSignature.count) == pngSignature
        : data.count >= jpegSignature.count && data.prefix(jpegSignature.count) == jpegSignature
    guard valid else { throw StagerError.invalidAttachment }

    try ensureDirectory(messagesRoot)
    let jobDirectory = messagesRoot
        .appendingPathComponent(String(jobArgument.prefix(2)).lowercased(), isDirectory: true)
        .appendingPathComponent(jobArgument.lowercased(), isDirectory: true)
    try ensureDirectory(jobDirectory)
    let destination = jobDirectory.appendingPathComponent(fileName)

    if fileManager.fileExists(atPath: destination.path) {
        let existing = try Data(contentsOf: destination, options: .mappedIfSafe)
        guard existing == data || (reuseExisting && fileName == "settlement-details.jpg") else {
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
    } else if arguments.count == 6, arguments[0] == "--send" {
        guard let jobID = UUID(uuidString: arguments[2]) else { throw StagerError.invalidJobID }
        let result = try validatedResultURL(arguments[5], expectedStem: "\(jobID.uuidString.lowercased())-send")
        do {
            let (service, previous) = try send(phone: arguments[1], job: arguments[2], fileName: arguments[3], kind: arguments[4])
            try writeResult(ok: true, service: service, previousMessageGuid: previous, to: result)
        } catch {
            try? writeResult(ok: false, error: error.localizedDescription, to: result)
            throw error
        }
    } else if arguments.count == 5, arguments[0] == "--status" {
        guard let jobID = UUID(uuidString: arguments[2]) else { throw StagerError.invalidJobID }
        let result = try validatedResultURL(arguments[4], expectedStem: "\(jobID.uuidString.lowercased())-status")
        do {
            let file = try taskAttachment(phone: arguments[1], job: arguments[2], fileName: arguments[3])
            let database = try MessagesDeliveryDatabase(url: home.appendingPathComponent("Library/Messages/chat.db"))
            let observation = try database.observation(attachment: file, phone: arguments[1], home: home)
            try writeResult(ok: true, delivery: observation.json, to: result)
        } catch {
            try? writeResult(ok: false, error: error.localizedDescription, to: result)
            throw error
        }
    } else if arguments.count == 3 || arguments.count == 4 || arguments.count == 5 {
        guard let jobID = UUID(uuidString: arguments[1]) else { throw StagerError.invalidJobID }
        let stem = jobID.uuidString.lowercased()
        let fileName = arguments.count >= 4 ? arguments[2] : "closing.png"
        let reuseExisting = arguments.count == 5 && arguments[3] == "--reuse-existing"
        guard arguments.count != 5 || (reuseExisting && fileName == "settlement-details.jpg") else {
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
