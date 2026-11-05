# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
from pathlib import Path
import tempfile,sys,zipfile
from xml.etree import ElementTree as ET

base=Path(tempfile.gettempdir())/'yavc-export-paper-evidence'
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
for engine in sys.argv[1:] or ['chromium','firefox','webkit']:
    for name,color in [('light','ffffff'),('dark','ffffff'),('authored','fff1dc')]:
        with zipfile.ZipFile(base/f'{engine}-{name}.docx') as archive:
            doc=ET.fromstring(archive.read('word/document.xml'))
            paper=doc.find('w:background',ns)
            assert paper is not None and paper.get('{'+ns['w']+'}color').lower()==color
            assert not doc.findall('.//w:shd',ns)
            assert all(n.get('{'+ns['w']+'}val')=='yellow' for n in doc.findall('.//w:highlight',ns))
    print(engine+': Word package carries the intended paper color, with no black shading')
