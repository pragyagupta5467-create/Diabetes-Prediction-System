import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import accuracy_score, classification_report

data = pd.read_csv("diabetes.csv", sep="\t")

data.columns = data.columns.str.strip()

cols = ["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"]
data[cols] = data[cols].replace(0, np.nan)
data.fillna(data.mean(), inplace=True)

X = data.drop("Outcome", axis=1)
y = data["Outcome"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

models = {
    "Logistic Regression": LogisticRegression(max_iter=1000),
    "Decision Tree": DecisionTreeClassifier(random_state=42),
    "Random Forest": RandomForestClassifier(n_estimators=200, random_state=42),
    "SVM": SVC(),
    "KNN": KNeighborsClassifier(n_neighbors=5),
    "Gradient Boosting": GradientBoostingClassifier()
}

accuracies = {}

for name, model in models.items():
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    
    acc = accuracy_score(y_test, y_pred)
    accuracies[name] = acc
    
    print(f"\n{name}")
    print(f"Accuracy: {acc:.4f}")
    print(classification_report(y_test, y_pred))

print("\nFinal Accuracy Summary:")
for name, acc in accuracies.items():
    print(f"{name}: {acc:.4f}")

sample = np.array([[6,148,72,35,80,33.6,0.627,50]])
sample = scaler.transform(sample)

prediction = models["Random Forest"].predict(sample)

if prediction[0] == 1:
    print("\nPatient is Diabetic")
else:
    print("\nPatient is Not Diabetic")