from PIL import Image, ImageDraw
from pathlib import Path
p = Path(__file__).parent / 'output'
p.mkdir(exist_ok=True)
for name, size in [('landscape', (4032, 3024)), ('portrait', (3024, 4032)), ('rotated', (4032, 3024))]:
    im = Image.new('RGB', size, '#dfe8f2')
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, size[0], 200), fill='red')
    d.rectangle((0, 200, 200, size[1]), fill='blue')
    d.text((400, 400), name + ' TOP', fill='black', font_size=180)
    exif = Image.Exif()
    if name == 'rotated': exif[274] = 6
    im.save(p / (name + '.jpg'), quality=95, exif=exif)
(p / 'broken.jpg').write_text('not an image')
