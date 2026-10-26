"""Build labelled contact sheets for docs/FEATURES.md from the VS_DOCS captures.

usage: python3 scripts/doc-sheets.py <capture dir> <docs/images dir>

<capture dir> holds manifest.json and images/{types,presets}/*.png written by the
app's VS_DOCS mode. Sheets use the panel's colours and the bundled Barlow typeface.
"""
import json
import os
import shutil
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFont

SRC, DST = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', 'src', 'assets')

BG = (18, 19, 21)
PLATE = (27, 28, 31)
EDGE = (44, 46, 51)
TEXT = (232, 230, 225)
DIM = (154, 157, 163)
FAINT = (92, 95, 102)
ACCENT = (217, 160, 91)


def font(weight, size):
    name = {400: 'Barlow-Regular.ttf', 500: 'Barlow-Medium.ttf', 600: 'Barlow-SemiBold.ttf'}[weight]
    return ImageFont.truetype(os.path.join(FONTS, name), size)


F_TITLE = font(600, 30)
F_SUB = font(400, 17)
F_NAME = font(600, 19)
F_LOOK = font(400, 15)
F_CAP = font(500, 11)
F_TINY = font(600, 12)


def caps(draw, xy, text, fill, f=F_CAP, track=1.6):
    x, y = xy
    for ch in text.upper():
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + track
    return x


def tile(path, w, h):
    """Centre-crop a capture to w:h and scale it."""
    im = Image.open(path).convert('RGB')
    iw, ih = im.size
    target = w / h
    if iw / ih > target:
        nw = int(ih * target)
        im = im.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
    else:
        nh = int(iw / target)
        im = im.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
    return im.resize((w, h), Image.LANCZOS)


def rounded_mask(size, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m


def sheet(title, subtitle, items, out, cols=3, tw=400, th=225):
    """items: list of (image path, name, description, flag or None)."""
    pad, gap, card_pad = 36, 22, 10
    card_w = tw + card_pad * 2
    text_h = 78
    card_h = th + card_pad * 2 + text_h
    rows = (len(items) + cols - 1) // cols
    head_h = 112
    W = pad * 2 + cols * card_w + (cols - 1) * gap
    H = head_h + rows * card_h + (rows - 1) * gap + pad
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((pad, 30), title, font=F_TITLE, fill=TEXT)
    d.text((pad, 70), subtitle, font=F_SUB, fill=DIM)
    for i, (p, name, desc, flag) in enumerate(items):
        cx = pad + (i % cols) * (card_w + gap)
        cy = head_h + (i // cols) * (card_h + gap)
        d.rounded_rectangle((cx, cy, cx + card_w, cy + card_h), 10, fill=PLATE, outline=EDGE)
        t = tile(p, tw, th)
        img.paste(t, (cx + card_pad, cy + card_pad), rounded_mask((tw, th), 6))
        # half labels: the left half of every capture is a dark screen, the right half a light one
        caps(d, (cx + card_pad + 10, cy + card_pad + th - 20), 'dark screen', (120, 123, 130), F_TINY, 1.4)
        lx = cx + card_pad + tw - 10 - (d.textlength('LIGHT SCREEN', font=F_TINY) + 1.4 * 12)
        caps(d, (lx, cy + card_pad + th - 20), 'light screen', (120, 123, 130), F_TINY, 1.4)
        ty = cy + card_pad + th + 12
        d.text((cx + card_pad + 2, ty), name, font=F_NAME, fill=TEXT)
        if flag:
            fx = cx + card_pad + 2 + d.textlength(name, font=F_NAME) + 10
            caps(d, (fx, ty + 5), flag, ACCENT, F_CAP)
        for j, line in enumerate(textwrap.wrap(desc, 52)[:2]):
            d.text((cx + card_pad + 2, ty + 28 + j * 19), line, font=F_LOOK, fill=DIM)
    img.save(out, optimize=True)
    print('wrote', out, img.size)


def mosaic(items, out, cols=8, tw=220, th=124):
    """Compact overview: every tile with its name."""
    pad, gap = 28, 12
    lab = 26
    rows = (len(items) + cols - 1) // cols
    W = pad * 2 + cols * tw + (cols - 1) * gap
    H = pad * 2 + rows * (th + lab) + (rows - 1) * gap
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    for i, (p, name) in enumerate(items):
        x = pad + (i % cols) * (tw + gap)
        y = pad + (i // cols) * (th + lab + gap)
        img.paste(tile(p, tw, th), (x, y), rounded_mask((tw, th), 6))
        caps(d, (x + 2, y + th + 8), name, DIM, F_CAP, 1.3)
    img.save(out, optimize=True)
    print('wrote', out, img.size)


def main():
    man = json.load(open(os.path.join(SRC, 'manifest.json')))
    os.makedirs(os.path.join(DST, 'types'), exist_ok=True)
    os.makedirs(os.path.join(DST, 'presets'), exist_ok=True)
    tdir = os.path.join(SRC, 'images', 'types')
    pdir = os.path.join(SRC, 'images', 'presets')
    tpath = {t['id']: os.path.join(tdir, f"{t['i']:02d}-{t['id']}.png") for t in man['types']}

    for f in man['families']:
        ts = [t for t in man['types'] if t['family'] == f['id']]
        sheet(f['name'], f['desc'], [(tpath[t['id']], t['name'], t['look'], 'Flicker' if t['flash'] else None) for t in ts],
              os.path.join(DST, 'types', f"family-{f['id']}.png"))
    mosaic([(tpath[t['id']], t['name']) for t in man['types']], os.path.join(DST, 'types', 'all-types.png'))

    for g in man['groups']:
        ps = [p for p in man['presets'] if p['group'] == g['id']]
        sheet(g['name'] + ' presets', 'Each preset is a stack of layers. Left half on a dark screen, right half on a light one.',
              [(os.path.join(pdir, p['id'] + '.png'), p['name'], p['desc'] + ' Layers: ' + ', '.join(p['layers']) + '.', None) for p in ps],
              os.path.join(DST, 'presets', f"group-{g['id']}.png"))

    # Single tiles too, so each type and preset can be linked on its own.
    for t in man['types']:
        tile(tpath[t['id']], 640, 360).save(os.path.join(DST, 'types', t['id'] + '.png'), optimize=True)
    for p in man['presets']:
        tile(os.path.join(pdir, p['id'] + '.png'), 640, 360).save(os.path.join(DST, 'presets', p['id'] + '.png'), optimize=True)

    # Screens: copy as they are.
    for name in os.listdir(os.path.join(SRC, 'images')):
        if name.endswith('.png'):
            shutil.copy(os.path.join(SRC, 'images', name), os.path.join(DST, name))


if __name__ == '__main__':
    main()
