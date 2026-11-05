# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import sys, zipfile, tempfile
import pymupdf
from pathlib import Path
from xml.etree import ElementTree as ET

base = Path(tempfile.gettempdir()) / 'yavc-editor-export-evidence'
for engine in sys.argv[1:] or ['chromium','firefox','webkit']:
    docs=[]
    for suffix in ['omitted','clean']:
        with zipfile.ZipFile(base / f'{engine}-{suffix}.docx') as package:
            for name in package.namelist():
                assert b'SECRET_' not in package.read(name), name
            document = ET.fromstring(package.read('word/document.xml'))
            ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            texts=[n.text or '' for n in document.findall('.//w:t',ns)]
            assert 'Before after.' in ''.join(texts), texts
            assert 'Caf\u00e9.' in ''.join(texts)
            docs.append((texts, len(document.findall('.//w:p',ns)), len(document.findall('.//w:tbl',ns)), ET.tostring(document.find('.//w:sectPr',ns))))
    assert docs[0] == docs[1], 'DOCX source deletion changes structure or paragraph count'
    pages=[]
    for suffix in ['omitted','clean']:
        pdf=base / f'{engine}-{suffix}.pdf'
        doc=pymupdf.open(pdf)
        text=''.join(page.get_text() for page in doc)
        assert 'SECRET_' not in text
        assert 'after.' in text
        assert len(doc)==1, 'Omitted page break created a blank page'
        pages.append([(list(page.rect),page.get_text('words')) for page in doc])
        if suffix=='omitted': doc[0].get_pixmap(matrix=pymupdf.Matrix(1.4,1.4)).save(base/f'{engine}-pdf.png')
    assert pages[0] == pages[1], 'PDF source deletion changes positions or page count'
    with zipfile.ZipFile(base/f'{engine}-slides.pptx') as package:
        for name in package.namelist():
            assert b'SECRET_' not in package.read(name), 'Slides leaked into '+name
    print(engine+': all DOCX package entries omit secrets; editable text/structure and PDF text/positions match source deletion')
