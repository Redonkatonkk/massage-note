import { expect, it } from "vitest";
import { LatestRequest } from "./latest-request";

it("后发请求先返回时拒绝旧响应", () => {
  const requests = new LatestRequest();
  requests.setScope("store/date");
  const first = requests.begin();
  const second = requests.begin();
  expect(second()).toBe(true);
  expect(first()).toBe(false);
});

it("切换日期立即使在途响应失效，普通重渲染不影响请求", () => {
  const requests = new LatestRequest();
  requests.setScope("day1");
  const current = requests.begin();
  requests.setScope("day1");
  expect(current()).toBe(true);
  requests.setScope("day2");
  expect(current()).toBe(false);
  requests.setScope("day1");
  expect(current()).toBe(false);
});
