"""
parser.py — StoreWise XLSX parsing layer.

Domain-specific functions (Sales / Target files):
  parse_sales(filepath)          → list of store dicts with monthly revenue
  parse_targets(filepath)        → {store_id: target_float}
  get_month_columns(df)          → detect "MMM-YYYY" columns automatically
  validate_store_match(s, t)     → warn on Store_ID mismatches between files

Generic functions (used by /api/data and /api/analysis):
  get_sheets / get_sheet_data / analyze_sheet
"""

import logging
import re
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Matches "Jul-2024", "jan-2025", "DEC-2023", etc.
_MONTH_RE = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$",
    re.IGNORECASE,
)

_SALES_EXPECTED = {"Store_ID", "Store_Name", "State", "Category"}
_TARGETS_EXPECTED = {"Store_ID", "Monthly_Target"}


# ── Domain-specific ────────────────────────────────────────────────────────────


def get_month_columns(df: pd.DataFrame) -> list[str]:
    """Return column names that match the 'MMM-YYYY' pattern, preserving order."""
    return [col for col in df.columns if _MONTH_RE.match(str(col))]


def validate_store_match(
    sales_df: pd.DataFrame, target_df: pd.DataFrame
) -> list[str]:
    """Compare Store_ID sets across two DataFrames.

    Returns a (possibly empty) list of human-readable warning strings.
    Each warning is also emitted via the module logger.
    Column lookup is case-insensitive.
    """
    warnings: list[str] = []

    s_col = _find_col(sales_df, "store_id")
    t_col = _find_col(target_df, "store_id")

    if s_col is None:
        w = "Sales DataFrame has no Store_ID column — cannot validate."
        logger.warning(w)
        return [w]
    if t_col is None:
        w = "Target DataFrame has no Store_ID column — cannot validate."
        logger.warning(w)
        return [w]

    sales_ids = set(sales_df[s_col].dropna().astype(str).str.strip())
    target_ids = set(target_df[t_col].dropna().astype(str).str.strip())

    only_sales = sales_ids - target_ids
    only_targets = target_ids - sales_ids

    if only_sales:
        sample = ", ".join(sorted(only_sales)[:10])
        suffix = "…" if len(only_sales) > 10 else ""
        w = f"{len(only_sales)} store(s) in sales but not in targets: {sample}{suffix}"
        warnings.append(w)
        logger.warning(w)

    if only_targets:
        sample = ", ".join(sorted(only_targets)[:10])
        suffix = "…" if len(only_targets) > 10 else ""
        w = f"{len(only_targets)} store(s) in targets but not in sales: {sample}{suffix}"
        warnings.append(w)
        logger.warning(w)

    if not warnings:
        logger.info("Store ID validation passed — all IDs match across both files.")

    return warnings


def parse_sales(filepath: str) -> list[dict[str, Any]]:
    """Parse a Sales XLSX file.

    Expected columns (case-insensitive):
      Store_ID, Store_Name, State, Category, <MMM-YYYY> …

    Returns a list of dicts, one per row:
      {
        "store_id":     str,
        "store_name":   str,
        "state":        str,
        "category":     str,
        "monthly_sales": {"Jul-2024": 150000.0, …},
        "total_sales":  float,
      }

    Missing / non-numeric revenue cells are treated as 0.
    Rows where Store_ID is blank are skipped with a warning.
    """
    df = pd.read_excel(filepath)
    df = _strip_column_names(df)
    _warn_missing_cols(df, _SALES_EXPECTED, filepath)

    month_cols = get_month_columns(df)
    if not month_cols:
        logger.warning("No month columns (MMM-YYYY) detected in: %s", filepath)

    # Coerce all revenue columns to numeric; missing → 0
    for col in month_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # Resolve field columns case-insensitively
    c_id = _find_col(df, "store_id")
    c_name = _find_col(df, "store_name")
    c_state = _find_col(df, "state")
    c_cat = _find_col(df, "category")

    records: list[dict[str, Any]] = []
    skipped = 0

    for _, row in df.iterrows():
        raw_id = str(row[c_id]).strip() if c_id else ""
        if not raw_id or raw_id.lower() == "nan":
            skipped += 1
            continue

        monthly: dict[str, float] = {col: float(row[col]) for col in month_cols}
        records.append(
            {
                "store_id": raw_id,
                "store_name": _str(row, c_name),
                "state": _str(row, c_state),
                "category": _str(row, c_cat),
                "monthly_sales": monthly,
                "total_sales": round(sum(monthly.values()), 2),
            }
        )

    if skipped:
        logger.warning("Skipped %d row(s) with blank Store_ID in: %s", skipped, filepath)

    return records


def parse_targets(filepath: str) -> dict[str, float]:
    """Parse a Targets XLSX file.

    Expected columns (case-insensitive): Store_ID, Monthly_Target.

    Returns {store_id_str: target_float}.
    Missing target values are treated as 0.
    Duplicate Store_IDs trigger a warning; last row wins.
    """
    df = pd.read_excel(filepath)
    df = _strip_column_names(df)
    _warn_missing_cols(df, _TARGETS_EXPECTED, filepath)

    c_id = _find_col(df, "store_id")
    c_target = _find_col(df, "monthly_target")

    if c_id is None:
        logger.error("Store_ID column not found in targets file: %s", filepath)
        return {}

    if c_target is not None:
        df[c_target] = pd.to_numeric(df[c_target], errors="coerce").fillna(0)

    # Drop rows without a Store_ID
    df = df[df[c_id].notna()].copy()
    df[c_id] = df[c_id].astype(str).str.strip()
    df = df[df[c_id].str.lower() != "nan"]

    # Warn on duplicates
    dupes = df[df.duplicated(subset=[c_id], keep=False)][c_id].unique()
    if len(dupes):
        logger.warning(
            "Duplicate Store_IDs in targets file (last row kept): %s",
            list(dupes)[:10],
        )

    result: dict[str, float] = {}
    for _, row in df.iterrows():
        sid = str(row[c_id])
        target = float(row[c_target]) if c_target else 0.0
        result[sid] = target

    return result


# ── Generic (used by /api/data and /api/analysis) ─────────────────────────────


def get_sheets(file_path: str) -> list[str]:
    xl = pd.ExcelFile(file_path)
    return xl.sheet_names  # type: ignore[return-value]


def get_sheet_data(file_path: str, sheet_name: str) -> dict[str, Any]:
    df = pd.read_excel(file_path, sheet_name=sheet_name)
    df = _clean(df)
    return {
        "columns": df.columns.tolist(),
        "rows": df.to_dict(orient="records"),
        "shape": {"rows": len(df), "columns": len(df.columns)},
    }


def analyze_sheet(file_path: str, sheet_name: str) -> dict[str, Any]:
    df = pd.read_excel(file_path, sheet_name=sheet_name)
    df = _clean(df)

    numeric_cols: list[str] = df.select_dtypes(include="number").columns.tolist()
    categorical_cols: list[str] = df.select_dtypes(
        include=["object", "category"]
    ).columns.tolist()

    kpis: dict[str, Any] = {}
    for col in numeric_cols[:5]:
        kpis[col] = {
            "sum": _safe_float(df[col].sum()),
            "mean": _safe_float(df[col].mean()),
            "min": _safe_float(df[col].min()),
            "max": _safe_float(df[col].max()),
        }

    bar_charts: list[dict[str, Any]] = []
    for cat_col in categorical_cols[:3]:
        for num_col in numeric_cols[:2]:
            grp = (
                df.groupby(cat_col)[num_col]
                .sum()
                .reset_index()
                .sort_values(num_col, ascending=False)
                .head(20)
            )
            bar_charts.append(
                {
                    "title": f"{num_col} by {cat_col}",
                    "x": [str(v) for v in grp[cat_col].tolist()],
                    "y": [_safe_float(v) for v in grp[num_col].tolist()],
                    "x_label": cat_col,
                    "y_label": num_col,
                }
            )

    distributions: list[dict[str, Any]] = []
    for col in numeric_cols[:5]:
        vals = df[col].dropna().tolist()
        distributions.append(
            {
                "title": f"Distribution of {col}",
                "column": col,
                "data": [_safe_float(v) for v in vals[:2000]],
            }
        )

    return {
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
        "shape": {"rows": len(df), "columns": len(df.columns)},
        "kpis": kpis,
        "bar_charts": bar_charts,
        "distributions": distributions,
    }


# ── Private helpers ────────────────────────────────────────────────────────────


def _strip_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """Strip leading/trailing whitespace from every column name."""
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _find_col(df: pd.DataFrame, name_lower: str) -> str | None:
    """Return the first column whose stripped, lowercased name matches name_lower."""
    for col in df.columns:
        if str(col).strip().lower() == name_lower:
            return col
    return None


def _warn_missing_cols(
    df: pd.DataFrame, expected: set[str], filepath: str
) -> None:
    existing_lower = {str(c).strip().lower() for c in df.columns}
    for col in sorted(expected):
        if col.lower() not in existing_lower:
            logger.warning("Expected column '%s' not found in: %s", col, filepath)


def _str(row: "pd.Series[Any]", col: str | None) -> str:
    if col is None:
        return ""
    val = row.get(col, "")
    return "" if pd.isna(val) else str(val).strip()


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df = df.where(pd.notna(df), other=None)
    return df


def _safe_float(value: Any) -> float:
    try:
        f = float(value)
        return 0.0 if np.isnan(f) or np.isinf(f) else f
    except (TypeError, ValueError):
        return 0.0
