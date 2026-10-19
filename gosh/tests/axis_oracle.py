"""Independent oracle for documented SVG bounds, omission and endpoint snapping."""
import math
import sys


def coordinates(points, requested):
    lo = min(p['mu'] for p in points)
    hi = max(p['mu'] for p in points)
    scale = max(abs(lo), abs(hi))
    pad = max(max((hi / scale - lo / scale) * .1, 8 * sys.float_info.epsilon) * scale,
              math.ulp(0.0)) if scale else .1
    bounds = {'x': [max(-sys.float_info.max, lo-pad), min(sys.float_info.max, hi+pad)],
              'y': [0, 100]}
    for axis, limits in requested.items():
        bounds[axis] = [default if value is None else value
                        for default, value in zip(bounds[axis], limits)]

    def fraction(value, axis):
        low, high = bounds[axis]
        assert math.isfinite(low) and math.isfinite(high) and low < high
        eps = 8 * sys.float_info.epsilon * max(1, abs(low), abs(high))
        if not math.isfinite(value) or value < low-eps or value > high+eps:
            return None
        dl, dh = abs(value-low), abs(value-high)
        if min(dl, dh) <= eps:
            value = low if dl <= dh else high
        scale = max(abs(low), abs(high))
        return (value/scale-low/scale)/(high/scale-low/scale)

    result = []
    for point in points:
        x, y = fraction(point['mu'], 'x'), fraction(point['I2'], 'y')
        if x is not None and y is not None:
            result.append([60+520*x, 20+350*(1-y)])
    return result
