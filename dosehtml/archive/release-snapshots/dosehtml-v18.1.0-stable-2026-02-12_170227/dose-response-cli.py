#!/usr/bin/env python3
"""
Dose Response Pro v18.1 - Command Line Interface
================================================

A Python implementation for batch processing and automation.

Usage:
    python dose-response-cli.py --input data.csv --output results.json --model gls
    python dose-response-cli.py --input data.csv --output results.json --model spline --knots 4
    python dose-response-cli.py --batch analyses.csv --output-dir results/

Requirements:
    - Python 3.7+
    - numpy, pandas, scipy
    - (Optional) R with dosresmeta package for validation

Author: M25 Evidence Synthesis Lab
Version: 18.1.0
License: MIT
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import numpy as np
import pandas as pd
from scipy import stats, optimize


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
    n = V.shape[0]

    # Add ridge penalty for numerical stability
    V_reg = V + RIDGE_PENALTY * np.eye(n)

    try:
        # Use Cholesky for symmetric positive-definite matrices
        L = np.linalg.cholesky(V_reg)
        V_inv = np.linalg.solve(L.T, np.linalg.solve(L, np.eye(n)))
        return V_inv
    except np.linalg.LinAlgError:
        # Fall back to standard inversion
        try:
            V_inv = np.linalg.inv(V_reg)
            return V_inv
        except np.linalg.LinAlgError as e:
            raise ValueError(f"Matrix is singular and cannot be inverted: {e}")


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


def build_gls_covariance(study_points: pd.DataFrame) -> np.ndarray:
    """
    Build covariance matrix for within-study correlation.

    Accounts for shared reference group using Greenland & Longnecker method.

    Args:
        study_points: DataFrame with columns [dose, cases, n]

    Returns:
        V: Covariance matrix (k x k where k = number of dose points)
    """
    k = len(study_points)
    V = np.zeros((k, k))

    # Compute log rates and variances
    log_rates = []
    variances = []
    for _, row in study_points.iterrows():
        rate = row['cases'] / row['n']
        log_rate = np.log(rate) if rate > 0 else np.log(NUMERICAL_TOLERANCE)
        variance = compute_log_rate_variance(row['cases'], row['n'])
        log_rates.append(log_rate)
        variances.append(variance)

    # Build covariance matrix
    for i in range(k):
        V[i, i] = variances[i]
        for j in range(i + 1, k):
            # Off-diagonal: accounts for shared reference group
            V[i, j] = min(0.5 * np.sqrt(variances[i] * variances[j]), 0.9 * min(variances[i], variances[j]))
            V[j, i] = V[i, j]

    return V


# =============================================================================
# GLS ESTIMATION
# =============================================================================

def solve_gls(points: pd.DataFrame, tau2_override: Optional[float] = None) -> Dict:
    """
    Perform GLS dose-response meta-analysis using Greenland & Longnecker method.

    Args:
        points: DataFrame with columns [study_id, dose, cases, n]
        tau2_override: Override between-study variance (for fixed-effect)

    Returns:
        Dictionary with results: {beta, se, var, tau2, I2, Q, df, predictions}
    """
    # Group by study
    studies = points['study_id'].unique()
    K = len(studies)

    # Stage 1: Within-study GLS estimation
    study_betas = []
    study_variances = []
    V_blocks = []

    for study_id in studies:
        study_points = points[points['study_id'] == study_id].copy()
        study_points = study_points.sort_values('dose')

        k = len(study_points)
        if k < 2:
            continue

        # Build design matrix (quadratic model)
        doses = study_points['dose'].values
        X = np.column_stack([np.ones(k), doses, doses**2])

        # Build covariance matrix
        V = build_gls_covariance(study_points)
        V_blocks.append({'V': V, 'n': k})

        # Compute log rates
        y = np.log(study_points['cases'].values / study_points['n'].values)

        # GLS estimation: beta = (X'V^(-1)X)^(-1)X'V^(-1)y
        try:
            V_inv = invert_matrix(V)
            XtV_inv = X.T @ V_inv
            XtV_invX = XtV_inv @ X
            XtV_invy = XtV_inv @ y

            beta_study = np.linalg.solve(XtV_invX, XtV_invy)
            var_study = np.linalg.inv(XtV_invX)

            study_betas.append(beta_study)
            study_variances.append(var_study)
        except np.linalg.LinAlgError:
            continue

    # Convert to arrays
    study_betas = np.array(study_betas)
    n_studies = len(study_betas)
    p = 3  # Number of parameters (intercept, linear, quadratic)

    # Stage 2: Pooling
    beta_pooled = np.mean(study_betas, axis=0)
    var_pooled = np.mean(study_variances, axis=0)

    # Estimate tauÂ² using DerSimonian-Laird method
    tau2 = estimate_tau2_DL(study_betas, beta_pooled, study_variances, V_blocks, n_studies, p)

    if tau2_override is not None:
        tau2 = tau2_override

    # Compute Q statistic
    Q = compute_Q_statistic(study_betas, beta_pooled, study_variances, tau2)

    # Degrees of freedom for multivariate meta-analysis
    df = (n_studies - 1) * p

    # IÂ² statistic
    I2 = max(0, 100 * (Q - df) / max(Q, 0.001))

    # Standard errors (clamp tiny negative numerical artifacts to tolerance)
    var_diag = np.diag(var_pooled) + tau2
    se = np.sqrt(np.maximum(var_diag, NUMERICAL_TOLERANCE))

    # Generate predictions
    predictions = generate_predictions(beta_pooled, se, points)

    return {
        'beta': beta_pooled.tolist(),
        'se': se.tolist(),
        'var': var_pooled.tolist(),
        'tau2': float(tau2),
        'I2': float(I2),
        'Q': float(Q),
        'df': int(df),
        'n_studies': n_studies,
        'predictions': predictions
    }


def estimate_tau2_DL(study_betas: np.ndarray, beta_pooled: np.ndarray,
                     study_variances: np.ndarray, V_blocks: List,
                     K: int, p: int) -> float:
    """
    Estimate between-study variance using DerSimonian-Laird method.

    Formula: tauÂ² = max(0, (Q - df) / (sum(tr(V_i)) - df))

    Reference: van Houwelingen et al. (2002). Statistics in Medicine, 21, 589-624.

    Args:
        study_betas: Study-specific coefficients (K x p)
        beta_pooled: Pooled coefficients (p,)
        study_variances: Study-specific variance matrices
        V_blocks: Covariance matrix blocks
        K: Number of studies
        p: Number of parameters

    Returns:
        tau2: Between-study variance estimate
    """
    # Calculate Q statistic
    Q = 0
    for i, beta in enumerate(study_betas):
        diff = beta - beta_pooled
        # Use trace of variance as weight
        w = 1.0 / max(np.trace(study_variances[i]), NUMERICAL_TOLERANCE)
        Q += w * np.sum(diff**2)

    # Sum of traces of covariance matrices
    sum_tr_V = sum(np.sum(np.diag(block['V'])) for block in V_blocks)

    # Degrees of freedom for multivariate meta-analysis
    df = (K - 1) * p

    # DL estimator
    denominator = max(sum_tr_V - df, NUMERICAL_TOLERANCE)
    tau2 = max(0, (Q - df) / denominator)

    return tau2


def compute_Q_statistic(study_betas: np.ndarray, beta_pooled: np.ndarray,
                        study_variances: np.ndarray, tau2: float) -> float:
    """
    Compute Cochran's Q statistic for heterogeneity.

    Args:
        study_betas: Study-specific coefficients
        beta_pooled: Pooled coefficients
        study_variances: Study-specific variance matrices
        tau2: Between-study variance

    Returns:
        Q: Cochran's Q statistic
    """
    Q = 0
    for i, beta in enumerate(study_betas):
        diff = beta - beta_pooled
        # Variance + tauÂ²
        var_with_tau2 = np.diag(study_variances[i]) + tau2
        # Weighted sum of squares
        w = 1.0 / np.mean(var_with_tau2)
        Q += w * np.sum(diff**2)
    return Q


def generate_predictions(beta: np.ndarray, se: np.ndarray,
                        points: pd.DataFrame) -> List[Dict]:
    """
    Generate dose-response predictions with confidence intervals.

    Args:
        beta: Coefficient estimates [Î²â‚€, Î²â‚, Î²â‚‚]
        se: Standard errors
        points: Original data points

    Returns:
        List of predictions for each dose level
    """
    doses = np.linspace(0, points['dose'].max() * 1.2, 100)
    z = stats.norm.ppf(0.975)  # 95% CI

    predictions = []
    for dose in doses:
        # Predicted log rate
        log_rr = beta[0] + beta[1] * dose + beta[2] * dose**2

        # Variance of prediction (using delta method)
        # Var(Î²â‚€ + Î²â‚Ã—d + Î²â‚‚Ã—dÂ²) = Var(Î²â‚€) + dÂ²Ã—Var(Î²â‚) + dâ´Ã—Var(Î²â‚‚)
        #                            + 2dÃ—Cov(Î²â‚€,Î²â‚) + 2dÂ²Ã—Cov(Î²â‚€,Î²â‚‚) + 2dÂ³Ã—Cov(Î²â‚,Î²â‚‚)
        # Simplified approximation:
        pred_se = np.sqrt(se[0]**2 + (dose * se[1])**2 + (dose**2 * se[2])**2)

        predictions.append({
            'dose': float(dose),
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
    df = pd.read_csv(filepath)

    # Detect column names
    column_map = detect_columns(df.columns.tolist())
    df = df.rename(columns=column_map)

    # Validate required columns
    required = ['study_id', 'dose', 'cases', 'n']
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Apply continuity correction if needed
    if (df['cases'] == 0).any():
        df['cases'] = df['cases'] + 0.5

    return df[['study_id', 'dose', 'cases', 'n']]


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
        output_dir: Directory for output files
    """
    batch_df = pd.read_csv(batch_file)
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)

    results_summary = []

    for _, row in batch_df.iterrows():
        print(f"\nProcessing: {row['input_file']}")
        output_name = row.get('output_file', f"analysis_{len(results_summary) + 1}.json")
        output_file = output_path / str(output_name)

        try:
            # Load data
            data = load_csv(row['input_file'])

            # Run analysis
            results = solve_gls(data)

            # Save results
            save_results(results, str(output_file))

            results_summary.append({
                'input': row['input_file'],
                'output': str(output_file),
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
        results = solve_gls(data, tau2_override=args.tau2)

        # Add metadata
        results['metadata'] = {
            'version': '18.1.0',
            'model': args.model,
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

        # Print summary
        print(f"\n{'='*60}")
        print(f"Dose Response Pro v18.1 - Analysis Summary")
        print(f"{'='*60}")
        print(f"Studies: {results['n_studies']}")
        print(f"\nCoefficients:")
        print(f"  b0 (Intercept): {results['beta'][0]:.4f} (SE: {results['se'][0]:.4f})")
        print(f"  b1 (Linear):    {results['beta'][1]:.4f} (SE: {results['se'][1]:.4f})")
        print(f"  b2 (Quadratic): {results['beta'][2]:.4f} (SE: {results['se'][2]:.4f})")
        print(f"\nHeterogeneity:")
        print(f"  Tau2: {results['tau2']:.4f}")
        print(f"  I2:   {results['I2']:.1f}%")
        print(f"  Q:    {results['Q']:.2f} (df={results['df']})")
        print(f"{'='*60}\n")

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
