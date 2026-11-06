# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

base = Path(tempfile.gettempdir()) / 'yavc-document-pages-evidence'
pdf = base / 'document-pages.pdf'
text = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-'], encoding='utf-8')
pages = text.rstrip('\f\n\r ').split('\f')
assert len(pages) == 2, f'Expected two printed pages, got {len(pages)}'
assert 'Before.' in pages[0] and 'After.' not in pages[0]
assert 'After.' in pages[1] and 'SECRET NOTE' not in text
boxes = re.findall(rb'/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]', pdf.read_bytes())
assert len(boxes) == 2 and all(abs(float(w) - 595.28) < 1 and abs(float(h) - 841.89) < 1 for w, h in boxes), 'Print paper is not A4'
print('Browser print PDF has two A4 pages, selectable text and no excluded note.')

export = Path(tempfile.gettempdir()) / 'yavc-editor-export-evidence'
with zipfile.ZipFile(export / 'chromium-omitted.docx') as package:
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    numbering = ET.fromstring(package.read('word/numbering.xml'))
    assert any(node.get('{'+ns['w']+'}val') == '\u2022' for node in numbering.findall('.//w:lvlText', ns)), 'DOCX bullet glyph changed'
print('DOCX numbering retains the bullet glyph.')
