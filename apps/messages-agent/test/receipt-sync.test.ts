import { afterEach, expect, it, vi } from "vitest";
import { syncDeliveryReceipts } from "../src/receipt-sync.js";
import { messagesDeliveryState } from "../src/stager.js";

vi.mock("../src/stager.js", () => ({ messagesDeliveryState: vi.fn(), taskMessagesPath: (id: string, file: string) => `/tasks/${id}/${file}` }));
afterEach(() => vi.resetAllMocks());
const job = { id: "job", attemptCount: 2, recipientPhoneE164: "+13105551234" };
const delivered = { messageGuid: "retry", state: "DELIVERED" as const, errorCode: 0, service: "RCS" };

it("syncs a late/manual-retry receipt for both task types without sending or claiming", async () => {
  const request = vi.fn(async (path: string) => path.endsWith("/receipts") ? [job] : { recorded: true });
  vi.mocked(messagesDeliveryState).mockResolvedValue(delivered);
  await syncDeliveryReceipts(request as never, { accepted: [job.id], completed: [job.id] });
  expect(messagesDeliveryState).toHaveBeenCalledWith(job.recipientPhoneE164, "/tasks/job/closing.png");
  expect(messagesDeliveryState).toHaveBeenCalledWith(job.recipientPhoneE164, "/tasks/job/settlement-details.jpg");
  const reports = request.mock.calls.filter(([path]) => path.endsWith("/receipt"));
  expect(reports).toHaveLength(2);
  expect(request).toHaveBeenCalledWith("/closing-delivery-agent/jobs/job/receipt", expect.objectContaining({ body: JSON.stringify({ attemptCount: 2, receipt: delivered }) }));
  expect(request.mock.calls.every(([path]) => /\/receipts?$/.test(path))).toBe(true);
});

it("does not attribute the previous send to a new attempt; missing results still rotate the polling queue", async () => {
  const request = vi.fn(async (path: string) => path.endsWith("/receipts") ? [job] : {});
  vi.mocked(messagesDeliveryState).mockResolvedValue(delivered);
  await syncDeliveryReceipts(request as never, { accepted: [], completed: [], submitted: { job: { service: "RCS", previousMessageGuid: "retry", attachmentPath: "/task" } } });
  expect(request).toHaveBeenCalledWith("/closing-delivery-agent/jobs/job/receipt", expect.objectContaining({ body: JSON.stringify({ attemptCount: 2, receipt: { state: "MISSING", messageGuid: null, errorCode: 0, service: null } }) }));
});

it("a status read error cannot report success and does not block the other task queue", async () => {
  const request = vi.fn(async (path: string) => path.endsWith("/receipts") ? [job] : {});
  vi.mocked(messagesDeliveryState).mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(delivered);
  await syncDeliveryReceipts(request as never, { accepted: [], completed: [] });
  expect(request.mock.calls.filter(([path]) => path.endsWith("/receipt"))).toHaveLength(1);
});
