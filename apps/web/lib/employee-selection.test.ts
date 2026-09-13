import { describe, expect, it, vi } from "vitest";
import { addEmployeesInOrder, toggleOrderedSelection } from "./employee-selection";

describe("employee selection", () => {
  it("keeps click order and appends a reselected employee at the end", () => {
    let selected: string[] = [];
    for (const id of ["c", "a", "b", "a", "a"]) selected = toggleOrderedSelection(selected, id);
    expect(selected).toEqual(["c", "b", "a"]);
  });

  it("waits for each append before starting the next", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => { release = resolve; });
    const add = vi.fn(async (id: string) => { if (id === "c") await first; });
    const onAdded = vi.fn();
    const pending = addEmployeesInOrder(["c", "a", "b"], add, onAdded);
    expect(add.mock.calls).toEqual([["c"]]);
    expect(onAdded).not.toHaveBeenCalled();
    release();
    await pending;
    expect(add.mock.calls).toEqual([["c"], ["a"], ["b"]]);
    expect(onAdded.mock.calls).toEqual([["c"], ["a"], ["b"]]);
  });

  it("stops on failure and retains remaining employees in retry order", async () => {
    let remaining = ["c", "a", "b"];
    const add = vi.fn(async (id: string) => { if (id === "a") throw new Error("failed"); });
    await expect(addEmployeesInOrder(remaining, add, (id) => {
      remaining = remaining.filter((value) => value !== id);
    })).rejects.toThrow("failed");
    expect(add.mock.calls).toEqual([["c"], ["a"]]);
    expect(remaining).toEqual(["a", "b"]);
  });
});
