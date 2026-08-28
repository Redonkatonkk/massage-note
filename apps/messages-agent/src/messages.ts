import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const messagesAttachmentScript = `on run argv
set phoneNumber to item 1 of argv
set filePath to item 2 of argv
set messageText to item 3 of argv
set serviceUsed to sendWithType(phoneNumber, filePath, messageText, "iMessage")
if serviceUsed is "" then set serviceUsed to sendWithType(phoneNumber, filePath, messageText, "RCS")
if serviceUsed is "" then set serviceUsed to sendWithType(phoneNumber, filePath, messageText, "SMS")
if serviceUsed is "" then error "No iMessage, RCS, or SMS account can address this phone number"
return serviceUsed
end run

on sendWithType(phoneNumber, filePath, messageText, requestedType)
tell application "Messages"
  repeat with targetAccount in accounts
    try
      if (service type of targetAccount as text) is requestedType then
        set targetParticipant to participant phoneNumber of targetAccount
        send POSIX file filePath to targetParticipant
        send messageText to targetParticipant
        return requestedType
      end if
    end try
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
    set end of foundServices to (service type of targetAccount as text)
  end try
end repeat
return foundServices
end tell`;
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script]);
  return stdout.split(",").map((item) => item.trim()).filter(Boolean);
}

export async function sendMessagesAttachment(phoneE164: string, pngPath: string, message: string): Promise<string> {
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", messagesAttachmentScript, "--", phoneE164, pngPath, message]);
  return stdout.trim();
}
