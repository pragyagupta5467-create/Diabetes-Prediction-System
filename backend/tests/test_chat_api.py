import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd
from openai import APIConnectionError, APITimeoutError, RateLimitError
from sklearn.model_selection import train_test_split

import app as prediction_app
from chat_service import create_chat_context_token, verify_chat_context_token
from model_pipeline import FEATURE_ORDER, build_prediction_pipeline
from train_model import load_dataset, save_pipeline_atomically


class ChatApiTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ,
            {
                "LLM_PROVIDER": "openai",
                "OPENAI_API_KEY": "test-key",
                "OPENAI_MODEL": "test-model",
                "CHAT_CONTEXT_SECRET": "test-secret-that-is-at-least-32-characters",
            },
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.client = prediction_app.app.test_client()
        self.inputs = {
            "age": 42,
            "glucose": 125,
            "bloodPressure": 80,
            "bmi": 27.5,
        }
        self.context_token = create_chat_context_token(
            self.inputs,
            45.25,
            "Moderate Risk",
        )

    @staticmethod
    def provider_response(content):
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=content),
                ),
            ],
        )

    def test_health_endpoint_reports_prediction_and_chat_routes(self):
        response = self.client.get("/health")
        body = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["status"], "online")
        self.assertIn("predict", body["endpoints"])
        self.assertIn("chat", body["endpoints"])

    def test_root_endpoint_remains_json_health_response(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/json")
        self.assertIn("endpoints", response.get_json())

    def test_valid_prediction_aware_chat_returns_provider_reply(self):
        with patch(
            "chat_service._request_openai",
            return_value=self.provider_response("This is an educational estimate."),
        ) as provider:
            response = self.client.post(
                "/api/chat",
                json={
                    "message": "What does my prediction mean?",
                    "history": [],
                    "prediction_context": self.context_token,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {"reply": "This is an educational estimate."},
        )
        messages = provider.call_args.args[0]
        self.assertIn("45.25% (Moderate Risk)", messages[0]["content"])
        self.assertIn("glucose 125 mg/dL", messages[0]["content"])

    def test_empty_message_is_rejected(self):
        response = self.client.post("/api/chat", json={"message": "  "})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "invalid_message")

    def test_excessively_long_message_is_rejected(self):
        response = self.client.post("/api/chat", json={"message": "x" * 2001})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "message_too_long")

    def test_missing_context_allows_general_education_chat(self):
        with patch(
            "chat_service._request_openai",
            return_value=self.provider_response("General educational information."),
        ) as provider:
            response = self.client.post(
                "/api/chat",
                json={"message": "What is diabetes?"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Verified context", provider.call_args.args[0][0]["content"])

    def test_invalid_context_is_rejected_before_provider_call(self):
        tampered_token = (
            ("A" if self.context_token[0] != "A" else "B")
            + self.context_token[1:]
        )
        with patch("chat_service._request_openai") as provider:
            response = self.client.post(
                "/api/chat",
                json={
                    "message": "What does my prediction mean?",
                    "prediction_context": tampered_token,
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json()["error"]["code"],
            "invalid_prediction_context",
        )
        provider.assert_not_called()

    def test_missing_context_secret_returns_configuration_error(self):
        with patch.dict(os.environ, {"CHAT_CONTEXT_SECRET": ""}):
            with patch("chat_service._request_openai") as provider:
                response = self.client.post(
                    "/api/chat",
                    json={
                        "message": "What does my prediction mean?",
                        "prediction_context": self.context_token,
                    },
                )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.get_json()["error"]["code"],
            "chat_context_not_configured",
        )
        provider.assert_not_called()

    def test_prediction_rejects_missing_fields(self):
        payload = {
            "pregnancies": 0,
            "glucose": 125,
            "bloodPressure": 80,
            "skinThickness": 20,
            "insulin": 80,
            "bmi": 27.5,
            "pedigree": 0.5,
        }

        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 400)
        self.assertIn("age", response.get_json()["error"])

    def test_prediction_rejects_malformed_and_non_object_json(self):
        malformed = self.client.post(
            "/predict",
            data="{",
            content_type="application/json",
        )
        non_object = self.client.post("/predict", json=["not", "an", "object"])

        self.assertEqual(malformed.status_code, 400)
        self.assertEqual(non_object.status_code, 400)

    def test_prediction_rejects_non_numeric_non_finite_and_out_of_range_values(self):
        payload = {
            "pregnancies": 0,
            "glucose": 125,
            "bloodPressure": 80,
            "skinThickness": 20,
            "insulin": 80,
            "bmi": 27.5,
            "pedigree": 0.5,
            "age": 42,
        }
        cases = [
            ({**payload, "glucose": "not-a-number"}, "glucose"),
            ({**payload, "glucose": float("nan")}, "glucose"),
            ({**payload, "bmi": 61}, "bmi"),
            ({**payload, "age": 42.5}, "age"),
        ]
        with patch.object(prediction_app, "model_pipeline", None):
            for body, field in cases:
                with self.subTest(field=field, value=body[field]):
                    response = self.client.post("/predict", json=body)
                    self.assertEqual(response.status_code, 400)
                    self.assertIn(field, response.get_json()["error"])

    def test_prediction_returns_service_unavailable_when_artifacts_are_missing(self):
        with patch.object(prediction_app, "model_pipeline", None), patch.object(
            prediction_app,
            "model",
            None,
        ), patch.object(prediction_app, "scaler", None):
            response = self.client.post(
                "/predict",
                json={
                    "pregnancies": 0,
                    "glucose": 125,
                    "bloodPressure": 80,
                    "skinThickness": 20,
                    "insulin": 80,
                    "bmi": 27.5,
                    "pedigree": 0.5,
                    "age": 42,
                },
            )

        self.assertEqual(response.status_code, 503)

    def test_model_artifact_load_failure_is_reported_without_details(self):
        with patch("app.os.path.isfile", return_value=True), patch(
            "app.joblib.load",
            side_effect=OSError("private artifact path"),
        ):
            with self.assertLogs("app", level="ERROR") as logs:
                loaded = prediction_app.load_model_artifacts()

        self.assertEqual(loaded, (None, None, None))
        self.assertNotIn("private artifact path", "\n".join(logs.output))

    def test_cors_preflight_allows_only_configured_frontend_origin(self):
        with patch.dict(
            os.environ,
            {"CORS_ALLOWED_ORIGINS": "https://frontend.example.test"},
        ):
            allowed = self.client.options(
                "/predict",
                headers={
                    "Origin": "https://frontend.example.test",
                    "Access-Control-Request-Method": "POST",
                },
            )
            denied = self.client.options(
                "/predict",
                headers={
                    "Origin": "https://untrusted.example.test",
                    "Access-Control-Request-Method": "POST",
                },
            )

        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(
            allowed.headers.get("Access-Control-Allow-Origin"),
            "https://frontend.example.test",
        )
        self.assertIsNone(denied.headers.get("Access-Control-Allow-Origin"))

    def test_follow_up_includes_bounded_conversation_history(self):
        history = [
            {"role": "user", "content": "I have a result."},
            {"role": "assistant", "content": "I can explain it as an estimate."},
        ]
        with patch(
            "chat_service._request_openai",
            return_value=self.provider_response("Ask your clinician about testing."),
        ) as provider:
            response = self.client.post(
                "/api/chat",
                json={
                    "message": "What should I ask about?",
                    "history": history,
                },
            )

        self.assertEqual(response.status_code, 200)
        messages = provider.call_args.args[0]
        self.assertEqual(messages[1:3], history)
        self.assertEqual(messages[-1], {
            "role": "user",
            "content": "What should I ask about?",
        })

    def test_history_above_limit_is_rejected(self):
        history = [{"role": "user", "content": "question"}] * 11
        response = self.client.post(
            "/api/chat",
            json={"message": "Next question", "history": history},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "invalid_history")

    def test_missing_provider_credentials_returns_configuration_error(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            with patch("chat_service._request_openai") as provider:
                response = self.client.post(
                    "/api/chat",
                    json={"message": "What is diabetes?"},
                )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["error"]["code"], "llm_not_configured")
        provider.assert_not_called()

    def test_provider_timeout_returns_gateway_timeout(self):
        request = Mock()
        with patch(
            "chat_service._request_openai",
            side_effect=APITimeoutError(request=request),
        ):
            response = self.client.post(
                "/api/chat",
                json={"message": "What is diabetes?"},
            )

        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.get_json()["error"]["code"], "llm_timeout")

    def test_provider_connection_failure_returns_safe_error(self):
        with patch(
            "chat_service._request_openai",
            side_effect=APIConnectionError(request=Mock()),
        ):
            response = self.client.post(
                "/api/chat",
                json={"message": "What is diabetes?"},
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()["error"]["code"], "llm_unavailable")
        self.assertNotIn("Traceback", response.get_data(as_text=True))

    def test_provider_rate_limit_is_reported(self):
        error = RateLimitError(
            message="rate limited",
            response=Mock(status_code=429),
            body=None,
        )
        with patch("chat_service._request_openai", side_effect=error):
            response = self.client.post(
                "/api/chat",
                json={"message": "What is diabetes?"},
            )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.get_json()["error"]["code"], "llm_rate_limited")

    def test_prediction_response_and_model_behavior_remain_compatible(self):
        class TestScaler:
            def transform(self, features):
                return features

        class TestModel:
            classes_ = np.array([0, 1])

            def predict_proba(self, features):
                return np.array([[0.45, 0.55]])

        payload = {
            "pregnancies": 1,
            "glucose": 125,
            "bloodPressure": 80,
            "skinThickness": 20,
            "insulin": 80,
            "bmi": 27.5,
            "pedigree": 0.5,
            "age": 42,
        }
        with patch.object(prediction_app, "model_pipeline", None), patch.object(
            prediction_app,
            "scaler",
            TestScaler(),
        ), patch.object(
            prediction_app,
            "model",
            TestModel(),
        ):
            response = self.client.post("/predict", json=payload)

        result = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(result["risk_percentage"], 55.0)
        self.assertEqual(result["risk_level"], "Moderate Risk")
        self.assertIn("chat_context_token", result)
        self.assertIsNotNone(result["chat_context_token"])

    def test_bundled_model_prediction_produces_verifiable_chat_context(self):
        if not prediction_app.model_is_loaded():
            self.skipTest("Bundled model artifacts could not be loaded.")

        payload = {
            "pregnancies": 6,
            "glucose": 148,
            "bloodPressure": 72,
            "skinThickness": 35,
            "insulin": 80,
            "bmi": 33.6,
            "pedigree": 0.627,
            "age": 50,
        }
        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertIsInstance(result["risk_percentage"], float)
        self.assertGreaterEqual(result["risk_percentage"], 0)
        self.assertLessEqual(result["risk_percentage"], 100)
        self.assertIn(
            result["risk_level"],
            {"Low Risk", "Moderate Risk", "High Risk"},
        )
        context = verify_chat_context_token(result["chat_context_token"])
        self.assertEqual(context["inputs"]["glucose"], 148)
        self.assertEqual(
            context["prediction"]["risk_percentage"],
            result["risk_percentage"],
        )

    def test_unavailable_context_signing_does_not_break_prediction(self):
        class TestScaler:
            def transform(self, features):
                return features

        class TestModel:
            classes_ = np.array([0, 1])

            def predict_proba(self, features):
                return np.array([[0.7, 0.3]])

        payload = {
            "pregnancies": 0,
            "glucose": 110,
            "bloodPressure": 75,
            "skinThickness": 18,
            "insulin": 65,
            "bmi": 24.5,
            "pedigree": 0.4,
            "age": 35,
        }
        with patch.dict(os.environ, {"CHAT_CONTEXT_SECRET": "too-short"}), patch.object(
            prediction_app,
            "model_pipeline",
            None,
        ), patch.object(
            prediction_app,
            "scaler",
            TestScaler(),
        ), patch.object(prediction_app, "model", TestModel()):
            response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["risk_percentage"], 30.0)
        self.assertIsNone(response.get_json()["chat_context_token"])

    def test_missing_context_secret_omits_token_and_logs_configuration_error(self):
        class TestScaler:
            def transform(self, features):
                return features

        class TestModel:
            classes_ = np.array([0, 1])

            def predict_proba(self, features):
                return np.array([[0.7, 0.3]])

        payload = {
            "pregnancies": 0,
            "glucose": 110,
            "bloodPressure": 75,
            "skinThickness": 18,
            "insulin": 65,
            "bmi": 24.5,
            "pedigree": 0.4,
            "age": 35,
        }
        with patch.dict(os.environ, {"CHAT_CONTEXT_SECRET": ""}), patch.object(
            prediction_app,
            "model_pipeline",
            None,
        ), patch.object(
            prediction_app,
            "scaler",
            TestScaler(),
        ), patch.object(prediction_app, "model", TestModel()):
            with self.assertLogs("app", level="WARNING") as logs:
                response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get_json()["chat_context_token"])
        self.assertIn("chat_context_not_configured", logs.output[0])

    def test_versioned_pipeline_preserves_feature_order_and_training_only_imputation(self):
        dataset = load_dataset()
        features = dataset.loc[:, FEATURE_ORDER]
        labels = dataset["Outcome"]
        x_train, _, y_train, _ = train_test_split(
            features,
            labels,
            test_size=0.2,
            random_state=42,
            stratify=labels,
        )
        candidate = build_prediction_pipeline(n_estimators=10)
        candidate.fit(x_train, y_train)

        self.assertEqual(tuple(candidate.feature_names_in_), FEATURE_ORDER)
        self.assertEqual(
            candidate.named_steps["classifier"].classes_.tolist(),
            [0, 1],
        )
        imputed_training = x_train.copy()
        for column in ("Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"):
            imputed_training[column] = imputed_training[column].replace(0, np.nan)
        expected_means = imputed_training.mean().to_numpy()
        np.testing.assert_allclose(
            candidate.named_steps["imputer"].statistics_,
            expected_means,
        )

    def test_pipeline_artifact_inference_is_repeatable_and_returns_contract(self):
        if prediction_app.model_pipeline is None:
            self.skipTest("Versioned pipeline artifact has not been generated.")

        payload = {
            "pregnancies": 6,
            "glucose": 148,
            "bloodPressure": 72,
            "skinThickness": 0,
            "insulin": 0,
            "bmi": 33.6,
            "pedigree": 0.627,
            "age": 50,
        }
        first = self.client.post("/api/predict", json=payload)
        second = self.client.post("/predict", json=payload)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.get_json()["risk_percentage"], second.get_json()["risk_percentage"])
        self.assertIn(first.get_json()["risk_level"], {"Low Risk", "Moderate Risk", "High Risk"})
        self.assertIn("chat_context_token", first.get_json())

    def test_training_refuses_to_overwrite_an_existing_pipeline_artifact(self):
        preserved_artifact = b"existing artifact"
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = os.path.join(directory, "diabetes_pipeline.pkl")
            with open(artifact_path, "wb") as artifact:
                artifact.write(preserved_artifact)

            with patch("train_model.PIPELINE_PATH", artifact_path):
                with self.assertRaises(FileExistsError):
                    save_pipeline_atomically(Mock())

            with open(artifact_path, "rb") as artifact:
                self.assertEqual(artifact.read(), preserved_artifact)


if __name__ == "__main__":
    unittest.main()
