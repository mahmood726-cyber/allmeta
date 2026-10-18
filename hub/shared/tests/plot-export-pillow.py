"""Independent libtiff/Pillow check used by Playwright and pytest."""
import sys
from PIL import Image


def check(path, width, height, dpi):
    with Image.open(path) as image:
        image.load()
        assert image.size == (width, height)
        assert image.mode == 'RGB'
        assert image.info['compression'] == 'tiff_lzw'
        assert image.info['dpi'] == (dpi, dpi)
        assert image.getpixel((0, 0)) == (255, 255, 255)


if __name__ == '__main__':
    check(sys.argv[1], *map(int, sys.argv[2:]))
    print('Pillow: RGB, tiff_lzw, dimensions, DPI and white pixel PASS')
