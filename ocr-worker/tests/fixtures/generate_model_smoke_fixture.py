"""Generate model-supported-title.png without fonts or external assets.

The block glyphs below are original test artwork released with this repository.
The generated image is committed so model smoke tests never depend on an OS
font or execute this script at test runtime.
"""

from pathlib import Path

from PIL import Image, ImageDraw


GLYPHS = {
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "N": ("10001", "11001", "11001", "10101", "10011", "10011", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
}


def draw_block_text(
    draw: ImageDraw.ImageDraw,
    position: tuple[int, int],
    text: str,
    *,
    scale: int,
) -> None:
    x, y = position
    glyph_width = 5 * scale
    for character in text:
        if character == " ":
            x += 2 * scale
            continue
        rows = GLYPHS[character]
        for row, pixels in enumerate(rows):
            for column, pixel in enumerate(pixels):
                if pixel == "1":
                    draw.rectangle(
                        (
                            x + column * scale,
                            y + row * scale,
                            x + (column + 1) * scale - 1,
                            y + (row + 1) * scale - 1,
                        ),
                        fill="black",
                    )
        x += glyph_width + 2 * scale


def main() -> None:
    image = Image.new("RGB", (1600, 1000), "white")
    draw = ImageDraw.Draw(image)
    draw_block_text(draw, (90, 70), "FRONT-ELEVATION", scale=10)

    # Sparse architectural elevation beneath the title.
    draw.rectangle((120, 300, 1480, 880), outline="black", width=8)
    draw.rectangle((220, 410, 650, 880), outline="black", width=8)
    draw.rectangle((950, 410, 1380, 880), outline="black", width=8)
    draw.rectangle((700, 500, 900, 880), outline="black", width=8)
    draw.line((120, 370, 1480, 370), fill="black", width=8)
    draw.line((120, 820, 1480, 820), fill="black", width=8)

    image.save(Path(__file__).with_name("model-supported-title.png"), "PNG")


if __name__ == "__main__":
    main()
