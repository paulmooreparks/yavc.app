# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
import sys
import tempfile
import re
from pathlib import Path
import fitz

folder = Path(tempfile.gettempdir()) / 'yavc-footnote-export-evidence'
for engine in sys.argv[1:] or ['chromium', 'firefox', 'webkit']:
    with fitz.open(folder / (engine + '-footnotes.pdf')) as pdf:
        text = ''.join(page.get_text() for page in pdf)
        assert 'native' in text and 'Second paragraph.' in text and 'Visible' in text
        assert 'SECRET_' not in text and 'UNUSED_NOTE' not in text
        assert len(pdf) == 1
        assert len(pdf[0].get_links()) == 2
        pdf[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(folder / (engine + '-footnotes.png'))
    with fitz.open(folder / (engine + '-long-notes.pdf')) as pdf:
        assert len(pdf) > 2
        text = ''.join(page.get_text() for page in pdf)
        for i in range(120):
            assert len(re.findall(r'\bNOTE' + str(i) + r'\b', text)) == 1, i
        for i in range(25):
            assert 'Body ' + str(i) + ' stays above notes.' in text
        for page in pdf:
            for block in page.get_text('dict')['blocks']:
                for line in block.get('lines', []):
                    assert line['bbox'][1] >= 33 and line['bbox'][3] <= page.rect.height - 33, line
            body = [w for w in page.get_text('words') if w[4] == 'Body']
            notes = [w for w in page.get_text('words') if w[4].startswith('NOTE')]
            if body and notes:
                assert max(w[3] for w in body) < min(w[1] for w in notes)
    with fitz.open(folder / (engine + '-formatting.pdf')) as pdf:
        words = pdf[0].get_text('words')
        root = next(w for w in words if w[4] == 'ROOT')
        indented = next(w for w in words if w[4] == 'INDENTED')
        assert indented[0] > root[0] + 8, (root, indented)
        just = next(w for w in words if w[4] == 'JUST0')
        first_line = [w for w in words if abs(w[1] - just[1]) < 1]
        assert max(w[2] for w in first_line) > pdf[0].rect.width - 37
    for name in ['keep-chain', 'keep-notes', 'keep-earlier']:
        with fitz.open(folder / (engine + '-' + name + '.pdf')) as pdf:
            heading = next(i for i, page in enumerate(pdf) if 'KEEPHEAD' in page.get_text())
            body = next(i for i, page in enumerate(pdf) if 'KEEPBODY' in page.get_text())
            assert heading == body == 1, (name, heading, body)
            if name == 'keep-chain':
                assert 'KEEPSUBHEAD' in pdf[body].get_text()
    print(engine + ' PDF notes are selectable, linked, bounded, excluded correctly and continued without duplicate or missing text; indentation, justification and heading keeps survive.')
