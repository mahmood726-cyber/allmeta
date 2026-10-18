"""Independent 60-digit derivation on explicit synthetic counts, no JS regression port."""
from decimal import Decimal, localcontext

with localcontext() as ctx:
    ctx.prec = 60
    c = (Decimal(10) / Decimal(90)).ln()
    counts = [(tp, 100-tp) for tp in [50, 60, 70, 80, 85, 90]]
    counts += [(10**14+i, 10**14-i) for i in range(6)]
    for tp, fn in counts:
        y = (Decimal(tp) / Decimal(fn)).ln()
        d, s = y-c, y+c
        assert abs((d-s) - (-2*c)) < Decimal('1e-58')
    # Thus D=S-2c exactly, B1=1 and 1-B1=0. SROC inversion is unidentified.
    ranks_fpr = [Decimal('3.5')]*6
    assert sum((r-Decimal('3.5'))**2 for r in ranks_fpr) == 0
    # Spearman's correlation denominator is zero, not a zero association.
    print('PASS: independent 60-digit constant-FPR identity and zero rank variance')
