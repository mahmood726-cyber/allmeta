function (yi, vi, sei, weights, ai, bi, ci, di, n1i, n2i, x1i, x2i, t1i, t2i, m1i, m2i, sd1i, sd2i, xi, mi, ri, ti, fi, pi, sdi, r2i, ni, mods, scale, measure = "GEN", data, slab, subset, add = 1/2, to = "only0", drop00 = FALSE, intercept = TRUE, method = "REML", weighted = TRUE, test = "z", level = 95, btt, att, tau2, verbose = FALSE, digits, control, ...) 
{
    mstyle <- .get.mstyle()
    if (!is.element(measure, c("RR", "OR", "PETO", "RD", "AS", "PHI", "ZPHI", "YUQ", "YUY", "RTET", "ZTET", "PBIT", "OR2D", "OR2DN", "OR2DL", "MPRD", "MPRR", "MPOR", "MPORC", "MPPETO", "MPORM", "IRR", "IRD", "IRSD", "MD", "SMD", "SMDH", "SMD1", "SMD1H", "ROM", "CVR", "VR", "RPB", "ZPB", "RBIS", "ZBIS", "D2OR", "D2ORN", "D2ORL", "COR", "UCOR", "ZCOR", "PCOR", "ZPCOR", "SPCOR", "ZSPCOR", "R2", "ZR2", "R2F", "ZR2F", "PR", "PLN", "PLO", "PRZ", "PAS", "PFT", "IR", "IRLN", "IRS", "IRFT", "MN", "SMN", "MNLN", 
        "CVLN", "SDLN", "MC", "SMCC", "SMCR", "SMCRH", "SMCRP", "SMCRPH", "CLESCN", "AUCCN", "ROMC", "CVRC", "VRC", "ARAW", "AHW", "ABT", "REH", "CLES", "CLESN", "AUC", "AUCN", "HR", "HD", "GEN"))) 
        stop(mstyle$stop("Unknown 'measure' specified."))
    if (!is.element(method[1], c("FE", "EE", "CE", "HS", "HSk", "HE", "DL", "DLIT", "GENQ", "GENQM", "SJ", "SJIT", "PM", "MP", "PMM", "ML", "REML", "EB"))) 
        stop(mstyle$stop("Unknown 'method' specified."))
    if (length(add) > 1L) 
        add <- add[1]
    if (length(to) > 1L) 
        to <- to[1]
    na.act <- getOption("na.action")
    if (!is.element(na.act, c("na.omit", "na.exclude", "na.fail", "na.pass"))) 
        stop(mstyle$stop("Unknown 'na.action' specified under options()."))
    if (missing(tau2)) 
        tau2 <- NULL
    if (missing(control)) 
        control <- list()
    time.start <- proc.time()
    ddd <- list(...)
    .chkdots(ddd, c("vtype", "knha", "onlyo1", "addyi", "addvi", "correct", "i2def", "r2def", "skipr2", "abbrev", "dfs", "time", "outlist", "link", "optbeta", "alpha", "beta", "skiphes", "retopt", "pleasedonotreportI2thankyouverymuch"))
    if (is.null(ddd$vtype)) {
        vtype <- "LS"
    }
    else {
        vtype <- ddd$vtype
    }
    if (.isFALSE(ddd$knha)) 
        test <- "z"
    if (.isTRUE(ddd$knha)) 
        test <- "knha"
    test <- tolower(test)
    if (!is.element(test, c("z", "t", "knha", "hksj", "adhoc"))) 
        stop(mstyle$stop("Invalid option selected for 'test' argument."))
    if (test == "hksj") 
        test <- "knha"
    if (missing(scale)) {
        model <- "rma.uni"
    }
    else {
        model <- "rma.ls"
    }
    onlyo1 <- .chkddd(ddd$onlyo1, FALSE)
    addyi <- .chkddd(ddd$addyi, TRUE)
    addvi <- .chkddd(ddd$addvi, TRUE)
    correct <- .chkddd(ddd$correct, TRUE)
    i2def <- .chkddd(ddd$i2def, "1")
    r2def <- .chkddd(ddd$r2def, "1")
    link <- .chkddd(ddd$link, "log", match.arg(ddd$link, c("log", "identity")))
    optbeta <- .chkddd(ddd$optbeta, FALSE, .isTRUE(ddd$optbeta))
    if (optbeta && !weighted) 
        stop(mstyle$stop("Must use 'weighted=TRUE' when 'optbeta=TRUE'."))
    alpha <- .chkddd(ddd$alpha, NA_real_)
    beta <- .chkddd(ddd$beta, NA_real_)
    if (model == "rma.uni" && !missing(att)) 
        warning(mstyle$warning("Argument 'att' only relevant for location-scale models and hence ignored."), call. = FALSE)
    if (missing(digits)) {
        digits <- .set.digits(dmiss = TRUE)
    }
    else {
        digits <- .set.digits(digits, dmiss = FALSE)
    }
    formula.yi <- NULL
    formula.mods <- NULL
    formula.scale <- NULL
    if (verbose > 2) {
        opwarn <- options(warn = 1)
        on.exit(options(warn = opwarn$warn), add = TRUE)
    }
    if (verbose) 
        .space()
    if (verbose > 1) 
        message(mstyle$message("Extracting/computing the yi/vi values ..."))
    if (missing(data)) 
        data <- NULL
    if (is.null(data)) {
        data <- sys.frame(sys.parent())
    }
    else {
        if (!is.data.frame(data)) 
            data <- data.frame(data)
    }
    mf <- match.call()
    addval <- mf[[match("add", names(mf))]]
    if (is.element(measure, c("AS", "PHI", "ZPHI", "RTET", "ZTET", "IRSD", "PAS", "PFT", "IRS", "IRFT")) && is.null(addval)) 
        add <- 0
    yi <- .getx("yi", mf = mf, data = data)
    if (!is.null(yi) && inherits(yi, "escalc")) 
        data <- yi
    weights <- .getx("weights", mf = mf, data = data, checknumeric = TRUE)
    slab <- .getx("slab", mf = mf, data = data)
    subset <- .getx("subset", mf = mf, data = data)
    mods <- .getx("mods", mf = mf, data = data)
    scale <- .getx("scale", mf = mf, data = data)
    ai <- bi <- ci <- di <- x1i <- x2i <- t1i <- t2i <- NA_real_
    if (!is.null(weights) && optbeta) 
        stop(mstyle$stop("Cannot use custom weights when 'optbeta=TRUE'."))
    if (!is.null(yi)) {
        if (inherits(yi, "formula")) {
            formula.yi <- yi
            formula.mods <- formula.yi[-2]
            options(na.action = "na.pass")
            mods <- model.matrix(yi, data = data)
            attr(mods, "assign") <- NULL
            attr(mods, "contrasts") <- NULL
            yi <- model.response(model.frame(yi, data = data))
            options(na.action = na.act)
            names(yi) <- NULL
            intercept <- FALSE
        }
        if (inherits(yi, "escalc")) {
            if (!is.null(attr(yi, "yi.names"))) {
                yi.name <- attr(yi, "yi.names")[1]
            }
            else {
                if (!is.element("yi", names(yi))) 
                  stop(mstyle$stop("Cannot determine name of the 'yi' variable."))
                yi.name <- "yi"
            }
            if (!is.null(attr(yi, "vi.names"))) {
                vi.name <- attr(yi, "vi.names")[1]
            }
            else {
                if (!is.element("vi", names(yi))) 
                  stop(mstyle$stop("Cannot determine name of the 'vi' variable."))
                vi.name <- "vi"
            }
            vi <- yi[[vi.name]]
            yi <- yi[[yi.name]]
            if (is.null(yi)) 
                stop(mstyle$stop(paste0("Cannot find variable '", yi.name, "' in the object.")))
            if (is.null(vi)) 
                stop(mstyle$stop(paste0("Cannot find variable '", vi.name, "' in the object.")))
            yi.escalc <- TRUE
        }
        else {
            yi.escalc <- FALSE
        }
        if (is.data.frame(yi)) {
            if (ncol(yi) == 1L) {
                yi <- yi[[1]]
            }
            else {
                stop(mstyle$stop("The object/variable specified for the 'yi' argument is a data frame with multiple columns."))
            }
        }
        if (.is.matrix(yi)) {
            if (nrow(yi) == 1L || ncol(yi) == 1L) {
                yi <- as.vector(yi)
            }
            else {
                stop(mstyle$stop("The object/variable specified for the 'yi' argument is a matrix with multiple rows/columns."))
            }
        }
        if (inherits(yi, "array")) 
            stop(mstyle$stop("The object/variable specified for the 'yi' argument is an array."))
        if (!is.numeric(yi)) 
            stop(mstyle$stop("The object/variable specified for the 'yi' argument is not numeric."))
        k <- length(yi)
        k.all <- k
        if (measure == "GEN" && !is.null(attr(yi, "measure"))) 
            measure <- attr(yi, "measure")
        attr(yi, "measure") <- measure
        if (!yi.escalc) {
            vi <- .getx("vi", mf = mf, data = data, checknumeric = TRUE)
            sei <- .getx("sei", mf = mf, data = data, checknumeric = TRUE)
        }
        ni <- .getx("ni", mf = mf, data = data, checknumeric = TRUE)
        if (is.null(vi)) {
            if (is.null(sei)) {
                stop(mstyle$stop("Must specify the 'vi' or 'sei' argument."))
            }
            else {
                vi <- sei^2
            }
        }
        .chkviarg(mf$vi)
        if (.is.matrix(vi)) {
            if (nrow(vi) == 1L || ncol(vi) == 1L) {
                vi <- as.vector(vi)
            }
            else {
                if (.is.square(vi) && isSymmetric(unname(vi))) {
                  vi <- as.matrix(vi)
                  if (any(vi[!diag(nrow(vi))] != 0)) 
                    warning(mstyle$warning("Using only the diagonal elements from 'vi' argument as the sampling variances."), call. = FALSE)
                  vi <- diag(vi)
                }
                else {
                  stop(mstyle$stop("The object/variable specified for the 'vi' argument is a matrix with multiple rows/columns."))
                }
            }
        }
        if (inherits(vi, "array")) 
            stop(mstyle$stop("The object/variable specified for the 'vi' argument is an array."))
        if ((length(vi) == 1L && vi == 0) || (length(vi) == k && !anyNA(vi) && all(vi == 0))) {
            vi0 <- TRUE
        }
        else {
            vi0 <- FALSE
        }
        vi <- .expand1(vi, k)
        if (length(vi) != k) 
            stop(mstyle$stop("Length of 'yi' and 'vi' (or 'sei') are not the same."))
        if (is.null(ni)) 
            ni <- attr(yi, "ni")
        if (!is.null(ni) && length(ni) != k) 
            ni <- NULL
        if (!is.null(ni)) 
            attr(yi, "ni") <- ni
        if (is.null(slab)) {
            slab <- attr(yi, "slab")
            if (!is.null(slab) && length(slab) != k) 
                slab <- NULL
        }
        if (!is.null(subset)) {
            subset <- .chksubset(subset, k)
            yi <- .getsubset(yi, subset)
            vi <- .getsubset(vi, subset)
            ni <- .getsubset(ni, subset)
            attr(yi, "measure") <- measure
            attr(yi, "ni") <- ni
        }
    }
    else {
        if (is.element(measure, c("RR", "OR", "PETO", "RD", "AS", "PHI", "ZPHI", "YUQ", "YUY", "RTET", "ZTET", "PBIT", "OR2D", "OR2DN", "OR2DL", "MPRD", "MPRR", "MPOR", "MPORC", "MPPETO", "MPORM"))) {
            ai <- .getx("ai", mf = mf, data = data, checknumeric = TRUE)
            bi <- .getx("bi", mf = mf, data = data, checknumeric = TRUE)
            ci <- .getx("ci", mf = mf, data = data, checknumeric = TRUE)
            di <- .getx("di", mf = mf, data = data, checknumeric = TRUE)
            n1i <- .getx("n1i", mf = mf, data = data, checknumeric = TRUE)
            n2i <- .getx("n2i", mf = mf, data = data, checknumeric = TRUE)
            ri <- .getx("ri", mf = mf, data = data, checknumeric = TRUE)
            pi <- .getx("pi", mf = mf, data = data, checknumeric = TRUE)
            if (is.null(bi)) 
                bi <- n1i - ai
            if (is.null(di)) 
                di <- n2i - ci
            k <- length(ai)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                ai <- .getsubset(ai, subset)
                bi <- .getsubset(bi, subset)
                ci <- .getsubset(ci, subset)
                di <- .getsubset(di, subset)
                ri <- .getsubset(ri, subset)
                pi <- .getsubset(pi, subset)
            }
            args <- list(ai = ai, bi = bi, ci = ci, di = di, ri = ri, pi = pi, add = add, to = to, drop00 = drop00, onlyo1 = onlyo1, addyi = addyi, addvi = addvi)
        }
        if (is.element(measure, c("IRR", "IRD", "IRSD"))) {
            x1i <- .getx("x1i", mf = mf, data = data, checknumeric = TRUE)
            x2i <- .getx("x2i", mf = mf, data = data, checknumeric = TRUE)
            t1i <- .getx("t1i", mf = mf, data = data, checknumeric = TRUE)
            t2i <- .getx("t2i", mf = mf, data = data, checknumeric = TRUE)
            k <- length(x1i)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                x1i <- .getsubset(x1i, subset)
                x2i <- .getsubset(x2i, subset)
                t1i <- .getsubset(t1i, subset)
                t2i <- .getsubset(t2i, subset)
            }
            args <- list(x1i = x1i, x2i = x2i, t1i = t1i, t2i = t2i, add = add, to = to, drop00 = drop00, addyi = addyi, addvi = addvi)
        }
        if (is.element(measure, c("MD", "SMD", "SMDH", "SMD1", "SMD1H", "ROM", "RPB", "ZPB", "RBIS", "ZBIS", "D2OR", "D2ORN", "D2ORL", "CVR", "VR"))) {
            m1i <- .getx("m1i", mf = mf, data = data, checknumeric = TRUE)
            m2i <- .getx("m2i", mf = mf, data = data, checknumeric = TRUE)
            sd1i <- .getx("sd1i", mf = mf, data = data, checknumeric = TRUE)
            sd2i <- .getx("sd2i", mf = mf, data = data, checknumeric = TRUE)
            n1i <- .getx("n1i", mf = mf, data = data, checknumeric = TRUE)
            n2i <- .getx("n2i", mf = mf, data = data, checknumeric = TRUE)
            di <- .getx("di", mf = mf, data = data, checknumeric = TRUE)
            ti <- .getx("ti", mf = mf, data = data, checknumeric = TRUE)
            pi <- .getx("pi", mf = mf, data = data, checknumeric = TRUE)
            ri <- .getx("ri", mf = mf, data = data, checknumeric = TRUE)
            if (is.element(measure, c("SMD", "RPB", "ZPB", "RBIS", "ZBIS", "D2OR", "D2ORN", "D2ORL"))) {
                if (!.equal.length(m1i, m2i, sd1i, sd2i, n1i, n2i, di, ti, pi, ri)) 
                  stop(mstyle$stop("Supplied data vectors are not all of the same length."))
                ti <- replmiss(ti, .convp2t(pi, df = n1i + n2i - 2))
                di <- replmiss(di, ti * sqrt(1/n1i + 1/n2i))
                mi <- n1i + n2i - 2
                hi <- mi/n1i + mi/n2i
                di <- replmiss(di, sqrt(hi) * ri/sqrt(1 - ri^2))
                m1i[!is.na(di)] <- di[!is.na(di)]
                m2i[!is.na(di)] <- 0
                sd1i[!is.na(di)] <- 1
                sd2i[!is.na(di)] <- 1
            }
            k <- length(n1i)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                m1i <- .getsubset(m1i, subset)
                m2i <- .getsubset(m2i, subset)
                sd1i <- .getsubset(sd1i, subset)
                sd2i <- .getsubset(sd2i, subset)
                n1i <- .getsubset(n1i, subset)
                n2i <- .getsubset(n2i, subset)
            }
            args <- list(m1i = m1i, m2i = m2i, sd1i = sd1i, sd2i = sd2i, n1i = n1i, n2i = n2i)
        }
        if (is.element(measure, c("COR", "UCOR", "ZCOR"))) {
            ri <- .getx("ri", mf = mf, data = data, checknumeric = TRUE)
            ni <- .getx("ni", mf = mf, data = data, checknumeric = TRUE)
            ti <- .getx("ti", mf = mf, data = data, checknumeric = TRUE)
            pi <- .getx("pi", mf = mf, data = data, checknumeric = TRUE)
            if (!.equal.length(ri, ni, ti, pi)) 
                stop(mstyle$stop("Supplied data vectors are not all of the same length."))
            ti <- replmiss(ti, .convp2t(pi, df = ni - 2))
            ri <- replmiss(ri, ti/sqrt(ti^2 + ni - 2))
            k <- length(ri)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                ri <- .getsubset(ri, subset)
                ni <- .getsubset(ni, subset)
            }
            args <- list(ri = ri, ni = ni)
        }
        if (is.element(measure, c("PCOR", "ZPCOR", "SPCOR", "ZSPCOR"))) {
            ri <- .getx("ri", mf = mf, data = data, checknumeric = TRUE)
            ti <- .getx("ti", mf = mf, data = data, checknumeric = TRUE)
            mi <- .getx("mi", mf = mf, data = data, checknumeric = TRUE)
            ni <- .getx("ni", mf = mf, data = data, checknumeric = TRUE)
            pi <- .getx("pi", mf = mf, data = data, checknumeric = TRUE)
            r2i <- .getx("r2i", mf = mf, data = data, checknumeric = TRUE)
            if (!.equal.length(ri, ti, mi, ni, pi, r2i)) 
                stop(mstyle$stop("Supplied data vectors are not all of the same length."))
            ti <- replmiss(ti, .convp2t(pi, df = ni - mi - 1))
            if (is.element(measure, c("PCOR", "ZPCOR"))) 
                ri <- replmiss(ri, ti/sqrt(ti^2 + ni - mi - 1))
            if (is.element(measure, c("SPCOR", "ZSPCOR"))) 
                ri <- replmiss(ri, ti * sqrt(1 - r2i)/sqrt(ni - mi - 1))
            k <- length(ri)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                ri <- .getsubset(ri, subset)
                mi <- .getsubset(mi, subset)
                ni <- .getsubset(ni, subset)
                r2i <- .getsubset(r2i, subset)
            }
            args <- list(ri = ri, mi = mi, ni = ni, r2i = r2i)
        }
        if (is.element(measure, c("R2", "ZR2", "R2F", "ZR2F"))) {
            r2i <- .getx("r2i", mf = mf, data = data, checknumeric = TRUE)
            mi <- .getx("mi", mf = mf, data = data, checknumeric = TRUE)
            ni <- .getx("ni", mf = mf, data = data, checknumeric = TRUE)
            fi <- .getx("fi", mf = mf, data = data, checknumeric = TRUE)
            pi <- .getx("pi", mf = mf, data = data, checknumeric = TRUE)
            if (!.equal.length(r2i, mi, ni)) 
                stop(mstyle$stop("Supplied data vectors are not all of the same length."))
            fi <- replmiss(fi, .convp2f(pi, df1 = mi, df2 = ni - mi - 1))
            r2i <- replmiss(r2i, mi * fi/(mi * fi + (ni - mi - 1)))
            k <- length(r2i)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                r2i <- .getsubset(r2i, subset)
                mi <- .getsubset(mi, subset)
                ni <- .getsubset(ni, subset)
            }
            args <- list(r2i = r2i, mi = mi, ni = ni)
        }
        if (is.element(measure, c("PR", "PLN", "PLO", "PRZ", "PAS", "PFT"))) {
            xi <- .getx("xi", mf = mf, data = data, checknumeric = TRUE)
            mi <- .getx("mi", mf = mf, data = data, checknumeric = TRUE)
            ni <- .getx("ni", mf = mf, data = data, checknumeric = TRUE)
            if (is.null(mi)) 
                mi <- ni - xi
            k <- length(xi)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                xi <- .getsubset(xi, subset)
                mi <- .getsubset(mi, subset)
            }
            args <- list(xi = xi, mi = mi, add = add, to = to, addyi = addyi, addvi = addvi)
        }
        if (is.element(measure, c("IR", "IRLN", "IRS", "IRFT"))) {
            xi <- .getx("xi", mf = mf, data = data, checknumeric = TRUE)
            ti <- .getx("ti", mf = mf, data = data, checknumeric = TRUE)
            k <- length(xi)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                xi <- .getsubset(xi, subset)
                ti <- .getsubset(ti, subset)
            }
            args <- list(xi = xi, ti = ti, add = add, to = to, addyi = addyi, addvi = addvi)
        }
        if (is.element(measure, c("MN", "SMN", "MNLN", "CVLN", "SDLN"))) {
            mi <- .getx("mi", mf = mf, data = data, checknumeric = TRUE)
            sdi <- .getx("sdi", mf = mf, data = data, checknumeric = TRUE)
            ni <- .getx("ni", mf = mf, data = data, checknumeric = TRUE)
            k <- length(ni)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                mi <- .getsubset(mi, subset)
                sdi <- .getsubset(sdi, subset)
                ni <- .getsubset(ni, subset)
            }
            args <- list(mi = mi, sdi = sdi, ni = ni)
        }
        if (is.element(measure, c("MC", "SMCC", "SMCR", "SMCRH", "SMCRP", "SMCRPH", "CLESCN", "AUCCN", "ROMC", "CVRC", "VRC"))) {
            m1i <- .getx("m1i", mf = mf, data = data, checknumeric = TRUE)
            m2i <- .getx("m2i", mf = mf, data = data, checknumeric = TRUE)
            sd1i <- .getx("sd1i", mf = mf, data = data, checknumeric = TRUE)
            sd2i <- .getx("sd2i", mf = mf, data = data, checknumeric = TRUE)
            ri <- .getx("ri", mf = mf, data = data, checknumeric = TRUE)
            ni <- .getx("ni", mf = mf, data = data, checknumeric = TRUE)
            di <- .getx("di", mf = mf, data = data, checknumeric = TRUE)
            ti <- .getx("ti", mf = mf, data = data, checknumeric = TRUE)
            pi <- .getx("pi", mf = mf, data = data, checknumeric = TRUE)
            ri <- .expand1(ri, list(m1i, m2i, sd1i, sd2i, ni, di, ti, pi))
            if (measure == "SMCC") {
                if (!.equal.length(m1i, m2i, sd1i, sd2i, ri, ni, di, ti, pi)) 
                  stop(mstyle$stop("Supplied data vectors are not all of the same length."))
                ti <- replmiss(ti, .convp2t(pi, df = ni - 1))
                di <- replmiss(di, ti * sqrt(1/ni))
                m1i[!is.na(di)] <- di[!is.na(di)]
                m2i[!is.na(di)] <- 0
                sd1i[!is.na(di)] <- 1
                sd2i[!is.na(di)] <- 1
                ri[!is.na(di)] <- 0.5
            }
            k <- length(m1i)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                m1i <- .getsubset(m1i, subset)
                m2i <- .getsubset(m2i, subset)
                sd1i <- .getsubset(sd1i, subset)
                sd2i <- .getsubset(sd2i, subset)
                ni <- .getsubset(ni, subset)
                ri <- .getsubset(ri, subset)
            }
            args <- list(m1i = m1i, m2i = m2i, sd1i = sd1i, sd2i = sd2i, ri = ri, ni = ni)
        }
        if (is.element(measure, c("ARAW", "AHW", "ABT"))) {
            ai <- .getx("ai", mf = mf, data = data, checknumeric = TRUE)
            mi <- .getx("mi", mf = mf, data = data, checknumeric = TRUE)
            ni <- .getx("ni", mf = mf, data = data, checknumeric = TRUE)
            k <- length(ai)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                ai <- .getsubset(ai, subset)
                mi <- .getsubset(mi, subset)
                ni <- .getsubset(ni, subset)
            }
            args <- list(ai = ai, mi = mi, ni = ni)
        }
        if (measure == "REH") {
            ai <- .getx("ai", mf = mf, data = data, checknumeric = TRUE)
            bi <- .getx("bi", mf = mf, data = data, checknumeric = TRUE)
            ci <- .getx("ci", mf = mf, data = data, checknumeric = TRUE)
            k <- length(ai)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                ai <- .getsubset(ai, subset)
                bi <- .getsubset(bi, subset)
                ci <- .getsubset(ci, subset)
            }
            args <- list(ai = ai, bi = bi, ci = ci)
        }
        if (is.element(measure, c("CLES", "AUC"))) {
            ai <- .getx("ai", mf = mf, data = data, checknumeric = TRUE)
            n1i <- .getx("n1i", mf = mf, data = data, checknumeric = TRUE)
            n2i <- .getx("n2i", mf = mf, data = data, checknumeric = TRUE)
            mi <- .getx("mi", mf = mf, data = data, checknumeric = TRUE)
            if (is.null(mi)) 
                mi <- rep(0, length(ai))
            mi[is.na(mi)] <- 0
            k <- length(ai)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                ai <- .getsubset(ai, subset)
                n1i <- .getsubset(n1i, subset)
                n2i <- .getsubset(n2i, subset)
                mi <- .getsubset(mi, subset)
            }
            args <- list(ai = ai, n1i = n1i, n2i = n2i, mi = mi)
        }
        if (is.element(measure, c("CLESN", "AUCN"))) {
            m1i <- .getx("m1i", mf = mf, data = data, checknumeric = TRUE)
            m2i <- .getx("m2i", mf = mf, data = data, checknumeric = TRUE)
            sd1i <- .getx("sd1i", mf = mf, data = data, checknumeric = TRUE)
            sd2i <- .getx("sd2i", mf = mf, data = data, checknumeric = TRUE)
            n1i <- .getx("n1i", mf = mf, data = data, checknumeric = TRUE)
            n2i <- .getx("n2i", mf = mf, data = data, checknumeric = TRUE)
            di <- .getx("di", mf = mf, data = data, checknumeric = TRUE)
            ti <- .getx("ti", mf = mf, data = data, checknumeric = TRUE)
            pi <- .getx("pi", mf = mf, data = data, checknumeric = TRUE)
            ai <- .getx("ai", mf = mf, data = data, checknumeric = TRUE)
            if (!.equal.length(m1i, m2i, sd1i, sd2i, n1i, n2i, di, ti, pi, ai)) 
                stop(mstyle$stop("Supplied data vectors are not all of the same length."))
            if (!.all.specified(n1i, n2i)) 
                stop(mstyle$stop("Cannot compute outcomes. Check that all of the required information is specified\n  via the appropriate arguments."))
            k.all <- max(sapply(list(m1i, m2i, sd1i, sd2i, n1i, n2i, di, ti, pi, ai), length))
            vtype <- .expand1(vtype, k.all)
            if (is.null(sd1i) || is.null(sd2i)) {
                sd1i <- .expand1(NA_real_, k.all)
                sd2i <- .expand1(NA_real_, k.all)
            }
            ti <- replmiss(ti, .convp2t(pi, df = n1i + n2i - 2))
            di <- replmiss(di, ti * sqrt(1/n1i + 1/n2i))
            if (!is.null(di)) 
                vtype[!is.na(di)] <- "HO"
            sdpi <- ifelse(vtype == "HO", sqrt(((n1i - 1) * sd1i^2 + (n2i - 1) * sd2i^2)/(n1i + n2i - 2)), sqrt((sd1i^2 + sd2i^2)/2))
            di <- replmiss(di, (m1i - m2i)/sdpi)
            ai <- replmiss(ai, pnorm(di/sqrt(2)))
            di <- replmiss(di, qnorm(ai) * sqrt(2))
            k.all <- length(ai)
            sdsmiss <- is.na(sd1i) | is.na(sd2i)
            sd1i <- ifelse(sdsmiss, 1, sd1i)
            sd2i <- ifelse(sdsmiss, 1, sd2i)
            vtype[sdsmiss] <- "HO"
            k <- length(ai)
            k.all <- k
            if (!is.null(subset)) {
                subset <- .chksubset(subset, k)
                vtype <- .getsubset(vtype, subset)
                ai <- .getsubset(ai, subset)
                sd1i <- .getsubset(sd1i, subset)
                sd2i <- .getsubset(sd2i, subset)
                n1i <- .getsubset(n1i, subset)
                n2i <- .getsubset(n2i, subset)
            }
            args <- list(ai = ai, sd1i = sd1i, sd2i = sd2i, n1i = n1i, n2i = n2i)
        }
        args <- c(args, list(measure = measure, vtype = vtype, correct = correct))
        dat <- .do.call(escalc, args)
        if (is.element(measure, "GEN")) 
            stop(mstyle$stop("Specify the desired outcome measure via the 'measure' argument."))
        yi <- dat$yi
        vi <- dat$vi
        ni <- attr(yi, "ni")
    }
    weights <- .expand1(weights, k)
    if (!is.null(weights) && (length(weights) != k)) 
        stop(mstyle$stop("Length of 'yi' and 'weights' are not the same."))
    if (!is.null(subset)) 
        weights <- .getsubset(weights, subset)
    if (verbose > 1) 
        message(mstyle$message("Creating the model matrix ..."))
    if (inherits(mods, "formula")) {
        formula.mods <- mods
        if (isTRUE(all.equal(formula.mods, ~1))) {
            mods <- matrix(1, nrow = k, ncol = 1)
            intercept <- FALSE
        }
        else {
            options(na.action = "na.pass")
            mods <- model.matrix(mods, data = data)
            attr(mods, "assign") <- NULL
            attr(mods, "contrasts") <- NULL
            options(na.action = na.act)
            intercept <- FALSE
        }
    }
    if (.is.vector(mods)) 
        mods <- cbind(mods)
    if (is.data.frame(mods)) 
        mods <- as.matrix(mods)
    if (is.character(mods)) 
        stop(mstyle$stop("Model matrix contains character variables."))
    if (!is.null(mods) && nrow(mods) != k) 
        stop(mstyle$stop(paste0("Number of rows in the model matrix (", nrow(mods), ") do not match the length of the outcome vector (", k, ").")))
    if (model == "rma.ls") {
        if (inherits(scale, "formula")) {
            formula.scale <- scale
            if (isTRUE(all.equal(formula.scale, ~1))) {
                Z <- matrix(1, nrow = k, ncol = 1)
                colnames(Z) <- "intrcpt"
            }
            else {
                options(na.action = "na.pass")
                Z <- model.matrix(scale, data = data)
                colnames(Z)[grep("(Intercept)", colnames(Z), fixed = TRUE)] <- "intrcpt"
                attr(Z, "assign") <- NULL
                attr(Z, "contrasts") <- NULL
                options(na.action = na.act)
            }
        }
        else {
            Z <- scale
            if (.is.vector(Z)) 
                Z <- cbind(Z)
            if (is.data.frame(Z)) 
                Z <- as.matrix(Z)
            if (is.character(Z)) 
                stop(mstyle$stop("Scale model matrix contains character variables."))
        }
        if (nrow(Z) != k) 
            stop(mstyle$stop(paste0("Number of rows in the model matrix specified via the 'scale' argument (", nrow(Z), ") do not match the length of the outcome vector (", k, ").")))
    }
    else {
        Z <- NULL
    }
    if (verbose > 1) 
        message(mstyle$message("Generating/extracting the study labels ..."))
    ids <- seq_len(k)
    if (is.null(slab)) {
        slab.null <- TRUE
        slab <- ids
    }
    else {
        if (anyNA(slab)) 
            stop(mstyle$stop("NAs in study labels."))
        if (length(slab) != k) 
            stop(mstyle$stop(paste0("Length of the 'slab' argument (", length(slab), ") does not correspond to the size of the dataset (", k, ").")))
        slab.null <- FALSE
    }
    if (!is.null(subset)) {
        if (verbose > 1) 
            message(mstyle$message("Subsetting ..."))
        mods <- .getsubset(mods, subset)
        slab <- .getsubset(slab, subset)
        ids <- .getsubset(ids, subset)
        Z <- .getsubset(Z, subset)
    }
    if (anyDuplicated(slab)) 
        slab <- .make.unique(slab)
    attr(yi, "slab") <- slab
    k <- length(yi)
    if (any(weights < 0, na.rm = TRUE)) 
        stop(mstyle$stop("Negative weights not allowed."))
    if (any(is.infinite(weights))) 
        stop(mstyle$stop("Infinite weights not allowed."))
    outdat.f <- list(ai = ai, bi = bi, ci = ci, di = di, x1i = x1i, x2i = x2i, t1i = t1i, t2i = t2i)
    yi.f <- yi
    vi.f <- vi
    weights.f <- weights
    ni.f <- ni
    mods.f <- mods
    Z.f <- Z
    k.f <- k
    has.na <- is.na(yi) | is.na(vi) | (if (is.null(mods)) 
        FALSE
    else apply(is.na(mods), 1, any)) | (if (is.null(Z)) 
        FALSE
    else apply(is.na(Z), 1, any)) | (if (is.null(weights)) 
        FALSE
    else is.na(weights))
    not.na <- !has.na
    if (any(has.na)) {
        if (verbose > 1) 
            message(mstyle$message("Handling NAs ..."))
        if (na.act == "na.omit" || na.act == "na.exclude" || na.act == "na.pass") {
            yi <- yi[not.na]
            vi <- vi[not.na]
            weights <- weights[not.na]
            ni <- ni[not.na]
            mods <- mods[not.na, , drop = FALSE]
            Z <- Z[not.na, , drop = FALSE]
            k <- length(yi)
            warning(mstyle$warning(paste(sum(has.na), ifelse(sum(has.na) > 1, "studies", "study"), "with NAs omitted from model fitting.")), call. = FALSE)
            attr(yi, "measure") <- measure
            attr(yi, "ni") <- ni
        }
        if (na.act == "na.fail") 
            stop(mstyle$stop("Missing values in data."))
    }
    if (k < 1L) 
        stop(mstyle$stop("Processing terminated since k = 0."))
    if (any(vi <= 0)) {
        allvipos <- FALSE
        if (!vi0) 
            warning(mstyle$warning("There are outcomes with non-positive sampling variances."), call. = FALSE)
        vi.neg <- vi < 0
        if (any(vi.neg)) {
            vi[vi.neg] <- 0
            warning(mstyle$warning("Negative sampling variances constrained to 0."), call. = FALSE)
        }
    }
    else {
        allvipos <- TRUE
    }
    if (k == 1L && test != "z") {
        warning(mstyle$warning("Setting argument test=\"z\" since k=1."), call. = FALSE)
        test <- "z"
    }
    if (is.null(mods) && !intercept) {
        warning(mstyle$warning("Must either include an intercept and/or moderators in model.\nCoerced intercept into the model."), call. = FALSE)
        intercept <- TRUE
    }
    if (!is.null(mods) && ncol(mods) == 0L) {
        warning(mstyle$warning("Cannot fit model with an empty model matrix. Coerced intercept into the model."), call. = FALSE)
        intercept <- TRUE
    }
    if (intercept) {
        X <- cbind(intrcpt = rep(1, k), mods)
        X.f <- cbind(intrcpt = rep(1, k.f), mods.f)
    }
    else {
        X <- mods
        X.f <- mods.f
    }
    tmp <- try(lm(yi ~ X - 1), silent = TRUE)
    if (inherits(tmp, "lm")) {
        coef.na <- is.na(coef(tmp))
    }
    else {
        coef.na <- rep(FALSE, NCOL(X))
    }
    if (any(coef.na)) {
        warning(mstyle$warning("Redundant predictors dropped from the model."), call. = FALSE)
        X <- X[, !coef.na, drop = FALSE]
        X.f <- X.f[, !coef.na, drop = FALSE]
    }
    is.int <- apply(X, 2, .is.intercept)
    if (any(is.int)) {
        int.incl <- TRUE
        int.indx <- which(is.int, arr.ind = TRUE)
        X <- cbind(intrcpt = 1, X[, -int.indx, drop = FALSE])
        X.f <- cbind(intrcpt = 1, X.f[, -int.indx, drop = FALSE])
        intercept <- TRUE
    }
    else {
        int.incl <- FALSE
    }
    p <- NCOL(X)
    colnames(X) <- colnames(X.f) <- .make.unique(colnames(X))
    colnames(Z) <- colnames(Z.f) <- .make.unique(colnames(Z))
    if ((p == 1L) && .is.intercept(X)) {
        int.only <- TRUE
    }
    else {
        int.only <- FALSE
    }
    if (!(int.only && k == 1L)) {
        if (is.element(method[1], c("FE", "EE", "CE"))) {
            if (p > k) 
                stop(mstyle$stop("Number of parameters to be estimated is larger than the number of observations."))
        }
        else {
            if (!is.null(tau2) && !is.na(tau2)) {
                if (p > k) 
                  stop(mstyle$stop("Number of parameters to be estimated is larger than the number of observations."))
            }
            else {
                if ((p + 1) > k) 
                  stop(mstyle$stop("Number of parameters to be estimated is larger than the number of observations."))
            }
        }
    }
    btt <- .set.btt(btt, p, int.incl, colnames(X))
    m <- length(btt)
    con <- list(verbose = FALSE, evtol = 1e-07, REMLf = TRUE)
    if (model == "rma.uni") {
        con <- c(con, list(tau2.init = NULL, tau2.min = 0, tau2.max = 100, threshold = 10^-5, tol = .Machine$double.eps^0.25, ll0check = TRUE, maxiter = 100, stepadj = 1))
        con$tau2.max <- max(con$tau2.max, 10 * mad(yi)^2)
    }
    if (model == "rma.ls") {
        con <- c(con, list(beta.init = NULL, hesspack = "numDeriv", optimizer = "nlminb", optmethod = "BFGS", parallel = list(), cl = NULL, ncpus = 1L, tau2.min = 0, tau2.max = Inf, alpha.init = NULL, alpha.min = -Inf, alpha.max = Inf, hessianCtrl = list(r = 8), scaleZ = TRUE))
    }
    con.pos <- pmatch(names(control), names(con))
    con[c(na.omit(con.pos))] <- control[!is.na(con.pos)]
    if (verbose) 
        con$verbose <- verbose
    verbose <- con$verbose
    if (model == "rma.ls") {
        con$hesspack <- match.arg(con$hesspack, c("numDeriv", "pracma", "calculus"))
        if (!isTRUE(ddd$skiphes) && !requireNamespace(con$hesspack, quietly = TRUE)) 
            stop(mstyle$stop(paste0("Please install the '", con$hesspack, "' package to compute the Hessian.")))
    }
    if (model == "rma.uni") {
        if (con$tau2.min < 0 && (con$tau2.min < -min(vi))) {
            con$tau2.min <- -min(vi)
            warning(mstyle$warning(paste0("Value of 'tau2.min' constrained to -min(vi) = ", fmtx(-min(vi), digits[["est"]]), ".")), call. = FALSE)
        }
    }
    else {
        if (is.element("tau2.min", names(control))) 
            con$tau2.min[con$tau2.min < 0] <- 0
    }
    if (!.chkpd(crossprod(X), tol = con$evtol)) 
        stop(mstyle$stop("Model matrix not of full rank. Cannot fit model."))
    vimaxmin <- max(vi)/min(vi)
    if (is.finite(vimaxmin) && vimaxmin >= 1/con$evtol) 
        warning(mstyle$warning("Ratio of largest to smallest sampling variance extremely large. May not be able to obtain stable results."), call. = FALSE)
    se.tau2 <- I2 <- H2 <- QE <- QEp <- NA_real_
    s2w <- 1
    level <- .level(level)
    Y <- as.matrix(yi)
    ymci <- scale(yi, center = TRUE, scale = FALSE)
    Ymc <- as.matrix(ymci)
    tau2.inf <- FALSE
    if (model == "rma.uni") {
        if (!is.null(tau2) && !is.na(tau2) && !is.element(method[1], c("FE", "EE", "CE"))) {
            tau2.fix <- TRUE
            tau2.arg <- tau2
            tau2.inf <- identical(tau2, Inf)
        }
        else {
            tau2.fix <- FALSE
            tau2.arg <- NA_real_
        }
        if (verbose > 1 && !tau2.fix && !is.element(method[1], c("FE", "EE", "CE"))) 
            message(mstyle$message("Estimating the tau^2 value ...\n"))
        if (k == 1L) {
            method.sav <- method[1]
            method <- "k1"
            if (!tau2.fix) 
                tau2 <- 0
        }
        conv <- FALSE
        while (!conv && !tau2.inf) {
            conv <- TRUE
            change <- con$threshold + 1
            iter <- 0
            if (is.element(method[1], c("HS", "HSk"))) {
                if (!allvipos) 
                  stop(mstyle$stop(paste0(method[1], " estimator cannot be used when there are non-positive sampling variances in the data.")))
                wi <- 1/vi
                W <- diag(wi, nrow = k, ncol = k)
                stXWX <- .invcalc(X = X, W = W, k = k)
                P <- W - W %*% X %*% stXWX %*% crossprod(X, W)
                RSS <- crossprod(Ymc, P) %*% Ymc
                if (method[1] == "HS") {
                  tau2 <- ifelse(tau2.fix, tau2.arg, (RSS - k)/sum(wi))
                }
                else {
                  tau2 <- ifelse(tau2.fix, tau2.arg, (k/(k - p) * RSS - k)/sum(wi))
                }
            }
            if (is.element(method[1], c("HE", "ML", "REML", "EB"))) {
                stXX <- .invcalc(X = X, W = diag(k), k = k)
                P <- diag(k) - X %*% tcrossprod(stXX, X)
                RSS <- crossprod(Ymc, P) %*% Ymc
                V <- diag(vi, nrow = k, ncol = k)
                PV <- P %*% V
                trPV <- .tr(PV)
                tau2 <- ifelse(tau2.fix, tau2.arg, (RSS - trPV)/(k - p))
            }
            if (method[1] == "DL") {
                if (!allvipos) 
                  stop(mstyle$stop("DL estimator cannot be used when there are non-positive sampling variances in the data."))
                wi <- 1/vi
                W <- diag(wi, nrow = k, ncol = k)
                stXWX <- .invcalc(X = X, W = W, k = k)
                P <- W - W %*% X %*% stXWX %*% crossprod(X, W)
                RSS <- crossprod(Ymc, P) %*% Ymc
                trP <- .tr(P)
                tau2 <- ifelse(tau2.fix, tau2.arg, (RSS - (k - p))/trP)
            }
            if (method[1] == "DLIT") {
                if (is.null(con$tau2.init)) {
                  tau2 <- 0
                }
                else {
                  tau2 <- con$tau2.init
                }
                while (change > con$threshold) {
                  if (verbose) 
                    cat(mstyle$verbose(paste("Iteration", formatC(iter, width = 5, flag = "-", format = "f", digits = 0), "tau^2 =", fmtx(tau2, digits[["var"]]), "\n")))
                  iter <- iter + 1
                  old2 <- tau2
                  wi <- 1/(vi + tau2)
                  if (any(tau2 + vi < 0)) 
                    stop(mstyle$stop("Some marginal variances are negative."))
                  if (any(is.infinite(wi))) 
                    stop(mstyle$stop("Division by zero when computing the inverse variance weights."))
                  W <- diag(wi, nrow = k, ncol = k)
                  stXWX <- .invcalc(X = X, W = W, k = k)
                  P <- W - W %*% X %*% stXWX %*% crossprod(X, W)
                  V <- diag(vi, nrow = k, ncol = k)
                  trP <- .tr(P)
                  trPV <- .tr(P %*% V)
                  RSS <- crossprod(Ymc, P) %*% Ymc
                  tau2 <- ifelse(tau2.fix, tau2.arg, (RSS - trPV)/trP)
                  tau2[tau2 < con$tau2.min] <- con$tau2.min
                  change <- abs(old2 - tau2)
                  if (iter > con$maxiter) {
                    conv <- FALSE
                    break
                  }
                }
                if (!conv) {
                  if (length(method) == 1L) {
                    stop(mstyle$stop("Iterative DL estimator did not converge."))
                  }
                  else {
                    if (verbose) 
                      warning(mstyle$warning("Iterative DL estimator did not converge."), call. = FALSE)
                  }
                }
            }
            if (method[1] == "GENQ") {
                if (is.null(weights)) 
                  stop(mstyle$stop("Must specify the 'weights' argument when method='GENQ'."))
                A <- diag(weights, nrow = k, ncol = k)
                stXAX <- .invcalc(X = X, W = A, k = k)
                P <- A - A %*% X %*% stXAX %*% crossprod(X, A)
                V <- diag(vi, nrow = k, ncol = k)
                PV <- P %*% V
                trP <- .tr(P)
                trPV <- .tr(PV)
                RSS <- crossprod(Ymc, P) %*% Ymc
                tau2 <- ifelse(tau2.fix, tau2.arg, (RSS - trPV)/trP)
            }
            if (method[1] == "GENQM") {
                if (is.null(weights)) 
                  stop(mstyle$stop("Must specify the 'weights' argument when method='GENQM'."))
                A <- diag(weights, nrow = k, ncol = k)
                stXAX <- .invcalc(X = X, W = A, k = k)
                P <- A - A %*% X %*% stXAX %*% crossprod(X, A)
                V <- diag(vi, nrow = k, ncol = k)
                PV <- P %*% V
                trP <- .tr(P)
                if (!tau2.fix) {
                  RSS <- crossprod(Ymc, P) %*% Ymc
                  if (.GENQ.func(con$tau2.min, P = P, vi = vi, Q = RSS, level = 0, k = k, p = p, getlower = TRUE) > 0.5) {
                    tau2 <- con$tau2.min
                  }
                  else {
                    if (.GENQ.func(con$tau2.max, P = P, vi = vi, Q = RSS, level = 0, k = k, p = p, getlower = TRUE) < 0.5) {
                      conv <- FALSE
                      if (length(method) == 1L) {
                        stop(mstyle$stop("Value of 'tau2.max' too low. Try increasing 'tau2.max' or switch to another 'method'."))
                      }
                      else {
                        if (verbose) 
                          warning(mstyle$warning("Value of 'tau2.max' too low. Try increasing 'tau2.max' or switch to another 'method'."), call. = FALSE)
                      }
                    }
                    else {
                      tau2 <- try(uniroot(.GENQ.func, interval = c(con$tau2.min, con$tau2.max), tol = con$tol, maxiter = con$maxiter, P = P, vi = vi, Q = RSS, level = 0.5, k = k, p = p, getlower = FALSE, verbose = verbose, digits = digits, extendInt = "no")$root, silent = TRUE)
                      if (inherits(tau2, "try-error")) {
                        conv <- FALSE
                        if (length(method) == 1L) {
                          stop(mstyle$stop("Error in iterative search for tau^2 using uniroot()."))
                        }
                        else {
                          if (verbose) 
                            warning(mstyle$warning("Error in iterative search for tau^2 using uniroot()."), call. = FALSE)
                        }
                      }
                    }
                  }
                }
                else {
                  tau2 <- tau2.arg
                }
            }
            if (method[1] == "SJ") {
                if (is.null(con$tau2.init)) {
                  tau2.0 <- c(var(ymci) * (k - 1)/k)
                }
                else {
                  tau2.0 <- con$tau2.init
                }
                wi <- 1/(vi + tau2.0)
                W <- diag(wi, nrow = k, ncol = k)
                stXWX <- .invcalc(X = X, W = W, k = k)
                P <- W - W %*% X %*% stXWX %*% crossprod(X, W)
                RSS <- crossprod(Ymc, P) %*% Ymc
                V <- diag(vi, nrow = k, ncol = k)
                PV <- P %*% V
                tau2 <- ifelse(tau2.fix, tau2.arg, tau2.0 * RSS/(k - p))
            }
            if (method[1] == "SJIT") {
                if (is.null(con$tau2.init)) {
                  tau2 <- c(var(ymci) * (k - 1)/k)
                }
                else {
                  tau2 <- con$tau2.init
                }
                tau2.0 <- tau2
                while (change > con$threshold) {
                  if (verbose) 
                    cat(mstyle$verbose(paste("Iteration", formatC(iter, width = 5, flag = "-", format = "f", digits = 0), "tau^2 =", fmtx(tau2, digits[["var"]]), "\n")))
                  iter <- iter + 1
                  old2 <- tau2
                  wi <- 1/(vi + tau2)
                  W <- diag(wi, nrow = k, ncol = k)
                  stXWX <- .invcalc(X = X, W = W, k = k)
                  P <- W - W %*% X %*% stXWX %*% crossprod(X, W)
                  RSS <- crossprod(Ymc, P) %*% Ymc
                  V <- diag(vi, nrow = k, ncol = k)
                  PV <- P %*% V
                  tau2 <- ifelse(tau2.fix, tau2.arg, tau2 * RSS/(k - p))
                  change <- abs(old2 - tau2)
                  if (iter > con$maxiter) {
                    conv <- FALSE
                    break
                  }
                }
                if (!conv) {
                  if (length(method) == 1L) {
                    stop(mstyle$stop("Iterative SJ estimator did not converge."))
                  }
                  else {
                    if (verbose) 
                      warning(mstyle$warning("Iterative SJ estimator did not converge."), call. = FALSE)
                  }
                }
            }
            if (is.element(method[1], c("PM", "MP", "PMM"))) {
                if (!allvipos) 
                  stop(mstyle$stop(method[1], " estimator cannot be used when there are non-positive sampling variances in the data."))
                if (method[1] == "PMM") {
                  target <- qchisq(0.5, df = k - p)
                }
                else {
                  target <- k - p
                }
                if (!tau2.fix) {
                  if (.QE.func(con$tau2.min, Y = Ymc, vi = vi, X = X, k = k, objective = 0) < target) {
                    tau2 <- con$tau2.min
                  }
                  else {
                    if (.QE.func(con$tau2.max, Y = Ymc, vi = vi, X = X, k = k, objective = 0) > target) {
                      conv <- FALSE
                      if (length(method) == 1L) {
                        stop(mstyle$stop("Value of 'tau2.max' too low. Try increasing 'tau2.max' or switch to another 'method'."))
                      }
                      else {
                        if (verbose) 
                          warning(mstyle$warning("Value of 'tau2.max' too low. Try increasing 'tau2.max' or switch to another 'method'."), call. = FALSE)
                      }
                    }
                    else {
                      tau2 <- try(uniroot(.QE.func, interval = c(con$tau2.min, con$tau2.max), tol = con$tol, maxiter = con$maxiter, Y = Ymc, vi = vi, X = X, k = k, objective = target, verbose = verbose, digits = digits, extendInt = "no")$root, silent = TRUE)
                      if (inherits(tau2, "try-error")) {
                        conv <- FALSE
                        if (length(method) == 1L) {
                          stop(mstyle$stop("Error in iterative search for tau^2 using uniroot()."))
                        }
                        else {
                          if (verbose) 
                            warning(mstyle$warning("Error in iterative search for tau^2 using uniroot()."), call. = FALSE)
                        }
                      }
                    }
                  }
                }
                else {
                  tau2 <- tau2.arg
                }
            }
            if (is.element(method[1], c("ML", "REML", "EB"))) {
                if (is.null(con$tau2.init)) {
                  tau2 <- max(0, tau2, con$tau2.min)
                }
                else {
                  tau2 <- con$tau2.init
                }
                while (change > con$threshold) {
                  if (verbose) 
                    cat(mstyle$verbose(paste(mstyle$verbose(paste("Iteration", formatC(iter, width = 5, flag = "-", format = "f", digits = 0), "tau^2 =", fmtx(tau2, digits[["var"]]), "\n")))))
                  iter <- iter + 1
                  old2 <- tau2
                  wi <- 1/(vi + tau2)
                  if (any(tau2 + vi < 0)) 
                    stop(mstyle$stop("Some marginal variances are negative."))
                  if (any(is.infinite(wi))) 
                    stop(mstyle$stop("Division by zero when computing the inverse variance weights."))
                  W <- diag(wi, nrow = k, ncol = k)
                  stXWX <- .invcalc(X = X, W = W, k = k)
                  P <- W - W %*% X %*% stXWX %*% crossprod(X, W)
                  if (method[1] == "ML") {
                    PP <- P %*% P
                    adj <- c(crossprod(Ymc, PP) %*% Ymc - sum(wi))/sum(wi^2)
                  }
                  if (method[1] == "REML") {
                    PP <- P %*% P
                    adj <- c(crossprod(Ymc, PP) %*% Ymc - .tr(P))/.tr(PP)
                  }
                  if (method[1] == "EB") {
                    adj <- c(crossprod(Ymc, P) %*% Ymc * k/(k - p) - k)/sum(wi)
                  }
                  adj <- c(adj) * con$stepadj
                  if (is.na(adj)) 
                    adj <- 0
                  while (tau2 + adj < con$tau2.min) adj <- adj/2
                  tau2 <- ifelse(tau2.fix, tau2.arg, tau2 + adj)
                  change <- abs(old2 - tau2)
                  if (iter > con$maxiter) {
                    conv <- FALSE
                    break
                  }
                }
                if (!conv) {
                  if (length(method) == 1L) {
                    stop(mstyle$stop("Fisher scoring algorithm did not converge. See 'help(rma)' for possible remedies."))
                  }
                  else {
                    if (verbose) 
                      warning(mstyle$warning("Fisher scoring algorithm did not converge. See 'help(rma)' for possible remedies."), call. = FALSE)
                  }
                }
                if (conv && is.element(method[1], c("ML", "REML")) && con$ll0check && allvipos && !tau2.fix) {
                  wi <- 1/vi
                  W <- diag(wi, nrow = k, ncol = k)
                  stXWX <- .invcalc(X = X, W = W, k = k)
                  beta <- stXWX %*% crossprod(X, W) %*% Ymc
                  RSS <- sum(wi * (ymci - X %*% beta)^2)
                  if (method[1] == "ML") 
                    ll0 <- -1/2 * (k) * log(2 * base::pi) - 1/2 * sum(log(vi)) - 1/2 * RSS
                  if (method[1] == "REML") 
                    ll0 <- -1/2 * (k - p) * log(2 * base::pi) - 1/2 * sum(log(vi)) - 1/2 * determinant(crossprod(X, W) %*% X, logarithm = TRUE)$modulus - 1/2 * RSS
                  wi <- 1/(vi + tau2)
                  if (any(tau2 + vi < 0)) 
                    stop(mstyle$stop("Some marginal variances are negative."))
                  if (any(is.infinite(wi))) 
                    stop(mstyle$stop("Division by zero when computing the inverse variance weights."))
                  W <- diag(wi, nrow = k, ncol = k)
                  stXWX <- .invcalc(X = X, W = W, k = k)
                  beta <- stXWX %*% crossprod(X, W) %*% Ymc
                  RSS <- sum(wi * (ymci - X %*% beta)^2)
                  if (method[1] == "ML") 
                    ll <- -1/2 * (k) * log(2 * base::pi) - 1/2 * sum(log(vi + tau2)) - 1/2 * RSS
                  if (method[1] == "REML") 
                    ll <- -1/2 * (k - p) * log(2 * base::pi) - 1/2 * sum(log(vi + tau2)) - 1/2 * determinant(crossprod(X, W) %*% X, logarithm = TRUE)$modulus - 1/2 * RSS
                  if (ll0 - ll > con$tol && tau2 > con$threshold) {
                    warning(mstyle$warning("Fisher scoring algorithm may have gotten stuck at a local maximum.\nSetting tau^2 = 0. Check the profile likelihood plot with profile()."), call. = FALSE)
                    tau2 <- 0
                  }
                }
                if (conv) {
                  wi <- 1/(vi + tau2)
                  if (any(tau2 + vi < 0)) 
                    stop(mstyle$stop("Some marginal variances are negative."))
                  if (any(is.infinite(wi))) 
                    stop(mstyle$stop("Division by zero when computing the inverse variance weights."))
                  W <- diag(wi, nrow = k, ncol = k)
                  stXWX <- .invcalc(X = X, W = W, k = k)
                  P <- W - W %*% X %*% stXWX %*% crossprod(X, W)
                }
            }
            if (conv) {
                tau2 <- max(con$tau2.min, c(tau2))
                if (!is.na(tau2) && any(tau2 + vi < 0)) 
                  stop(mstyle$stop("Some marginal variances are negative."))
                if (verbose && is.element(method[1], c("ML", "REML", "EB"))) {
                  cat(mstyle$verbose(paste("Iteration", formatC(iter, width = 5, flag = "-", format = "f", digits = 0), "tau^2 =", fmtx(tau2, digits[["var"]]), "\n")))
                  cat(mstyle$verbose(paste("Fisher scoring algorithm converged after", iter, "iterations.\n")))
                }
                if (method[1] == "HS") 
                  se.tau2 <- sqrt(1/sum(wi)^2 * (2 * (k - p) + 4 * max(tau2, 0) * .tr(P) + 2 * max(tau2, 0)^2 * sum(P * P)))
                if (method[1] == "HSk") 
                  se.tau2 <- k/(k - p) * sqrt(1/sum(wi)^2 * (2 * (k - p) + 4 * max(tau2, 0) * .tr(P) + 2 * max(tau2, 0)^2 * sum(P * P)))
                if (method[1] == "HE") 
                  se.tau2 <- sqrt(1/(k - p)^2 * (2 * sum(PV * t(PV)) + 4 * max(tau2, 0) * trPV + 2 * max(tau2, 0)^2 * (k - p)))
                if (method[1] == "DL") 
                  se.tau2 <- sqrt(1/trP^2 * (2 * (k - p) + 4 * max(tau2, 0) * trP + 2 * max(tau2, 0)^2 * sum(P * P)))
                if (is.element(method[1], c("GENQ", "GENQM"))) 
                  se.tau2 <- sqrt(1/trP^2 * (2 * sum(PV * t(PV)) + 4 * max(tau2, 0) * sum(PV * P) + 2 * max(tau2, 0)^2 * sum(P * P)))
                if (method[1] == "SJ") 
                  se.tau2 <- sqrt(tau2.0^2/(k - p)^2 * (2 * sum(PV * t(PV)) + 4 * max(tau2, 0) * sum(PV * P) + 2 * max(tau2, 0)^2 * sum(P * P)))
                if (method[1] == "ML") 
                  se.tau2 <- sqrt(2/sum(wi^2))
                if (method[1] == "REML") 
                  se.tau2 <- sqrt(2/sum(P * P))
                if (is.element(method[1], c("EB", "PM", "MP", "PMM", "DLIT", "SJIT"))) {
                  wi <- 1/(vi + tau2)
                  se.tau2 <- sqrt(2 * k^2/(k - p)/sum(wi)^2)
                }
            }
            else {
                method <- method[-1]
            }
        }
        if (k == 1L) 
            method <- method.sav
    }
    if (model == "rma.ls") {
        if (!is.element(method[1], c("ML", "REML"))) 
            stop(mstyle$stop("Location-scale models can only be fitted with ML or REML estimation."))
        tau2.fix <- FALSE
        if (!is.null(tau2) && !is.na(tau2)) 
            warning(mstyle$warning("Argument 'tau2' ignored for location-scale models."), call. = FALSE)
        optimizer <- match.arg(con$optimizer, c("optim", "nlminb", "uobyqa", "newuoa", "bobyqa", "nloptr", "nlm", "hjk", "nmk", "mads", "ucminf", "lbfgsb3c", "subplex", "BBoptim", "optimParallel", "constrOptim", "solnp", "alabama", "constrOptim.nl", "Nelder-Mead", "BFGS", "CG", "L-BFGS-B", "SANN", "Brent", "Rcgmin", "Rvmmin"))
        optmethod <- match.arg(con$optmethod, c("Nelder-Mead", "BFGS", "CG", "L-BFGS-B", "SANN", "Brent"))
        if (optimizer %in% c("Nelder-Mead", "BFGS", "CG", "L-BFGS-B", "SANN", "Brent")) {
            optmethod <- optimizer
            optimizer <- "optim"
        }
        parallel <- con$parallel
        cl <- con$cl
        ncpus <- con$ncpus
        optcontrol <- control[is.na(con.pos)]
        if (length(optcontrol) == 0L) 
            optcontrol <- list()
        if (ncpus > 1L) 
            optimizer <- "optimParallel"
        if (optimizer == "alabama") 
            optimizer <- "constrOptim.nl"
        if (link == "identity") {
            if (optimizer == "nlminb") {
                optimizer <- "constrOptim"
            }
            else {
                if (!is.element(optimizer, c("constrOptim", "solnp", "nloptr", "constrOptim.nl"))) {
                  optimizer <- "constrOptim"
                  warning(mstyle$warning(paste0("Can only use optimizers 'constrOptim', 'solnp', 'nloptr', or 'constrOptim.nl' when link='identity' (resetting to '", optimizer, "').")), call. = FALSE)
                }
            }
        }
        if (link == "log" && is.element(optimizer, c("constrOptim", "constrOptim.nl"))) 
            stop(mstyle$stop(paste0("Cannot use '", optimizer, "' optimizer when using a log link.")))
        reml <- ifelse(method[1] == "REML", TRUE, FALSE)
        tmp <- try(lm(yi ~ Z - 1), silent = TRUE)
        if (inherits(tmp, "lm")) {
            coef.na.Z <- is.na(coef(tmp))
        }
        else {
            coef.na.Z <- rep(FALSE, NCOL(Z))
        }
        if (any(coef.na.Z)) {
            warning(mstyle$warning("Redundant predictors dropped from the scale model."), call. = FALSE)
            Z <- Z[, !coef.na.Z, drop = FALSE]
            Z.f <- Z.f[, !coef.na.Z, drop = FALSE]
        }
        is.int <- apply(Z, 2, .is.intercept)
        if (any(is.int)) {
            Z.int.incl <- TRUE
            int.indx <- which(is.int, arr.ind = TRUE)
            Z <- cbind(intrcpt = 1, Z[, -int.indx, drop = FALSE])
            Z.f <- cbind(intrcpt = 1, Z.f[, -int.indx, drop = FALSE])
            Z.intercept <- TRUE
        }
        else {
            Z.int.incl <- FALSE
        }
        q <- NCOL(Z)
        if (!.chkpd(crossprod(Z), tol = con$evtol)) 
            stop(mstyle$stop("Model matrix for scale part of the model not of full rank. Cannot fit model."))
        is.int <- apply(Z, 2, .is.intercept)
        if (q == 1L && is.int) {
            Z.int.only <- TRUE
        }
        else {
            Z.int.only <- FALSE
        }
        if (missing(alpha) || is.null(alpha) || all(is.na(alpha))) {
            alpha <- rep(NA_real_, q)
        }
        else {
            alpha <- .expand1(alpha, q)
            if (length(alpha) != q) 
                stop(mstyle$stop(paste0("Length of the 'alpha' argument (", length(alpha), ") does not match the actual number of parameters (", q, ").")))
        }
        if (optbeta) {
            if (missing(beta) || is.null(beta) || all(is.na(beta))) {
                beta <- rep(NA_real_, p)
            }
            else {
                beta <- .expand1(beta, p)
                if (length(beta) != p) 
                  stop(mstyle$stop(paste0("Length of the 'beta' argument (", length(beta), ") does not match the actual number of parameters (", p, ").")))
            }
            X0 <- X
            X0[] <- 0
        }
        else {
            X0 <- NULL
        }
        if (!Z.int.only && Z.int.incl && con$scaleZ && is.na(alpha[1]) && all(is.infinite(con$alpha.min)) && all(is.infinite(con$alpha.max)) && !optbeta) {
            Zsave <- Z
            meanZ <- colMeans(Z[, 2:q, drop = FALSE])
            sdZ <- apply(Z[, 2:q, drop = FALSE], 2, sd)
            is.d <- apply(Z, 2, .is.dummy)
            mZ <- rbind(c(intrcpt = 1, -1 * ifelse(is.d[-1], 0, meanZ/sdZ)), cbind(0, diag(ifelse(is.d[-1], 1, 1/sdZ), nrow = length(is.d) - 1, ncol = length(is.d) - 1)))
            imZ <- try(suppressWarnings(solve(mZ)), silent = TRUE)
            Z[, !is.d] <- apply(Z[, !is.d, drop = FALSE], 2, scale)
            if (any(!is.na(alpha))) {
                if (inherits(imZ, "try-error")) 
                  stop(mstyle$stop("Unable to rescale starting values for the scale parameters."))
                alpha <- diag(imZ) * alpha
            }
        }
        else {
            mZ <- NULL
        }
        if (k == 1L && Z.int.only) {
            if (link == "log") 
                con$alpha.init <- -10000
            if (link == "identity") 
                con$alpha.init <- 1e-05
        }
        if (verbose > 1) 
            message(mstyle$message("Extracting/computing the initial values ..."))
        if (is.null(con$alpha.init)) {
            fit <- suppressWarnings(rma.uni(yi, vi, mods = X, intercept = FALSE, method = "HE", skipr2 = TRUE))
            tmp <- rstandard(fit)
            if (link == "log") {
                tmp <- suppressWarnings(rma.uni(log(tmp$resid^2), 4/tmp$resid^2 * tmp$se^2, mods = Z, intercept = FALSE, method = "FE"))
                alpha.init <- coef(tmp)
            }
            if (link == "identity") {
                tmp <- suppressWarnings(rma.uni(tmp$resid^2, tmp$se^2, mods = Z, intercept = FALSE, method = "FE"))
                alpha.init <- coef(tmp)
                if (any(Z %*% alpha.init < 0)) 
                  alpha.init <- ifelse(is.int, fit$tau2 + 0.01, 0)
                if (any(Z %*% alpha.init < 0)) 
                  stop(mstyle$stop("Unable to find suitable starting values for the scale parameters."))
            }
        }
        else {
            alpha.init <- con$alpha.init
            if (!is.null(mZ)) {
                if (inherits(imZ, "try-error")) 
                  stop(mstyle$stop("Unable to rescale starting values for the scale parameters."))
                alpha.init <- c(imZ %*% cbind(alpha.init))
            }
            if (link == "identity" && any(Z %*% alpha.init < 0)) 
                stop(mstyle$stop("Starting values for the scale parameters lead to one or more negative tau^2 values."))
            if (optbeta) 
                fit <- suppressWarnings(rma.uni(yi, vi, mods = X, intercept = FALSE, method = "HE", skipr2 = TRUE))
        }
        if (length(alpha.init) != q) 
            stop(mstyle$stop(paste0("Length of the 'alpha.init' argument (", length(alpha.init), ") does not match the actual number of parameters (", q, ").")))
        if (anyNA(alpha.init)) 
            stop(mstyle$stop("No missing values allowed in 'alpha.init'."))
        if (optbeta) {
            if (is.null(con$beta.init)) {
                beta.init <- c(fit$beta)
            }
            else {
                beta.init <- con$beta.init
                if (length(beta.init) != p) 
                  stop(mstyle$stop(paste0("Length of the 'beta.init' argument (", length(beta.init), ") does not match the actual number of parameters (", p, ").")))
                if (anyNA(beta.init)) 
                  stop(mstyle$stop("No missing values allowed in 'beta.init'."))
            }
        }
        else {
            beta.init <- NULL
        }
        con$alpha.min <- .expand1(con$alpha.min, q)
        con$alpha.max <- .expand1(con$alpha.max, q)
        if (length(con$alpha.min) != q) 
            stop(mstyle$stop(paste0("Length of the 'alpha.min' argument (", length(alpha.min), ") does not match the actual number of parameters (", q, ").")))
        if (length(con$alpha.max) != q) 
            stop(mstyle$stop(paste0("Length of the 'alpha.max' argument (", length(alpha.max), ") does not match the actual number of parameters (", q, ").")))
        if (any(xor(is.infinite(con$alpha.min), is.infinite(con$alpha.max)))) 
            stop(mstyle$stop("Constraints on scale coefficients must be placed on both the lower and upper bound."))
        alpha.min <- con$alpha.min
        alpha.max <- con$alpha.max
        if (link == "identity" && (any(alpha.min != -Inf) || any(alpha.max != Inf))) 
            stop(mstyle$stop("Cannot use constraints on scale coefficients when using an identity link."))
        alpha.init <- pmax(alpha.init, alpha.min)
        alpha.init <- pmin(alpha.init, alpha.max)
        alpha.init <- mapply(.mapinvfun.alpha, alpha.init, alpha.min, alpha.max)
        if (verbose > 1) 
            message(mstyle$message("Estimating the scale parameters ...\n"))
        tmp <- .chkopt(optimizer, optcontrol, ineq = link == "identity")
        optimizer <- tmp$optimizer
        optcontrol <- tmp$optcontrol
        par.arg <- tmp$par.arg
        ctrl.arg <- tmp$ctrl.arg
        if (optimizer == "optimParallel::optimParallel") {
            parallel$cl <- NULL
            if (is.null(cl)) {
                ncpus <- as.integer(ncpus)
                if (ncpus < 1L) 
                  stop(mstyle$stop("Control argument 'ncpus' must be >= 1."))
                cl <- parallel::makePSOCKcluster(ncpus)
                on.exit(parallel::stopCluster(cl), add = TRUE)
            }
            else {
                if (!inherits(cl, "SOCKcluster")) 
                  stop(mstyle$stop("Specified cluster is not of class 'SOCKcluster'."))
            }
            parallel$cl <- cl
            if (is.null(parallel$forward)) 
                parallel$forward <- FALSE
            if (is.null(parallel$loginfo)) {
                if (verbose) {
                  parallel$loginfo <- TRUE
                }
                else {
                  parallel$loginfo <- FALSE
                }
            }
        }
        if (link == "log") {
            optcall <- paste0(optimizer, "(", par.arg, "=c(beta.init, alpha.init), .ll.rma.ls, ", ifelse(optimizer == "optim", "method=optmethod, ", ""), "yi=yi, vi=vi, X=X, Z=Z, reml=reml, k=k, pX=p, alpha.arg=alpha, beta.arg=beta, verbose=verbose, digits=digits,\n                          REMLf=con$REMLf, link=link, mZ=mZ, alpha.min=alpha.min, alpha.max=alpha.max, alpha.transf=TRUE,\n                          tau2.min=con$tau2.min, tau2.max=con$tau2.max, optbeta=optbeta", ctrl.arg, ")\n")
        }
        if (link == "identity") {
            if (optimizer == "constrOptim") 
                optcall <- paste0("constrOptim(theta=c(beta.init, alpha.init), f=.ll.rma.ls, grad=NULL, ui=cbind(X0,Z), ci=rep(0,k),\n                              yi=yi, vi=vi, X=X, Z=Z, reml=reml, k=k, pX=p, alpha.arg=alpha, beta.arg=beta, verbose=verbose, digits=digits,\n                              REMLf=con$REMLf, link=link, mZ=mZ, alpha.min=alpha.min, alpha.max=alpha.max, alpha.transf=TRUE,\n                              tau2.min=con$tau2.min, tau2.max=con$tau2.max, optbeta=optbeta", ctrl.arg, 
                  ")\n")
            if (optimizer == "Rsolnp::solnp") 
                optcall <- paste0("Rsolnp::solnp(pars=c(beta.init, alpha.init), fun=.ll.rma.ls, ineqfun=.rma.ls.ineqfun.pos, ineqLB=rep(0,k), ineqUB=rep(Inf,k),\n                              yi=yi, vi=vi, X=X, Z=Z, reml=reml, k=k, pX=p, alpha.arg=alpha, beta.arg=beta, verbose=verbose, digits=digits,\n                              REMLf=con$REMLf, link=link, mZ=mZ, alpha.min=alpha.min, alpha.max=alpha.max, alpha.transf=TRUE,\n                              tau2.min=con$tau2.min, tau2.max=con$tau2.max, optbeta=optbeta", 
                  ctrl.arg, ")\n")
            if (optimizer == "nloptr::nloptr") 
                optcall <- paste0("nloptr::nloptr(x0=c(beta.init, alpha.init), eval_f=.ll.rma.ls, eval_g_ineq=.rma.ls.ineqfun.neg,\n                              yi=yi, vi=vi, X=X, Z=Z, reml=reml, k=k, pX=p, alpha.arg=alpha, beta.arg=beta, verbose=verbose, digits=digits,\n                              REMLf=con$REMLf, link=link, mZ=mZ, alpha.min=alpha.min, alpha.max=alpha.max, alpha.transf=TRUE,\n                              tau2.min=con$tau2.min, tau2.max=con$tau2.max, optbeta=optbeta", ctrl.arg, 
                  ")\n")
            if (optimizer == "alabama::constrOptim.nl") 
                optcall <- paste0("alabama::constrOptim.nl(par=c(beta.init, alpha.init), fn=.ll.rma.ls, hin=.rma.ls.ineqfun.pos,\n                              yi=yi, vi=vi, X=X, Z=Z, reml=reml, k=k, pX=p, alpha.arg=alpha, beta.arg=beta, verbose=verbose, digits=digits,\n                              REMLf=con$REMLf, link=link, mZ=mZ, alpha.min=alpha.min, alpha.max=alpha.max, alpha.transf=TRUE,\n                              tau2.min=con$tau2.min, tau2.max=con$tau2.max, optbeta=optbeta", ctrl.arg, 
                  ")\n")
        }
        if (verbose) {
            opt.res <- try(eval(str2lang(optcall)), silent = !verbose)
        }
        else {
            opt.res <- try(suppressWarnings(eval(str2lang(optcall))), silent = !verbose)
        }
        if (isTRUE(ddd$retopt)) 
            return(opt.res)
        opt.res$par <- .chkconv(optimizer = optimizer, opt.res = opt.res, optcontrol = optcontrol, fun = "rma", verbose = verbose)
        if (optbeta) {
            opt.res$par[-seq_len(p)] <- mapply(.mapfun.alpha, opt.res$par[-seq_len(p)], alpha.min, alpha.max)
        }
        else {
            opt.res$par <- mapply(.mapfun.alpha, opt.res$par, alpha.min, alpha.max)
        }
        if (optbeta) {
            opt.res$par[seq_len(p)] <- ifelse(is.na(beta), opt.res$par[seq_len(p)], beta)
            opt.res$par[-seq_len(p)] <- ifelse(is.na(alpha), opt.res$par[-seq_len(p)], alpha)
        }
        else {
            opt.res$par <- ifelse(is.na(alpha), opt.res$par, alpha)
        }
        H <- NA_real_
        if (optbeta) {
            va <- matrix(NA_real_, nrow = p + q, ncol = p + q)
            hest <- c(is.na(beta), is.na(alpha))
        }
        else {
            va <- matrix(NA_real_, nrow = q, ncol = q)
            hest <- is.na(alpha)
        }
        if (any(hest) && !isTRUE(ddd$skiphes)) {
            if (verbose > 1) 
                message(mstyle$message("\nComputing the Hessian ..."))
            if (con$hesspack == "numDeriv") 
                H <- try(numDeriv::hessian(func = .ll.rma.ls, x = opt.res$par, method.args = con$hessianCtrl, yi = yi, vi = vi, X = X, Z = Z, reml = reml, k = k, pX = p, alpha.arg = alpha, beta.arg = beta, verbose = FALSE, digits = digits, REMLf = con$REMLf, link = link, mZ = mZ, alpha.min = alpha.min, alpha.max = alpha.max, alpha.transf = FALSE, tau2.min = con$tau2.min, tau2.max = con$tau2.max, optbeta = optbeta), silent = TRUE)
            if (con$hesspack == "pracma") 
                H <- try(pracma::hessian(f = .ll.rma.ls, x0 = opt.res$par, yi = yi, vi = vi, X = X, Z = Z, reml = reml, k = k, pX = p, alpha.arg = alpha, beta.arg = beta, verbose = FALSE, digits = digits, REMLf = con$REMLf, link = link, mZ = mZ, alpha.min = alpha.min, alpha.max = alpha.max, alpha.transf = FALSE, tau2.min = con$tau2.min, tau2.max = con$tau2.max, optbeta = optbeta), silent = TRUE)
            if (con$hesspack == "calculus") 
                H <- try(calculus::hessian(f = .ll.rma.ls, var = opt.res$par, params = list(yi = yi, vi = vi, X = X, Z = Z, reml = reml, k = k, pX = p, alpha.arg = alpha, beta.arg = beta, verbose = FALSE, digits = digits, REMLf = con$REMLf, link = link, mZ = mZ, alpha.min = alpha.min, alpha.max = alpha.max, alpha.transf = FALSE, tau2.min = con$tau2.min, tau2.max = con$tau2.max, optbeta = optbeta)), silent = TRUE)
            if (inherits(H, "try-error")) {
                warning(mstyle$warning("Error when trying to compute the Hessian."), call. = FALSE)
            }
            else {
                H.hest <- H[hest, hest, drop = FALSE]
                iH.hest <- try(suppressWarnings(chol2inv(chol(H.hest))), silent = TRUE)
                if (inherits(iH.hest, "try-error") || anyNA(iH.hest) || any(is.infinite(iH.hest))) {
                  warning(mstyle$warning("Error when trying to invert the Hessian."), call. = FALSE)
                }
                else {
                  va[hest, hest] <- iH.hest
                }
            }
        }
        if (optbeta) {
            vba <- va
            vb <- va[seq_len(p), seq_len(p), drop = FALSE]
            va <- va[-seq_len(p), -seq_len(p), drop = FALSE]
        }
        alpha.arg <- alpha
        beta.arg <- beta
        if (optbeta) {
            beta <- cbind(opt.res$par[seq_len(p)])
            alpha <- cbind(opt.res$par[-seq_len(p)])
        }
        else {
            alpha <- cbind(opt.res$par)
        }
        if (any(alpha <= alpha.min + 10 * .Machine$double.eps^0.25) || any(alpha >= alpha.max - 10 * .Machine$double.eps^0.25)) 
            warning(mstyle$warning("One or more 'alpha' estimates are (almost) equal to their lower or upper bound.\nTreat results with caution (or consider adjusting 'alpha.min' and/or 'alpha.max')."), call. = FALSE)
        if (!is.null(mZ)) {
            alpha <- mZ %*% alpha
            va[!hest, ] <- 0
            va[, !hest] <- 0
            va <- mZ %*% va %*% t(mZ)
            va[!hest, ] <- NA_real_
            va[, !hest] <- NA_real_
            Z <- Zsave
        }
        att <- .set.btt(att, q, Z.int.incl, colnames(Z))
        m.alpha <- length(att)
        if (is.element(test, c("knha", "adhoc", "t"))) {
            ddf.alpha <- k - q
        }
        else {
            ddf.alpha <- NA_integer_
        }
        QS <- try(as.vector(t(alpha)[att] %*% chol2inv(chol(va[att, att])) %*% alpha[att]), silent = TRUE)
        if (inherits(QS, "try-error")) 
            QS <- NA_real_
        se.alpha <- sqrt(diag(va))
        rownames(alpha) <- rownames(va) <- colnames(va) <- colnames(Z)
        names(se.alpha) <- NULL
        zval.alpha <- c(alpha/se.alpha)
        if (is.element(test, c("knha", "adhoc", "t"))) {
            QS <- QS/m.alpha
            QSdf <- c(m.alpha, ddf.alpha)
            QSp <- if (QSdf[2] > 0) 
                pf(QS, df1 = QSdf[1], df2 = QSdf[2], lower.tail = FALSE)
            else NA_real_
            pval.alpha <- if (ddf.alpha > 0) 
                2 * pt(abs(zval.alpha), df = ddf.alpha, lower.tail = FALSE)
            else rep(NA_real_, q)
            crit.alpha <- if (ddf.alpha > 0) 
                qt(level/2, df = ddf.alpha, lower.tail = FALSE)
            else NA_real_
        }
        else {
            QSdf <- c(m.alpha, ddf.alpha)
            QSp <- pchisq(QS, df = QSdf[1], lower.tail = FALSE)
            pval.alpha <- 2 * pnorm(abs(zval.alpha), lower.tail = FALSE)
            crit.alpha <- qnorm(level/2, lower.tail = FALSE)
        }
        ci.lb.alpha <- c(alpha - crit.alpha * se.alpha)
        ci.ub.alpha <- c(alpha + crit.alpha * se.alpha)
        if (link == "log") 
            tau2 <- exp(as.vector(Z %*% alpha))
        if (link == "identity") 
            tau2 <- as.vector(Z %*% alpha)
    }
    if (is.element(method[1], c("FE", "EE", "CE"))) 
        tau2 <- 0
    if (verbose > 1) 
        message(mstyle$message("\nModel fitting ..."))
    wi <- 1/(vi + tau2)
    W <- diag(wi, nrow = k, ncol = k)
    M <- diag(vi + tau2, nrow = k, ncol = k)
    if (weighted) {
        if (is.null(weights) || is.element(test, c("knha", "adhoc"))) {
            if (any(is.infinite(wi))) 
                stop(mstyle$stop("Division by zero when computing the inverse variance weights."))
            if (!optbeta) {
                if (tau2.inf) {
                  beta <- cbind(coef(lm(yi ~ 0 + X)))
                  vb <- diag(rep(Inf, p), nrow = p, ncol = p)
                }
                else {
                  stXWX <- .invcalc(X = X, W = W, k = k)
                  beta <- stXWX %*% crossprod(X, W) %*% Y
                  vb <- stXWX
                }
            }
            RSS.f <- sum(wi * c(yi - X %*% beta)^2)
            RSS.knha <- RSS.f
        }
        if (!is.null(weights)) {
            A <- diag(weights, nrow = k, ncol = k)
            stXAX <- .invcalc(X = X, W = A, k = k)
            beta <- stXAX %*% crossprod(X, A) %*% Y
            vb <- stXAX %*% t(X) %*% A %*% M %*% A %*% X %*% stXAX
            RSS.f <- sum(wi * c(yi - X %*% beta)^2)
        }
        if (is.element(test, c("knha", "adhoc"))) {
            if (RSS.knha <= .Machine$double.eps) {
                s2w <- 0
            }
            else {
                s2w <- RSS.knha/(k - p)
            }
        }
    }
    else {
        stXX <- .invcalc(X = X, W = diag(k), k = k)
        beta <- stXX %*% crossprod(X, Y)
        vb <- tcrossprod(stXX, X) %*% M %*% X %*% stXX
        RSS.f <- sum(wi * (yi - X %*% beta)^2)
        if (is.element(test, c("knha", "adhoc"))) {
            if (any(is.infinite(wi))) 
                stop(mstyle$stop("Division by zero when computing the inverse variance weights."))
            stXWX <- .invcalc(X = X, W = W, k = k)
            beta.knha <- stXWX %*% crossprod(X, W) %*% Y
            RSS.knha <- sum(wi * (yi - X %*% beta.knha)^2)
            if (RSS.knha <= .Machine$double.eps) {
                s2w <- 0
            }
            else {
                s2w <- RSS.knha/(k - p)
            }
        }
    }
    if (verbose > 1) 
        message(mstyle$message("Conducting the tests of the fixed effects ..."))
    if (is.element(method[1], c("FE", "EE", "CE")) && is.element(test, c("knha", "adhoc"))) 
        warning(mstyle$warning(paste0("Knapp and Hartung method is not meant to be used in the context of ", method[1], " models.")), call. = FALSE)
    if (test == "adhoc") 
        s2w[s2w < 1] <- 1
    vb <- s2w * vb
    if (tau2.inf) 
        vb <- diag(rep(Inf, p), nrow = p, ncol = p)
    if (is.element(test, c("knha", "adhoc", "t"))) {
        ddf <- .chkddd(ddd$dfs, k - p, ddd$dfs[[1]])
    }
    else {
        ddf <- NA_integer_
    }
    QM <- try(as.vector(t(beta)[btt] %*% chol2inv(chol(vb[btt, btt])) %*% beta[btt]), silent = TRUE)
    if (inherits(QM, "try-error")) 
        QM <- NA_real_
    if (.isTRUE(ddd$abbrev)) {
        tmp <- colnames(X)
        tmp <- gsub("relevel(factor(", "", tmp, fixed = TRUE)
        tmp <- gsub("\\), ref = \"[[:alnum:]]*\")", "", tmp)
        tmp <- gsub("poly(", "", tmp, fixed = TRUE)
        tmp <- gsub(", degree = [[:digit:]], raw = TRUE)", "^", tmp)
        tmp <- gsub(", degree = [[:digit:]], raw = T)", "^", tmp)
        tmp <- gsub(", degree = [[:digit:]])", "^", tmp)
        tmp <- gsub("rcs\\([[:alnum:]]*, [[:digit:]]\\)", "", tmp)
        tmp <- gsub("factor(", "", tmp, fixed = TRUE)
        tmp <- gsub("I(", "", tmp, fixed = TRUE)
        tmp <- gsub(")", "", tmp, fixed = TRUE)
        colnames(X) <- tmp
    }
    rownames(beta) <- rownames(vb) <- colnames(vb) <- colnames(X.f) <- colnames(X)
    se <- sqrt(diag(vb))
    names(se) <- NULL
    zval <- c(beta/se)
    if (is.element(test, c("knha", "adhoc", "t"))) {
        QM <- QM/m
        QMdf <- c(m, ddf)
        QMp <- if (QMdf[2] > 0) 
            pf(QM, df1 = QMdf[1], df2 = QMdf[2], lower.tail = FALSE)
        else NA_real_
        pval <- if (ddf > 0) 
            2 * pt(abs(zval), df = ddf, lower.tail = FALSE)
        else rep(NA_real_, p)
        crit <- if (ddf > 0) 
            qt(level/2, df = ddf, lower.tail = FALSE)
        else NA_real_
    }
    else {
        QMdf <- c(m, ddf)
        QMp <- pchisq(QM, df = QMdf[1], lower.tail = FALSE)
        pval <- 2 * pnorm(abs(zval), lower.tail = FALSE)
        crit <- qnorm(level/2, lower.tail = FALSE)
    }
    ci.lb <- c(beta - crit * se)
    ci.ub <- c(beta + crit * se)
    if (verbose > 1) 
        message(mstyle$message("Conducting the heterogeneity test ..."))
    if (allvipos) {
        if (k > p) {
            wi <- 1/vi
            W.FE <- diag(wi, nrow = k, ncol = k)
            stXWX <- .invcalc(X = X, W = W.FE, k = k)
            P <- W.FE - W.FE %*% X %*% stXWX %*% crossprod(X, W.FE)
            QE <- max(0, c(crossprod(Ymc, P) %*% Ymc))
            QEp <- pchisq(QE, df = k - p, lower.tail = FALSE)
            if (i2def == "1") 
                vt <- (k - p)/.tr(P)
            if (i2def == "2") 
                vt <- 1/mean(wi)
            if (is.element(method[1], c("FE", "EE", "CE"))) {
                I2 <- max(0, 100 * (QE - (k - p))/QE)
                H2 <- QE/(k - p)
            }
            else {
                I2 <- 100 * tau2/(vt + tau2)
                H2 <- tau2/vt + 1
            }
        }
        else {
            QE <- 0
            QEp <- 1
            I2 <- 0
            H2 <- 1
            vt <- 0
        }
    }
    else {
        if (!vi0) 
            warning(mstyle$warning(paste0("Cannot compute ", ifelse(int.only, "Q", "QE"), "-test, I^2, or H^2 when there are non-positive sampling variances in the data.")), call. = FALSE)
        vt <- NA_real_
    }
    if (verbose > 1) 
        message(mstyle$message("Computing the fit statistics and log-likelihood ..."))
    q.est <- ifelse(model == "rma.uni", 0, sum(is.na(alpha.arg)))
    parms <- ifelse(optbeta, sum(is.na(beta.arg)), p) + ifelse(model == "rma.uni", ifelse(is.element(method[1], c("FE", "EE", "CE")) || tau2.fix, 0, 1), q.est)
    ll.ML <- -1/2 * (k) * log(2 * base::pi) - 1/2 * sum(log(vi + tau2)) - 1/2 * RSS.f
    ll.REML <- -1/2 * (k - p) * log(2 * base::pi) + ifelse(con$REMLf, 1/2 * determinant(crossprod(X), logarithm = TRUE)$modulus, 0) + -1/2 * sum(log(vi + tau2)) - 1/2 * determinant(crossprod(X, W) %*% X, logarithm = TRUE)$modulus - 1/2 * RSS.f
    if (k > p) {
        if (allvipos) {
            dev.ML <- -2 * (ll.ML - sum(dnorm(yi, mean = yi, sd = sqrt(vi), log = TRUE)))
        }
        else {
            dev.ML <- -2 * ll.ML
        }
    }
    else {
        dev.ML <- 0
    }
    AIC.ML <- -2 * ll.ML + 2 * parms
    BIC.ML <- -2 * ll.ML + parms * log(k)
    AICc.ML <- -2 * ll.ML + 2 * parms * max(k, parms + 2)/(max(k, parms + 2) - parms - 1)
    dev.REML <- -2 * (ll.REML - 0)
    AIC.REML <- -2 * ll.REML + 2 * parms
    BIC.REML <- -2 * ll.REML + parms * log(k - p)
    AICc.REML <- -2 * ll.REML + 2 * parms * max(k - p, parms + 2)/(max(k - p, parms + 2) - parms - 1)
    fit.stats <- matrix(c(ll.ML, dev.ML, AIC.ML, BIC.ML, AICc.ML, ll.REML, dev.REML, AIC.REML, BIC.REML, AICc.REML), ncol = 2, byrow = FALSE)
    dimnames(fit.stats) <- list(c("ll", "dev", "AIC", "BIC", "AICc"), c("ML", "REML"))
    fit.stats <- data.frame(fit.stats)
    if (!int.only && int.incl && model == "rma.uni" && !isTRUE(ddd$skipr2)) {
        if (verbose > 1) 
            message(mstyle$message("Computing R^2 ..."))
        if (is.element(method[1], c("FE", "EE", "CE"))) {
            if (identical(var(yi), 0)) {
                R2 <- 0
            }
            else {
                if (weighted) {
                  if (is.null(weights)) {
                    R2 <- max(0, 100 * summary(lm(yi ~ X, weights = wi))$adj.r.squared)
                  }
                  else {
                    R2 <- max(0, 100 * summary(lm(yi ~ X, weights = weights))$adj.r.squared)
                  }
                }
                else {
                  R2 <- max(0, 100 * summary(lm(yi ~ X))$adj.r.squared)
                }
            }
        }
        else {
            if (r2def %in% c("1", "1v", "3", "3v", "5", "6", "7", "8")) {
                args <- list(yi = yi, vi = vi, weights = weights, method = method, weighted = weighted, test = test, verbose = ifelse(verbose, TRUE, FALSE), control = con, digits = digits, outlist = "minimal")
                if (verbose > 1) {
                  res0 <- try(.do.call(rma.uni, args), silent = FALSE)
                }
                else {
                  res0 <- try(suppressWarnings(.do.call(rma.uni, args)), silent = TRUE)
                }
                if (!inherits(res0, "try-error")) {
                  tau2.RE <- res0$tau2
                  if (identical(tau2.RE, 0) && r2def %in% c("1", "3")) {
                    R2 <- 0
                  }
                  else {
                    ll0 <- logLik(res0)
                    ll1 <- ifelse(method[1] == "ML", ll.ML, ll.REML)
                    lls <- (ifelse(method[1] == "ML", dev.ML, dev.REML) + 2 * ll1)/2
                    if (r2def == "1") 
                      R2 <- (tau2.RE - tau2)/tau2.RE
                    if (r2def == "1v") 
                      R2 <- (tau2.RE - tau2)/(tau2.RE + 1/mean(1/vi))
                    if (r2def == "3") 
                      R2 <- var(c(X %*% beta))/tau2.RE
                    if (r2def == "3v") 
                      R2 <- var(c(X %*% beta))/(tau2.RE + 1/mean(1/vi))
                    if (r2def == "5") 
                      R2 <- 1 - ll1/ll0
                    if (r2def == "6") 
                      R2 <- 1 - (exp(ll0)/exp(ll1))^(2/k)
                    if (r2def == "7") 
                      R2 <- (1 - (exp(ll0)/exp(ll1))^(2/k))/(1 - exp(ll0)^(2/k))
                    if (r2def == "8") 
                      R2 <- (ll1 - ll0)/(lls - ll0)
                  }
                }
                else {
                  R2 <- NA_real_
                }
            }
            else {
                if (r2def == "2") 
                  R2 <- var(c(X %*% beta))/(var(c(X %*% beta)) + tau2)
                if (r2def == "2v") 
                  R2 <- var(c(X %*% beta))/(var(c(X %*% beta)) + tau2 + 1/mean(1/vi))
                if (r2def == "4") 
                  R2 <- cor(yi, c(X %*% beta))^2
                if (r2def == "4w") {
                  if (is.null(weights)) {
                    R2 <- cov.wt(cbind(yi, c(X %*% beta)), cor = TRUE, wt = 1/(vi + tau2))$cor[1, 2]^2
                  }
                  else {
                    R2 <- cov.wt(cbind(yi, c(X %*% beta)), cor = TRUE, wt = weights)$cor[1, 2]^2
                  }
                }
            }
            R2 <- max(0, 100 * R2)
        }
    }
    else {
        R2 <- NULL
    }
    if (.isTRUE(ddd$pleasedonotreportI2thankyouverymuch)) {
        I2 <- NA
        H2 <- NA
    }
    if (verbose > 1) 
        message(mstyle$message("Preparing the output ..."))
    p.eff <- p
    k.eff <- k
    if (is.null(ddd$outlist) || ddd$outlist == "nodata") {
        res <- list(b = beta, beta = beta, se = se, zval = zval, pval = pval, ci.lb = ci.lb, ci.ub = ci.ub, vb = vb, tau2 = tau2, se.tau2 = se.tau2, tau2.fix = tau2.fix, tau2.f = tau2, I2 = I2, H2 = H2, R2 = R2, vt = vt, QE = QE, QEp = QEp, QM = QM, QMdf = QMdf, QMp = QMp, k = k, k.f = k.f, k.eff = k.eff, k.all = k.all, p = p, p.eff = p.eff, parms = parms, int.only = int.only, int.incl = int.incl, intercept = intercept, allvipos = allvipos, coef.na = coef.na, yi = yi, vi = vi, X = X, weights = weights, 
            yi.f = yi.f, vi.f = vi.f, X.f = X.f, weights.f = weights.f, M = M, chksumyi = digest::digest(as.vector(yi)), chksumvi = digest::digest(as.vector(vi)), chksumX = digest::digest(X), outdat.f = outdat.f, ni = ni, ni.f = ni.f, ids = ids, not.na = not.na, subset = subset, slab = slab, slab.null = slab.null, measure = measure, method = method[1], model = model, weighted = weighted, test = test, dfs = ddf, ddf = ddf, s2w = s2w, btt = btt, m = m, digits = digits, level = level, control = control, 
            verbose = verbose, add = add, to = to, drop00 = drop00, fit.stats = fit.stats, formula.yi = formula.yi, formula.mods = formula.mods, version = packageVersion("metafor"), call = mf)
        if (is.null(ddd$outlist)) 
            res <- append(res, list(data = data), which(names(res) == "fit.stats"))
    }
    else {
        if (ddd$outlist == "minimal") {
            res <- list(b = beta, beta = beta, se = se, zval = zval, pval = pval, ci.lb = ci.lb, ci.ub = ci.ub, vb = vb, tau2 = tau2, se.tau2 = se.tau2, tau2.fix = tau2.fix, I2 = I2, H2 = H2, R2 = R2, QE = QE, QEp = QEp, QM = QM, QMdf = QMdf, QMp = QMp, k = k, k.f = k.f, k.eff = k.eff, p = p, p.eff = p.eff, parms = parms, int.only = int.only, int.incl = int.incl, intercept = intercept, chksumyi = digest::digest(as.vector(yi)), chksumvi = digest::digest(as.matrix(vi)), chksumX = digest::digest(X), 
                measure = measure, method = method[1], model = model, weighted = weighted, test = test, dfs = ddf, ddf = ddf, btt = btt, m = m, digits = digits, level = level, fit.stats = fit.stats)
        }
        else {
            res <- eval(str2lang(paste0("list(", ddd$outlist, ")")))
        }
    }
    if (model == "rma.ls") {
        res$alpha <- alpha
        res$va <- va
        res$se.alpha <- se.alpha
        res$zval.alpha <- zval.alpha
        res$pval.alpha <- pval.alpha
        res$ci.lb.alpha <- ci.lb.alpha
        res$ci.ub.alpha <- ci.ub.alpha
        res$alpha.fix <- !is.na(alpha.arg)
        res$optbeta <- optbeta
        if (optbeta) {
            res$vba <- vba
            res$beta.fix <- !is.na(beta.arg)
        }
        res$q <- q
        res$alphas <- q
        res$link <- link
        res$Z <- Z
        res$Z.f <- Z.f
        res$tau2.f <- rep(NA_real_, k.f)
        res$tau2.f[not.na] <- tau2
        res$att <- att
        res$m.alpha <- m.alpha
        res$ddf.alpha <- ddf.alpha
        res$QS <- QS
        res$QSdf <- QSdf
        res$QSp <- QSp
        res$formula.scale <- formula.scale
        res$Z.int.incl <- Z.int.incl
        res$Z.intercept <- Z.int.incl
        res$Z.int.only <- Z.int.only
        res$coef.na.Z <- coef.na.Z
        res$H <- H
    }
    time.end <- proc.time()
    res$time <- unname(time.end - time.start)[3]
    if (.isTRUE(ddd$time)) 
        .print.time(res$time)
    if (verbose || .isTRUE(ddd$time)) 
        cat("\n")
    if (model == "rma.ls") {
        class(res) <- c("rma.ls", "rma.uni", "rma")
    }
    else {
        class(res) <- c("rma.uni", "rma")
    }
    return(res)
}
