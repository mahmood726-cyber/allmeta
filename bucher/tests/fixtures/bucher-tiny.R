## bucher-tiny.R — R-parity for bucher indirect comparison
##
## The JS engine (bucher/index.html) implements the Bucher (1997) closed-form
## indirect treatment comparison:
##   d_indirect(BC) = d(AC) - d(AB)     [A is the common comparator]
##   se_indirect(BC) = sqrt(se(AC)^2 + se(AB)^2)
##
## This R script pools the two AB trials and the two AC trials using
## fixed-effect (IV) pooling, then computes the Bucher indirect BC estimate.
## It also cross-checks with netmeta::netmeta(method="inverse") to confirm
## the indirect-only estimate at the network level.
##
## Usage (called by _r_parity.py):
##   Rscript --vanilla bucher-tiny.R bucher-tiny.csv

suppressPackageStartupMessages(library(jsonlite))
suppressPackageStartupMessages(library(netmeta))

args <- commandArgs(trailingOnly = TRUE)
d <- read.csv(args[1])
# columns: study, treat1, treat2, TE, seTE

## ---- Step 1: pool AB trials and AC trials (FE / IV) ----
## AB: S1 (TE=-0.30, seTE=0.10), S4 (TE=-0.28, seTE=0.11)
ab <- d[d$treat1 == "A" & d$treat2 == "B", ]
w_ab <- 1 / ab$seTE^2
mu_ab <- sum(w_ab * ab$TE) / sum(w_ab)
se_ab <- 1 / sqrt(sum(w_ab))

## AC: S2 (TE=-0.50, seTE=0.12), S5 (TE=-0.48, seTE=0.14)
ac <- d[d$treat1 == "A" & d$treat2 == "C", ]
w_ac <- 1 / ac$seTE^2
mu_ac <- sum(w_ac * ac$TE) / sum(w_ac)
se_ac <- 1 / sqrt(sum(w_ac))

## BC: S3 (TE=-0.22, seTE=0.09) — only one study, no pooling needed
bc <- d[d$treat1 == "B" & d$treat2 == "C", ]
mu_bc_direct <- bc$TE[1]
se_bc_direct <- bc$seTE[1]

## ---- Step 2: Bucher indirect B vs C (via common comparator A) ----
## indirect BC = AC - AB  (A is the common comparator)
mu_bc_indirect <- mu_ac - mu_ab
se_bc_indirect <- sqrt(se_ac^2 + se_ab^2)

## 95% CI
z95 <- qnorm(0.975)
lo_indirect <- mu_bc_indirect - z95 * se_bc_indirect
hi_indirect <- mu_bc_indirect + z95 * se_bc_indirect

## p-value (two-sided)
p_indirect <- 2 * pnorm(-abs(mu_bc_indirect / se_bc_indirect))

## ---- Step 3: cross-check with netmeta (fixed-effect, indirect contribution) ----
nm <- netmeta(TE, seTE, treat1, treat2, study, data = d,
              reference.group = "A", sm = "MD",
              details.chkmultiarm = FALSE)

## Extract indirect-only BC from netmeta random estimates
## netmeta stores indirect effects in nm$TE.indirect.common (FE) or nm$TE.indirect.random
te_indirect_nm  <- nm$TE.indirect.common["B", "C"]
se_indirect_nm  <- nm$seTE.indirect.common["B", "C"]

cat(toJSON(list(
  ## Bucher closed-form (pooled AB + AC, then subtract)
  mu_ab            = as.numeric(mu_ab),
  se_ab            = as.numeric(se_ab),
  mu_ac            = as.numeric(mu_ac),
  se_ac            = as.numeric(se_ac),
  mu_bc_indirect   = as.numeric(mu_bc_indirect),
  se_bc_indirect   = as.numeric(se_bc_indirect),
  lo_bc_indirect   = as.numeric(lo_indirect),
  hi_bc_indirect   = as.numeric(hi_indirect),
  p_bc_indirect    = as.numeric(p_indirect),
  ## netmeta cross-check
  te_indirect_nm   = as.numeric(te_indirect_nm),
  se_indirect_nm   = as.numeric(se_indirect_nm)
), auto_unbox = TRUE, digits = 15))
cat("\n")
