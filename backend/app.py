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


# Load trained model and scaler
model = joblib.load("diabetes_model.pkl")
scaler = joblib.load("scaler.pkl")


@app.route("/", methods=["GET"])
def home():
    return "Flask server is running"


@app.route("/predict", methods=["POST", "OPTIONS"])
def predict():

    # Handle browser CORS preflight request
    if request.method == "OPTIONS":
        return "", 204

    data = request.get_json()

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

    # Scale input
    features_scaled = scaler.transform(features)

    # Prediction probability
    probability = model.predict_proba(features_scaled)[0][1]

    risk_percentage = round(probability * 100, 2)

    # Risk classification
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


if __name__ == "__main__":
    print("Running Flask server...")
    app.run(debug=True)
