from __future__ import annotations

from collections.abc import Iterator
from os import PathLike
from typing import BinaryIO

from PIL import Image, UnidentifiedImageError


class ImageSourceError(ValueError):
    """Raised when an image source cannot be decoded safely."""


def open_source_pages(
    source: str | PathLike[str] | BinaryIO,
    *,
    max_page_pixels: int = 40_000_000,
    max_pages: int = 50,
) -> Iterator[Image.Image]:
    """Yield each source frame as an independent RGB Pillow image."""
    _register_heif_opener()
    image: Image.Image | None = None
    try:
        image = Image.open(source)
        frame_count = getattr(image, "n_frames", 1)
        if frame_count > max_pages:
            raise ImageSourceError("The source image contains too many pages.")
        for frame_number in range(frame_count):
            image.seek(frame_number)
            if image.width * image.height > max_page_pixels:
                raise ImageSourceError("A source image page is too large.")
            image.load()
            yield image.convert("RGB")
    except ImageSourceError:
        raise
    except (
        Image.DecompressionBombError,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as error:
        raise ImageSourceError("The source image could not be decoded.") from error
    finally:
        if image is not None:
            image.close()


def _register_heif_opener() -> None:
    try:
        import pillow_heif
    except ImportError:
        return
    pillow_heif.register_heif_opener()
