import { afterEach, expect, it, vi } from "vitest";
import { monitorMessagesDelivery } from "../src/delivery-monitor.js";
import { sendMessagesAttachment } from "../src/messages.js";
import { submitAndConfirmMessages } from "../src/submission.js";
import type { Journal } from "../src/journal.js";
vi.mock("../src/messages.js", () => ({ sendMessagesAttachment: vi.fn() }));
vi.mock("../src/delivery-monitor.js", () => ({ monitorMessagesDelivery: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it("AppleScript 返回后仍保留观察状态，收到发送状态前不写完成检查点", async () => {
  const journal: Journal = { accepted: [], completed: [] };
  const save = vi.fn(async () => {});
  vi.mocked(sendMessagesAttachment).mockResolvedValue({ service: "SMS", previousMessageGuid: "old" });
  let confirm!: (value: Awaited<ReturnType<typeof monitorMessagesDelivery>>) => void;
  vi.mocked(monitorMessagesDelivery).mockImplementation(() => new Promise(resolve => { confirm = resolve; }));
  const result = submitAndConfirmMessages("job", "+13105551234", "/attachment", "IMAGE", journal, save);
  await vi.waitFor(() => expect(monitorMessagesDelivery).toHaveBeenCalled());
  expect(journal.accepted).toEqual([]);
  expect(journal.submitted?.job).toMatchObject({ previousMessageGuid: "old", attachmentPath: "/attachment" });
  confirm({ messageGuid: "new", state: "DELIVERED", errorCode: 0, service: "SMS" });
  await result; expect(journal.accepted).toEqual(["job"]);
});

it("重启后继续观察已提交的任务，不再次发送图片", async () => {
  const journal: Journal = { accepted: [], completed: [], started: ["job"], submitted: { job: { service: "SMS", previousMessageGuid: "old", attachmentPath: "/attachment" } } };
  vi.mocked(monitorMessagesDelivery).mockResolvedValue({ messageGuid: "new", state: "DELIVERED", errorCode: 0, service: "SMS" });
  await submitAndConfirmMessages("job", "+13105551234", "/attachment", "IMAGE", journal, async () => {});
  expect(sendMessagesAttachment).not.toHaveBeenCalled();
  expect(monitorMessagesDelivery).toHaveBeenCalledWith("+13105551234", "/attachment", "old");
});
