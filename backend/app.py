import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import joblib

app = Flask(__name__)

# Enable CORS
CORS(app, resources={r"/*": {"origins": "*"}})

# Explicit CORS headers for every response
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

print("Starting Flask app...")

# Absolute path resolution for model & scaler
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "diabetes_model.pkl")
SCALER_PATH = os.path.join(BASE_DIR, "scaler.pkl")

model = joblib.load(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "online",
        "message": "Diabetes Prediction Server is running"
    })

@app.route("/predict", methods=["POST", "OPTIONS"])
def predict():
    # Handle browser CORS preflight request
    if request.method == "OPTIONS":
        return "", 204

    data = request.get_json()
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
