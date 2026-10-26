import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiBaseUrl } from "../src/apiConfig.js";

test("development without an API URL uses the local Flask backend", () => {
  assert.equal(
    resolveApiBaseUrl("", true),
    "http://127.0.0.1:5000",
  );
});

test("production requires an explicitly configured API URL", () => {
  assert.throws(
    () => resolveApiBaseUrl("", false),
    /Set VITE_API_URL/,
  );
});

test("configured backend URLs are validated and trailing slashes normalized", () => {
  assert.equal(
    resolveApiBaseUrl("https://api.example.test///", false),
    "https://api.example.test",
  );
  assert.throws(
    () => resolveApiBaseUrl("file:///tmp/api", false),
    /HTTP or HTTPS/,
  );
});
