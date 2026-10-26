export const PREDICTION_INPUT_RULES = {
  pregnancies: { min: 0, max: 20, integer: true },
  glucose: { min: 50, max: 300 },
  bloodPressure: { min: 40, max: 200 },
  skinThickness: { min: 0, max: 100 },
  insulin: { min: 0, max: 900 },
  bmi: { min: 10, max: 60 },
  pedigree: { min: 0, max: 3 },
  age: { min: 1, max: 120, integer: true },
};

export function validatePredictionForm(form) {
  const errors = {};
  const values = {};

  for (const [name, rule] of Object.entries(PREDICTION_INPUT_RULES)) {
    const rawValue = form[name];
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      errors[name] = `${name} is required`;
      continue;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      errors[name] = `${name} must be a finite number`;
      continue;
    }
    if (value < rule.min || value > rule.max) {
      errors[name] = `${name} must be between ${rule.min} and ${rule.max}`;
      continue;
    }
    if (rule.integer && !Number.isInteger(value)) {
      errors[name] = `${name} must be a whole number`;
      continue;
    }

    values[name] = value;
  }

  return {
    errors,
    values: Object.keys(errors).length === 0 ? values : null,
  };
}
