"""YAML overrides for triage. Human always wins. Fail-closed on operator error."""

from __future__ import annotations
from pathlib import Path
import yaml


_ALLOWED_KINDS = {"numerical", "non-numerical"}


def load_overrides(yaml_path: Path) -> dict[str, dict]:
    if not yaml_path.is_file():
        return {}
    try:
        data = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        raise ValueError(f"Bad YAML in {yaml_path}: {e}") from e
    if not isinstance(data, dict):
        raise ValueError(f"{yaml_path}: top-level must be a mapping")
    apps = data.get("apps") or {}
    if not isinstance(apps, dict):
        raise ValueError(f"{yaml_path}: 'apps' must be a mapping")
    out: dict[str, dict] = {}
    for key, entry in apps.items():
        if not isinstance(entry, dict):
            raise ValueError(f"{yaml_path}: apps.{key} must be a mapping")
        if "tier" in entry:
            t = entry["tier"]
            if not isinstance(t, int) or t < 1 or t > 5:
                raise ValueError(f"{yaml_path}: apps.{key}.tier must be int 1-5, got {t!r}")
        if "kind" in entry and entry["kind"] not in _ALLOWED_KINDS:
            raise ValueError(f"{yaml_path}: apps.{key}.kind must be one of {_ALLOWED_KINDS}")
        if any(k in entry for k in ("tier", "kind")) and "reason" not in entry:
            raise ValueError(f"{yaml_path}: apps.{key}: 'reason' required when setting tier or kind")
        out[key] = entry
    return out
