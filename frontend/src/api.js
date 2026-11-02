import { resolveApiBaseUrl } from "./apiConfig";
import { postJsonToBaseUrl } from "./request";

const viteEnvironment = import.meta.env ?? {};
export const DEFAULT_PRODUCTION_API_URL = "https://diabetes-prediction-system-hzvy.vercel.app";

export async function postJson(path, payload, timeoutMs = 45000) {
  const apiUrl = resolveApiBaseUrl(
    viteEnvironment.VITE_API_URL || (viteEnvironment.DEV ? "" : DEFAULT_PRODUCTION_API_URL),
    viteEnvironment.DEV,
  );
  return postJsonToBaseUrl(apiUrl, path, payload, timeoutMs);
}
