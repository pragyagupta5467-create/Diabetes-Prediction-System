export function resolveApiBaseUrl(configuredUrl, isDevelopment) {
  const value = typeof configuredUrl === "string" ? configuredUrl.trim() : "";
  if (!value) {
    if (isDevelopment) return "http://127.0.0.1:5000";
    throw new Error(
      "The backend URL is not configured. Set VITE_API_URL in the frontend build environment.",
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("VITE_API_URL must be an absolute HTTP or HTTPS URL.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("VITE_API_URL must use HTTP or HTTPS.");
  }

  return value.replace(/\/+$/, "");
}
