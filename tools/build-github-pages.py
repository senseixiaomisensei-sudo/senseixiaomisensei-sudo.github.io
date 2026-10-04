"""Publish the interface without duplicating the 10 GB Cloudflare model CDN."""
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STATIC_DIRS = {'assets', 'community', 'skills', 'docs'}
STATIC_FILES = {'.nojekyll', '_headers', '_redirects', 'robots.txt', 'sitemap.xml',
                'ads.txt', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md',
                'CONTRIBUTING.md', 'SECURITY.md'}


def included(relative: Path) -> bool:
    return (relative.parts[0] in STATIC_DIRS or
            len(relative.parts) == 1 and (relative.suffix.lower() in
            {'.html', '.css', '.js', '.ico', '.png', '.jpg', '.svg', '.webmanifest'}
            or relative.name in STATIC_FILES))


def build(destination: Path) -> tuple[int, int]:
    destination = destination.resolve()
    if destination == ROOT or ROOT in destination.parents or destination.exists():
        raise ValueError('Use a new output directory outside the checkout')
    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).split(b'\0')
    selected = [Path(item.decode('utf8')) for item in paths if item and included(Path(item.decode('utf8')))]
    total = sum((ROOT / relative).stat().st_size for relative in selected)
    if total >= 1024 ** 3:
        raise ValueError('Static site exceeds GitHub Pages 1 GB limit')
    destination.mkdir(parents=True)
    for relative in selected:
        source = ROOT / relative
        if source.is_symlink():
            raise ValueError(f'Symlinks are not published: {relative}')
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    return len(selected), total


if __name__ == '__main__':
    count, size = build(Path(sys.argv[1]))
    print(f'Published static files: {count}; bytes: {size}; models: existing Cloudflare CDN')
