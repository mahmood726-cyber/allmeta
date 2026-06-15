# NMA Truth-Recovery — measured report

> Seeded (20260615), reps/cell = 500 (Bayesian 120), 57 cells, 279s. Every number is produced by `harness_nma.py`; nothing is hand-entered.

Treatments 0..T-1 (0=reference); two-arm studies; effects on a generic additive scale. 'sep' = well-separated true effects, 'tight' = closely-spaced top treatments (where 'which is best?' is genuinely hard).

## 1. Coverage of the true relative effects

The LivingNMA / enma-snma fixed-effect-CI bug (τ² ignored in the CI) reproduced as **NaiveFE**; **RE** is the proper random-effects network CI; **NetHK** is the Hartung-Knapp honest-coverage lever (the analogue of the HKSJ fix that repaired the pairwise track).

| geometry | spe | τ² | spread | NaiveFE | RE | NetHK | width FE/RE/HK |
|---|---|---|---|---|---|---|---|
| dense | 2 | 0.0 | sep | 0.941 | 0.953 | **0.978** | 0.44/0.49/0.57 |
| dense | 2 | 0.0 | tight | 0.931 | 0.947 | **0.974** | 0.44/0.49/0.57 |
| dense | 2 | 0.05 | sep | 0.761 | 0.906 | **0.942** | 0.44/0.65/0.77 |
| dense | 2 | 0.05 | tight | 0.756 | 0.909 | **0.945** | 0.44/0.65/0.78 |
| dense | 2 | 0.15 | sep | 0.567 | 0.904 | **0.942** | 0.44/0.91/1.09 |
| dense | 2 | 0.15 | tight | 0.558 | 0.913 | **0.947** | 0.44/0.92/1.11 |
| dense | 5 | 0.0 | sep | 0.949 | 0.959 | **0.970** | 0.26/0.28/0.30 |
| dense | 5 | 0.0 | tight | 0.953 | 0.964 | **0.972** | 0.26/0.28/0.29 |
| dense | 5 | 0.05 | sep | 0.715 | 0.925 | **0.939** | 0.26/0.42/0.45 |
| dense | 5 | 0.05 | tight | 0.715 | 0.924 | **0.938** | 0.26/0.42/0.45 |
| dense | 5 | 0.15 | sep | 0.523 | 0.935 | **0.955** | 0.26/0.59/0.64 |
| dense | 5 | 0.15 | tight | 0.506 | 0.931 | **0.951** | 0.26/0.59/0.64 |
| ladder | 2 | 0.0 | sep | 0.947 | 0.961 | **0.986** | 0.53/0.60/0.74 |
| ladder | 2 | 0.0 | tight | 0.950 | 0.961 | **0.989** | 0.51/0.59/0.73 |
| ladder | 2 | 0.05 | sep | 0.789 | 0.905 | **0.950** | 0.52/0.76/0.95 |
| ladder | 2 | 0.05 | tight | 0.763 | 0.900 | **0.946** | 0.52/0.78/0.98 |
| ladder | 2 | 0.15 | sep | 0.565 | 0.891 | **0.939** | 0.52/1.05/1.32 |
| ladder | 2 | 0.15 | tight | 0.586 | 0.910 | **0.949** | 0.53/1.07/1.35 |
| ladder | 5 | 0.0 | sep | 0.958 | 0.967 | **0.976** | 0.30/0.32/0.35 |
| ladder | 5 | 0.0 | tight | 0.949 | 0.957 | **0.966** | 0.30/0.33/0.35 |
| ladder | 5 | 0.05 | sep | 0.724 | 0.928 | **0.941** | 0.30/0.48/0.52 |
| ladder | 5 | 0.05 | tight | 0.734 | 0.930 | **0.950** | 0.30/0.48/0.52 |
| ladder | 5 | 0.15 | sep | 0.530 | 0.940 | **0.958** | 0.30/0.68/0.74 |
| ladder | 5 | 0.15 | tight | 0.523 | 0.933 | **0.954** | 0.30/0.67/0.74 |
| loop | 2 | 0.0 | sep | 0.965 | 0.971 | **0.998** | 0.54/0.62/0.89 |
| loop | 2 | 0.0 | tight | 0.949 | 0.959 | **0.996** | 0.55/0.65/0.94 |
| loop | 2 | 0.05 | sep | 0.755 | 0.877 | **0.949** | 0.55/0.80/1.16 |
| loop | 2 | 0.05 | tight | 0.771 | 0.895 | **0.965** | 0.54/0.77/1.13 |
| loop | 2 | 0.15 | sep | 0.561 | 0.862 | **0.941** | 0.53/1.04/1.53 |
| loop | 2 | 0.15 | tight | 0.557 | 0.853 | **0.943** | 0.53/1.01/1.50 |
| loop | 5 | 0.0 | sep | 0.960 | 0.973 | **0.985** | 0.30/0.34/0.38 |
| loop | 5 | 0.0 | tight | 0.950 | 0.962 | **0.981** | 0.30/0.34/0.38 |
| loop | 5 | 0.05 | sep | 0.723 | 0.900 | **0.928** | 0.30/0.47/0.53 |
| loop | 5 | 0.05 | tight | 0.754 | 0.926 | **0.947** | 0.30/0.47/0.54 |
| loop | 5 | 0.15 | sep | 0.529 | 0.921 | **0.953** | 0.30/0.67/0.77 |
| loop | 5 | 0.15 | tight | 0.524 | 0.917 | **0.950** | 0.30/0.68/0.78 |

## 2. Ranking over-confidence (the spurious 'best treatment')

Claimed P(best) for the point-best treatment vs the rate it IS the true best. **over-conf** = claimed − actual (positive ⇒ over-confident). **FE** = SUCRA/P-score sampled from the fixed-effect covariance; **RE** from the RE covariance; **Cal** from the calibrated (NetHK × detected-inconsistency-inflated) covariance; **Bayes** = posterior P(best).

| geometry | spe | τ² | spread | src | P(best) claimed | actual hit | **over-conf** | spurious |
|---|---|---|---|---|---|---|---|---|
| dense | 2 | 0.0 | sep | FE | 0.907 | 0.952 | -0.045 | 0.002 |
| dense | 2 | 0.0 | sep | RE | 0.894 | 0.950 | -0.056 | 0.000 |
| dense | 2 | 0.0 | sep | **Cal** | 0.858 | 0.950 | **-0.092** | 0.000 |
| dense | 2 | 0.0 | sep | Bayes | 0.882 | 0.950 | -0.068 | - |
| dense | 5 | 0.0 | sep | FE | 0.983 | 0.998 | -0.015 | 0.000 |
| dense | 5 | 0.0 | sep | RE | 0.978 | 0.998 | -0.020 | 0.000 |
| dense | 5 | 0.0 | sep | **Cal** | 0.967 | 0.998 | **-0.031** | 0.000 |
| dense | 5 | 0.0 | sep | Bayes | 0.970 | 1.000 | -0.030 | - |
| dense | 2 | 0.05 | sep | FE | 0.894 | 0.862 | 0.032 | 0.042 |
| dense | 2 | 0.05 | sep | RE | 0.833 | 0.866 | -0.033 | 0.018 |
| dense | 2 | 0.05 | sep | **Cal** | 0.781 | 0.866 | **-0.085** | 0.012 |
| dense | 2 | 0.05 | sep | Bayes | 0.827 | 0.908 | -0.081 | - |
| dense | 5 | 0.05 | sep | FE | 0.949 | 0.956 | -0.007 | 0.008 |
| dense | 5 | 0.05 | sep | RE | 0.912 | 0.974 | -0.062 | 0.000 |
| dense | 5 | 0.05 | sep | **Cal** | 0.887 | 0.974 | **-0.087** | 0.000 |
| dense | 5 | 0.05 | sep | Bayes | 0.913 | 0.967 | -0.054 | - |
| dense | 2 | 0.15 | sep | FE | 0.878 | 0.760 | 0.118 | 0.102 |
| dense | 2 | 0.15 | sep | RE | 0.766 | 0.796 | -0.030 | 0.020 |
| dense | 2 | 0.15 | sep | **Cal** | 0.699 | 0.796 | **-0.097** | 0.012 |
| dense | 2 | 0.15 | sep | Bayes | 0.771 | 0.817 | -0.045 | - |
| dense | 5 | 0.15 | sep | FE | 0.929 | 0.862 | 0.067 | 0.068 |
| dense | 5 | 0.15 | sep | RE | 0.845 | 0.908 | -0.063 | 0.004 |
| dense | 5 | 0.15 | sep | **Cal** | 0.805 | 0.908 | **-0.103** | 0.002 |
| dense | 5 | 0.15 | sep | Bayes | 0.838 | 0.908 | -0.070 | - |
| ladder | 2 | 0.0 | sep | FE | 0.875 | 0.930 | -0.055 | 0.004 |
| ladder | 2 | 0.0 | sep | RE | 0.858 | 0.934 | -0.076 | 0.004 |
| ladder | 2 | 0.0 | sep | **Cal** | 0.805 | 0.934 | **-0.129** | 0.002 |
| ladder | 2 | 0.0 | sep | Bayes | 0.843 | 0.942 | -0.098 | - |
| ladder | 5 | 0.0 | sep | FE | 0.965 | 0.992 | -0.027 | 0.000 |
| ladder | 5 | 0.0 | sep | RE | 0.958 | 0.990 | -0.032 | 0.000 |
| ladder | 5 | 0.0 | sep | **Cal** | 0.941 | 0.990 | **-0.049** | 0.000 |
| ladder | 5 | 0.0 | sep | Bayes | 0.948 | 0.992 | -0.044 | - |
| ladder | 2 | 0.05 | sep | FE | 0.876 | 0.866 | 0.010 | 0.020 |
| ladder | 2 | 0.05 | sep | RE | 0.803 | 0.854 | -0.051 | 0.006 |
| ladder | 2 | 0.05 | sep | **Cal** | 0.733 | 0.854 | **-0.121** | 0.000 |
| ladder | 2 | 0.05 | sep | Bayes | 0.797 | 0.867 | -0.070 | - |
| ladder | 5 | 0.05 | sep | FE | 0.923 | 0.920 | 0.003 | 0.014 |
| ladder | 5 | 0.05 | sep | RE | 0.879 | 0.946 | -0.067 | 0.004 |
| ladder | 5 | 0.05 | sep | **Cal** | 0.847 | 0.946 | **-0.099** | 0.004 |
| ladder | 5 | 0.05 | sep | Bayes | 0.889 | 0.983 | -0.095 | - |
| ladder | 2 | 0.15 | sep | FE | 0.873 | 0.708 | 0.165 | 0.100 |
| ladder | 2 | 0.15 | sep | RE | 0.745 | 0.726 | 0.019 | 0.022 |
| ladder | 2 | 0.15 | sep | **Cal** | 0.670 | 0.726 | **-0.056** | 0.012 |
| ladder | 2 | 0.15 | sep | Bayes | 0.734 | 0.733 | 0.000 | - |
| ladder | 5 | 0.15 | sep | FE | 0.918 | 0.828 | 0.090 | 0.086 |
| ladder | 5 | 0.15 | sep | RE | 0.825 | 0.878 | -0.053 | 0.012 |
| ladder | 5 | 0.15 | sep | **Cal** | 0.781 | 0.878 | **-0.097** | 0.008 |
| ladder | 5 | 0.15 | sep | Bayes | 0.828 | 0.908 | -0.080 | - |
| loop | 2 | 0.0 | sep | FE | 0.935 | 0.980 | -0.045 | 0.000 |
| loop | 2 | 0.0 | sep | RE | 0.917 | 0.970 | -0.053 | 0.000 |
| loop | 2 | 0.0 | sep | **Cal** | 0.850 | 0.970 | **-0.120** | 0.000 |
| loop | 2 | 0.0 | sep | Bayes | 0.899 | 0.992 | -0.093 | - |
| loop | 5 | 0.0 | sep | FE | 0.996 | 1.000 | -0.004 | 0.000 |
| loop | 5 | 0.0 | sep | RE | 0.993 | 1.000 | -0.007 | 0.000 |
| loop | 5 | 0.0 | sep | **Cal** | 0.979 | 1.000 | **-0.021** | 0.000 |
| loop | 5 | 0.0 | sep | Bayes | 0.991 | 1.000 | -0.009 | - |
| loop | 2 | 0.05 | sep | FE | 0.905 | 0.898 | 0.007 | 0.012 |
| loop | 2 | 0.05 | sep | RE | 0.863 | 0.906 | -0.043 | 0.006 |
| loop | 2 | 0.05 | sep | **Cal** | 0.778 | 0.906 | **-0.128** | 0.002 |
| loop | 2 | 0.05 | sep | Bayes | 0.851 | 0.908 | -0.057 | - |
| loop | 5 | 0.05 | sep | FE | 0.977 | 0.984 | -0.007 | 0.000 |
| loop | 5 | 0.05 | sep | RE | 0.953 | 0.994 | -0.041 | 0.000 |
| loop | 5 | 0.05 | sep | **Cal** | 0.927 | 0.994 | **-0.067** | 0.000 |
| loop | 5 | 0.05 | sep | Bayes | 0.946 | 1.000 | -0.054 | - |
| loop | 2 | 0.15 | sep | FE | 0.902 | 0.838 | 0.064 | 0.062 |
| loop | 2 | 0.15 | sep | RE | 0.820 | 0.880 | -0.060 | 0.016 |
| loop | 2 | 0.15 | sep | **Cal** | 0.719 | 0.880 | **-0.161** | 0.002 |
| loop | 2 | 0.15 | sep | Bayes | 0.803 | 0.908 | -0.106 | - |
| loop | 5 | 0.15 | sep | FE | 0.954 | 0.920 | 0.034 | 0.040 |
| loop | 5 | 0.15 | sep | RE | 0.890 | 0.954 | -0.064 | 0.004 |
| loop | 5 | 0.15 | sep | **Cal** | 0.849 | 0.954 | **-0.105** | 0.002 |
| loop | 5 | 0.15 | sep | Bayes | 0.888 | 0.975 | -0.087 | - |
| dense | 2 | 0.0 | tight | FE | 0.686 | 0.622 | 0.064 | 0.014 |
| dense | 2 | 0.0 | tight | RE | 0.660 | 0.614 | 0.046 | 0.010 |
| dense | 2 | 0.0 | tight | **Cal** | 0.609 | 0.614 | **-0.005** | 0.000 |
| dense | 2 | 0.0 | tight | Bayes | 0.610 | 0.600 | 0.010 | - |
| dense | 5 | 0.0 | tight | FE | 0.769 | 0.846 | -0.077 | 0.008 |
| dense | 5 | 0.0 | tight | RE | 0.754 | 0.850 | -0.096 | 0.004 |
| dense | 5 | 0.0 | tight | **Cal** | 0.722 | 0.850 | **-0.128** | 0.004 |
| dense | 5 | 0.0 | tight | Bayes | 0.731 | 0.792 | -0.060 | - |
| dense | 2 | 0.05 | tight | FE | 0.752 | 0.532 | 0.220 | 0.092 |
| dense | 2 | 0.05 | tight | RE | 0.654 | 0.518 | 0.136 | 0.030 |
| dense | 2 | 0.05 | tight | **Cal** | 0.594 | 0.518 | **0.076** | 0.014 |
| dense | 2 | 0.05 | tight | Bayes | 0.651 | 0.508 | 0.143 | - |
| dense | 5 | 0.05 | tight | FE | 0.789 | 0.636 | 0.153 | 0.080 |
| dense | 5 | 0.05 | tight | RE | 0.687 | 0.642 | 0.045 | 0.034 |
| dense | 5 | 0.05 | tight | **Cal** | 0.649 | 0.642 | **0.007** | 0.020 |
| dense | 5 | 0.05 | tight | Bayes | 0.693 | 0.667 | 0.026 | - |
| dense | 2 | 0.15 | tight | FE | 0.815 | 0.460 | 0.355 | 0.208 |
| dense | 2 | 0.15 | tight | RE | 0.625 | 0.480 | 0.145 | 0.034 |
| dense | 2 | 0.15 | tight | **Cal** | 0.563 | 0.480 | **0.083** | 0.014 |
| dense | 2 | 0.15 | tight | Bayes | 0.630 | 0.475 | 0.155 | - |
| dense | 5 | 0.15 | tight | FE | 0.842 | 0.486 | 0.356 | 0.224 |
| dense | 5 | 0.15 | tight | RE | 0.639 | 0.558 | 0.081 | 0.022 |
| dense | 5 | 0.15 | tight | **Cal** | 0.598 | 0.558 | **0.040** | 0.018 |
| dense | 5 | 0.15 | tight | Bayes | 0.650 | 0.583 | 0.067 | - |
| ladder | 2 | 0.0 | tight | FE | 0.653 | 0.598 | 0.055 | 0.002 |
| ladder | 2 | 0.0 | tight | RE | 0.626 | 0.600 | 0.026 | 0.002 |
| ladder | 2 | 0.0 | tight | **Cal** | 0.563 | 0.600 | **-0.037** | 0.000 |
| ladder | 2 | 0.0 | tight | Bayes | 0.616 | 0.625 | -0.009 | - |
| ladder | 5 | 0.0 | tight | FE | 0.740 | 0.776 | -0.036 | 0.016 |
| ladder | 5 | 0.0 | tight | RE | 0.723 | 0.760 | -0.037 | 0.018 |
| ladder | 5 | 0.0 | tight | **Cal** | 0.690 | 0.760 | **-0.070** | 0.010 |
| ladder | 5 | 0.0 | tight | Bayes | 0.703 | 0.767 | -0.064 | - |
| ladder | 2 | 0.05 | tight | FE | 0.748 | 0.506 | 0.242 | 0.094 |
| ladder | 2 | 0.05 | tight | RE | 0.633 | 0.496 | 0.137 | 0.026 |
| ladder | 2 | 0.05 | tight | **Cal** | 0.566 | 0.496 | **0.070** | 0.012 |
| ladder | 2 | 0.05 | tight | Bayes | 0.616 | 0.483 | 0.133 | - |
| ladder | 5 | 0.05 | tight | FE | 0.755 | 0.598 | 0.157 | 0.064 |
| ladder | 5 | 0.05 | tight | RE | 0.646 | 0.606 | 0.040 | 0.010 |
| ladder | 5 | 0.05 | tight | **Cal** | 0.599 | 0.606 | **-0.007** | 0.008 |
| ladder | 5 | 0.05 | tight | Bayes | 0.624 | 0.650 | -0.026 | - |
| ladder | 2 | 0.15 | tight | FE | 0.794 | 0.406 | 0.388 | 0.220 |
| ladder | 2 | 0.15 | tight | RE | 0.627 | 0.402 | 0.225 | 0.058 |
| ladder | 2 | 0.15 | tight | **Cal** | 0.553 | 0.402 | **0.151** | 0.016 |
| ladder | 2 | 0.15 | tight | Bayes | 0.625 | 0.433 | 0.191 | - |
| ladder | 5 | 0.15 | tight | FE | 0.830 | 0.498 | 0.332 | 0.200 |
| ladder | 5 | 0.15 | tight | RE | 0.635 | 0.510 | 0.125 | 0.018 |
| ladder | 5 | 0.15 | tight | **Cal** | 0.586 | 0.510 | **0.076** | 0.010 |
| ladder | 5 | 0.15 | tight | Bayes | 0.636 | 0.492 | 0.144 | - |
| loop | 2 | 0.0 | tight | FE | 0.740 | 0.724 | 0.016 | 0.022 |
| loop | 2 | 0.0 | tight | RE | 0.711 | 0.706 | 0.005 | 0.012 |
| loop | 2 | 0.0 | tight | **Cal** | 0.617 | 0.706 | **-0.089** | 0.000 |
| loop | 2 | 0.0 | tight | Bayes | 0.681 | 0.683 | -0.003 | - |
| loop | 5 | 0.0 | tight | FE | 0.811 | 0.846 | -0.035 | 0.004 |
| loop | 5 | 0.0 | tight | RE | 0.790 | 0.832 | -0.042 | 0.002 |
| loop | 5 | 0.0 | tight | **Cal** | 0.747 | 0.832 | **-0.085** | 0.002 |
| loop | 5 | 0.0 | tight | Bayes | 0.773 | 0.833 | -0.060 | - |
| loop | 2 | 0.05 | tight | FE | 0.772 | 0.624 | 0.148 | 0.076 |
| loop | 2 | 0.05 | tight | RE | 0.705 | 0.612 | 0.093 | 0.030 |
| loop | 2 | 0.05 | tight | **Cal** | 0.608 | 0.612 | **-0.004** | 0.008 |
| loop | 2 | 0.05 | tight | Bayes | 0.666 | 0.617 | 0.049 | - |
| loop | 5 | 0.05 | tight | FE | 0.825 | 0.734 | 0.091 | 0.064 |
| loop | 5 | 0.05 | tight | RE | 0.742 | 0.746 | -0.004 | 0.020 |
| loop | 5 | 0.05 | tight | **Cal** | 0.686 | 0.746 | **-0.060** | 0.008 |
| loop | 5 | 0.05 | tight | Bayes | 0.719 | 0.775 | -0.056 | - |
| loop | 2 | 0.15 | tight | FE | 0.838 | 0.498 | 0.340 | 0.228 |
| loop | 2 | 0.15 | tight | RE | 0.706 | 0.512 | 0.194 | 0.084 |
| loop | 2 | 0.15 | tight | **Cal** | 0.606 | 0.512 | **0.094** | 0.026 |
| loop | 2 | 0.15 | tight | Bayes | 0.696 | 0.500 | 0.196 | - |
| loop | 5 | 0.15 | tight | FE | 0.866 | 0.602 | 0.264 | 0.172 |
| loop | 5 | 0.15 | tight | RE | 0.710 | 0.644 | 0.066 | 0.030 |
| loop | 5 | 0.15 | tight | **Cal** | 0.661 | 0.644 | **0.017** | 0.018 |
| loop | 5 | 0.15 | tight | Bayes | 0.718 | 0.667 | 0.052 | - |

## 3. Inconsistency test — type-I and power

Global design-by-treatment Q-test. **honest** uses a common RE τ² (calibrated under heterogeneity); **naive** ignores τ² and over-rejects (the sheaf-nma / enma-snma over-detection bug, reproduced).

| geometry | τ² | true incons | honest reject | naive reject |
|---|---|---|---|---|
| dense | 0.05 | 0.0 (type-I) | **0.038** | 0.426 |
| dense | 0.05 | 0.2 (power) | **0.324** | 0.842 |
| dense | 0.05 | 0.5 (power) | **0.962** | 1.000 |
| dense | 0.15 | 0.0 (type-I) | **0.054** | 0.788 |
| dense | 0.15 | 0.2 (power) | **0.198** | 0.888 |
| dense | 0.15 | 0.5 (power) | **0.822** | 0.994 |
| ladder | 0.05 | 0.0 (type-I) | **0.048** | 0.352 |
| ladder | 0.05 | 0.2 (power) | **0.148** | 0.576 |
| ladder | 0.05 | 0.5 (power) | **0.680** | 0.956 |
| ladder | 0.15 | 0.0 (type-I) | **0.044** | 0.654 |
| ladder | 0.15 | 0.2 (power) | **0.088** | 0.692 |
| ladder | 0.15 | 0.5 (power) | **0.404** | 0.920 |
| loop | 0.05 | 0.0 (type-I) | **0.034** | 0.236 |
| loop | 0.05 | 0.2 (power) | **0.094** | 0.334 |
| loop | 0.05 | 0.5 (power) | **0.302** | 0.694 |
| loop | 0.15 | 0.0 (type-I) | **0.042** | 0.390 |
| loop | 0.15 | 0.2 (power) | **0.064** | 0.478 |
| loop | 0.15 | 0.5 (power) | **0.238** | 0.714 |

## 4. Small-study / publication selection on the network

No method here corrects publication bias; selection collapses coverage for ALL intervals — the honest boundary of the consistency model.

| scenario | NaiveFE | RE | NetHK | sel.frac |
|---|---|---|---|---|
| copas_strong | 0.631 | 0.828 | 0.849 | 0.63 |
| none | 0.715 | 0.925 | 0.939 | 1.00 |
| step_strong | 0.442 | 0.656 | 0.714 | 0.40 |

## 5. Partial-identification bounds for under-determined networks

PartialID = NetHK CI widened by ±c·ω̂ (c=2.0), ω̂ = data-driven inconsistency SD from the honest global test (0 when none detected).

| geometry | true incons | RE cov | NetHK cov | **PartialID cov** | width RE/HK/PID |
|---|---|---|---|---|---|
| loop | 0.0 | 0.901 | 0.929 | **0.946** | 0.48/0.54/0.66 |
| loop | 0.1 | 0.898 | 0.931 | **0.956** | 0.48/0.55/0.67 |
| loop | 0.2 | 0.844 | 0.883 | **0.931** | 0.49/0.55/0.75 |
| loop | 0.4 | 0.684 | 0.756 | **0.882** | 0.53/0.60/0.97 |
| dense | 0.0 | 0.930 | 0.946 | **0.967** | 0.41/0.44/0.56 |
| dense | 0.1 | 0.930 | 0.947 | **0.974** | 0.43/0.46/0.68 |
| dense | 0.2 | 0.939 | 0.953 | **0.991** | 0.46/0.50/0.95 |
| dense | 0.4 | 0.981 | 0.988 | **1.000** | 0.58/0.62/1.62 |
| star (indirect-only, **consistent**) | 0.0 | 0.918 | 0.938 | **0.938** | 1.02/1.18/1.18 |

## 6. Honest negatives & boundaries

- **NetHK is mildly conservative at τ²=0** (over-covers slightly, like the pairwise HKSJ floor) — the honest price of guaranteed coverage under unknown heterogeneity; it is never worse than RE on coverage.
- **The Bayesian posterior P(best) is NOT automatically calibrated.** Under heterogeneity + closely-spaced treatments it is over-confident (the IG(ε,ε) τ² prior under-shrinks the ranking spread) — a Bayesian framing does not by itself cure ranking over-confidence; the calibrated covariance does.
- **PartialID buys nothing where there is nothing to hedge.** On consistent or untestable (star, indirect-only) networks ω̂=0 and PartialID ≡ NetHK — no false width. Its coverage gain appears only under genuine inconsistency.
- **On dense, redundant networks the consistency estimand is barely biased** even under injected inconsistency (the loop disagreements average out), so PartialID merely over-covers there — it is a small-/sparse-network tool.
- **Publication selection is uncorrected.** Step/Copas selection collapses coverage for every interval; honest network coverage needs a selection model (out of scope here, flagged like the pairwise bench).
- **Two-arm studies only.** Multi-arm trials add a within-study shared-control sampling covariance (the platformtrialma failure mode) and are deliberately out of scope rather than approximated.
