import os
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from werkzeug.exceptions import HTTPException
import numpy as np
import joblib

app = Flask(__name__)
app.url_map.strict_slashes = False

# Enable CORS globally for all origins, resources, methods, and headers
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

# Add explicit CORS headers to every response
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, HEAD"
    return response

# Error handler that preserves HTTP status codes (e.g., 404, 400) and adds CORS headers
@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        response = jsonify({"error": e.description, "status_code": e.code})
        response.status_code = e.code
    else:
        response = jsonify({"error": str(e), "status_code": 500})
        response.status_code = 500

    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, HEAD"
    return response

print("Starting Flask app...")

# Absolute path resolution for model & scaler
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "diabetes_model.pkl")
SCALER_PATH = os.path.join(BASE_DIR, "scaler.pkl")

try:
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    print("Model and Scaler loaded successfully.")
except Exception as err:
    print(f"Error loading model/scaler: {err}")
    model = None
    scaler = None

@app.route("/", methods=["GET", "OPTIONS"])
@app.route("/health", methods=["GET", "OPTIONS"])
@cross_origin()
def home():
    if request.method == "OPTIONS":
        response = jsonify({"status": "ok"})
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response, 200
    return jsonify({
        "status": "online",
        "message": "Diabetes Prediction Server is running",
        "model_loaded": model is not None,
        "endpoints": {
            "predict": "/predict [POST]"
        }
    })

@app.route("/predict", methods=["GET", "POST", "OPTIONS"])
@app.route("/api/predict", methods=["GET", "POST", "OPTIONS"])
@cross_origin()
def predict():
    # Handle browser CORS preflight (OPTIONS) request explicitly
    if request.method == "OPTIONS":
        response = jsonify({"status": "ok"})
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response, 200

    # If accessed via GET (e.g. browser URL test)
    if request.method == "GET":
        return jsonify({
            "status": "ready",
            "message": "Send a POST request with JSON body containing health parameters (pregnancies, glucose, bloodPressure, skinThickness, insulin, bmi, pedigree, age) to predict diabetes risk."
        }), 200

    if model is None or scaler is None:
        return jsonify({"error": "Model or scaler failed to load on server."}), 500

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request. JSON payload required."}), 400

    try:
        features = np.array([[
            float(data.get("pregnancies", 0)),
            float(data.get("glucose", 0)),
            float(data.get("bloodPressure", 0)),
            float(data.get("skinThickness", 0)),
            float(data.get("insulin", 0)),
            float(data.get("bmi", 0)),
            float(data.get("pedigree", 0)),
            float(data.get("age", 0))
        ]])

        features_scaled = scaler.transform(features)
        probability = model.predict_proba(features_scaled)[0][1]
        risk_percentage = round(float(probability) * 100, 2)

        if risk_percentage < 30:
            risk_level = "Low Risk"
        elif risk_percentage < 60:
            risk_level = "Moderate Risk"
        else:
            risk_level = "High Risk"

        return jsonify({
            "risk_percentage": risk_percentage,
            "risk_level": risk_level
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Running Flask server on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
