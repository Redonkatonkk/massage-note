import Foundation
import SQLite3

struct MessageDeliveryObservation {
    let messageGuid: String?
    let state: String
    let errorCode: Int
    let service: String?

    var json: [String: Any] {
        ["messageGuid": messageGuid as Any? ?? NSNull(), "state": state,
         "errorCode": errorCode, "service": service as Any? ?? NSNull()]
    }
}

enum MessageStatusError: LocalizedError {
    case unavailable(Int32)
    var errorDescription: String? {
        switch self {
        case .unavailable(let code): return "Messages send-status metadata is unavailable (SQLite \(code)); no delivery success was confirmed"
        }
    }
}

/// Only metadata for an exact task attachment and recipient is selected. No body,
/// attributedBody, chat text, contact data, or database writes are used.
final class MessagesDeliveryDatabase {
    private var database: OpaquePointer?

    init(url: URL) throws {
        let code = sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil)
        guard code == SQLITE_OK else {
            if let database { sqlite3_close(database) }
            database = nil
            throw MessageStatusError.unavailable(code)
        }
        sqlite3_busy_timeout(database, 1_000)
    }

    deinit { if let database { sqlite3_close(database) } }

    func observation(attachment: URL, phone: String, home: URL) throws -> MessageDeliveryObservation {
        let sql = """
        SELECT m.guid, m.is_sent, m.is_delivered, m.error, m.service
        FROM message m
        JOIN message_attachment_join j ON j.message_id = m.ROWID
        JOIN attachment a ON a.ROWID = j.attachment_id
        JOIN handle h ON h.ROWID = m.handle_id
        WHERE m.is_from_me = 1 AND a.filename IN (?, ?) AND h.id IN (?, ?)
        ORDER BY m.ROWID DESC LIMIT 1
        """
        var statement: OpaquePointer?
        let prepared = sqlite3_prepare_v2(database, sql, -1, &statement, nil)
        guard prepared == SQLITE_OK, let statement else { throw MessageStatusError.unavailable(prepared) }
        defer { sqlite3_finalize(statement) }
        let localPhone = phone.hasPrefix("+1") && phone.count == 12 ? String(phone.dropFirst(2)) : phone
        let relativePath = attachment.path.hasPrefix(home.path + "/")
            ? "~" + attachment.path.dropFirst(home.path.count) : attachment.path
        for (index, value) in [attachment.path, relativePath, phone, localPhone].enumerated() {
            let code = value.withCString { sqlite3_bind_text(statement, Int32(index + 1), $0, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self)) }
            guard code == SQLITE_OK else { throw MessageStatusError.unavailable(code) }
        }
        let step = sqlite3_step(statement)
        if step == SQLITE_DONE { return MessageDeliveryObservation(messageGuid: nil, state: "MISSING", errorCode: 0, service: nil) }
        guard step == SQLITE_ROW else { throw MessageStatusError.unavailable(step) }
        let text = { (column: Int32) -> String? in
            guard let value = sqlite3_column_text(statement, column) else { return nil }
            return String(cString: value)
        }
        let error = Int(sqlite3_column_int(statement, 3))
        let sent = sqlite3_column_int(statement, 1) != 0
        let delivered = sqlite3_column_int(statement, 2) != 0
        // A later explicit error overrides an earlier sent/delivered flag.
        let state = error != 0 ? "FAILED" : delivered ? "DELIVERED" : sent ? "SENT" : "PENDING"
        return MessageDeliveryObservation(messageGuid: text(0), state: state, errorCode: error, service: text(4))
    }
}
