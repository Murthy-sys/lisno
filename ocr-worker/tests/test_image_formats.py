from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from lisno_ocr.image_formats import ImageSourceError, open_source_pages


def _rgb_image(color: str, size: tuple[int, int]) -> Image.Image:
    return Image.new("RGB", size, color)


def test_open_source_pages_decodes_tiff_frames_as_ordered_rgb_pages():
    first = _rgb_image("red", (7, 5))
    second = _rgb_image("blue", (5, 7))
    source = BytesIO()
    try:
        first.save(source, format="TIFF", save_all=True, append_images=[second])
    finally:
        first.close()
        second.close()

    pages = list(open_source_pages(BytesIO(source.getvalue())))
    try:
        assert [(page.mode, page.size, page.getpixel((0, 0))) for page in pages] == [
            ("RGB", (7, 5), (255, 0, 0)),
            ("RGB", (5, 7), (0, 0, 255)),
        ]
    finally:
        for page in pages:
            page.close()


def test_open_source_pages_decodes_heic_as_rgb_page():
    pillow_heif = pytest.importorskip("pillow_heif")
    pillow_heif.register_heif_opener()
    image = _rgb_image("green", (7, 5))
    source = BytesIO()
    try:
        image.save(source, format="HEIF")
    finally:
        image.close()

    pages = list(open_source_pages(BytesIO(source.getvalue())))
    try:
        assert [(page.mode, page.size) for page in pages] == [("RGB", (7, 5))]
    finally:
        for page in pages:
            page.close()


def test_open_source_pages_classifies_pillow_decompression_bombs(monkeypatch):
    def decompression_bomb(_source):
        raise Image.DecompressionBombError("too large")

    monkeypatch.setattr("lisno_ocr.image_formats.Image.open", decompression_bomb)

    with pytest.raises(ImageSourceError, match="could not be decoded"):
        list(open_source_pages(BytesIO(b"not an image")))
