load("C:/HTML apps/dosehtml/milk_mort.rda")

df <- milk_mort
write.csv(df, "C:/HTML apps/dosehtml/milk_mort_full_raw.csv", row.names = FALSE)

df$base_dose <- NA
for (id in unique(df$id)) {
  sub <- df[df$id == id, ]
  idx <- which(sub$logrr == 0 & (sub$se == 0 | is.na(sub$se)))
  if (length(idx) == 0) idx <- which(sub$logrr == 0)
  if (length(idx) == 0) idx <- 1
  base <- sub$dose[idx[1]]
  df$base_dose[df$id == id] <- base
}

df$dose_shifted <- df$dose - df$base_dose

app_df <- data.frame(
  id = df$id,
  author = df$author,
  type = df$type,
  dose = df$dose_shifted,
  cases = df$cases,
  n = df$n,
  logRR = df$logrr,
  se = df$se
)

write.csv(app_df, "C:/HTML apps/dosehtml/milk_mort_full_shifted.csv", row.names = FALSE)
