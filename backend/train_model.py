import os
import tempfile

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

from model_pipeline import (
    FEATURE_ORDER,
    build_prediction_pipeline,
    build_preprocessing_pipeline,
)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "diabetes.csv")
PIPELINE_PATH = os.path.join(BASE_DIR, "diabetes_pipeline.pkl")
TARGET_COLUMN = "Outcome"
RANDOM_STATE = 42


def load_dataset():
    dataset = pd.read_csv(DATA_PATH, sep="\t")
    dataset.columns = dataset.columns.str.strip()
    expected_columns = set(FEATURE_ORDER) | {TARGET_COLUMN}
    if set(dataset.columns) != expected_columns:
        raise ValueError("The tab-separated diabetes dataset has unexpected columns.")
    if dataset[TARGET_COLUMN].isna().any() or not set(dataset[TARGET_COLUMN]).issubset({0, 1}):
        raise ValueError("Outcome must contain only non-missing binary labels (0 or 1).")
    return dataset.loc[:, [*FEATURE_ORDER, TARGET_COLUMN]]


def evaluate_candidate(dataset):
    features = dataset.loc[:, FEATURE_ORDER]
    labels = dataset[TARGET_COLUMN]
    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=labels,
    )

    classifiers = {
        "Logistic Regression": LogisticRegression(max_iter=1000),
        "Decision Tree": DecisionTreeClassifier(random_state=RANDOM_STATE),
        "Random Forest": RandomForestClassifier(
            n_estimators=200,
            random_state=RANDOM_STATE,
        ),
        "SVM": SVC(),
        "KNN": KNeighborsClassifier(n_neighbors=5),
        "Gradient Boosting": GradientBoostingClassifier(random_state=RANDOM_STATE),
    }

    results = {}
    for name, classifier in classifiers.items():
        candidate = Pipeline(
            [
                *build_preprocessing_pipeline().steps,
                ("classifier", classifier),
            ]
        )
        candidate.fit(x_train, y_train)
        predicted = candidate.predict(x_test)
        results[name] = {
            "accuracy": accuracy_score(y_test, predicted),
            "recall": recall_score(y_test, predicted, zero_division=0),
            "precision": precision_score(y_test, predicted, zero_division=0),
            "f1": f1_score(y_test, predicted, zero_division=0),
            "confusion_matrix": confusion_matrix(y_test, predicted).tolist(),
            "classification_report": classification_report(
                y_test,
                predicted,
                zero_division=0,
            ),
        }
    return results


def save_pipeline_atomically(pipeline):
    if os.path.exists(PIPELINE_PATH):
        raise FileExistsError(
            "Refusing to overwrite diabetes_pipeline.pkl. Archive the existing "
            "artifact and review its prediction changes before retraining."
        )

    file_descriptor, temporary_path = tempfile.mkstemp(
        prefix=".diabetes_pipeline_",
        suffix=".tmp",
        dir=BASE_DIR,
    )
    os.close(file_descriptor)
    try:
        joblib.dump(pipeline, temporary_path)
        os.replace(temporary_path, PIPELINE_PATH)
    finally:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)


def main():
    dataset = load_dataset()
    results = evaluate_candidate(dataset)
    for name, metrics in results.items():
        print(f"\n{name}")
        for key in ("accuracy", "recall", "precision", "f1", "confusion_matrix"):
            print(f"{key}: {metrics[key]}")
        print(metrics["classification_report"])

    production_pipeline = build_prediction_pipeline(random_state=RANDOM_STATE)
    production_pipeline.fit(
        dataset.loc[:, FEATURE_ORDER],
        dataset[TARGET_COLUMN],
    )
    save_pipeline_atomically(production_pipeline)
    print(f"Saved full-data inference pipeline atomically to {PIPELINE_PATH}")


if __name__ == "__main__":
    main()
