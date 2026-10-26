import assert from "node:assert/strict";
import test from "node:test";
import { validatePredictionForm } from "../src/predictionForm.js";

const validForm = {
  pregnancies: "0",
  glucose: "148",
  bloodPressure: "72",
  skinThickness: "0",
  insulin: "0",
  bmi: "33.6",
  pedigree: "0.627",
  age: "50",
};

test("validates all required inputs and converts them to numeric API values", () => {
  const result = validatePredictionForm(validForm);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.values, {
    pregnancies: 0,
    glucose: 148,
    bloodPressure: 72,
    skinThickness: 0,
    insulin: 0,
    bmi: 33.6,
    pedigree: 0.627,
    age: 50,
  });
});

test("does not treat blank fields as zero", () => {
  const result = validatePredictionForm({ ...validForm, pregnancies: "" });
  assert.equal(result.values, null);
  assert.match(result.errors.pregnancies, /required/);
});

test("rejects non-finite, out-of-range, and fractional integer fields", () => {
  const nonFinite = validatePredictionForm({ ...validForm, glucose: "Infinity" });
  assert.match(nonFinite.errors.glucose, /finite/);

  const outOfRange = validatePredictionForm({ ...validForm, bmi: "0" });
  assert.match(outOfRange.errors.bmi, /between 10 and 60/);

  const fractionalAge = validatePredictionForm({ ...validForm, age: "50.5" });
  assert.match(fractionalAge.errors.age, /whole number/);
});
