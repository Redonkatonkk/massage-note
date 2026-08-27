import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
  const script = `on sendWithType(phoneNumber, filePath, messageText, requestedType)
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
set serviceUsed to sendWithType(item 1 of argv, item 2 of argv, item 3 of argv, "iMessage")
if serviceUsed is "" then set serviceUsed to sendWithType(item 1 of argv, item 2 of argv, item 3 of argv, "RCS")
if serviceUsed is "" then set serviceUsed to sendWithType(item 1 of argv, item 2 of argv, item 3 of argv, "SMS")
if serviceUsed is "" then error "No iMessage, RCS, or SMS account can address this phone number"
return serviceUsed`;
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script, "--", phoneE164, pngPath, message]);
  return stdout.trim();
}
