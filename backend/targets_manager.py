"""
targets_manager.py — per-month target file management.

Directory layout:
  data/targets/           ← uploaded target xlsx files (one per month)
  data/archive/           ← archived copies
  data/targets_active.json← {"active_month": "Jul-2025"} or {"active_month": null}

When a month is set Active, its xlsx is also copied to data/targets.xlsx so
the existing /api/data endpoint continues to work unchanged.
"""

import json
import logging
import os
import re
import shutil
from datetime import datetime
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

_MONTH_RE = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$",
    re.IGNORECASE,
)

_MONTH_ORDER = {
    m: i for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun",
         "jul", "aug", "sep", "oct", "nov", "dec"]
    )
}

DATA_DIR    = os.path.join(os.path.dirname(__file__), "data")
TARGETS_DIR = os.path.join(DATA_DIR, "targets")
ARCHIVE_DIR = os.path.join(DATA_DIR, "archive")
ACTIVE_JSON = os.path.join(DATA_DIR, "targets_active.json")
ACTIVE_XLSX = os.path.join(DATA_DIR, "targets.xlsx")  # read by /api/data


# ── Internal helpers ───────────────────────────────────────────────────────────


def _ensure_dirs() -> None:
    os.makedirs(TARGETS_DIR, exist_ok=True)
    os.makedirs(ARCHIVE_DIR, exist_ok=True)


def _active_month() -> str | None:
    if not os.path.exists(ACTIVE_JSON):
        return None
    try:
        with open(ACTIVE_JSON) as f:
            return json.load(f).get("active_month") or None
    except Exception:
        return None


def _write_active_json(month: str | None) -> None:
    with open(ACTIVE_JSON, "w") as f:
        json.dump({"active_month": month}, f)


def _targets_path(month_label: str) -> str:
    return os.path.join(TARGETS_DIR, f"targets_{month_label}.xlsx")


def _archive_path(month_label: str) -> str:
    return os.path.join(ARCHIVE_DIR, f"targets_{month_label}.xlsx")


def _count_stores(filepath: str) -> int:
    try:
        df = pd.read_excel(filepath)
        for col in df.columns:
            if str(col).strip().lower() == "store_id":
                return int(df[col].dropna().shape[0])
        return 0
    except Exception:
        return 0


def _file_meta(path: str, month_label: str, status: str) -> dict[str, Any]:
    stat = os.stat(path)
    return {
        "month":         month_label,
        "filename":      os.path.basename(path),
        "store_count":   _count_stores(path),
        "uploaded_at":   datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        "file_size_kb":  round(stat.st_size / 1024, 1),
        "status":        status,
    }


def _month_sort_key(month_label: str) -> tuple[int, int]:
    parts = month_label.split("-")
    if len(parts) != 2:
        return (9999, 99)
    name, year = parts
    return (int(year) if year.isdigit() else 9999,
            _MONTH_ORDER.get(name.lower(), 99))


# ── Public API ─────────────────────────────────────────────────────────────────


def validate_month(month_label: str) -> bool:
    return bool(_MONTH_RE.match(month_label.strip()))


def save_target(file_content: bytes, month_label: str) -> dict[str, Any]:
    """Save uploaded bytes as targets_{month_label}.xlsx. Returns metadata."""
    _ensure_dirs()
    dest = _targets_path(month_label)
    with open(dest, "wb") as f:
        f.write(file_content)
    active = _active_month()
    # If this overwrites the currently active month, refresh the live copy too
    if active == month_label:
        shutil.copy2(dest, ACTIVE_XLSX)
    status = "active" if active == month_label else "inactive"
    return _file_meta(dest, month_label, status)


def list_targets() -> list[dict[str, Any]]:
    """Return all managed target files sorted newest month first."""
    _ensure_dirs()
    active = _active_month()
    results: list[dict[str, Any]] = []

    for fname in os.listdir(TARGETS_DIR):
        if not fname.endswith(".xlsx") or not fname.startswith("targets_"):
            continue
        stem = fname[len("targets_"):-len(".xlsx")]
        if not validate_month(stem):
            continue
        path = os.path.join(TARGETS_DIR, fname)
        results.append(_file_meta(path, stem, "active" if active == stem else "inactive"))

    for fname in os.listdir(ARCHIVE_DIR):
        if not fname.endswith(".xlsx") or not fname.startswith("targets_"):
            continue
        stem = fname[len("targets_"):-len(".xlsx")]
        if not validate_month(stem):
            continue
        results.append(_file_meta(os.path.join(ARCHIVE_DIR, fname), stem, "archived"))

    results.sort(key=lambda r: _month_sort_key(r["month"]), reverse=True)
    return results


def set_active(month_label: str) -> dict[str, Any]:
    """Make month_label the active target. Copies it to data/targets.xlsx."""
    _ensure_dirs()
    src = _targets_path(month_label)
    if not os.path.exists(src):
        raise FileNotFoundError(f"No target file for month '{month_label}'")
    shutil.copy2(src, ACTIVE_XLSX)
    _write_active_json(month_label)
    return _file_meta(src, month_label, "active")


def archive_target(month_label: str) -> dict[str, Any]:
    """Move month_label from targets/ to archive/. Clears active if needed."""
    _ensure_dirs()
    src = _targets_path(month_label)
    if not os.path.exists(src):
        raise FileNotFoundError(f"No target file for month '{month_label}'")
    dest = _archive_path(month_label)
    shutil.move(src, dest)
    if _active_month() == month_label:
        _write_active_json(None)
        if os.path.exists(ACTIVE_XLSX):
            os.remove(ACTIVE_XLSX)
    return _file_meta(dest, month_label, "archived")
