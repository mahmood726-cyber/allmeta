suppressPackageStartupMessages(library(metafor))
suppressPackageStartupMessages(library(jsonlite))

# Two SMD rows (means+SDs)
smd_rows <- data.frame(
  m1i  = c(52.5, 61.0),
  sd1i = c(8.2,  10.5),
  n1i  = c(30L,  45L),
  m2i  = c(47.1, 54.3),
  sd2i = c(7.9,   9.8),
  n2i  = c(30L,  45L)
)
smd_esc <- escalc(measure = "SMD",
                  m1i = smd_rows$m1i, sd1i = smd_rows$sd1i, n1i = smd_rows$n1i,
                  m2i = smd_rows$m2i, sd2i = smd_rows$sd2i, n2i = smd_rows$n2i)

# Two OR rows (2x2 tables: ai=events_treat, bi=non-events_treat, ci=events_ctrl, di=non-ctrl)
or_rows <- data.frame(
  ai = c(12L,  5L),
  bi = c(38L, 95L),
  ci = c( 8L, 10L),
  di = c(42L, 90L)
)
or_esc <- escalc(measure = "OR",
                 ai = or_rows$ai, bi = or_rows$bi,
                 ci = or_rows$ci, di = or_rows$di)

result <- list(
  smd = list(
    yi = as.numeric(smd_esc$yi),
    vi = as.numeric(smd_esc$vi)
  ),
  or = list(
    yi = as.numeric(or_esc$yi),
    vi = as.numeric(or_esc$vi)
  )
)
cat(toJSON(result, auto_unbox = FALSE, digits = 12))
