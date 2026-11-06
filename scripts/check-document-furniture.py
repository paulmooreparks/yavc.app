# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
"""Verify generated running text and live DOCX fields without Word automation."""
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

base = Path(sys.argv[1])
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with zipfile.ZipFile(base.with_suffix('.docx')) as z:
    document = ET.fromstring(z.read('word/document.xml'))
    assert document.find('.//w:titlePg', ns) is not None
    headers = [ET.fromstring(z.read(n)) for n in z.namelist() if re.fullmatch(r'word/header\d+\.xml', n)]
    texts = [''.join(n.text or '' for n in h.findall('.//w:t', ns)) for h in headers]
    assert any('A <literal> title' in t for t in texts) and '' in texts, texts
    for name in [n for n in z.namelist() if re.fullmatch(r'word/footer\d+\.xml', n)]:
        root = ET.fromstring(z.read(name))
        fields = ' '.join(n.text or '' for n in root.findall('.//w:instrText', ns))
        assert 'PAGE' in fields and 'NUMPAGES' in fields, fields
        assert len(root.findall('.//w:tc', ns)) == 3
    fonts = [n.get('{'+ns['w']+'}ascii') for n in document.findall('.//w:rFonts', ns)]
    assert 'Georgia' in fonts, fonts
    spacing = document.findall('.//w:spacing', ns)
    assert any(n.get('{'+ns['w']+'}after') == '160' and n.get('{'+ns['w']+'}line') == '384' for n in spacing)
text = subprocess.run(['pdftotext', '-layout', str(base.with_suffix('.pdf')), '-'], check=True, capture_output=True, encoding='utf-8').stdout
pages = [p for p in text.split('\f') if p.strip()]
assert len(pages) > 1
assert 'A <literal> title' not in pages[0]
for i, page in enumerate(pages, 1):
    assert re.search(r'Page\s+'+str(i)+r'\s+of\s+'+str(len(pages))+r'\b', page), (i, page[-300:])
    if i > 1:
        assert 'A <literal> title' in page
print('DOCX live fields/first header/fonts and selectable PDF running text passed')
