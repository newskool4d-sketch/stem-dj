import test from "node:test";
import assert from "node:assert/strict";
import {
  formatStemJobStatus,
  stemReadinessLabel,
} from "../static/ui-state.js";

test("stemReadinessLabel: reports ready stems by count", () => {
  // Given
  const state = { ready: true, stems: { vocals: "/stem/vocals.wav", drums: "/stem/drums.wav" } };

  // When
  const label = stemReadinessLabel(state);

  // Then
  assert.equal(label, "Stems ready (2/4)");
});

test("stemReadinessLabel: reports missing stems", () => {
  // Given
  const state = { ready: false, stems: {} };

  // When
  const label = stemReadinessLabel(state);

  // Then
  assert.equal(label, "Stems not ready");
});

test("formatStemJobStatus: formats queued and running states", () => {
  // Given
  const queued = { status: "queued" };
  const running = { status: "running", message: "Separating stems" };

  // When
  const queuedLabel = formatStemJobStatus(queued);
  const runningLabel = formatStemJobStatus(running);

  // Then
  assert.equal(queuedLabel, "Stem job queued");
  assert.equal(runningLabel, "Separating stems");
});

test("formatStemJobStatus: formats done with stem count", () => {
  // Given
  const state = { status: "done", stems: { vocals: "v.wav", drums: "d.wav", bass: "b.wav", other: "o.wav" } };

  // When
  const label = formatStemJobStatus(state);

  // Then
  assert.equal(label, "Stem job complete (4/4)");
});

test("formatStemJobStatus: formats error, missing, and unknown states", () => {
  // Given
  const error = { status: "error", message: "Demucs failed" };
  const missing = { status: "missing" };
  const unknown = { status: "paused" };

  // When
  const errorLabel = formatStemJobStatus(error);
  const missingLabel = formatStemJobStatus(missing);
  const unknownLabel = formatStemJobStatus(unknown);

  // Then
  assert.equal(errorLabel, "Demucs failed");
  assert.equal(missingLabel, "Stem job missing");
  assert.equal(unknownLabel, "Stem job paused");
});
