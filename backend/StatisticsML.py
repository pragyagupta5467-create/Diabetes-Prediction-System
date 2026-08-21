import numpy as np
import pandas as pd
from scipy import stats

# Dataset
data = {
    "Marks": [45, 50, 55, 60, 60, 65, 70, 75, 80, 85]
}

# Create DataFrame
df = pd.DataFrame(data)

# Statistical Calculations
mean_value = df["Marks"].mean()
median_value = df["Marks"].median()
mode_value = df["Marks"].mode()[0]
variance_value = df["Marks"].var()       # Sample variance
std_deviation = df["Marks"].std()         # Sample standard deviation

# Output
print("Dataset:\n", df)
print("\nMean:", mean_value)
print("Median:", median_value)
print("Mode:", mode_value)
print("Variance:", variance_value)
print("Standard Deviation:", std_deviation)
