# Run after node gosh/tests/p13-live-script-replay.cjs.
# The generated code is the production adapter's buildScript output plus checks.
script <- file.path(dirname(tempdir()), 'p13-live-scripts.R')
stopifnot(file.exists(script))
source(script, local=new.env(parent=globalenv()))
