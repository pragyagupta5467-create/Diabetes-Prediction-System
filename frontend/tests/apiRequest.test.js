import assert from "node:assert/strict";
import test from "node:test";
import { postJsonToBaseUrl } from "../src/request.js";

test("POST client sends JSON and parses a successful JSON response", async () => {
  let observedUrl = "";
  let observedBody;
  const result = await postJsonToBaseUrl(
    "https://api.example.test",
    "/predict",
    { glucose: 100 },
    1000,
    async (url, options) => {
      observedUrl = url;
      observedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ risk_percentage: 12 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );

  assert.equal(observedUrl, "https://api.example.test/predict");
  assert.deepEqual(observedBody, { glucose: 100 });
  assert.deepEqual(result, { risk_percentage: 12 });
});

test("POST client reports malformed success JSON", async () => {
  await assert.rejects(
    postJsonToBaseUrl(
      "https://api.example.test",
      "/api/chat",
      {},
      1000,
      async () => new Response("{", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
    /malformed JSON/,
  );
});

test("POST client surfaces structured non-2xx backend errors", async () => {
  await assert.rejects(
    postJsonToBaseUrl(
      "https://api.example.test",
      "/api/chat",
      {},
      1000,
      async () => new Response(JSON.stringify({
        error: { code: "chat_context_not_configured", message: "Set the secret." },
      }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    ),
    /Set the secret/,
  );
});

test("POST client distinguishes network failures and timeouts", async () => {
  await assert.rejects(
    postJsonToBaseUrl(
      "https://api.example.test",
      "/predict",
      {},
      1000,
      async () => { throw new TypeError("fetch failed"); },
    ),
    /Could not connect to the backend/,
  );

  await assert.rejects(
    postJsonToBaseUrl(
      "https://api.example.test",
      "/predict",
      {},
      1,
      (_, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    ),
    /too long to respond/,
  );
});
