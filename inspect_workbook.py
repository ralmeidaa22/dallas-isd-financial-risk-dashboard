#!/usr/bin/env python3
"""Read an XLSX's sheet cells, cached values, and formulas without modifying it."""

from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(node.text or "" for node in item.findall(".//m:t", NS)) for item in root]


def workbook_sheets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
    relationship_key = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    return [
        (sheet.attrib["name"], "xl/" + targets[sheet.attrib[relationship_key]])
        for sheet in workbook.findall("m:sheets/m:sheet", NS)
    ]


def cell_value(cell: ET.Element, strings: list[str]) -> str:
    value = cell.findtext("m:v", default="", namespaces=NS)
    if cell.attrib.get("t") == "s" and value:
        return strings[int(value)]
    if cell.attrib.get("t") == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS))
    return value


def main() -> None:
    path = Path(sys.argv[1])
    selected = set(sys.argv[2:])
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        sheets = workbook_sheets(archive)
        print("SHEETS:", ", ".join(name for name, _ in sheets))
        for name, target in sheets:
            if selected and name not in selected:
                continue
            print(f"\n### {name} ({target})")
            root = ET.fromstring(archive.read(target))
            for row in root.findall(".//m:sheetData/m:row", NS):
                entries = []
                for cell in row.findall("m:c", NS):
                    ref = cell.attrib.get("r", "?")
                    value = cell_value(cell, strings)
                    formula = cell.findtext("m:f", default="", namespaces=NS)
                    if value or formula:
                        display = value
                        if formula:
                            display = f"{value} [={formula}]"
                        entries.append(f"{ref}:{display}")
                if entries:
                    print(" | ".join(entries))


if __name__ == "__main__":
    main()
