import path from "node:path";
import { homedir } from "node:os";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  if (CONTROL_CHARS.test(value)) {
    throw new Error(`${name} contains control characters`);
  }
  return value.trim();
}

export function optionalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return nonEmptyString(value, name);
}

export function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  const items = value.map((item, index) => nonEmptyString(item, `${name}[${index}]`));
  if (items.length === 0) {
    throw new Error(`${name} must not be empty`);
  }
  return items;
}

export function boolValue(value: unknown, name: string, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

export function limitValue(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("limit must be a positive integer");
  }
  return Math.min(parsed, max);
}

export function expandLinuxPath(input: string): string {
  const raw = nonEmptyString(input, "path");
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return path.join(homedir(), raw.slice(2));
  if (!raw.startsWith("/")) {
    throw new Error("path must be an absolute Linux path or start with ~");
  }
  return path.normalize(raw);
}

export function requireConfirm(value: unknown, action: string): void {
  if (value !== true) {
    throw new Error(`${action} requires confirm: true`);
  }
}

export function validateGitUrl(value: unknown, name = "url"): string {
  const url = nonEmptyString(value, name);
  const isGitSsh = /^git@[^:\s]+:[^\s]+$/.test(url);
  const isScheme = /^(https?|ssh|git):\/\/[^\s]+$/.test(url);
  const isFile = /^file:\/\/\/[^\s]+$/.test(url);
  if (!isGitSsh && !isScheme && !isFile) {
    throw new Error(`${name} must be a Git URL`);
  }
  return url;
}

export function refParam(value: unknown): string {
  return nonEmptyString(value, "reference");
}
