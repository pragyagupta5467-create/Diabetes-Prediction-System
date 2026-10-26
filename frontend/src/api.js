function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return "http://127.0.0.1:5000";
  }

  throw new Error(
    "The backend URL is not configured. Set VITE_API_URL in the frontend build environment.",
  );
}

export async function postJson(path, payload, timeoutMs = 45000) {
  const apiUrl = getApiBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
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
