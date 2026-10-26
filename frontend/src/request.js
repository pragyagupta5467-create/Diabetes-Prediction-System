export async function postJsonToBaseUrl(
  apiUrl,
  path,
  payload,
  timeoutMs = 45000,
  fetchImpl = fetch,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${apiUrl}/${path.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        if (response.ok) {
          throw new Error("The backend returned malformed JSON.");
        }
      }
    } else if (response.ok) {
      throw new Error("The backend returned a non-JSON response.");
    }

    if (!response.ok) {
      const message =
        typeof data?.error === "string"
          ? data.error
          : data?.error?.message || `The backend returned HTTP ${response.status}.`;
      throw new Error(message);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("The backend returned an invalid response.");
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The backend took too long to respond. Please try again.");
    }
    if (error instanceof TypeError) {
      throw new Error(
        `Could not connect to the backend at ${apiUrl}. Check that it is running, that VITE_API_URL is correct, and that CORS permits this frontend.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
