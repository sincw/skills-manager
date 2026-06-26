import { describe, expect, it } from "vitest";
import { resolveLocalPathSelection, singleSelectedPath } from "./installLocalPathFallback";

describe("local install path fallback", () => {
  it("opens the matching fallback picker when the native dialog returns null", () => {
    expect(resolveLocalPathSelection(null, "folder")).toEqual({
      sourcePath: null,
      fallbackMode: "folder",
    });
    expect(resolveLocalPathSelection(null, "archive")).toEqual({
      sourcePath: null,
      fallbackMode: "archive",
    });
    expect(resolveLocalPathSelection(null, "batch")).toEqual({
      sourcePath: null,
      fallbackMode: "batch",
    });
  });

  it("uses the selected path when the native dialog returns a path", () => {
    expect(resolveLocalPathSelection("/tmp/skill", "folder")).toEqual({
      sourcePath: "/tmp/skill",
      fallbackMode: null,
    });
  });

  it("keeps native dialog cancellation as a no-op when fallback is unavailable", () => {
    expect(resolveLocalPathSelection(null, "folder", false)).toEqual({
      sourcePath: null,
      fallbackMode: null,
    });
  });

  it("uses the first path when a dialog returns an array", () => {
    expect(singleSelectedPath(["/tmp/one", "/tmp/two"])).toBe("/tmp/one");
    expect(singleSelectedPath([])).toBeNull();
  });
});
