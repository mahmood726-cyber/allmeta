window.RIPD_EXAMPLES = {
  "tierA": {
    "label": "Tier A — rich (KM points + at-risk)",
    "trial": {
      "nct_id": "EXAMPLE-A",
      "source_url": "synthetic example",
      "time_unit": "months",
      "arms": [
        {
          "arm_id": "OG000",
          "label": "Drug A",
          "role": "experimental",
          "N": 200,
          "total_events": 131,
          "follow_up_max": 24,
          "km_points": [
            {
              "t": 0,
              "S": 1
            },
            {
              "t": 4,
              "S": 0.905
            },
            {
              "t": 8,
              "S": 0.81
            },
            {
              "t": 12,
              "S": 0.69
            },
            {
              "t": 16,
              "S": 0.59
            },
            {
              "t": 20,
              "S": 0.505
            },
            {
              "t": 24,
              "S": 0.425
            }
          ],
          "nar_points": [
            {
              "t": 0,
              "n": 200
            },
            {
              "t": 12,
              "n": 138
            },
            {
              "t": 24,
              "n": 85
            }
          ]
        },
        {
          "arm_id": "OG001",
          "label": "Placebo",
          "role": "comparator",
          "N": 200,
          "total_events": 165,
          "follow_up_max": 24,
          "km_points": [
            {
              "t": 0,
              "S": 1
            },
            {
              "t": 4,
              "S": 0.83
            },
            {
              "t": 8,
              "S": 0.62
            },
            {
              "t": 12,
              "S": 0.45
            },
            {
              "t": 16,
              "S": 0.325
            },
            {
              "t": 20,
              "S": 0.25
            },
            {
              "t": 24,
              "S": 0.22
            }
          ],
          "nar_points": [
            {
              "t": 0,
              "n": 200
            },
            {
              "t": 12,
              "n": 90
            },
            {
              "t": 24,
              "n": 44
            }
          ]
        }
      ],
      "hr": {
        "value": 0.647,
        "ci_low": 0.5,
        "ci_high": 0.86,
        "method": "Cox",
        "favors_arm_id": "OG000"
      }
    }
  },
  "tierB": {
    "label": "Tier B — medium (median + HR, parametric)",
    "trial": {
      "nct_id": "EXAMPLE-B",
      "source_url": "synthetic example",
      "time_unit": "months",
      "arms": [
        {
          "arm_id": "OG000",
          "label": "Drug B",
          "role": "experimental",
          "N": 300,
          "total_events": 165,
          "follow_up_max": 30,
          "median": {
            "value": 16,
            "ci_low": 13,
            "ci_high": 20.5
          },
          "km_points": [],
          "nar_points": []
        },
        {
          "arm_id": "OG001",
          "label": "Placebo",
          "role": "comparator",
          "N": 300,
          "total_events": 200,
          "follow_up_max": 30,
          "median": {
            "value": 10,
            "ci_low": 8.5,
            "ci_high": 11.8
          },
          "km_points": [],
          "nar_points": []
        }
      ],
      "hr": {
        "value": 0.625,
        "ci_low": 0.5,
        "ci_high": 0.78,
        "method": "Cox",
        "favors_arm_id": "OG000"
      }
    }
  },
  "tierC": {
    "label": "Tier C — sparse (HR only, refused)",
    "trial": {
      "nct_id": "EXAMPLE-C",
      "source_url": "synthetic example",
      "time_unit": "months",
      "arms": [
        {
          "arm_id": "OG000",
          "label": "Drug C",
          "role": "experimental",
          "N": null,
          "total_events": null,
          "km_points": [],
          "nar_points": [],
          "median": null
        },
        {
          "arm_id": "OG001",
          "label": "Placebo",
          "role": "comparator",
          "N": null,
          "total_events": null,
          "km_points": [],
          "nar_points": [],
          "median": null
        }
      ],
      "hr": {
        "value": 0.82,
        "ci_low": 0.66,
        "ci_high": 1.02,
        "method": "Cox",
        "favors_arm_id": "OG000"
      }
    }
  },
  "realOnc": {
    "label": "REAL ct.gov — NCT01524783 (RADIANT-4, NET; high-event OS)",
    "trial": {
      "nct_id": "NCT01524783",
      "source_url": "https://clinicaltrials.gov/study/NCT01524783",
      "outcome_id": 228201242,
      "time_unit": "months",
      "condition": "Advanced NET of GI Origin; Advanced NET of Lung Origin; Neuroendocrine Tumors",
      "arms": [
        {
          "arm_id": "OG000",
          "label": "Everolimus + BSC",
          "role": "experimental",
          "N": 205,
          "total_events": 107,
          "follow_up_max": 24,
          "km_points": [
            {
              "t": 2,
              "S": 0.901
            },
            {
              "t": 4,
              "S": 0.812
            },
            {
              "t": 6,
              "S": 0.721
            },
            {
              "t": 8,
              "S": 0.624
            },
            {
              "t": 10,
              "S": 0.517
            },
            {
              "t": 12,
              "S": 0.444
            },
            {
              "t": 15,
              "S": 0.401
            },
            {
              "t": 18,
              "S": 0.318
            },
            {
              "t": 21,
              "S": 0.276
            },
            {
              "t": 24,
              "S": 0.22
            }
          ],
          "nar_points": [],
          "median": null
        },
        {
          "arm_id": "OG001",
          "label": "Placebo + BSC",
          "role": "comparator",
          "N": 97,
          "total_events": 77,
          "follow_up_max": 27,
          "km_points": [
            {
              "t": 2,
              "S": 0.746
            },
            {
              "t": 4,
              "S": 0.491
            },
            {
              "t": 6,
              "S": 0.401
            },
            {
              "t": 8,
              "S": 0.358
            },
            {
              "t": 10,
              "S": 0.313
            },
            {
              "t": 12,
              "S": 0.281
            },
            {
              "t": 15,
              "S": 0.264
            },
            {
              "t": 18,
              "S": 0.244
            },
            {
              "t": 21,
              "S": 0.174
            },
            {
              "t": 24,
              "S": 0.174
            },
            {
              "t": 27,
              "S": 0.174
            }
          ],
          "nar_points": [],
          "median": null
        }
      ],
      "hr": {
        "value": 0.48,
        "ci_low": 0.35,
        "ci_high": 0.67,
        "ci_percent": 95,
        "p_value": 0.001,
        "method": "Log Rank",
        "one_sided": false,
        "favors_arm_id": "OG000"
      },
      "_note": "total_events set from drop_withdrawals (censoring-informed); see VALIDATION.md"
    }
  },
  "real": {
    "label": "REAL ct.gov — NCT00725985 (cladribine MS; low-event)",
    "trial": {
      "nct_id": "NCT00725985",
      "source_url": "https://clinicaltrials.gov/study/NCT00725985",
      "outcome_id": 228260378,
      "time_unit": "months",
      "arms": [
        {
          "arm_id": "OG000",
          "label": "Cladribine 5.25 mg/kg, Rebif (OLMP)",
          "role": "experimental",
          "N": 24,
          "total_events": null,
          "follow_up_max": 23.655,
          "km_points": [
            {
              "t": 0.0329,
              "S": 1
            },
            {
              "t": 2.9569,
              "S": 1
            },
            {
              "t": 5.9138,
              "S": 0.9583
            },
            {
              "t": 8.8706,
              "S": 0.9583
            },
            {
              "t": 11.8275,
              "S": 0.9583
            },
            {
              "t": 14.7844,
              "S": 0.9583
            },
            {
              "t": 17.7413,
              "S": 0.9583
            },
            {
              "t": 20.6982,
              "S": 0.9583
            },
            {
              "t": 23.655,
              "S": 0.9583
            }
          ],
          "nar_points": [],
          "median": null
        },
        {
          "arm_id": "OG001",
          "label": "Cladribine 3.5 mg/kg, Rebif (OLMP)",
          "role": "experimental",
          "N": 25,
          "total_events": null,
          "follow_up_max": 23.655,
          "km_points": [
            {
              "t": 0.0329,
              "S": 1
            },
            {
              "t": 2.9569,
              "S": 1
            },
            {
              "t": 5.9138,
              "S": 0.9583
            },
            {
              "t": 8.8706,
              "S": 0.9583
            },
            {
              "t": 11.8275,
              "S": 0.9583
            },
            {
              "t": 14.7844,
              "S": 0.9583
            },
            {
              "t": 17.7413,
              "S": 0.9583
            },
            {
              "t": 20.6982,
              "S": 0.9583
            },
            {
              "t": 23.655,
              "S": 0.9583
            }
          ],
          "nar_points": [],
          "median": null
        },
        {
          "arm_id": "OG002",
          "label": "Placebo, Rebif (OLMP)",
          "role": "comparator",
          "N": 60,
          "total_events": null,
          "follow_up_max": 23.655,
          "km_points": [
            {
              "t": 0.0329,
              "S": 1
            },
            {
              "t": 2.9569,
              "S": 1
            },
            {
              "t": 5.9138,
              "S": 0.9473
            },
            {
              "t": 8.8706,
              "S": 0.9473
            },
            {
              "t": 11.8275,
              "S": 0.9473
            },
            {
              "t": 14.7844,
              "S": 0.9236
            },
            {
              "t": 17.7413,
              "S": 0.8906
            },
            {
              "t": 20.6982,
              "S": 0.8906
            },
            {
              "t": 23.655,
              "S": 0.8906
            }
          ],
          "nar_points": [],
          "median": null
        }
      ],
      "hr": null
    }
  }
};
