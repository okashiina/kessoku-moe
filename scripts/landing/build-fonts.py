from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font_dir = Path('frontend/public/fonts')
for family, weights in [('nunito', [400, 600, 700, 800]), ('comfortaa', [700])]:
    for weight in weights:
        font = TTFont(font_dir / f'{family}-latin.woff2')
        static = instantiateVariableFont(font, {'wght': weight}, inplace=False)
        # Rename generated instances, retaining original copyright and licenses.
        # Comfortaa's OFL reserves the original font name for unmodified files.
        instance_family = 'Kessoku Text' if family == 'nunito' else 'Kessoku Wordmark'
        instance_style = {400: 'Regular', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold'}[weight]
        names = {
            1: instance_family, 2: instance_style,
            3: f'{instance_family}-{weight}-20261006',
            4: f'{instance_family} {instance_style}',
            6: f'{instance_family.replace(" ", "")}-{instance_style}',
            16: instance_family, 17: instance_style, 25: instance_family.replace(' ', ''),
        }
        for record in list(static['name'].names):
            if record.nameID in names:
                static['name'].setName(names[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)
        static.flavor = 'woff2'
        static.save(font_dir / f'{family}-landing-{weight}.woff2')
        print(f'{family}-landing-{weight}.woff2: {(font_dir / f"{family}-landing-{weight}.woff2").stat().st_size} bytes')
