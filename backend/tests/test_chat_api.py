import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
from openai import APIConnectionError, APITimeoutError, RateLimitError

import app as prediction_app
from chat_service import create_chat_context_token


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
        with patch("chat_service._request_openai") as provider:
            response = self.client.post(
                "/api/chat",
                json={
                    "message": "What does my prediction mean?",
                    "prediction_context": f"{self.context_token[:-1]}x",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json()["error"]["code"],
            "invalid_prediction_context",
        )
        provider.assert_not_called()

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
        with patch.object(prediction_app, "scaler", TestScaler()), patch.object(
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

    def test_unavailable_context_signing_does_not_break_prediction(self):
        class TestScaler:
            def transform(self, features):
                return features

        class TestModel:
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
            "scaler",
            TestScaler(),
        ), patch.object(prediction_app, "model", TestModel()):
            response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["risk_percentage"], 30.0)
        self.assertIsNone(response.get_json()["chat_context_token"])


if __name__ == "__main__":
    unittest.main()
