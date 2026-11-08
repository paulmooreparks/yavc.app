# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

folder = Path(tempfile.gettempdir()) / "yavc-footnote-export-evidence"
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
for engine in sys.argv[1:] or ["chromium", "firefox", "webkit"]:
    with zipfile.ZipFile(folder / (engine + "-footnotes.docx")) as package:
        for name in package.namelist():
            data = package.read(name)
            assert b"SECRET_" not in data and b"UNUSED_NOTE" not in data, name
        document = ET.fromstring(package.read("word/document.xml"))
        notes = ET.fromstring(package.read("word/footnotes.xml"))
        references = document.findall(".//w:footnoteReference", ns)
        assert len(references) == 1
        identifier = references[0].attrib["{" + ns["w"] + "}id"]
        note = next(n for n in notes.findall("w:footnote", ns) if n.attrib["{" + ns["w"] + "}id"] == identifier)
        text = "".join(n.text or "" for n in note.findall(".//w:t", ns))
        assert "A native footnote." in text and "Second paragraph." in text
        assert note.find(".//w:b", ns) is not None
        fields = document.findall(".//w:fldSimple", ns)
        assert len([f for f in fields if "NOTEREF yavc_note_1" in f.attrib.get("{" + ns["w"] + "}instr", "")]) == 1
        main = "".join(n.text or "" for n in document.findall(".//w:t", ns))
        assert "native footnote" not in main
    print(engine + " DOCX has an editable native footnote, one repeated-reference field and no excluded note data.")
