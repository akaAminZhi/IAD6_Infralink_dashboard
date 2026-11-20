"""Pure helpers for NETA report test-position parsing, grouping and comparison.

A *position* is one tested location on an equipment (``FB5-PRI``,
``CT-P-A``, ``MCB1-SEC``). Each GC report name (or, when the Tracker has
extracted it, the PDF ASSET field) is reduced to a canonical position key so
that equipment in the same family can be compared against a position baseline.

The helpers never invent PRI/SEC or numbers: anything that cannot be parsed
cleanly is marked ``needs_review`` instead of being guessed.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
import re
from typing import Any, Iterable, Literal, Mapping


PositionConfidence = Literal["exact", "normalized", "alias", "snapped", "needs_review"]
ReviewStatus = Literal["PASSED", "FAILED", "REVIEW_REQUIRED", "ERROR"]

EQUIPMENT_KEY = "EQUIPMENT"
PROJECT_PREFIX = re.compile(r"^IAD[0O]?6-")
EXCLUDED_NAME = re.compile(r"^(?:FDR|ATR)(?:\b|[-_\s\d])|^CB\s", re.IGNORECASE)
EXCLUDED_PARSED_SOURCES = {"LV_CABLE", "MV_CABLE"}
DEVICE_ID = re.compile(
    r"^(?P<base>.+?)-(?P<num>\d{2})(?P<lineup>[A-Z])?(?:-(?P<sub>\d{1,2}))?$"
)
DEVICE_TOKEN = re.compile(
    r"(?<![A-Z0-9])(?P<num>\d{2})(?P<lineup>[A-Z])?(?:-?\s?(?P<sub>\d{1,2}))?(?![0-9A-Z])"
)
SPACED_WORDS = {
    "PHASE": re.compile(r"P\s?H\s?A\s?S\s?E"),
    "RETEST": re.compile(r"R\s?E\s?T\s?E\s?S\s?T"),
    "TRANSFORM": re.compile(r"T\s?R\s?A\s?N\s?S\s?F\s?O\s?R\s?M"),
}
SPACED_RUN = re.compile(r"(?<![A-Z0-9])(?:[A-Z] ){3,}[A-Z](?![A-Z0-9])")
FAILED_SUFFIX = re.compile(r"\s*(?:\(|C(?=FAIL(?:ED)?\)))?FAIL(?:ED)?\)?")
RETEST_SUFFIX = re.compile(r"[\s-]*RETEST(?:[\s-]*\d)*")
COPY_SUFFIX = re.compile(r"__(\d+)$")
DIGIT_FIX = str.maketrans({"O": "0", "I": "1", "L": "1", "S": "5", "Z": "2", "B": "8", "G": "6"})
# Canonical spellings that are known to describe the same location everywhere.
BUILTIN_ALIASES = {"CT-MG": "CT-S-MG"}


@dataclass(frozen=True, slots=True)
class DeviceRef:
    base: str
    num: str | None
    lineup: str | None
    sub: str | None

    @property
    def short_id(self) -> str:
        if self.num is None:
            return self.base
        return f"{self.base}-{self.num}{self.lineup or ''}" + (f"-{self.sub}" if self.sub else "")


@dataclass(slots=True)
class PositionParse:
    key: str
    confidence: PositionConfidence
    form: Literal["ct", "report"]
    flags: list[str] = field(default_factory=list)
    referenced_equipment: str | None = None
    raw_name: str = ""


def short_equipment_id(equipment_id: str) -> str:
    return PROJECT_PREFIX.sub("", equipment_id.strip().upper())


def parse_device_id(equipment_id: str) -> DeviceRef:
    short = short_equipment_id(equipment_id)
    match = DEVICE_ID.match(short)
    if match is None:
        return DeviceRef(short, None, None, None)
    return DeviceRef(match["base"], match["num"], match["lineup"], match["sub"])


def family_key(equipment_id: str) -> str:
    """``MDS6|A-F``, ``MDS6|R``, ``PDU6|A-F|sub``, ``RP6|H1``, ``UTILITY6|-``."""
    device = parse_device_id(equipment_id)
    if device.num is None:
        h_match = re.match(r"^(?P<base>.+?)-(?P<site>H\d+)(?:-[\dA-Z]+)*$", device.base)
        if h_match:
            return f"{h_match['base']}|{h_match['site']}"
        return f"{device.base}|-"
    lineup = "-" if device.lineup is None else ("R" if device.lineup == "R" else "A-F")
    return f"{device.base}|{lineup}" + ("|sub" if device.sub else "")


def is_excluded_report(name: str, parsed_source: str | None = None) -> bool:
    """Cable and cross-equipment reports belong to cables/other equipment."""
    if (parsed_source or "").strip().upper() in EXCLUDED_PARSED_SOURCES:
        return True
    return bool(EXCLUDED_NAME.match(name.strip()))


def _family_letters(device: DeviceRef) -> set[str]:
    return {re.sub(r"[^A-Z]", "", part) for part in device.base.split("-") if part}


def _canonical_breaker(match: re.Match[str], prefix: str) -> str:
    digits = match.group(1).translate(DIGIT_FIX)
    return f"{prefix}{int(digits)}" if digits.isdigit() else match.group(0)


def normalize_position_text(text: str) -> tuple[str, list[str]]:
    """Canonicalize the position part of a name (device id already removed)."""
    flags: list[str] = []
    value = text.upper()
    for word, pattern in SPACED_WORDS.items():
        if pattern.search(value) and word not in value:
            flags.append("spaced_letters")
        value = pattern.sub(word, value)
    if SPACED_RUN.search(value):
        flags.append("spaced_letters")
        value = SPACED_RUN.sub(lambda m: m.group(0).replace(" ", ""), value)
    if FAILED_SUFFIX.search(value):
        flags.append("failed_suffix")
        value = FAILED_SUFFIX.sub("", value)
    if RETEST_SUFFIX.search(value):
        flags.append("retest_suffix")
        value = RETEST_SUFFIX.sub("", value)
    value = re.sub(r"[\s-]+INJ\b", "", value)
    value = re.sub(r"^[\s-]*52-", "", value)
    value = re.sub(r"\s*-?\s*([ABCG])\s*-?\s*PHASE\b", r"-\1", value)
    value = re.sub(r"(?<![A-Z0-9])MCB0*([1-9OIS]\d*)(?:[\s-]*MAIN)?", lambda m: _canonical_breaker(m, "MCB"), value)
    value = re.sub(r"(?<![A-Z0-9])FC?B-?F?([0-9OIS]{1,2})(?![0-9])", lambda m: _canonical_breaker(m, "FB"), value)
    value = re.sub(r"(?<![A-Z0-9])CT0*([0-9OIS])(?![0-9])", lambda m: "CT0" + m.group(1).translate(DIGIT_FIX), value)
    value = re.sub(r"(?<![A-Z0-9])CT[\s-]+([PS]|MG)(?![A-Z])", r"CT-\1", value)
    value = re.sub(r"WAY\s+(\d)", r"WAY\1", value)
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    value = BUILTIN_ALIASES.get(value, value)
    return value, flags


def _clean_name(name: str) -> tuple[str, list[str], bool]:
    flags: list[str] = []
    value = name.strip()
    if value.lower().endswith(".pdf"):
        value = value[:-4]
    value = value.upper()
    ezct = False
    if value.endswith(".EZCT"):
        ezct = True
        value = value[:-5]
    copy = COPY_SUFFIX.search(value)
    if copy:
        flags.append("copy_suffix")
        value = value[: copy.start()]
    value = re.sub(r"\bTAG\s+", "", value)
    return value, flags, ezct


def parse_position(report_name: str, equipment_id: str) -> PositionParse:
    """Reduce a report name or ASSET value to a canonical position key."""
    device = parse_device_id(equipment_id)
    value, flags, ezct = _clean_name(report_name)
    for word, pattern in SPACED_WORDS.items():  # before device detection: "P H A S E"
        value = pattern.sub(word, value)
    own = device.short_id
    referenced: str | None = None
    start = value.find(own)
    if start >= 0 and not re.match(r"[0-9]", value[start + len(own): start + len(own) + 1]):
        pre, rest = value[:start], value[start + len(own):]
    else:
        token = DEVICE_TOKEN.search(value)
        if token is None or device.num is None:
            key, more = normalize_position_text(value)
            return PositionParse(key or value, "needs_review", "ct" if ezct or "CT" in key else "report",
                                 [*flags, *more, "device_not_found"], raw_name=report_name)
        pre, rest = value[: token.start()], value[token.end():]
        found = (token["num"], token["lineup"], str(int(token["sub"])) if token["sub"] else None)
        if found != (device.num, device.lineup, device.sub):
            if found[0] == device.num and (
                (found[1] is None and found[2] is None)
                or (found[1] == device.lineup and found[2] is None)
            ):
                flags.append("device_partial")
            else:
                flags.append("asset_equipment_conflict")
                referenced = f"{token['num']}{token['lineup'] or ''}" + (f"-{token['sub']}" if token["sub"] else "")
        else:
            flags.append("device_variant")
    family_letters = _family_letters(device)
    pre_tokens = []
    for part in re.split(r"-", re.sub(r"\s+", "", PROJECT_PREFIX.sub("", pre))):
        if not part or re.fullmatch(r"IAD[0O]?6", part):
            continue
        letters = re.sub(r"[^A-Z]", "", part)
        # Same letters in another order is a typo of the family ("MSD6" for MDS6).
        if letters in family_letters or sorted(letters) in [sorted(item) for item in family_letters]:
            continue
        if re.search(r"[A-Z]+0?6$", part) and letters not in {"TX"} and not re.fullmatch(r"FD\d+", part):
            flags.append("references_other_equipment")
            continue
        pre_tokens.append(part)
    rest_key, more = normalize_position_text(rest)
    flags.extend(more)
    key = "-".join(token for token in [*pre_tokens, rest_key] if token) or EQUIPMENT_KEY
    key = BUILTIN_ALIASES.get(key, key)
    form: Literal["ct", "report"] = "ct" if ezct or re.search(r"(?:^|-)CT(?:\d|-|$)", key) else "report"
    if any(flag in flags for flag in ("device_partial", "references_other_equipment")) or "PHASE" in key:
        confidence: PositionConfidence = "needs_review"
    elif {"spaced_letters", "device_variant"} & set(flags) or key != rest.strip(" -"):
        confidence = "normalized"
    else:
        confidence = "exact"
    return PositionParse(key, confidence, form, list(dict.fromkeys(flags)), referenced, report_name)


# --- PDF header fields ------------------------------------------------------

VOTE_FIELDS = ("asset", "substation", "equipment_id_field", "station", "special_id", "designation", "filename")
POSITION_SOURCE_FIELDS = ("asset", "filename", "designation")


def device_token(value: str) -> tuple[str, str | None, str | None] | None:
    """First ``NN[L][-N]`` equipment number token in a field value."""
    text = PROJECT_PREFIX.sub("", value.upper().replace(" ", "-"))
    match = DEVICE_TOKEN.search(text)
    if match is None:
        return None
    return match["num"], match["lineup"], str(int(match["sub"])) if match["sub"] else None


def _token_text(token: tuple[str, str | None, str | None]) -> str:
    return f"{token[0]}{token[1] or ''}" + (f"-{token[2]}" if token[2] else "")


def vote_equipment(fields: Mapping[str, Any], equipment_id: str) -> dict[str, Any]:
    """Majority of header fields decides which equipment a report belongs to.

    A partial token (``01B`` for ``PDU6-01B-3``) supports the folder equipment
    without contradicting it. ASSET disagreeing with the majority is a typo
    (``asset_equipment_conflict``); a majority against the folder means the
    report belongs elsewhere.
    """
    device = parse_device_id(equipment_id)
    own = (device.num, device.lineup, device.sub)
    votes: dict[str, str] = {}
    agree = disagree = 0
    others: Counter[str] = Counter()
    for name in VOTE_FIELDS:
        value = str(fields.get(name) or "")
        token = device_token(value) if value else None
        if token is None or device.num is None:
            continue
        if token == own or (token[0] == own[0] and token[1] in {None, own[1]} and token[2] is None):
            votes[name] = "agree"
            agree += 1
        else:
            votes[name] = _token_text(token)
            disagree += 1
            others[_token_text(token)] += 1
    asset_vote = votes.get("asset")
    asset_conflict = asset_vote not in {None, "agree"} and agree > disagree
    belongs_elsewhere = disagree > agree and disagree >= 2
    return {
        "votes": votes,
        "asset_equipment_conflict": asset_conflict,
        "belongs_elsewhere": others.most_common(1)[0][0] if belongs_elsewhere else None,
    }


GLUED_FIELD_TAIL = re.compile(
    r"\.\s*(?:T\s*E\s*S\s*T|E\s*Z\s*C\s*T)\b.*$|\.?\s*(?:T\s*E\s*S\s*T)?(?:MFR|MODEL|OPERATOR|COMMENTS)\s*:.*$",
    re.IGNORECASE,
)


def position_source(fields: Mapping[str, Any]) -> tuple[str, str] | None:
    for name in POSITION_SOURCE_FIELDS:
        value = GLUED_FIELD_TAIL.sub("", str(fields.get(name) or "")).strip(" .")
        if value and value.upper() not in {"N/A", "NA"}:
            return name, value
    return None


def suggested_gc_name(value: str, equipment_id: str, wrong_token: str | None) -> str:
    """PDF identifier as a GC file name, with a typo'd equipment number corrected."""
    device = parse_device_id(equipment_id)
    text = " ".join(value.split()).replace("/", "-")
    text = re.sub(r'[<>:"\\|?*]', "_", text)
    if wrong_token and device.num is not None:
        own = _token_text((device.num, device.lineup, device.sub))
        text = re.sub(rf"(?<![A-Z0-9]){re.escape(wrong_token)}(?![0-9])", own, text, count=1)
    return f"{text.strip(' .')}.pdf"


# --- constrained snapping -------------------------------------------------

CONFUSABLE_PAIRS = {frozenset(pair) for pair in ("O0", "S5", "I1", "L1", "B8", "Z2", "G6", "GC", "C(")}


def confusion_distance(left: str, right: str) -> float:
    """Edit distance where OCR-confusable substitutions cost 0.3."""
    previous = [float(index) for index in range(len(right) + 1)]
    for row, left_char in enumerate(left, start=1):
        current = [float(row)]
        for column, right_char in enumerate(right, start=1):
            if left_char == right_char:
                cost = 0.0
            elif frozenset((left_char, right_char)) in CONFUSABLE_PAIRS:
                cost = 0.3
            else:
                cost = 1.0
            current.append(min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost))
        previous = current
    return previous[-1]


def snap_position(key: str, candidates: Iterable[str], max_distance: float = 0.6) -> str | None:
    """Snap only when the best candidate needs confusable edits and is unique."""
    scored = sorted((confusion_distance(key, candidate), candidate) for candidate in candidates)
    if not scored or scored[0][0] == 0 or scored[0][0] > max_distance:
        return None
    if len(scored) > 1 and scored[1][0] - scored[0][0] < 0.5:
        return None
    return scored[0][1]


def _position_aliases(positions: Iterable[Mapping[str, Any]]) -> dict[str, str]:
    return {
        key: position["key"]
        for position in positions
        for key in (position["key"], *(position.get("aliases") or []))
    }


def suggest_ocr_gc_name(
    name: str, equipment_id: str, record: Mapping[str, Any], families: Mapping[str, Any],
) -> str | None:
    """Propose a filename correction when both the OCR header and name show the same typo."""
    if record.get("text_source") != "ocr" or is_excluded_report(name):
        return None
    family = families.get(family_key(equipment_id))
    if not isinstance(family, Mapping) or family.get("status") != "confirmed":
        return None
    fields = record.get("fields")
    if not isinstance(fields, Mapping):
        return None
    source = position_source(fields)
    if not source or vote_equipment(fields, equipment_id)["belongs_elsewhere"]:
        return None
    header = parse_position(source[1], equipment_id)
    gc_name = parse_position(name, equipment_id)
    for parsed in (header, gc_name):
        if parsed.confidence == "needs_review" or "asset_equipment_conflict" in parsed.flags:
            return None
    if header.key != gc_name.key:
        return None

    exception = (family.get("exceptions") or {}).get(equipment_id.upper()) or {}
    aliases = _position_aliases([*family["positions"], *(exception.get("extra_positions") or [])])
    if header.key in aliases:
        return None
    candidate = snap_position(header.key, aliases)
    if candidate is None or aliases[candidate] in (exception.get("waived_positions") or []):
        return None

    # Keep the spelling outside the corrected position, including FAIL/retest/copy markers.
    pattern = r"[-_\s]+".join(re.escape(part) for part in header.key.split("-"))
    matches = list(re.finditer(rf"(?<![A-Z0-9]){pattern}(?![A-Z0-9])", name, re.IGNORECASE))
    if len(matches) != 1:
        return None
    match = matches[0]
    return name[:match.start()] + candidate + name[match.end():]


# --- baseline drafts --------------------------------------------------------


def build_family_draft(
    complete_members: Mapping[str, set[str]],
) -> dict[str, Any]:
    """Positions present in more than half of the NETA-complete members."""
    count = len(complete_members)
    support: Counter[str] = Counter()
    for keys in complete_members.values():
        support.update(keys)
    if count < 2:
        status = "insufficient"
        positions: list[str] = []
    else:
        positions = sorted(key for key, seen in support.items() if seen * 2 > count)
        distinct = {frozenset(keys) for keys in complete_members.values()}
        status = "needs_decision" if count == 2 and len(distinct) > 1 else "draft"
    return {
        "status": status,
        "complete_member_count": count,
        "positions": positions,
        "support": {key: support[key] for key in sorted(support)},
    }


# --- comparison -------------------------------------------------------------


@dataclass(slots=True)
class ReportRef:
    file: str
    key: str
    confidence: PositionConfidence
    status: str
    test_date: str | None = None
    serial_number: str | None = None


def _serial(value: str | None) -> str | None:
    text = re.sub(r"\s+", "", str(value or "")).upper()
    return None if text in {"", "N/A", "NA", "N/F", "-"} else text


def resolve_position(reports: list[ReportRef]) -> tuple[str, list[str]]:
    """Return (result, notes) for the reports at one baseline position.

    FAIL and PASS at one position: when test dates are known for both, a PASS
    on the same date as a FAIL does not clear it; otherwise the newest result
    wins. Without dates the order is unknown and the position needs review.
    Two PASS reports with different serial numbers suggest a misread position.
    """
    notes: list[str] = []
    passes = [report for report in reports if report.status == "PASSED"]
    fails = [report for report in reports if report.status == "FAILED"]
    pending = [report for report in reports if report.status not in {"PASSED", "FAILED"}]
    if not reports:
        return "missing", notes
    if len(passes) > 1:
        serials = {serial for report in passes if (serial := _serial(report.serial_number))}
        notes.append("duplicate_different_sn" if len(serials) > 1 else "duplicate")
    if fails and passes:
        dated = [report for report in passes + fails if report.test_date]
        if len(dated) != len(passes) + len(fails):
            return "retest_unordered", notes
        latest_fail = max(report.test_date or "" for report in fails)
        latest_pass = max(report.test_date or "" for report in passes)
        if latest_pass > latest_fail:
            notes.append("superseded_fail")
            return "pass", notes
        notes.append("same_day_fail" if latest_pass == latest_fail else "fail_after_pass")
        return "failed_only", notes
    if fails:
        return "failed_only", notes
    if passes:
        return "pass", notes
    return "result_pending", [*notes, *(["needs_review"] if pending else [])]


NONCONFORMING_RESULTS = {"missing", "failed_only"}


def compare_equipment(
    reports: list[ReportRef],
    baseline: list[Mapping[str, Any]],
    waived: Iterable[str] = (),
) -> dict[str, Any]:
    """Compare one equipment's parsed reports with a family baseline."""
    waived_keys = set(waived)
    alias_lookup = _position_aliases(baseline)
    by_key: dict[str, list[ReportRef]] = defaultdict(list)
    extras: list[ReportRef] = []
    unreadable: list[ReportRef] = []
    for report in reports:
        if report.confidence == "needs_review":
            unreadable.append(report)
            continue
        target = alias_lookup.get(report.key)
        if target is None:
            snapped = snap_position(report.key, alias_lookup)
            if snapped is not None:
                target = alias_lookup[snapped]
                report.confidence = "snapped"
        elif target != report.key:
            report.confidence = "alias"
        if target is None:
            extras.append(report)
        else:
            by_key[target].append(report)
    positions = []
    issues: Counter[str] = Counter()
    for position in baseline:
        key = position["key"]
        matched = by_key.get(key, [])
        if key in waived_keys and not matched:
            result, notes = "waived", []
        elif position.get("optional") and not matched:
            result, notes = "optional_missing", []
        else:
            result, notes = resolve_position(matched)
            expected = int(position.get("count") or 1)
            passes = sum(1 for report in matched if report.status == "PASSED")
            if expected > 1 and passes <= expected:
                notes = [note for note in notes if not note.startswith("duplicate")]
        if len(matched) > 1 and result in {"pass", "failed_only"}:
            # The matrix and drawer link to the first report in the position.
            winning_status = "PASSED" if result == "pass" else "FAILED"
            matched = sorted(matched, key=lambda report: (
                report.status == winning_status, report.test_date or "",
            ), reverse=True)
        if result in {"missing", "failed_only", "retest_unordered", "result_pending"}:
            issues[result] += 1
        for note in notes:
            issues[note] += 1
        positions.append({
            "key": key,
            "result": result,
            "notes": notes,
            "reports": [report.file for report in matched],
        })
    if extras:
        issues["extra"] = len(extras)
    if unreadable:
        issues["needs_review"] += len(unreadable)
    return {
        "positions": positions,
        "extra_reports": [{"file": report.file, "key": report.key} for report in extras],
        "needs_review_reports": [{"file": report.file, "key": report.key} for report in unreadable],
        "issue_counts": dict(sorted(issues.items())),
        "nonconforming": any(position["result"] in NONCONFORMING_RESULTS for position in positions),
    }
