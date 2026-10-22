import { createServer } from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jsonRequestBody, requestBodyError } from "../src/common/request-body.js";
import { apiErrorFromException } from "../src/common/api-exception.filter.js";

const app = express();
app.use(jsonRequestBody, requestBodyError);
app.use((_request, response) => { response.json({ parsed: true }); });
app.use(((error, _request, response, _next) => {
  const { status, payload } = apiErrorFromException(error, "parser-test"); response.status(status).json(payload);
}) satisfies express.ErrorRequestHandler);
const server = createServer(app);
let base = "";
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

it("allows larger JSON exclusively on the two store-import routes", async () => {
  const body = JSON.stringify({ padding: "x".repeat(150000) });
  for (const [path, method, status] of [["/api/v1/stores/abc/data/import/preview", "POST", 200], ["/api/v1/stores/abc/data/import/confirm", "POST", 200], ["/api/v1/stores/abc/data/import/preview/other", "POST", 413], ["/api/v1/stores/abc/data/import/preview", "PATCH", 413], ["/api/v1/stores/abc", "PATCH", 413]] as const) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body });
    expect(response.status, `${method} ${path}`).toBe(status);
  }
});
it("returns structured 400 and 413 errors instead of a server failure", async () => {
  const invalid = await fetch(base + "/invalid", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalid" });
  expect(invalid.status).toBe(400); expect(await invalid.json()).toMatchObject({ code: "INVALID_JSON_BODY" });
  const oversized = await fetch(base + "/api/v1/stores/abc/data/import/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(52 * 1024 * 1024) }) });
  expect(oversized.status).toBe(413); expect(await oversized.json()).toMatchObject({ code: "REQUEST_BODY_TOO_LARGE" });
});
