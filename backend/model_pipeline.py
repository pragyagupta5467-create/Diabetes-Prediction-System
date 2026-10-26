import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler


FEATURE_ORDER = (
    "Pregnancies",
    "Glucose",
    "BloodPressure",
    "SkinThickness",
    "Insulin",
    "BMI",
    "DiabetesPedigreeFunction",
    "Age",
)

ZERO_IS_MISSING = (
    "Glucose",
    "BloodPressure",
    "SkinThickness",
    "Insulin",
    "BMI",
)


def replace_zero_sentinels(features):
    cleaned = features.copy()
    for column in ZERO_IS_MISSING:
        cleaned[column] = cleaned[column].replace(0, np.nan)
    return cleaned


def build_preprocessing_pipeline():
    return Pipeline(
        [
            (
                "zero_sentinels",
                FunctionTransformer(
                    replace_zero_sentinels,
                    feature_names_out="one-to-one",
                ),
            ),
            ("imputer", SimpleImputer(strategy="mean")),
            ("scaler", StandardScaler()),
        ]
    )


def build_prediction_pipeline(random_state=42, n_estimators=200):
    return Pipeline(
        [
            *build_preprocessing_pipeline().steps,
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=n_estimators,
                    random_state=random_state,
                ),
            ),
        ]
    )
