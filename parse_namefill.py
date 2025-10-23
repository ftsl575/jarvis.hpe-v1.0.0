#!/usr/bin/env python3
"""Utility for converting NameFill XML exports to JSON.

This script converts an arbitrary XML document into a JSON structure that
preserves element attributes, element text and nested children. It is intended to
help automate migrations from the NameFill XML format to downstream systems
that expect JSON payloads.

Usage::

    python parse_namefill.py input.xml output.json

If the output path is omitted the script will create a JSON file next to the
input with the same stem.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import xml.etree.ElementTree as ET
from typing import Any, Dict

AttributeKey = "@attributes"
TextKey = "#text"


def _normalise_text(value: str | None) -> str | None:
    """Return a stripped text value or ``None`` when the input is empty."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _merge_child(target: Dict[str, Any], key: str, value: Any) -> None:
    """Merge a child node into ``target`` preserving multiplicity."""
    if key in target:
        existing = target[key]
        if isinstance(existing, list):
            existing.append(value)
        else:
            target[key] = [existing, value]
    else:
        target[key] = value


def _element_to_dict(element: ET.Element) -> Any:
    """Convert an :class:`~xml.etree.ElementTree.Element` to a JSON-friendly value."""
    node: Dict[str, Any] = {}

    if element.attrib:
        node[AttributeKey] = dict(element.attrib)

    children = list(element)
    for child in children:
        child_value = _element_to_dict(child)
        _merge_child(node, child.tag, child_value)

    text_value = _normalise_text(element.text)
    if text_value is not None:
        if children or element.attrib:
            node[TextKey] = text_value
        else:
            # Leaf nodes containing only text can be represented directly.
            if not node:
                return text_value
            node[TextKey] = text_value

    tail_value = _normalise_text(element.tail)
    if tail_value is not None:
        node.setdefault("@tail", tail_value)

    return node


def xml_to_dict(xml_path: pathlib.Path) -> Dict[str, Any]:
    """Parse ``xml_path`` into a nested dictionary."""
    try:
        tree = ET.parse(xml_path)
    except ET.ParseError as exc:  # pragma: no cover - defensive clarity
        raise SystemExit(f"Failed to parse '{xml_path}': {exc}")

    root = tree.getroot()
    return {root.tag: _element_to_dict(root)}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert NameFill XML to JSON")
    parser.add_argument("xml", type=pathlib.Path, help="Path to the XML file")
    parser.add_argument(
        "json",
        type=pathlib.Path,
        nargs="?",
        help="Destination JSON path (defaults to alongside the XML file)",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="Number of spaces to use for JSON indentation (default: 2)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    xml_path: pathlib.Path = args.xml

    if not xml_path.exists():
        raise SystemExit(f"XML file '{xml_path}' does not exist")

    json_path: pathlib.Path
    if args.json is not None:
        json_path = args.json
    else:
        json_path = xml_path.with_suffix(".json")

    data = xml_to_dict(xml_path)

    json_path.parent.mkdir(parents=True, exist_ok=True)
    with json_path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=args.indent)
        fh.write("\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
