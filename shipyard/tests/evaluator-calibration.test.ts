import { describe, expect, it } from "vitest";

import { mergeBrowserEvaluationIntoVerificationReport } from "../src/agents/coordinator.js";
import { evaluatorCalibrationScenarios } from "./fixtures/evaluator-calibration.js";

describe("evaluator calibration fixtures", () => {
  it.each(evaluatorCalibrationScenarios)(
    "$id",
    (scenario) => {
      const result = mergeBrowserEvaluationIntoVerificationReport({
        verificationReport: scenario.verificationReport,
        browserEvaluationReport: scenario.browserEvaluationReport,
      });

      expect(result.passed).toBe(scenario.expectedPassed);
      expect(result.summary).toContain(scenario.expectedSummaryFragment);
    },
  );
});
