import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function messagesPhoneHandle(phoneE164: string) {
  const match = /^\+1(\d{10})$/.exec(phoneE164);
  return match?.[1] ?? phoneE164;
}

export const messagesAttachmentScript = `on run argv
set phoneNumber to item 1 of argv
set filePath to item 2 of argv
set serviceUsed to sendWithType(phoneNumber, filePath, "SMS")
if serviceUsed is "" then set serviceUsed to sendWithType(phoneNumber, filePath, "RCS")
if serviceUsed is "" then set serviceUsed to sendWithType(phoneNumber, filePath, "iMessage")
if serviceUsed is "" then error "No enabled Messages account can address this phone number"
delay 15
return serviceUsed
end run

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
      set targetParticipant to participant phoneNumber of targetAccount
      send POSIX file filePath to targetParticipant
      return requestedType
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

export async function sendMessagesAttachment(phoneE164: string, pngPath: string): Promise<string> {
  const phoneHandle = messagesPhoneHandle(phoneE164);
  const { stdout } = await execFileAsync(
    "/usr/bin/osascript",
    ["-e", messagesAttachmentScript, "--", phoneHandle, pngPath],
    { timeout: 45_000 },
  );
  return stdout.trim();
}
