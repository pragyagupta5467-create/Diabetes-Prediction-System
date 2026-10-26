import { resolveApiBaseUrl } from "./apiConfig";
import { postJsonToBaseUrl } from "./request";

const viteEnvironment = import.meta.env ?? {};

export async function postJson(path, payload, timeoutMs = 45000) {
  const apiUrl = resolveApiBaseUrl(
    viteEnvironment.VITE_API_URL,
    viteEnvironment.DEV,
  );
  return postJsonToBaseUrl(apiUrl, path, payload, timeoutMs);
}
