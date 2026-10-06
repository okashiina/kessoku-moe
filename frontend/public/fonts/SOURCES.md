# Brand fonts

Unmodified Google Fonts WOFF2 subsets, retrieved 2026-09-06.

- Nunito variable weights 400–800, Google Fonts version 32.
- Comfortaa variable weights 400–700, Google Fonts version 47.
- Source CSS: https://fonts.googleapis.com/css2?family=Nunito:wght@400..800&family=Comfortaa:wght@400..700&display=swap
- Font files served by https://fonts.gstatic.com/.
- Licenses copied from https://github.com/google/fonts/tree/main/ofl/nunito and https://github.com/google/fonts/tree/main/ofl/comfortaa.

Keep `nunito-OFL.txt` and `comfortaa-OFL.txt` with the font files.

## Static landing instances, 2026-10-06

The five `*-landing-*.woff2` files are static Latin instances derived from the
bundled variable WOFF2 files with fontTools. Their internal family names are
Kessoku Text and Kessoku Wordmark, preserving the source license and copyright
records while respecting Comfortaa's reserved font name. CSS aliases scope
these faces to the landing. Reproduce with `python scripts/landing/build-fonts.py`
(fontTools with Brotli support). No runtime dependency is added.