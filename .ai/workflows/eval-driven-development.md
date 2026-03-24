# Eval-Driven Development Workflow

**Purpose**: Turn AI behavior changes into measurable contracts so model quality is tested instead of judged by vibe.

---

## When To Run

Run this workflow before implementation when a story changes any nondeterministic AI path:
- prompts or system instructions,
- model selection or decoding strategy,
- retrieval/ranking behavior,
- tool selection or tool argument extraction,
- agent routing or handoff logic,
- graders, judges, or answer formatting behavior.

Skip only when the story does not affect AI behavior.

---

## Step 1: Define Eval Objective

Write a concise eval objective before coding:
- what behavior should improve or remain stable,
- what failure mode the eval is meant to catch,
- what decision the eval will drive.

Examples:
- "Answers should cite the correct source chunk and abstain when evidence is missing."
- "Router should choose the order tool for order-status requests with correct order-id extraction."

---

## Step 2: Build the Eval Set

Assemble a small but representative dataset:
- common production-like cases,
- edge cases,
- adversarial or conflict cases.

Prefer a mix of:
- historical or production traces,
- human-curated examples,
- synthetic examples used only to fill gaps,
- regression cases from past failures.

Avoid distribution drift:
- do not rely only on clean happy-path examples,
- do not let synthetic data dominate if real data exists.

---

## Step 3: Choose Evaluators and Metrics

Use the simplest evaluator that can reliably score the behavior:
- exact match or schema validation,
- tool-call accuracy and argument precision,
- pass/fail rubric grading,
- pairwise comparison between old and new behavior,
- reference-guided model grading,
- human review for calibration.

Guidelines:
- prefer pairwise or pass/fail over open-ended grading when possible,
- use task-specific metrics instead of generic academic scores alone,
- control for judge bias such as verbosity and response order,
- calibrate automated grading against human judgment before trusting it.

---

## Step 4: Set Thresholds and Baseline

Before implementation, record:
- baseline behavior or current score,
- target threshold,
- unacceptable regressions,
- minimum sample slices that must pass.

Examples:
- "Tool routing accuracy >= 0.95 on held-out routing set."
- "Citation grounding pass rate must not drop below current baseline."

---

## Step 5: Run, Compare, and Inspect

Evaluate candidate changes against baseline.

Required output:
- score summary,
- slice breakdown,
- failure examples,
- judgment on whether to keep, revise, or roll back.

Do not rely on one aggregate score alone. Inspect failures directly.

---

## Step 6: Promote to Continuous Eval

For any shipped AI behavior:
- keep the best eval cases as regression cases,
- add newly discovered failures from logs or user feedback,
- rerun evals on meaningful prompt/model/routing changes,
- keep evaluator prompts and rubrics versioned with the workflow.

---

## Required Eval Brief

Before implementation, publish a concise eval brief containing:
1. objective,
2. dataset sources and slices,
3. evaluator types and metrics,
4. thresholds and baseline,
5. regression/continuous-eval plan.

---

## Exit Criteria

- Eval objective defined
- Eval set identified
- Evaluators and metrics selected
- Thresholds recorded
- Baseline/comparison plan defined
- Regression/continuous-eval plan captured
