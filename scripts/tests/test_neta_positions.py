import pytest

from scripts.etl.neta_positions import (
    ReportRef,
    build_family_draft,
    compare_equipment,
    confusion_distance,
    family_key,
    is_excluded_report,
    parse_position,
    resolve_position,
    snap_position,
)


@pytest.mark.parametrize(("equipment_id", "expected"), [
    ("IAD06-MDS6-01D", "MDS6|A-F"),
    ("IAD06-MDS6-01R", "MDS6|R"),
    ("IAD06-PDU6-01D-2", "PDU6|A-F|sub"),
    ("IAD06-CDS6-01R-2", "CDS6|R|sub"),
    ("IAD06-ATS-TX-HTP6-01A", "ATS-TX-HTP6|A-F"),
    ("IAD06-UTILITY6-03", "UTILITY6|-"),
    ("IAD06-RP6-H1-1-1", "RP6|H1"),
])
def test_family_key(equipment_id: str, expected: str) -> None:
    assert family_key(equipment_id) == expected


@pytest.mark.parametrize(("name", "equipment_id", "key"), [
    ("MDS6-01D-CDS-PRICFAILED).pdf", "IAD06-MDS6-01D", "CDS-PRI"),
    ("MDS6-01D-MCB2 PRIFAILED).pdf", "IAD06-MDS6-01D", "MCB2-PRI"),
    ("MDS6-01A-MCB1 MAIN-PRI.pdf", "IAD06-MDS6-01A", "MCB1-PRI"),
    ("MDS6-01A-MCB1-PRI.pdf", "IAD06-MDS6-01A", "MCB1-PRI"),
    ("MDS6-01A-MCB1 PRI.pdf", "IAD06-MDS6-01A", "MCB1-PRI"),
    ("IAD06-MDS6-01D-FCB06-PRI.pdf", "IAD06-MDS6-01D", "FB6-PRI"),
    ("MDS6-01B-FCBO9-SEC.pdf", "IAD06-MDS6-01B", "FB9-SEC"),
    ("MDS6-01D-PQM1-CT01 A PHASE.pdf", "IAD06-MDS6-01D", "PQM1-CT01-A"),
    ("MDS1-01E-PQM1-CT01 A PHASE.pdf", "IAD06-MDS6-01E", "PQM1-CT01-A"),
    ("IAD06-PDU6-01D-4-FB5 PRI.pdf", "IAD06-PDU6-01D-4", "FB5-PRI"),
    ("IAD06-PDU6-01D-2-52-MCB01 PRI INJ.pdf", "IAD06-PDU6-01D-2", "MCB1-PRI"),
    ("IAD06-PDU6-PDU-01D-2 CT-P B P H A S E.pdf", "IAD06-PDU6-01D-2", "CT-P-B"),
    ("IAD06-PDU6-01D-4-CT-P-APHASE.EZCT.pdf", "IAD06-PDU6-01D-4", "CT-P-A"),
    ("IAD06-PDU6-01D-4-CT-MG.EZCT.pdf", "IAD06-PDU6-01D-4", "CT-S-MG"),
    ("PDU6-01F2-CT-S MG.pdf", "IAD06-PDU6-01F-2", "CT-S-MG"),
    ("IAD06-TX-PDU6-01D-2.pdf", "IAD06-PDU6-01D-2", "TX"),
    ("IAD06-PDU6-01D-2.pdf", "IAD06-PDU6-01D-2", "EQUIPMENT"),
    ("TX-CUPP6-01F-01.pdf", "IAD06-TX-CUPP6-01F-1", "EQUIPMENT"),
    ("IAD06-PDU6-01A-1-PM__2.pdf", "IAD06-PDU6-01A-1", "PM"),
    ("TAG UTILITY6-02-WAY4-RLY3.pdf", "IAD06-UTILITY6-02", "WAY4-RLY3"),
    ("IADO6-GEN6-H1-MCCB.pdf", "IAD06-GEN6-H1", "MCCB"),
    ("MSD6-02R-PQM1-CT01 A PHASE.pdf", "IAD06-MDS6-02R", "PQM1-CT01-A"),
])
def test_parse_position_normalizes_variants(name: str, equipment_id: str, key: str) -> None:
    parsed = parse_position(name, equipment_id)
    assert parsed.key == key
    assert parsed.confidence != "needs_review"


def test_asset_naming_another_equipment_is_flagged_not_reassigned() -> None:
    parsed = parse_position("IAD06-PDU6-01D-4-FCB-F5 PRI INJ.pdf", "IAD06-PDU6-01D-2")
    assert parsed.key == "FB5-PRI"
    assert "asset_equipment_conflict" in parsed.flags
    assert parsed.referenced_equipment == "01D-4"


@pytest.mark.parametrize(("name", "equipment_id"), [
    ("RUNTEST.pdf", "IAD06-PDU6-01A-1"),
    ("PDU6-0 E-6 CT-P C PHA S E.pdf", "IAD06-PDU6-03E-6"),
    ("PDU6-01A-6-CT-S- PHA S E.pdf", "IAD06-PDU6-01A-6"),
    ("MDS6-01.pdf", "IAD06-MDS6-01B"),
    ("FD04-UTILITY6-01.pdf", "IAD06-TX6-01A"),
])
def test_unparseable_names_need_review_instead_of_guessing(name: str, equipment_id: str) -> None:
    assert parse_position(name, equipment_id).confidence == "needs_review"


def test_cable_and_cross_equipment_reports_are_excluded() -> None:
    assert is_excluded_report("FDR-IAD06-MDS6-01D-IAD06-CDS6-01D.pdf")
    assert is_excluded_report("ATR-LV-Cable- REMARK.pdf")
    assert is_excluded_report("CB GEN6-01D-MDS6-01D-GEN6.pdf")
    assert is_excluded_report("FD01-TX6-01B.pdf", "LV_CABLE")
    assert not is_excluded_report("MDS6-01D-CDS-PRI.pdf", "ASSET")


def test_snap_only_accepts_unique_confusable_match() -> None:
    assert confusion_distance("FB6-PRI", "FB6-PRI") == 0
    assert snap_position("CDS-PR1", ["CDS-PRI", "CDS-SEC"]) == "CDS-PRI"
    assert snap_position("FB5-PRI", ["FB6-PRI", "FB7-PRI"]) is None
    assert snap_position("MCB1", ["MCB1-PRI"]) is None


def test_draft_uses_majority_of_complete_members() -> None:
    draft = build_family_draft({
        "A": {"X", "Y"}, "B": {"X", "Y"}, "C": {"X", "Z"},
    })
    assert draft["status"] == "draft"
    assert draft["positions"] == ["X", "Y"]
    assert draft["support"] == {"X": 3, "Y": 2, "Z": 1}
    assert build_family_draft({"A": {"X"}, "B": {"Y"}})["status"] == "needs_decision"
    assert build_family_draft({"A": {"X"}})["status"] == "insufficient"


def _ref(status: str, date: str | None = None, key: str = "K") -> ReportRef:
    return ReportRef(f"{key}-{status}-{date}.pdf", key, "exact", status, date)


def test_retest_rules_follow_test_dates() -> None:
    assert resolve_position([_ref("FAILED"), _ref("PASSED")])[0] == "retest_unordered"
    assert resolve_position([_ref("FAILED", "2026-11-10"), _ref("PASSED", "2026-11-10")])[0] == "failed_only"
    result, notes = resolve_position([_ref("FAILED", "2026-11-10"), _ref("PASSED", "2026-11-11")])
    assert (result, notes) == ("pass", ["superseded_fail"])
    assert resolve_position([_ref("FAILED", "2026-11-12"), _ref("PASSED", "2026-11-11")])[0] == "failed_only"
    assert resolve_position([])[0] == "missing"
    assert resolve_position([_ref("REVIEW_REQUIRED")])[0] == "result_pending"
    assert resolve_position([_ref("PASSED"), _ref("PASSED")]) == ("pass", ["duplicate"])


def test_compare_mds6_01d_case() -> None:
    baseline = [{"key": key} for key in ("CDS-PRI", "CDS-SEC", "MCB2-PRI", "MBB-PRI")]
    reports = [
        _ref("FAILED", key="CDS-PRI"),
        _ref("FAILED", key="MCB2-PRI"),
        _ref("PASSED", key="MCB2-PRI"),
        _ref("PASSED", key="MBB-PRI"),
        _ref("PASSED", key="EXTRA-1"),
        ReportRef("odd.pdf", "RUNTEST", "needs_review", "PASSED"),
    ]
    result = compare_equipment(reports, baseline)
    results = {position["key"]: position["result"] for position in result["positions"]}
    assert results == {"CDS-PRI": "failed_only", "CDS-SEC": "missing",
                       "MCB2-PRI": "retest_unordered", "MBB-PRI": "pass"}
    assert result["nonconforming"] is True
    assert result["extra_reports"] == [{"file": "EXTRA-1-PASSED-None.pdf", "key": "EXTRA-1"}]
    assert result["needs_review_reports"] == [{"file": "odd.pdf", "key": "RUNTEST"}]


def test_compare_honours_aliases_waivers_and_optional() -> None:
    baseline = [
        {"key": "FB5-PRI", "aliases": ["F5-PRI"]},
        {"key": "PM", "optional": True},
        {"key": "TX"},
    ]
    result = compare_equipment([_ref("PASSED", key="F5-PRI")], baseline, waived=["TX"])
    results = {position["key"]: position["result"] for position in result["positions"]}
    assert results == {"FB5-PRI": "pass", "PM": "optional_missing", "TX": "waived"}
    assert result["nonconforming"] is False


def test_vote_treats_asset_typo_as_conflict_not_reassignment() -> None:
    from scripts.etl.neta_positions import vote_equipment
    fields = {"asset": "IAD06-PDU6-01D-4-FCB-F5 PRI INJ", "substation": "IAD06-PDU6-01D-2",
              "equipment_id_field": "IAD06-PDU6-01D-2-FCB-F5"}
    vote = vote_equipment(fields, "IAD06-PDU6-01D-2")
    assert vote["votes"] == {"asset": "01D-4", "substation": "agree", "equipment_id_field": "agree"}
    assert vote["asset_equipment_conflict"] is True and vote["belongs_elsewhere"] is None
    # MDS forms name the substation after the UPS lineup; the number still agrees.
    assert vote_equipment({"substation": "IAD06-UPSE-01B", "asset": "MDS6-01B-CDS-PRI"},
                          "IAD06-MDS6-01B")["votes"] == {"asset": "agree", "substation": "agree"}
    other = vote_equipment({"asset": "PDU6-01D-4-PM", "substation": "PDU6-01D-4", "equipment_id_field": "PDU6-01D-4"},
                           "IAD06-PDU6-01D-2")
    assert other["belongs_elsewhere"] == "01D-4" and other["asset_equipment_conflict"] is False


def test_suggested_gc_name_fixes_only_the_wrong_equipment_number() -> None:
    from scripts.etl.neta_positions import suggested_gc_name
    assert suggested_gc_name("IAD06-PDU6-01D-4-FCB-F5 PRI INJ", "IAD06-PDU6-01D-2", "01D-4") == \
        "IAD06-PDU6-01D-2-FCB-F5 PRI INJ.pdf"
    assert suggested_gc_name("MDS6-01B-PQM1-CT01 A PHASE", "IAD06-MDS6-01B", None) == "MDS6-01B-PQM1-CT01 A PHASE.pdf"
    assert suggested_gc_name("A/B: C", "IAD06-MDS6-01B", None) == "A-B_ C.pdf"


def test_position_source_prefers_asset_and_strips_ct_extensions() -> None:
    from scripts.etl.neta_positions import position_source
    assert position_source({"asset": "N/A", "filename": "X-CT-P-APHASE.ezct"}) == ("filename", "X-CT-P-APHASE")
    assert position_source({"filename": "PDU6-01D-2 CT-P B PHASE.testMFR: ACCU"}) == ("filename", "PDU6-01D-2 CT-P B PHASE")
    assert position_source({"asset": "MDS6-01B-PQM1"}) == ("asset", "MDS6-01B-PQM1")
    assert position_source({}) is None


def test_duplicate_pass_with_different_serials_is_suspicious() -> None:
    same = [ReportRef("a", "K", "exact", "PASSED", None, "SN1"), ReportRef("b", "K", "exact", "PASSED", None, "sn 1")]
    different = [ReportRef("a", "K", "exact", "PASSED", None, "SN1"), ReportRef("b", "K", "exact", "PASSED", None, "SN2")]
    unknown = [ReportRef("a", "K", "exact", "PASSED", None, "N/A"), ReportRef("b", "K", "exact", "PASSED", None, None)]
    assert resolve_position(same) == ("pass", ["duplicate"])
    assert resolve_position(different) == ("pass", ["duplicate_different_sn"])
    assert resolve_position(unknown) == ("pass", ["duplicate"])


def test_fail_notes_explain_which_retest_rule_applied() -> None:
    assert resolve_position([_ref("FAILED", "2026-11-10"), _ref("PASSED", "2026-11-10")]) == ("failed_only", ["same_day_fail"])
    assert resolve_position([_ref("FAILED", "2026-11-12"), _ref("PASSED", "2026-11-11")]) == ("failed_only", ["fail_after_pass"])
