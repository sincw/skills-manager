import { describe, expect, it } from "vitest";
import {
  expandLinuxPath,
  requireConfirm,
  stringArray,
  validateGitUrl,
} from "../src/validation.js";

describe("validation", () => {
  it("accepts absolute and home paths only", () => {
    expect(expandLinuxPath("/tmp/example")).toBe("/tmp/example");
    expect(expandLinuxPath("~/skills")).toContain("/skills");
    expect(() => expandLinuxPath("../relative")).toThrow("absolute Linux path");
  });

  it("rejects control characters", () => {
    expect(() => expandLinuxPath("/tmp/a\u0000b")).toThrow("control characters");
  });

  it("requires explicit confirmation", () => {
    expect(() => requireConfirm(false, "danger")).toThrow("confirm");
    expect(() => requireConfirm(undefined, "danger")).toThrow("confirm");
    expect(() => requireConfirm(true, "danger")).not.toThrow();
  });

  it("validates git URLs", () => {
    expect(validateGitUrl("https://github.com/a/b.git")).toBe("https://github.com/a/b.git");
    expect(validateGitUrl("git@github.com:a/b.git")).toBe("git@github.com:a/b.git");
    expect(() => validateGitUrl("github.com/a/b")).toThrow("Git URL");
  });

  it("requires non-empty arrays", () => {
    expect(stringArray(["a", "b"], "refs")).toEqual(["a", "b"]);
    expect(() => stringArray([], "refs")).toThrow("must not be empty");
    expect(() => stringArray("a", "refs")).toThrow("must be an array");
  });
});
