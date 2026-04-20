#!/usr/bin/env python3
"""
Dose Response Pro v18.1 - Command Line Interface
================================================

A Python implementation for batch processing and automation.

Usage:
    python dose-response-cli.py --input data.csv --output results.json --model gls
    python dose-response-cli.py --input data.csv --output results.json --model linear
    python dose-response-cli.py --batch analyses.csv --output-dir results/

Requirements:
    - Python 3.7+
    - numpy, pandas
    - (Optional) R with dosresmeta package for validation

Author: M25 Evidence Synthesis Lab
Version: 18.1.0
License: MIT
"""

import argparse
import json
import math
import sys
from statistics import NormalDist
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import numpy as np
import pandas as pd

_STANDARD_NORMAL = NormalDist()


def normal_ppf(p: float) -> float:
    """Stable inverse normal CDF without SciPy dependency."""
    p = min(max(float(p), 1e-12), 1 - 1e-12)
    return float(_STANDARD_NORMAL.inv_cdf(p))


def normal_cdf(x: float) -> float:
    return float(_STANDARD_NORMAL.cdf(float(x)))


def chi2_cdf_wilson_hilferty(x: float, df: int) -> float:
    """
    Fast chi-square CDF approximation via Wilson-Hilferty transform.
    Accurate enough for reporting Q-test p-values in CLI summaries.
    """
    if df <= 0:
        return float('nan')
    if x <= 0:
        return 0.0
    k = float(df)
    z = ((float(x) / k) ** (1.0 / 3.0) - (1.0 - 2.0 / (9.0 * k))) / math.sqrt(2.0 / (9.0 * k))
    return min(max(normal_cdf(z), 0.0), 1.0)


# =============================================================================
# NUMERICAL CONSTANTS
# =============================================================================

NUMERICAL_TOLERANCE = 1e-10
DETERMINANT_THRESHOLD = 1e-10
RIDGE_PENALTY = 1e-10
VALIDATION_TOLERANCE = 1e-4


# =============================================================================
# MATRIX OPERATIONS
# =============================================================================

def invert_matrix(V: np.ndarray) -> np.ndarray:
    """
    Invert a symmetric matrix using Cholesky decomposition.

    Args:
        V: Covariance matrix (n x n)

    Returns:
        V_inv: Inverted matrix

    Raises:
        np.linalg.LinAlgError: If matrix is singular
    """
    V = np.asarray(V, dtype=float)
    n = V.shape[0]
    eye = np.eye(n)

    ridge = RIDGE_PENALTY
    for _ in range(8):
        V_reg = V + ridge * eye

        try:
            # Prefer Cholesky for symmetric positive-definite systems.
            L = np.linalg.cholesky(V_reg)
            return np.linalg.solve(L.T, np.linalg.solve(L, eye))
        except np.linalg.LinAlgError:
            try:
                return np.linalg.inv(V_reg)
            except np.linalg.LinAlgError:
                ridge *= 10.0

    # Last resort for near-singular systems.
    V_pinv = np.linalg.pinv(V + ridge * eye, rcond=1e-12)
    if not np.all(np.isfinite(V_pinv)):
        raise ValueError("Matrix inversion failed after regularization and pseudo-inverse fallback.")
    return V_pinv


def invert_block_diagonal(V_blocks: List[Dict]) -> List[Dict]:
    """
    Invert block-diagonal matrix by inverting each block separately.

    Args:
        V_blocks: List of {V: matrix, n: size} blocks

    Returns:
        List of {V_inv: matrix, n: size} inverted blocks
    """
    result = []
    for block in V_blocks:
        V_inv = invert_matrix(block['V'])
        result.append({'V_inv': V_inv, 'n': block['n']})
    return result


# =============================================================================
# VARIANCE CALCULATIONS
# =============================================================================

def compute_log_rate_variance(cases: float, n: float) -> float:
    """
    Compute exact variance of log rate using delta method.

    Formula: Var(log rate) = 1/cases - 1/n

    Args:
        cases: Number of cases
        n: Sample size or person-time

    Returns:
        Variance of log rate
    """
    return max(1.0 / max(cases, NUMERICAL_TOLERANCE) - 1.0 / max(n, NUMERICAL_TOLERANCE),
               NUMERICAL_TOLERANCE)


def build_gls_covariance(study_points: pd.DataFrame, rho: float = 0.5) -> np.ndarray:
    """
    Build covariance matrix for within-study correlation.

    Uses a shared-reference style covariance when a reference category is
    available (dose==0 with cases > 0). Otherwise applies a bounded
    correlation approximation and falls back to diagonal if needed.

    Args:
        study_points: DataFrame with columns [dose, cases, n]
        rho: Approximate within-study correlation when reference unavailable

    Returns:
        V: Covariance matrix (k x k where k = number of dose points)
    """
    k = len(study_points)
    if k == 0:
        return np.zeros((0, 0))

    rho = min(0.9, max(0.1, rho))

    variances = []
    for _, row in study_points.iterrows():
        variance = compute_log_rate_variance(row['cases'], row['n'])
        variances.append(variance)

    V = np.zeros((k, k))
    for i in range(k):
        V[i, i] = variances[i]

    baseline_idx = None
    baseline = study_points[(study_points['dose'] == 0) & (study_points['cases'] > 0)]
    if not baseline.empty:
        baseline_idx = baseline.index[0]
    else:
        sorted_points = study_points[study_points['cases'] > 0].sort_values('dose')
        if not sorted_points.empty:
            baseline_idx = sorted_points.index[0]

    if baseline_idx is not None:
        ref_cases = float(study_points.loc[baseline_idx, 'cases'])
        ref_cov = 1.0 / max(ref_cases, NUMERICAL_TOLERANCE)

        for i in range(k):
            for j in range(i + 1, k):
                cov_bound = 0.9 * np.sqrt(variances[i] * variances[j])
                cov = min(ref_cov, cov_bound)
                V[i, j] = cov
                V[j, i] = cov
    else:
        for i in range(k):
            for j in range(i + 1, k):
                cov_bound = 0.9 * min(variances[i], variances[j])
                cov = min(rho * np.sqrt(variances[i] * variances[j]), cov_bound)
                V[i, j] = cov
                V[j, i] = cov

    if not is_positive_semidefinite(V):
        return np.diag(variances)

    return V


def build_relative_gls_inputs(
    study_points: pd.DataFrame,
    model_key: str
) -> Optional[Tuple[np.ndarray, np.ndarray, np.ndarray, int, float]]:
    """
    Build GLS inputs using log-rate ratios against a study-specific reference dose.

    This mirrors the reference-comparison structure used in dosresmeta-style models
    and improves alignment for SE/tau2 benchmarking.
    """
    p = 1 if model_key == 'linear' else 2
    sp = study_points.copy().sort_values('dose').reset_index(drop=True)
    if len(sp) < p + 1:
        return None

    valid_ref = sp[(sp['cases'] > 0) & (sp['n'] > 0)]
    if valid_ref.empty:
        return None

    ref_idx = int(valid_ref.index[0])
    ref_cases = float(sp.loc[ref_idx, 'cases'])
    ref_n = float(sp.loc[ref_idx, 'n'])
    if ref_cases <= 0 or ref_n <= 0:
        return None

    ref_rate = ref_cases / ref_n
    if not np.isfinite(ref_rate) or ref_rate <= 0:
        return None

    reference_dose = float(sp.loc[ref_idx, 'dose'])

    work = sp[sp.index != ref_idx].copy().reset_index(drop=True)
    if len(work) < p:
        return None

    X = np.vstack([
        _contrast_predictor_row(float(dose), reference_dose, model_key)
        for dose in work['dose'].to_numpy(dtype=float)
    ])

    rates = np.maximum(
        work['cases'].to_numpy(dtype=float) /
        np.maximum(work['n'].to_numpy(dtype=float), NUMERICAL_TOLERANCE),
        NUMERICAL_TOLERANCE
    )
    y = np.log(np.maximum(rates / ref_rate, NUMERICAL_TOLERANCE))

    k = len(work)
    V = np.zeros((k, k), dtype=float)
    ref_component = max(
        1.0 / max(ref_cases, NUMERICAL_TOLERANCE) - 1.0 / max(ref_n, NUMERICAL_TOLERANCE),
        NUMERICAL_TOLERANCE
    )

    variances = np.zeros(k, dtype=float)
    for i, row in work.iterrows():
        var_i = (
            1.0 / max(float(row['cases']), NUMERICAL_TOLERANCE)
            - 1.0 / max(float(row['n']), NUMERICAL_TOLERANCE)
            + ref_component
        )
        variances[i] = max(var_i, NUMERICAL_TOLERANCE)

    for i in range(k):
        V[i, i] = variances[i]
        for j in range(i + 1, k):
            cov_bound = 0.99 * np.sqrt(variances[i] * variances[j])
            cov = min(ref_component, cov_bound)
            V[i, j] = cov
            V[j, i] = cov

    if not is_positive_semidefinite(V):
        V = np.diag(variances)

    return X, y, V, int(len(work)), reference_dose


def is_positive_semidefinite(V: np.ndarray) -> bool:
    """Robust PSD check using eigenvalues on a symmetrized matrix."""
    V = np.asarray(V, dtype=float)
    if V.size == 0:
        return True

    if V.ndim != 2 or V.shape[0] != V.shape[1]:
        return False

    if not np.all(np.isfinite(V)):
        return False

    V_sym = 0.5 * (V + V.T)
    evals = np.linalg.eigvalsh(V_sym)
    tol = 1e-10 * max(1.0, float(np.max(np.abs(np.diag(V_sym)))) if V_sym.size else 1.0)
    return bool(np.all(evals >= -tol))


# =============================================================================
# GLS ESTIMATION
# =============================================================================


def _normalize_model(model: str) -> str:
    model_key = (model or 'gls').strip().lower()
    if model_key == 'gls':
        model_key = 'quadratic'
    if model_key not in {'linear', 'quadratic'}:
        raise ValueError(f"Unsupported model '{model}'. Use 'gls', 'quadratic', or 'linear'.")
    return model_key


def _build_design_matrix(doses: np.ndarray, model_key: str, include_intercept: bool = True) -> np.ndarray:
    doses = np.asarray(doses, dtype=float)
    if model_key == 'linear':
        if include_intercept:
            return np.column_stack([np.ones(len(doses)), doses])
        return doses.reshape(-1, 1)
    if include_intercept:
        return np.column_stack([np.ones(len(doses)), doses, doses**2])
    return np.column_stack([doses, doses**2])


def _predictor_row(dose: float, model_key: str, include_intercept: bool = True) -> np.ndarray:
    dose = float(dose)
    if model_key == 'linear':
        if include_intercept:
            return np.array([1.0, dose], dtype=float)
        return np.array([dose], dtype=float)
    if include_intercept:
        return np.array([1.0, dose, dose ** 2], dtype=float)
    return np.array([dose, dose ** 2], dtype=float)


def _contrast_predictor_row(dose: float, reference_dose: float, model_key: str) -> np.ndarray:
    full_row = _predictor_row(dose, model_key, include_intercept=True)
    reference_row = _predictor_row(reference_dose, model_key, include_intercept=True)
    return (full_row - reference_row)[1:]


def _pool_multivariate(
    study_betas: np.ndarray,
    study_variances: np.ndarray,
    tau2: float
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Pool study-specific coefficient vectors using inverse-variance weights:
        beta = (sum W_i)^(-1) * sum(W_i * b_i),  W_i = (S_i + tau2 * I)^(-1)
    """
    p = study_betas.shape[1]
    tau2 = max(float(tau2), 0.0)
    I_p = np.eye(p)

    sum_W = np.zeros((p, p), dtype=float)
    sum_Wb = np.zeros(p, dtype=float)

    for beta_i, S_i in zip(study_betas, study_variances):
        S_tau = np.asarray(S_i, dtype=float) + tau2 * I_p
        W_i = invert_matrix(S_tau)
        sum_W += W_i
        sum_Wb += W_i @ np.asarray(beta_i, dtype=float)

    var_pooled = invert_matrix(sum_W)
    beta_pooled = var_pooled @ sum_Wb
    return beta_pooled, var_pooled


def compute_Q_statistic(
    study_betas: np.ndarray,
    beta_pooled: np.ndarray,
    study_variances: np.ndarray,
    tau2: float
) -> float:
    """Compute multivariate Cochran Q using full covariance matrices."""
    p = study_betas.shape[1]
    tau2 = max(float(tau2), 0.0)
    I_p = np.eye(p)

    Q = 0.0
    for beta_i, S_i in zip(study_betas, study_variances):
        diff = np.asarray(beta_i, dtype=float) - np.asarray(beta_pooled, dtype=float)
        S_tau = np.asarray(S_i, dtype=float) + tau2 * I_p
        W_i = invert_matrix(S_tau)
        Q += float(diff.T @ W_i @ diff)
    return max(Q, 0.0)


def estimate_tau2_moments(
    study_betas: np.ndarray,
    study_variances: np.ndarray
) -> float:
    """
    Estimate tau^2 by solving Q(tau^2) ~= df using bisection.
    This is a stable method-of-moments approach for multivariate pooling.
    """
    K = int(study_betas.shape[0])
    p = int(study_betas.shape[1])
    df = max((K - 1) * p, 0)
    if K <= 1 or df <= 0:
        return 0.0

    beta0, _ = _pool_multivariate(study_betas, study_variances, tau2=0.0)
    Q0 = compute_Q_statistic(study_betas, beta0, study_variances, tau2=0.0)
    if Q0 <= df:
        return 0.0

    def objective(tau2_value: float) -> float:
        beta_t, _ = _pool_multivariate(study_betas, study_variances, tau2=tau2_value)
        return compute_Q_statistic(study_betas, beta_t, study_variances, tau2=tau2_value) - df

    lower = 0.0
    upper = 1e-6
    obj_upper = objective(upper)
    max_upper = 1e6

    while obj_upper > 0 and upper < max_upper:
        upper *= 2.0
        obj_upper = objective(upper)

    if obj_upper > 0:
        return upper

    for _ in range(80):
        mid = 0.5 * (lower + upper)
        obj_mid = objective(mid)
        if abs(obj_mid) < 1e-8:
            return max(mid, 0.0)
        if obj_mid > 0:
            lower = mid
        else:
            upper = mid

    return max(0.5 * (lower + upper), 0.0)


def solve_gls(
    points: pd.DataFrame,
    tau2_override: Optional[float] = None,
    model: str = 'gls',
    ci_level: float = 0.95
) -> Dict:
    """
    Perform two-stage GLS dose-response meta-analysis.

    Args:
        points: DataFrame with columns [study_id, dose, cases, n]
        tau2_override: Optional tau^2 override (0 => fixed-effects)
        model: Model family ('gls'/'quadratic' or 'linear')
        ci_level: Confidence level for predictions

    Returns:
        Dictionary with pooled coefficients, uncertainty, heterogeneity, and predictions
    """
    if not (0 < ci_level < 1):
        raise ValueError(f"ci_level must be between 0 and 1 (exclusive), got {ci_level}")

    model_key = _normalize_model(model)
    output_p = 2 if model_key == 'linear' else 3
    relative_p = 1 if model_key == 'linear' else 2

    studies = points['study_id'].unique()
    eligible_studies: List[Tuple[str, pd.DataFrame]] = []
    relative_inputs_by_study: Dict[str, Tuple[np.ndarray, np.ndarray, np.ndarray, int, float]] = {}

    for study_id in studies:
        study_points = points[points['study_id'] == study_id].copy().sort_values('dose')
        if len(study_points) < output_p:
            continue
        eligible_studies.append((study_id, study_points))
        relative_inputs = build_relative_gls_inputs(study_points, model_key)
        if relative_inputs is not None:
            relative_inputs_by_study[study_id] = relative_inputs

    use_relative_mode = False
    reference_dose = 0.0
    if len(eligible_studies) > 0 and len(relative_inputs_by_study) == len(eligible_studies):
        reference_doses = [float(relative_inputs_by_study[study_id][4]) for study_id, _ in eligible_studies]
        if reference_doses:
            first_reference = reference_doses[0]
            shared_reference = all(abs(ref - first_reference) <= 1e-12 for ref in reference_doses)
            if shared_reference:
                use_relative_mode = True
                reference_dose = first_reference
    p = relative_p if use_relative_mode else output_p

    study_betas: List[np.ndarray] = []
    study_variances: List[np.ndarray] = []
    n_points_used = 0
    relative_mode_studies = 0 if not use_relative_mode else len(eligible_studies)

    # Stage 1: estimate study-specific coefficients with within-study GLS.
    for study_id, study_points in eligible_studies:
        if use_relative_mode:
            X, y, V, used_points, _ = relative_inputs_by_study[study_id]
        else:
            doses = study_points['dose'].to_numpy(dtype=float)
            X = _build_design_matrix(doses, model_key, include_intercept=True)
            V = build_gls_covariance(study_points)
            rates = np.maximum(
                study_points['cases'].to_numpy(dtype=float) /
                np.maximum(study_points['n'].to_numpy(dtype=float), NUMERICAL_TOLERANCE),
                NUMERICAL_TOLERANCE
            )
            y = np.log(rates)
            used_points = len(study_points)

        try:
            V_inv = invert_matrix(V)
            XtV_invX = X.T @ V_inv @ X
            XtV_invX = XtV_invX + RIDGE_PENALTY * np.eye(p)
            XtV_invy = X.T @ V_inv @ y
            beta_study = np.linalg.solve(XtV_invX, XtV_invy)
            var_study = invert_matrix(XtV_invX)
        except (np.linalg.LinAlgError, ValueError):
            continue

        study_betas.append(np.asarray(beta_study, dtype=float))
        study_variances.append(np.asarray(var_study, dtype=float))
        n_points_used += int(used_points)

    if len(study_betas) == 0:
        raise ValueError(
            f"No eligible studies for {model_key} model. "
            f"Each study needs at least {p} dose rows."
        )

    study_betas = np.array(study_betas, dtype=float)
    study_variances = np.array(study_variances, dtype=float)
    n_studies = len(study_betas)
    df = max((n_studies - 1) * p, 0)

    tau2 = max(float(tau2_override), 0.0) if tau2_override is not None else estimate_tau2_moments(
        study_betas, study_variances
    )

    # Stage 2: multivariate random-effects pooling with full covariance matrices.
    beta_reduced, var_reduced = _pool_multivariate(study_betas, study_variances, tau2)
    Q = compute_Q_statistic(study_betas, beta_reduced, study_variances, tau2)
    Qp = float(1.0 - chi2_cdf_wilson_hilferty(Q, df)) if df > 0 else None
    I2 = max(0.0, 100.0 * (Q - df) / max(Q, NUMERICAL_TOLERANCE)) if df > 0 else 0.0

    if use_relative_mode:
        beta_pooled = np.zeros(output_p, dtype=float)
        beta_pooled[1:] = beta_reduced
        var_pooled = np.zeros((output_p, output_p), dtype=float)
        var_pooled[1:, 1:] = var_reduced
    else:
        beta_pooled = beta_reduced
        var_pooled = var_reduced

    se = np.sqrt(np.maximum(np.diag(var_pooled), NUMERICAL_TOLERANCE))

    predictions = generate_predictions(
        beta_pooled,
        var_pooled,
        points,
        model=model_key,
        ci_level=ci_level,
        reference_dose=reference_dose
    )

    return {
        'beta': beta_pooled.tolist(),
        'se': se.tolist(),
        'var': var_pooled.tolist(),
        'tau2': float(tau2),
        'I2': float(I2),
        'Q': float(Q),
        'df': int(df),
        'Qp': Qp,
        'n_points': int(n_points_used),
        'n_studies': n_studies,
        'n_relative_mode_studies': int(relative_mode_studies),
        'estimation_mode': 'relative_no_intercept' if use_relative_mode else 'absolute_intercept',
        'reference_dose': float(reference_dose),
        'model': model_key,
        'ci_level': float(ci_level),
        'predictions': predictions
    }


def generate_predictions(
    beta: np.ndarray,
    var: np.ndarray,
    points: pd.DataFrame,
    model: str = 'quadratic',
    ci_level: float = 0.95,
    reference_dose: float = 0.0
) -> List[Dict]:
    """
    Generate dose-response predictions with confidence intervals.

    Args:
        beta: Coefficient estimates
        var: Variance-covariance matrix of coefficients
        points: Original data points
        model: Model family ('linear' or 'quadratic')
        ci_level: Confidence level

    Returns:
        List of predictions for each dose level
    """
    model_key = _normalize_model(model)
    beta_vec = np.asarray(beta, dtype=float).reshape(-1)
    var_mat = np.asarray(var, dtype=float)
    if var_mat.ndim == 1:
        p = beta_vec.shape[0]
        var_mat = var_mat.reshape((p, p))

    dose_values = points['dose'].to_numpy(dtype=float) if len(points) > 0 else np.array([reference_dose], dtype=float)
    dose_min = float(np.min(dose_values)) if len(dose_values) > 0 else float(reference_dose)
    dose_max = float(np.max(dose_values)) if len(dose_values) > 0 else float(reference_dose)
    if not np.isfinite(dose_min):
        dose_min = float(reference_dose)
    if not np.isfinite(dose_max):
        dose_max = float(reference_dose)

    grid_lower = min(dose_min, float(reference_dose))
    observed_span = max(dose_max - grid_lower, 0.0)
    baseline_upper = max(dose_max, float(reference_dose))
    grid_upper = max(
        baseline_upper,
        baseline_upper * 1.2 if baseline_upper > 0 else 1.0,
        grid_lower + max(observed_span * 0.2, 1.0 if baseline_upper == grid_lower else 0.0)
    )
    doses = np.linspace(grid_lower, grid_upper, 100)
    z = normal_ppf(0.5 + ci_level / 2.0)
    reference_row = _predictor_row(float(reference_dose), model_key)

    predictions = []
    for dose in doses:
        x = _predictor_row(float(dose), model_key) - reference_row
        log_rr = float(x @ beta_vec)
        pred_var = float(x @ var_mat @ x)
        pred_se = np.sqrt(max(pred_var, NUMERICAL_TOLERANCE))

        predictions.append({
            'dose': float(dose),
            'reference_dose': float(reference_dose),
            'logrr': float(log_rr),
            'se_logrr': float(pred_se),
            'rr': float(np.exp(log_rr)),
            'ci_lower': float(np.exp(log_rr - z * pred_se)),
            'ci_upper': float(np.exp(log_rr + z * pred_se))
        })

    return predictions

# =============================================================================
# CSV INPUT/OUTPUT
# =============================================================================

def load_csv(filepath: str) -> pd.DataFrame:
    """
    Load CSV file with flexible column detection.

    Args:
        filepath: Path to CSV file

    Returns:
        DataFrame with standardized column names
    """
    df = pd.read_csv(filepath, comment='#', skip_blank_lines=True, encoding='utf-8-sig')

    # Detect column names
    column_map = detect_columns(df.columns.tolist())
    df = df.rename(columns=column_map)

    # Validate required columns
    required = ['study_id', 'dose', 'cases', 'n']
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    cleaned = df[['study_id', 'dose', 'cases', 'n']].copy()
    cleaned['dose'] = pd.to_numeric(cleaned['dose'], errors='coerce')
    cleaned['cases'] = pd.to_numeric(cleaned['cases'], errors='coerce')
    cleaned['n'] = pd.to_numeric(cleaned['n'], errors='coerce')

    cleaned = cleaned.replace([np.inf, -np.inf], np.nan)
    cleaned = cleaned.dropna(subset=['study_id', 'dose', 'cases', 'n'])
    cleaned = cleaned[cleaned['n'] > 0]
    cleaned = cleaned[cleaned['cases'] >= 0]

    if cleaned.empty:
        raise ValueError("No valid rows after numeric cleaning. Check study_id/dose/cases/n columns.")

    # Apply continuity correction only where needed.
    zero_mask = cleaned['cases'] == 0
    if zero_mask.any():
        cleaned.loc[zero_mask, 'cases'] = cleaned.loc[zero_mask, 'cases'] + 0.5

    return cleaned[['study_id', 'dose', 'cases', 'n']]


def detect_columns(columns: List[str]) -> Dict[str, str]:
    """
    Detect and map column names to standard names.

    Args:
        columns: List of column names from CSV

    Returns:
        Dictionary mapping original names to standard names
    """
    columns_lower = [c.lower() for c in columns]
    mapping = {}

    # Study ID
    for col in columns:
        if col.lower() in ['study', 'study_id', 'study name', 'author', 'id']:
            mapping[col] = 'study_id'
            break

    # Dose
    for col in columns:
        if col.lower() in ['dose', 'dosage', 'exposure', 'level', 'intake']:
            mapping[col] = 'dose'
            break

    # Cases
    for col in columns:
        if col.lower() in ['cases', 'events', 'case', 'event']:
            mapping[col] = 'cases'
            break

    # N
    for col in columns:
        if col.lower() in ['n', 'sample', 'sample size', 'persontime', 'person-years', 'py', 'personyears']:
            mapping[col] = 'n'
            break

    return mapping


def save_results(results: Dict, output_path: str, format: str = 'json'):
    """
    Save analysis results to file.

    Args:
        results: Analysis results dictionary
        output_path: Output file path
        format: Output format ('json' or 'csv')
    """
    if format == 'json':
        with open(output_path, 'w') as f:
            json.dump(sanitize_for_json(results), f, indent=2, allow_nan=False)
    elif format == 'csv':
        # Save predictions as CSV
        preds = pd.DataFrame(results['predictions'])
        preds.to_csv(output_path, index=False)
    else:
        raise ValueError(f"Unknown format: {format}")


def sanitize_for_json(value):
    """
    Recursively convert non-finite floats to None for strict JSON serialization.
    """
    if isinstance(value, dict):
        return {k: sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(v) for v in value]
    if isinstance(value, tuple):
        return [sanitize_for_json(v) for v in value]
    if isinstance(value, np.ndarray):
        return sanitize_for_json(value.tolist())
    if isinstance(value, (float, np.floating)):
        return float(value) if np.isfinite(value) else None
    return value


# =============================================================================
# BATCH PROCESSING
# =============================================================================

def run_batch_analysis(batch_file: str, output_dir: str):
    """
    Run multiple analyses from a batch file.

    Args:
        batch_file: CSV file with columns [input_file, model, output_file]
                   and optional [tau2, ci_level]
        output_dir: Directory for output files
    """
    batch_df = pd.read_csv(batch_file)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    results_summary = []

    for _, row in batch_df.iterrows():
        print(f"\nProcessing: {row['input_file']}")
        output_name = row.get('output_file', f"analysis_{len(results_summary) + 1}.json")
        if pd.isna(output_name) or not str(output_name).strip():
            output_name = f"analysis_{len(results_summary) + 1}.json"
        output_file = output_path / str(output_name)

        try:
            # Load data
            data = load_csv(row['input_file'])

            # Run analysis
            model = str(row.get('model', 'gls') or 'gls').strip().lower()
            tau2_value = row.get('tau2', None)
            tau2_override = None
            if pd.notna(tau2_value):
                tau2_override = float(tau2_value)

            ci_level_value = row.get('ci_level', 0.95)
            ci_level = float(ci_level_value) if pd.notna(ci_level_value) else 0.95

            results = solve_gls(
                data,
                tau2_override=tau2_override,
                model=model,
                ci_level=ci_level
            )

            # Save results
            save_results(results, str(output_file))

            results_summary.append({
                'input': row['input_file'],
                'output': str(output_file),
                'model': model,
                'ci_level': ci_level,
                'status': 'success',
                'tau2': results['tau2'],
                'I2': results['I2']
            })

        except Exception as e:
            print(f"Error: {e}")
            results_summary.append({
                'input': row['input_file'],
                'output': str(output_file),
                'status': f'error: {e}'
            })

    # Save summary
    summary_file = output_path / 'batch_summary.csv'
    pd.DataFrame(results_summary).to_csv(summary_file, index=False)
    print(f"\nBatch complete. Summary saved to: {summary_file}")


# =============================================================================
# MAIN CLI INTERFACE
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Dose Response Pro v18.1 - Command Line Interface',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic analysis
  python dose-response-cli.py --input data.csv --output results.json

  # Fixed-effect analysis
  python dose-response-cli.py --input data.csv --output results.json --tau2 0

  # Batch processing
  python dose-response-cli.py --batch batch.csv --output-dir results/

  # Save predictions as CSV
  python dose-response-cli.py --input data.csv --output predictions.csv --format csv

  # Pretty print results
  python dose-response-cli.py --input data.csv --output - --pretty
        """
    )

    # Input options
    parser.add_argument('--input', '-i', type=str,
                        help='Input CSV file with dose-response data')
    parser.add_argument('--batch', '-b', type=str,
                        help='Batch file with multiple analyses to run')

    # Output options
    parser.add_argument('--output', '-o', type=str, default='-',
                        help='Output file (default: stdout)')
    parser.add_argument('--output-dir', '-d', type=str, default='results',
                        help='Output directory for batch processing')
    parser.add_argument('--format', '-f', choices=['json', 'csv'], default='json',
                        help='Output format')
    parser.add_argument('--pretty', '-p', action='store_true',
                        help='Pretty print JSON output')

    # Analysis options
    parser.add_argument('--model', '-m', choices=['gls', 'linear', 'quadratic'],
                        default='gls', help='Analysis model (default: gls)')
    parser.add_argument('--tau2', '-t', type=float,
                        help='Override tauÂ² (0 for fixed-effect)')
    parser.add_argument('--ci-level', '-c', type=float, default=0.95,
                        help='Confidence level (default: 0.95)')

    # Other options
    parser.add_argument('--version', '-v', action='version',
                        version='Dose Response Pro v18.1 CLI')
    parser.add_argument('--verbose', action='store_true',
                        help='Verbose output')

    args = parser.parse_args()

    # Validate arguments
    if not (0 < args.ci_level < 1):
        parser.error('--ci-level must be between 0 and 1 (exclusive)')

    if args.batch:
        run_batch_analysis(args.batch, args.output_dir)
        return 0

    if not args.input:
        parser.error('--input or --batch is required')

    try:
        # Load data
        if args.verbose:
            print(f"Loading data from: {args.input}")
        data = load_csv(args.input)

        if args.verbose:
            print(f"Loaded {len(data['study_id'].unique())} studies with {len(data)} data points")

        # Run analysis
        if args.verbose:
            print("Running GLS dose-response meta-analysis...")
        results = solve_gls(
            data,
            tau2_override=args.tau2,
            model=args.model,
            ci_level=args.ci_level
        )

        # Add metadata
        results['metadata'] = {
            'version': '18.1.0',
            'model': results.get('model', args.model),
            'ci_level': args.ci_level,
            'input_file': args.input,
            'n_studies': results['n_studies']
        }

        # Save results
        if args.output == '-':
            # Print to stdout
            output_results = sanitize_for_json(results)
            if args.pretty:
                print(json.dumps(output_results, indent=2, allow_nan=False))
            else:
                print(json.dumps(output_results, allow_nan=False))
        else:
            save_results(results, args.output, args.format)
            if args.verbose:
                print(f"Results saved to: {args.output}")

        # Print summary, but keep stdout clean JSON when output='-'
        if args.output != '-' or args.verbose:
            stream = sys.stderr if args.output == '-' else sys.stdout
            coeff_labels = ['b0 (Intercept)', 'b1 (Linear)', 'b2 (Quadratic)']
            print(f"\n{'='*60}", file=stream)
            print("Dose Response Pro v18.1 - Analysis Summary", file=stream)
            print(f"{'='*60}", file=stream)
            print(f"Model: {results.get('model', args.model)}", file=stream)
            print(f"Studies: {results['n_studies']}", file=stream)
            print("\nCoefficients:", file=stream)
            for i, (beta_i, se_i) in enumerate(zip(results['beta'], results['se'])):
                label = coeff_labels[i] if i < len(coeff_labels) else f"b{i}"
                print(f"  {label:<14}: {beta_i:.4f} (SE: {se_i:.4f})", file=stream)
            print("\nHeterogeneity:", file=stream)
            print(f"  Tau2: {results['tau2']:.4f}", file=stream)
            print(f"  I2:   {results['I2']:.1f}%", file=stream)
            print(f"  Q:    {results['Q']:.2f} (df={results['df']})", file=stream)
            print(f"{'='*60}\n", file=stream)

        return 0

    except FileNotFoundError as e:
        print(f"Error: File not found: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
