# Diabetes Prediction System — Fix Report

## Summary

The React app and Flask API are separate services. Seeing JSON at the backend root is
expected; `/` and `/health` are API health endpoints, not the React site. The frontend is
served by Vite locally and must be deployed separately (for example, on Vercel).

The local Flask service and Vite frontend were started independently and exercised
together. Prediction succeeds, returns the existing result fields plus a signed chat
context when configured, and the browser UI displays the result. The signed-context flow
was verified end to end. A real OpenAI response was not tested: this workspace has no
backend `.env`, and a live chat request correctly returned `llm_not_configured` because
`OPENAI_API_KEY` is absent.

No commit, push, or deployment was performed.

## Confirmed root causes and fixes

| Area | Confirmed cause | Repair |
|---|---|---|
| Prediction inputs | The API previously substituted zero for omitted values, and the frontend did not consistently distinguish blank fields from numeric zero. | Require all eight fields, validate finite numeric values and model ranges, reject malformed JSON, and send numeric values from the frontend. Zero remains an allowed “not recorded” sentinel only for skin thickness and insulin. |
| Model preprocessing | The old training script imputed dataset-wide zero sentinels before splitting, so evaluation preprocessing used holdout information. The serving code also had no matching imputation step. | Add a shared inference/training pipeline. During holdout evaluation, zero-sentinel replacement, imputation, and scaling are fitted only on training rows. The inference pipeline is then refit on all rows for production. |
| Model artifacts | The old model and scaler do not include their preprocessing and remain version-sensitive. | Preserve both legacy artifacts unchanged. Add a separate, atomically written `diabetes_pipeline.pkl`; the app validates its feature order and prefers it, retaining the old files as a fallback. Retraining refuses to overwrite an existing versioned pipeline. |
| Reported performance | The README and dashboard advertised 97%/92% without a reproducible evaluation basis. | Replace those claims with the measured fixed-split result below and label it as a small-dataset holdout result, not a clinical guarantee. |
| Chat context | `chat_context_not_configured` is returned when `CHAT_CONTEXT_SECRET` is absent or shorter than 32 characters. The backend loads `backend/.env` by an absolute path, but no such local file existed. | Keep signature validation enabled; the local run used an ephemeral test-only secret. A prediction returned a token, and the chat endpoint accepted/verified it before returning the separate, expected provider-configuration error. |
| AI provider | The existing implementation uses OpenAI Chat Completions. A server-side `OPENAI_API_KEY` is required; it was absent in this workspace. | Keep provider/model configuration on the backend, return a user-safe `llm_not_configured` error, and retain mocked-provider tests. No alternate provider or simulated answer was added. |
| Frontend API origin | Production requests require `VITE_API_URL`; only development may fall back to localhost. | Centralize URL resolution and requests, normalize trailing slashes, and report configuration, timeout, network, invalid JSON, and HTTP errors. |
| Local Vite task | The task passed a host value that Vite treated as a positional project-root path; Vite appeared ready but served 404. | Remove the unnecessary CLI arguments and align the VS Code launch URL/readiness pattern with Vite’s default `http://localhost:5173/`. Verified the corrected dev server returns HTTP 200. |
| Deployment status | Earlier checks returned HTTP 503 for `/` and `/health`; the final recheck timed out without a response (curl HTTP 000). | Do not treat the health response or deployment as verified. The current hosted revision and endpoint set remain unknown. |

### Model evaluation and behavior change

The dataset has 768 rows, is tab-separated, and contains the eight API features plus
`Outcome`. The pipeline keeps this feature order:

`Pregnancies, Glucose, BloodPressure, SkinThickness, Insulin, BMI, DiabetesPedigreeFunction, Age`

For the reproducible 20% stratified holdout (`random_state=42`, 154 rows), the training-only
Random Forest candidate measured:

| Metric | Result |
|---|---:|
| Accuracy | 74.68% |
| Recall (class 1) | 57.41% |
| Precision (class 1) | 65.96% |
| F1 (class 1) | 61.39% |
| Confusion matrix (true rows, predicted columns) | `[[84, 16], [23, 31]]` |

As a behavior-change check, the preserved legacy artifacts and a training-only pipeline
candidate were compared on the original script's unstratified `random_state=42` held-out
rows: class predictions differed for 1 of 154 rows, and mean absolute class-1 probability
change was 1.8539 percentage points. This is a prediction-difference check, not a valid
comparison of generalization performance: the legacy pipeline imputed using the full
dataset, and the legacy artifact's exact training provenance is not established.

The API percentage is the model's class-1 probability, not a calibrated medical risk or
diagnosis. The old serialized sklearn estimators report that they were created with
scikit-learn 1.8.0, while the project runtime is pinned to 1.7.2 for the new artifact.
The legacy fallback loaded and produced predictions in this environment, but sklearn
emitted cross-version warnings; use the versioned pipeline for normal operation.

## Files changed

| File | Reason |
|---|---|
| `.gitignore` | Allow the versioned model artifact, environment example, and VS Code launch/task files to be included while continuing to ignore local secrets and generated files. |
| `.vscode/launch.json` | Replace the unrelated machine-specific C++ launch configuration with Flask and React launch configurations. |
| `.vscode/tasks.json` | Add the Vite task and use the working default Vite command and readiness URL. |
| `README` | Document model methodology/metrics, local configuration, API contracts, and separate Vercel/Render deployment settings; remove unsubstantiated accuracy claims. |
| `backend/.env.example` | Document local backend variables with placeholders only. |
| `backend/.env.production.example` | Document production backend variables with placeholders only. |
| `backend/app.py` | Add strict prediction validation, pipeline-first model loading, API health/version details, safe inference errors, and configurable exact-origin CORS. |
| `backend/chat_service.py` | Preserve/clarify signed context configuration and provider error handling; do not bypass token verification. |
| `backend/diabetes_pipeline.pkl` | Add the separately generated inference pipeline; the original model and scaler files were not overwritten. |
| `backend/model_pipeline.py` | Define the shared feature order, zero-sentinel preprocessing, imputer/scaler pipeline, and deterministic Random Forest pipeline. |
| `backend/requirements.txt` | Pin scikit-learn to the runtime version used to create the new pipeline and retain backend dependencies. |
| `backend/tests/test_chat_api.py` | Cover health, prediction validation/contracts, missing model/config, CORS, context signing/verification, provider errors, pipeline feature order, and artifact overwrite protection. |
| `backend/train_model.py` | Use stratified reproducible evaluation with training-only preprocessing, report metrics, refit for inference, and save atomically without overwriting an existing pipeline. |
| `frontend/.env.production.example` | Record the previously intended HTTPS API origin; it is not evidence that the origin is currently healthy. |
| `frontend/eslint.config.js` | Configure Node globals for the frontend’s built-in test files. |
| `frontend/package.json` | Add the `npm test` command using Node’s built-in test runner. |
| `frontend/src/App.jsx` | Validate required inputs, send numeric values, present prediction errors consistently, allow sentinel zeros only for the documented measurements, and replace the unverified accuracy display. |
| `frontend/src/api.js` | Route prediction/chat calls through the shared request client. |
| `frontend/src/apiConfig.js` | Resolve and normalize `VITE_API_URL`, allowing localhost only in development. |
| `frontend/src/predictionForm.js` | Centralize required-field, numeric, range, and integer validation. |
| `frontend/src/request.js` | Centralize JSON POST, timeout, network, malformed-response, and HTTP error handling. |
| `frontend/tests/apiConfig.test.js` | Test development fallback, required production URL, validation, and URL normalization. |
| `frontend/tests/apiRequest.test.js` | Test successful JSON requests and error/timeout paths. |
| `frontend/tests/predictionForm.test.js` | Test required values, numeric conversion, sentinel zero, and invalid values. |
| `requirements.txt` | Keep root-level Render installs aligned with the backend dependency set. |
| `FIX_REPORT.md` | Record confirmed findings, test evidence, local setup, remaining risks, and deployment actions. |

## Verification results

All commands below were run locally after the final code changes:

| Check | Result |
|---|---|
| `backend\venv\Scripts\python.exe -m unittest discover -s tests -v` | **PASS** — 27 tests, 0 failures, exit code 0. |
| `npm test` (from `frontend`) | **PASS** — 10 tests, 0 failures, exit code 0. |
| `npm run lint` (from `frontend`) | **PASS** — exit code 0. |
| `npm run build` (from `frontend`) | **PASS** — Vite built 34 modules, exit code 0. |
| `git diff --check` | **PASS** — exit code 0. |
| VS Code launch/task JSON parsing | **PASS**. |
| Local `GET /health` and `GET /` | **PASS** — HTTP 200; health reports `model_loaded: true`, version `local`, and prediction/chat routes. |
| Live local `POST /predict` | **PASS** — HTTP 200 for valid numeric inputs including insulin and skin-thickness sentinel zero; response included a signed context token. |
| Local CORS preflight | **PASS** — allowed Vite origin received its exact allow-origin header; an untrusted origin received none. |
| Prediction-to-chat browser flow | **PASS** — entered valid values, received and displayed a prediction, opened the assistant, and saw the expected provider-not-configured message. No real AI call was made. |
| Context configuration behavior | **PASS** — with a test-only process secret, the prediction token was accepted by chat; the response was `llm_not_configured`, not `chat_context_not_configured`. Missing/short secret behavior is covered by backend tests. |
| Render/Vercel live deployment | **NOT VERIFIED** — the known Render origin returned HTTP 503; no production dashboard or deployment access was used. |

No database or Docker-managed dependency is used by this application. The browser check
used Playwright Chromium locally; its browser files were installed in the user cache and
no Playwright dependency was added to the project.

## Configuration required

### Backend

Copy `backend/.env.example` to `backend/.env` for local work. For production, configure
the same values in the hosting provider's environment settings rather than committing a
`.env` file:

| Variable | Required value |
|---|---|
| `LLM_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | A valid server-side OpenAI API key. Keep it out of Vercel and the frontend. |
| `OPENAI_MODEL` | `gpt-4o-mini` (the existing OpenAI Chat Completions implementation’s configured model). |
| `CHAT_CONTEXT_SECRET` | A random secret of at least 32 characters. It signs two-hour prediction context tokens. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated exact frontend origins, such as the local Vite origin(s) in development; use the deployed Vercel origin in production. Do not use a wildcard. |
| `APP_ENV` | `development` locally; `production` on the backend host. |
| `APP_VERSION` | Optional explicit version; Render's `RENDER_GIT_COMMIT` is used when available. |

No local `backend/.env` or `frontend/.env.local` existed during verification. The local
HTTP smoke test set only an ephemeral, non-production context secret in the backend
process. `OPENAI_API_KEY` was absent, as confirmed by the safe `llm_not_configured`
response.

### Frontend

`VITE_API_URL` is the only frontend API-origin variable. It is optional in local Vite
development, where the frontend falls back to `http://127.0.0.1:5000`; it is mandatory
for production builds. `frontend/.env.production.example` contains the existing intended
origin `https://diabetes-prediction-system-1-qvw0.onrender.com`. Earlier checks returned
503; a final recheck timed out. Its current health must be verified before relying on it.

## Local Windows PowerShell instructions

Backend terminal:

```powershell
cd C:\Users\hp\Desktop\leetcode\collage_project\Diabetes-Prediction-System\backend
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

Set the backend variables in `.env`, including a valid provider key if you want live AI
responses, and generate `CHAT_CONTEXT_SECRET` with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Then start Flask from the same terminal:

```powershell
python app.py
```

Frontend terminal:

```powershell
cd C:\Users\hp\Desktop\leetcode\collage_project\Diabetes-Prediction-System\frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open the Vite URL printed by the command (normally `http://localhost:5173`). To rerun
checks:

```powershell
# Backend
cd C:\Users\hp\Desktop\leetcode\collage_project\Diabetes-Prediction-System\backend
.\venv\Scripts\python.exe -m unittest discover -s tests -v

# Frontend
cd C:\Users\hp\Desktop\leetcode\collage_project\Diabetes-Prediction-System\frontend
npm test
npm run lint
npm run build
```

## Deployment settings and remaining actions

### Vercel frontend

Configure the Vercel project with:

- **Root Directory:** `frontend`
- **Framework Preset:** `Vite`
- **Install Command:** `npm ci`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Node.js:** 22.x (or a version supported by the checked-in Vite version)
- **Environment:** Set `VITE_API_URL` for Production and Preview to the verified HTTPS
  backend origin. Do not add `OPENAI_API_KEY` to Vercel.

Vite embeds this value at build time. After changing it, create a new frontend build and
redeploy.

### Flask backend

The backend needs separate hosting; Vercel does not run this Flask application from the
frontend project configuration. For Render, use one of these consistent configurations:

1. **Repository root as service root:** root `Procfile`, root `requirements.txt`, command
   `gunicorn --chdir backend app:app --bind 0.0.0.0:$PORT`.
2. **`backend` as service root:** `backend/Procfile`, `backend/requirements.txt`, command
   `gunicorn app:app --bind 0.0.0.0:$PORT`.

Configure the production backend variables listed above, setting `CORS_ALLOWED_ORIGINS`
to the exact deployed Vercel origin. Ensure `backend/diabetes_pipeline.pkl` is included
when the source changes are committed and deployed; the old model/scaler files are not a
replacement for that versioned pipeline.

After the backend is deployed, check `/health` for the expected routes, `model_loaded:
true`, and a non-`local` version/commit. Then verify `/predict` and `/api/chat` from the
deployed frontend. The currently known Render origin previously returned 503 and later timed out, so repairing
or confirming that Render service is a required manual action before production use. The
current hosted revision, Vercel project settings, and production requests were not
verified here.

## Manual feature verification

1. Start both services using the PowerShell commands above.
2. Enter all eight values in the prediction form. For a safe example, use pregnancies
   `6`, glucose `148`, blood pressure `72`, skin thickness `0`, insulin `0`, BMI `33.6`,
   pedigree `0.627`, and age `50`.
3. Run the analysis. Confirm a percentage and risk level appear with the “Not a
   diagnosis” notice. Blank values should be rejected; zero is accepted only for insulin
   and skin thickness.
4. Choose **Ask the AI assistant**. With `CHAT_CONTEXT_SECRET` configured, the prediction
   request provides the assistant a signed, expiring context token. With a valid OpenAI
   key/model, the backend should return an educational reply. Without the key, the
   expected response is the visible `llm_not_configured` message; no fake answer is
   returned.
5. To verify the API separately, open `http://127.0.0.1:5000/health` and send a JSON
   `POST` to `http://127.0.0.1:5000/predict`. `/` returning JSON is expected and does not
   indicate that the React frontend is being served by Flask.
