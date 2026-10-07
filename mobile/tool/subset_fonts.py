"""Cuts the bundled Inter faces down to the characters this app can draw.

Full Inter covers Latin, Greek, Cyrillic and a large symbol set: four faces came
to 1.7 MB, on an app whose entire interface is two Latin languages. Subsetting
takes that to about 167 KB with nothing missing on screen.

Run after replacing the fonts:

    pip install fonttools
    python tool/subset_fonts.py

It reads every string literal in lib/ and both ARB files rather than assuming a
range, because a guessed range is how a stray character becomes a blank box on
someone's shift. Re-running on already-subset files is harmless.
"""

import glob, io, os, re, subprocess, sys

# Every character the app can actually draw: the two ARB files plus anything
# composed in Dart. Subsetting to a guessed range would be how a stray glyph
# turns into a blank box on someone's shift.
chars = set()
for path in glob.glob('lib/l10n/app_*.arb'):
    chars |= set(io.open(path, encoding='utf-8').read())
for path in glob.glob('lib/**/*.dart', recursive=True):
    src = io.open(path, encoding='utf-8').read()
    for literal in re.findall(r"'([^'\\n]*)'|\"([^\"\\n]*)\"", src):
        chars |= set(literal[0] or literal[1])

# Plus the printable ASCII range and the typographic punctuation the design
# uses, so server-worded messages and sample codes are always covered.
chars |= set(chr(c) for c in range(0x20, 0x7F))
chars |= set('\u00a0\u2010\u2011\u2012\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u00b7\u00d7\u00b0\u00b2\u00b3')
# Latin-1 letters, so an accented name from the server still renders.
chars |= set(chr(c) for c in range(0x00C0, 0x0180))

unicodes = ','.join('U+%04X' % ord(c) for c in sorted(chars) if ord(c) >= 0x20)
print('keeping %d codepoints' % len(chars))

before = after = 0
for face in ('Regular', 'SemiBold', 'Bold'):
    src = 'assets/fonts/Inter-%s.ttf' % face
    out = src + '.subset'
    before += os.path.getsize(src)
    subprocess.run([
        sys.executable, '-m', 'fontTools.subset', src,
        '--unicodes=' + unicodes,
        '--layout-features=kern,liga,calt,tnum',
        '--output-file=' + out,
    ], check=True)
    os.replace(out, src)
    after += os.path.getsize(src)
    print('%-10s %7d -> %6d B' % (face, os.path.getsize(src), os.path.getsize(src)))

print('total %.0f KB -> %.0f KB' % (before / 1024, after / 1024))
