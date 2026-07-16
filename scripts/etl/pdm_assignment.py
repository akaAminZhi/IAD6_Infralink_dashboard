"""Resolve PDM assignment conflicts between the module list and SystemElements."""

from __future__ import annotations

import re
from typing import Any


PDM_PREFIX_PATTERN = re.compile(r"^IAD0?6-PDM-", re.IGNORECASE)
PDM_SCOPE_PATTERN = re.compile(r"^([A-Z]+\d+)-(\d{3})(?:-|$)", re.IGNORECASE)


def clean_text(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def is_pdm_name(value: Any) -> bool:
    text = clean_text(value)
    return bool(text and PDM_PREFIX_PATTERN.match(text))


def get_pdm_scope(value: Any) -> str | None:
    text = clean_text(value)
    if not text:
        return None

    without_prefix = PDM_PREFIX_PATTERN.sub("", text.upper())
    match = PDM_SCOPE_PATTERN.match(without_prefix)
    if not match:
        return None
    return f"{match.group(1).upper()}-{match.group(2)}"


def choose_effective_pdm_name(module_pdm_name: Any, system_parent: Any) -> str | None:
    """Select a PDM while preventing cross-area Parent values from overriding the module list."""

    module_name = clean_text(module_pdm_name)
    parent_name = clean_text(system_parent) if is_pdm_name(system_parent) else None

    if not parent_name:
        return module_name
    if not module_name:
        return parent_name

    module_scope = get_pdm_scope(module_name)
    parent_scope = get_pdm_scope(parent_name)
    if module_scope and parent_scope and module_scope != parent_scope:
        return module_name

    return parent_name
