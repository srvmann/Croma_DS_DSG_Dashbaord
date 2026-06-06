import numpy as np
import pandas as pd
from typing import Any


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
