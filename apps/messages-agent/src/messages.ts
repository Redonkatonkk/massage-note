import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sendStagedMessagesAttachment, type MessagesSubmission } from "./stager.js";

const execFileAsync = promisify(execFile);

export const messagesAttachmentScript = `on run argv
with timeout of 45 seconds
set phoneNumber to item 1 of argv
set phoneE164 to item 2 of argv
set filePath to item 3 of argv
set attachmentKind to "IMAGE"
if (count of argv) is greater than 3 then set attachmentKind to item 4 of argv
if attachmentKind is "DIAGNOSE" then
  set fileHandle to open for access (POSIX file filePath as alias)
  try
    read fileHandle for 8 as data
    close access fileHandle
  on error failureMessage number messageCode
    close access fileHandle
    error failureMessage number messageCode
  end try
  tell application "Messages" to get count of accounts
  return "ready"
end if
if attachmentKind is "CONVERSATION_IMAGE" then
  set serviceUsed to sendToExistingChat(phoneE164, filePath)
  if serviceUsed is not "" then
    delay 15
    return serviceUsed
  end if
end if
set requestedTypes to {"SMS", "RCS", "iMessage"}
set serviceUsed to ""
repeat with requestedType in requestedTypes
  if serviceUsed is "" then set serviceUsed to sendWithType(phoneNumber, filePath, requestedType as text)
end repeat
if serviceUsed is "" then error "No enabled Messages account can address this phone number"
delay 15
return serviceUsed
end timeout
end run

on sendToExistingChat(phoneE164, filePath)
tell application "Messages"
  try
    set targetChat to chat id ("any;-;" & phoneE164)
    if not (exists targetChat) then return ""
  on error
    return ""
  end try
  -- Once send starts, propagate errors: Messages may already have accepted it.
  send POSIX file filePath to targetChat
  return "existing conversation"
end tell
end sendToExistingChat

on sendWithType(phoneNumber, filePath, requestedType)
tell application "Messages"
  repeat with targetAccount in accounts
    set accountType to ""
    try
      set accountType to service type of targetAccount as text
    on error
      -- macOS 26 exposes additional account kinds that its AppleScript
      -- dictionary cannot convert. Ignore only that account and continue.
    end try
    if accountType is requestedType and enabled of targetAccount is true then
      set targetParticipant to missing value
      try
        set targetParticipant to participant phoneNumber of targetAccount
        if not (exists targetParticipant) then set targetParticipant to missing value
      on error
        set targetParticipant to missing value
      end try
      if targetParticipant is not missing value then
        send POSIX file filePath to targetParticipant
        return requestedType
      end if
    end if
  end repeat
end tell
return ""
end sendWithType
`;

export async function messagesServices(): Promise<string[]> {
  const script = `tell application "Messages"
set foundServices to {}
repeat with targetAccount in accounts
  try
    if enabled of targetAccount then set end of foundServices to (service type of targetAccount as text)
  end try
end repeat
return foundServices
end tell`;
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script]);
  return stdout.split(",").map((item) => item.trim()).filter(Boolean);
}

export async function sendMessagesAttachment(
  phoneE164: string,
  attachmentPath: string,
  attachmentKind: "IMAGE" | "CONVERSATION_IMAGE" = "IMAGE",
): Promise<MessagesSubmission> {
  return sendStagedMessagesAttachment(phoneE164, attachmentPath, attachmentKind);
}
