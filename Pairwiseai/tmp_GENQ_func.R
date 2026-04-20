function (tau2val, P, vi, Q, level, k, p, getlower, verbose = FALSE, digits = 4) 
{
    mstyle <- .get.mstyle()
    S <- diag(sqrt(vi + tau2val), nrow = k, ncol = k)
    lambda <- Re(eigen(S %*% P %*% S, symmetric = TRUE, only.values = TRUE)$values)
    tmp <- CompQuadForm::farebrother(Q, lambda[seq_len(k - p)])
    if (exists("res", tmp)) 
        tmp$Qq <- tmp$res
    if (getlower) {
        res <- tmp$Qq - level
    }
    else {
        res <- (1 - tmp$Qq) - level
    }
    if (verbose) 
        cat(mstyle$verbose(paste("tau2 =", fmtx(tau2val, digits[["var"]], addwidth = 4), "  objective =", fmtx(res, digits[["var"]], flag = " "), "\n")))
    return(res)
}
