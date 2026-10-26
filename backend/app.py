import os
import math

import pandas as pd
import joblib
from flask import Flask, request, jsonify
from werkzeug.exceptions import HTTPException
from dotenv import load_dotenv

from chat_service import (
    ChatServiceError,
    create_chat_context_token,
    generate_reply,
    verify_chat_context_token,
)
from model_pipeline import FEATURE_ORDER, ZERO_IS_MISSING


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

INPUT_FEATURES = {
    "pregnancies": ("Pregnancies", 0, 20, True),
    "glucose": ("Glucose", 50, 300, False),
    "bloodPressure": ("BloodPressure", 40, 200, False),
    "skinThickness": ("SkinThickness", 0, 100, False),
    "insulin": ("Insulin", 0, 900, False),
    "bmi": ("BMI", 10, 60, False),
    "pedigree": ("DiabetesPedigreeFunction", 0, 3, False),
    "age": ("Age", 1, 120, True),
}
INPUT_FEATURE_ORDER = tuple(INPUT_FEATURES)
PIPELINE_PATH = os.path.join(BASE_DIR, "diabetes_pipeline.pkl")
MODEL_PATH = os.path.join(BASE_DIR, "diabetes_model.pkl")
SCALER_PATH = os.path.join(BASE_DIR, "scaler.pkl")

app = Flask(__name__)
app.url_map.strict_slashes = False


def allowed_frontend_origins():
    configured = os.environ.get("CORS_ALLOWED_ORIGINS")
    if configured is not None:
        return {
            origin.strip().rstrip("/")
            for origin in configured.split(",")
            if origin.strip()
        }
    if os.environ.get("APP_ENV", "development").strip().lower() == "production":
        return set()
    return {"http://localhost:5173", "http://127.0.0.1:5173"}


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "").rstrip("/")
    if origin and origin in allowed_frontend_origins():
        response.headers["Access-Control-Allow-Origin"] = origin
        response.vary.add("Origin")
        if request.method == "OPTIONS":
            response.headers["Access-Control-Allow-Headers"] = (
                "Content-Type, Authorization, X-Requested-With, Accept"
            )
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, OPTIONS, HEAD"
            )
    return response


@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        response = jsonify({"error": e.description, "status_code": e.code})
        response.status_code = e.code
    else:
        app.logger.error("Unhandled request error (%s).", type(e).__name__)
        response = jsonify({
            "error": "An unexpected server error occurred.",
            "status_code": 500,
        })
        response.status_code = 500

    return response


def load_model_artifacts(
    pipeline_path=PIPELINE_PATH,
    model_path=MODEL_PATH,
    scaler_path=SCALER_PATH,
):
    try:
        if os.path.isfile(pipeline_path):
            pipeline = joblib.load(pipeline_path)
            actual_order = tuple(getattr(pipeline, "feature_names_in_", ()))
            if actual_order != FEATURE_ORDER:
                raise ValueError("Pipeline feature order does not match the API.")
            if 1 not in getattr(pipeline, "classes_", ()):
                raise ValueError("Pipeline has no positive outcome class.")
            app.logger.info("Loaded versioned preprocessing and prediction pipeline.")
            return pipeline, None, None

        model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)
        if getattr(scaler, "n_features_in_", None) != len(FEATURE_ORDER):
            raise ValueError("Legacy scaler feature count does not match the API.")
        scaler_order = tuple(getattr(scaler, "feature_names_in_", FEATURE_ORDER))
        if scaler_order != FEATURE_ORDER:
            raise ValueError("Legacy scaler feature order does not match the API.")
        if 1 not in getattr(model, "classes_", ()):
            raise ValueError("Legacy model has no positive outcome class.")
        app.logger.warning(
            "Versioned pipeline is absent; using preserved legacy model artifacts."
        )
        return None, model, scaler
    except Exception as error:
        app.logger.error("Model artifact loading failed (%s).", type(error).__name__)
        return None, None, None

try:
    model_pipeline, model, scaler = load_model_artifacts()
except Exception as error:
    app.logger.error("Model initialization failed (%s).", type(error).__name__)
    model_pipeline, model, scaler = None, None, None


def model_is_loaded():
    return model_pipeline is not None or (model is not None and scaler is not None)

@app.route("/", methods=["GET", "OPTIONS"])
@app.route("/health", methods=["GET", "OPTIONS"])
def home():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    return jsonify({
        "status": "online",
        "message": "Diabetes Prediction Server is running",
        "model_loaded": model_is_loaded(),
        "version": (
            os.environ.get("APP_VERSION")
            or os.environ.get("RENDER_GIT_COMMIT")
            or "local"
        ),
        "endpoints": {
            "health": "/health [GET]",
            "predict": "/predict [POST] or /api/predict [POST]",
            "chat": "/api/chat [POST]",
        }
    })

@app.route("/predict", methods=["GET", "POST", "OPTIONS"])
@app.route("/api/predict", methods=["GET", "POST", "OPTIONS"])
def predict():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    if request.method == "GET":
        return jsonify({
            "status": "ready",
            "message": "Send a POST request with JSON body containing health parameters (pregnancies, glucose, bloodPressure, skinThickness, insulin, bmi, pedigree, age) to predict diabetes risk."
        }), 200

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid request. JSON payload required."}), 400

    missing_fields = [name for name in INPUT_FEATURE_ORDER if name not in data]
    if missing_fields:
        return jsonify({
            "error": "Missing required fields: " + ", ".join(missing_fields) + "."
        }), 400

    parsed_features = {}
    for request_name, (model_name, minimum, maximum, integer_only) in INPUT_FEATURES.items():
        value = data[request_name]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return jsonify({
                "error": f"{request_name} must be a finite JSON number."
            }), 400
        if not math.isfinite(value):
            return jsonify({
                "error": f"{request_name} must be a finite JSON number."
            }), 400
        if not minimum <= value <= maximum:
            return jsonify({
                "error": f"{request_name} must be between {minimum} and {maximum}."
            }), 400
        if integer_only and not float(value).is_integer():
            return jsonify({
                "error": f"{request_name} must be a whole number."
            }), 400
        parsed_features[model_name] = float(value)

    if not model_is_loaded():
        return jsonify({
            "error": "The prediction model is unavailable on the server."
        }), 503

    features = pd.DataFrame(
        [[parsed_features[column] for column in FEATURE_ORDER]],
        columns=FEATURE_ORDER,
    )

    try:
        if model_pipeline is not None:
            prediction_model = model_pipeline
            probabilities = model_pipeline.predict_proba(features)[0]
        else:
            prediction_model = model
            legacy_features = features.copy()
            for index, column in enumerate(FEATURE_ORDER):
                if column in ZERO_IS_MISSING and legacy_features.at[0, column] == 0:
                    legacy_features.at[0, column] = scaler.mean_[index]
            probabilities = model.predict_proba(
                scaler.transform(legacy_features)
            )[0]

        positive_class_index = list(prediction_model.classes_).index(1)
        probability = float(probabilities[positive_class_index])
        if not math.isfinite(probability) or not 0 <= probability <= 1:
            raise ValueError("Model returned an invalid class probability.")
        risk_percentage = round(probability * 100, 2)

        if risk_percentage < 30:
            risk_level = "Low Risk"
        elif risk_percentage < 60:
            risk_level = "Moderate Risk"
        else:
            risk_level = "High Risk"

        response = {
            "risk_percentage": risk_percentage,
            "risk_level": risk_level,
            "chat_context_token": None,
        }
        try:
            response["chat_context_token"] = create_chat_context_token(
                {
                    "age": parsed_features["Age"],
                    "glucose": parsed_features["Glucose"],
                    "bloodPressure": parsed_features["BloodPressure"],
                    "bmi": parsed_features["BMI"],
                },
                risk_percentage,
                risk_level,
            )
        except ChatServiceError as error:
            app.logger.warning(
                "Prediction context signing is unavailable: %s",
                error.code,
            )
        return jsonify(response)
    except Exception as error:
        app.logger.error("Prediction inference failed (%s).", type(error).__name__)
        return jsonify({
            "error": "The prediction could not be completed. Please retry."
        }), 500


@app.route("/api/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    if request.content_length and request.content_length > 32768:
        return jsonify({
            "error": {
                "code": "request_too_large",
                "message": "The chat request is too large. Shorten the message or conversation and try again.",
            }
        }), 413

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "error": {
                "code": "invalid_request",
                "message": "A JSON object with a message is required.",
            }
        }), 400

    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        return jsonify({
            "error": {
                "code": "invalid_message",
                "message": "Enter a message before sending.",
            }
        }), 400
    if len(message) > 2000:
        return jsonify({
            "error": {
                "code": "message_too_long",
                "message": "Messages must be 2,000 characters or fewer.",
            }
        }), 400

    history = data.get("history", [])
    if not isinstance(history, list) or len(history) > 10:
        return jsonify({
            "error": {
                "code": "invalid_history",
                "message": "Conversation history must contain at most 10 messages.",
            }
        }), 400

    normalized_history = []
    for item in history:
        if (
            not isinstance(item, dict)
            or item.get("role") not in {"user", "assistant"}
            or not isinstance(item.get("content"), str)
            or not item["content"].strip()
            or len(item["content"]) > 2000
        ):
            return jsonify({
                "error": {
                    "code": "invalid_history",
                    "message": "Each history entry must have a valid user or assistant role and a message of at most 2,000 characters.",
                }
            }), 400
        normalized_history.append({
            "role": item["role"],
            "content": item["content"].strip(),
        })

    context_token = data.get("prediction_context")
    if context_token is not None and not isinstance(context_token, str):
        return jsonify({
            "error": {
                "code": "invalid_prediction_context",
                "message": "The prediction context is invalid. Start a new conversation.",
            }
        }), 400

    try:
        prediction_context = (
            verify_chat_context_token(context_token)
            if context_token
            else None
        )
        answer = generate_reply(
            message.strip(),
            normalized_history,
            prediction_context,
        )
    except ChatServiceError as error:
        return jsonify({
            "error": {
                "code": error.code,
                "message": error.message,
            }
        }), error.status_code

    return jsonify({"reply": answer})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Running Flask server on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
