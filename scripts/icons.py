#!/usr/bin/env python3
"""erzeugt das zweikampf-zeichen: svg fuer das web, png fuer homescreen und tab.

zwei keile stossen ineinander — der warme von links oben, der kuehle von rechts
unten, die spitzen laufen aneinander vorbei. dazwischen bleibt ein schmaler
diagonaler schlitz stehen: der clinch. punktsymmetrisch, weil keiner der beiden
im vorteil ist.

kein grafikprogramm, keine abhaengigkeit: scanline-fuellung mit 4x
ueberabtastung und ein png-encoder aus zlib. aufruf:

    python3 scripts/icons.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

# tokens aus DESIGN.md, keine eigenen farben
GRUND = (0x14, 0x17, 0x1C)
FLAECHE = (0x1B, 0x20, 0x27)
ERIJON = (0xF2, 0xC1, 0x4E)
KORAY = (0x57, 0xB8, 0xA5)

E = 512.0  # alle koordinaten in diesem raster, gerendert wird skaliert
MITTE = E / 2
NEIGUNG = -0.52  # steigung des schlitzes zwischen den keilen
RADIUS = 112.0  # ecke der gerundeten variante (ios-verhaeltnis 0.22)


def keile(xl: float, yt: float, xc: float, schlitz: float):
    """die zwei keile als polygone.

    xl  linke kante des warmen keils (die rechte des kuehlen liegt gespiegelt)
    yt  oberkante des warmen keils
    xc  wie weit seine spitze ueber die mitte hinausschiesst
    schlitz  senkrechter abstand der beiden schnittkanten
    """

    def kante(x: float) -> float:
        return MITTE + NEIGUNG * (x - MITTE) - schlitz / 2

    warm = [(xl, yt), (xl, kante(xl)), (xc, kante(xc))]
    kuehl = [(E - x, E - y) for x, y in warm]  # 180 grad um die mitte
    return warm, kuehl


# gross: fuer 180 px aufwaerts. die ecken bleiben im sicheren kreis der
# maskable-icons (radius 205 um die mitte), damit android nichts abschneidet.
GROSS = keile(xl=114, yt=112, xc=384, schlitz=26)
# klein: fuer 32 px. fettere keile, breiterer schlitz — sonst faellt er zu.
KLEIN = keile(xl=104, yt=104, xc=396, schlitz=44)


def gerundetes_quadrat(r: float, n: int = 24):
    """das quadrat mit ecken, als polygon (die boegen in n schritten)."""
    pkt = []
    ecken = [(E - r, E - r, 0.0), (r, E - r, 90.0), (r, r, 180.0), (E - r, r, 270.0)]
    for cx, cy, start in ecken:
        for i in range(n + 1):
            w = math.radians(start + 90.0 * i / n)
            pkt.append((cx + r * math.cos(w), cy + r * math.sin(w)))
    return pkt


def fuelle(deckung: list[float], n: int, polygon, ss: int = 4) -> None:
    """scanline-fuellung: pro zeile ss abtastungen, waagerecht exakte anteile."""
    s = n / E  # vom 512er raster in die zielaufloesung
    pts = [(x * s, y * s) for x, y in polygon]
    kanten = [(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    gewicht = 1.0 / ss

    ymin = max(0, int(min(p[1] for p in pts)))
    ymax = min(n - 1, int(max(p[1] for p in pts)) + 1)

    for zeile in range(ymin, ymax + 1):
        basis = zeile * n
        for k in range(ss):
            sy = zeile + (k + 0.5) / ss
            schnitte = []
            for (x0, y0), (x1, y1) in kanten:
                if (y0 <= sy < y1) or (y1 <= sy < y0):
                    schnitte.append(x0 + (sy - y0) * (x1 - x0) / (y1 - y0))
            if not schnitte:
                continue
            schnitte.sort()
            for i in range(0, len(schnitte) - 1, 2):
                a = max(0.0, schnitte[i])
                b = min(float(n), schnitte[i + 1])
                if b <= a:
                    continue
                ia, ib = int(a), min(int(b), n - 1)
                if ia == ib:
                    deckung[basis + ia] += (b - a) * gewicht
                else:
                    deckung[basis + ia] += (ia + 1 - a) * gewicht
                    for x in range(ia + 1, ib):
                        deckung[basis + x] += gewicht
                    deckung[basis + ib] += (b - ib) * gewicht


def zeichne(n: int, rund: bool, klein: bool) -> bytes:
    """ein icon als rgba-puffer."""
    warm, kuehl = KLEIN if klein else GROSS
    grund = gerundetes_quadrat(RADIUS) if rund else [(0, 0), (E, 0), (E, E), (0, E)]

    bild = bytearray(n * n * 4)
    for flaeche, farbe in ((grund, FLAECHE), (warm, ERIJON), (kuehl, KORAY)):
        deckung = [0.0] * (n * n)
        fuelle(deckung, n, flaeche)
        r, g, b = farbe
        for i, d in enumerate(deckung):
            if d <= 0.0:
                continue
            a = 1.0 if d > 1.0 else d
            p = i * 4
            va = bild[p + 3] / 255.0
            na = a + va * (1 - a)  # ueber das darunterliegende legen
            for kanal, wert in ((0, r), (1, g), (2, b)):
                alt = bild[p + kanal]
                bild[p + kanal] = round((wert * a + alt * va * (1 - a)) / na)
            bild[p + 3] = round(na * 255)
    return bytes(bild)


def schreibe_png(pfad: Path, n: int, daten: bytes) -> None:
    roh = bytearray()
    for zeile in range(n):
        roh.append(0)  # filter: keiner
        roh += daten[zeile * n * 4 : (zeile + 1) * n * 4]

    def block(typ: bytes, inhalt: bytes) -> bytes:
        return (
            struct.pack(">I", len(inhalt))
            + typ
            + inhalt
            + struct.pack(">I", zlib.crc32(typ + inhalt) & 0xFFFFFFFF)
        )

    pfad.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + block(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0))
        + block(b"IDAT", zlib.compress(bytes(roh), 9))
        + block(b"IEND", b"")
    )


def punkte(polygon) -> str:
    return " ".join(f"{x:.0f},{y:.0f}" for x, y in polygon)


def schreibe_svg(pfad: Path, klein: bool) -> None:
    warm, kuehl = KLEIN if klein else GROSS
    f = lambda c: "#%02x%02x%02x" % c
    pfad.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">\n'
        f'  <rect width="512" height="512" rx="{RADIUS:.0f}" fill="{f(FLAECHE)}"/>\n'
        f'  <polygon points="{punkte(warm)}" fill="{f(ERIJON)}"/>\n'
        f'  <polygon points="{punkte(kuehl)}" fill="{f(KORAY)}"/>\n'
        f"</svg>\n"
    )


def main() -> None:
    ziel = Path(__file__).resolve().parent.parent / "public"
    schreibe_svg(ziel / "icon.svg", klein=False)
    schreibe_svg(ziel / "favicon.svg", klein=True)

    # rund fuer den browsertab, voll fuer den homescreen: ios und android
    # runden selbst, ein vorgerundetes png bekaeme einen zweiten rand
    for name, n, rund, klein in (
        ("favicon-32x32.png", 32, True, True),
        ("apple-touch-icon.png", 180, False, False),
        ("pwa-192x192.png", 192, False, False),
        ("pwa-512x512.png", 512, False, False),
    ):
        schreibe_png(ziel / name, n, zeichne(n, rund, klein))
        print(f"{name}: {n}x{n}")


if __name__ == "__main__":
    main()
