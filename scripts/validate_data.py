#!/usr/bin/env python3
"""Validate report_data.json against key report invariants."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "report_data.json"
REGIONS = ["北京", "天津", "河北"]
STAGES = ["上游", "中游", "下游"]

sys.path.insert(0, str(ROOT))

from scripts.build_data import aggregate_effect_source_metadata, extract_chain_capital, extract_leading_industries, extract_survey  # noqa: E402


def near(a: float, b: float, tol: float = 0.03) -> bool:
    return abs(float(a) - float(b)) <= tol


def assert_same(actual, expected, path: str = "data") -> None:
    if isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path}: expected dict, got {type(actual).__name__}"
        assert actual.keys() == expected.keys(), f"{path}: keys differ {actual.keys()} != {expected.keys()}"
        for key in expected:
            assert_same(actual[key], expected[key], f"{path}.{key}")
        return
    if isinstance(expected, list):
        assert isinstance(actual, list), f"{path}: expected list, got {type(actual).__name__}"
        assert len(actual) == len(expected), f"{path}: length differs {len(actual)} != {len(expected)}"
        for index, item in enumerate(expected):
            assert_same(actual[index], item, f"{path}[{index}]")
        return
    if isinstance(expected, float):
        assert near(actual, expected), f"{path}: {actual} != {expected}"
        return
    assert actual == expected, f"{path}: {actual!r} != {expected!r}"


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    assert_same(data["leadingIndustries"], extract_leading_industries(), "leadingIndustries")
    assert_same(data["chainCapital"], extract_chain_capital(), "chainCapital")
    assert_same(data["survey"], extract_survey(), "survey")
    assert_same(data["aggregateChainEffects"]["sourceMeta"], aggregate_effect_source_metadata(data), "aggregateChainEffects.sourceMeta")

    output_2022 = next(row for row in data["overall"]["effects"]["output"] if row["name"] == "2022")
    assert near(output_2022["values"]["北京"], 203592.00)
    assert near(output_2022["values"]["天津"], 62737.26)
    assert near(output_2022["values"]["河北"], 140896.24)
    assert near(output_2022["values"]["总"], 407225.50)

    dynamic_beijing = next(row for row in data["overall"]["effects"]["dynamic"] if row["name"] == "北京")
    assert near(dynamic_beijing["values"]["北京"], 61.44)
    assert near(dynamic_beijing["values"]["河北"], 6.00)

    policy_tool_count = sum(item["count"] for item in data["policy"]["dimensionElements"] if item["dimension"] == "X政策工具维度")
    assert policy_tool_count == 1254
    policy_industry_count = sum(item["count"] for item in data["policy"]["dimensionElements"] if item["dimension"] == "Z产业划分维度")
    assert policy_industry_count == 312

    for chain in data["chainCapital"]:
        for region in REGIONS:
            stage_total = sum(chain["values"][region][stage] for stage in STAGES)
            reported = chain["values"][region]["地区合计"]
            assert near(stage_total, reported), f"{chain['chain']} {region} stage total mismatch: {stage_total} vs {reported}"
        for stage in [*STAGES, "地区合计"]:
            regional_total = sum(chain["values"][region][stage] for region in REGIONS)
            reported = chain["values"]["三次产业结构合计"][stage]
            assert near(regional_total, reported), f"{chain['chain']} {stage} regional total mismatch: {regional_total} vs {reported}"

    robot_issue = next(row for row in data["survey"]["innovationBarriers"] if row["issue"] == "技术方面的信息不对称")
    assert robot_issue["机器人"] == 11

    hydrogen_up = data["chainEffects"]["氢能"]["上游"]
    out_2017 = next(row for row in hydrogen_up["output"] if row["name"] == "2017")
    assert near(out_2017["values"]["总"], 3518)

    print("Data validation passed.")


if __name__ == "__main__":
    main()
