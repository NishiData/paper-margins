"""Build an unpacked-extension ZIP using only Python's standard library."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parent.parent
extension = root / 'extension'
version = json.loads((extension / 'manifest.json').read_text(encoding='utf-8'))['version']
output = root / 'dist' / f'paper-margins-v{version}.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(extension.rglob('*')):
        if file.is_file():
            archive.write(file, Path('extension') / file.relative_to(extension))
    archive.write(root / 'README.md', 'README.md')
    archive.write(root / 'LICENSE', 'LICENSE')
    for file in sorted((root / 'docs').glob('*.md')):
        archive.write(file, Path('docs') / file.name)
with zipfile.ZipFile(output) as archive:
    broken = archive.testzip()
    if broken:
        raise RuntimeError(f'Corrupt ZIP entry: {broken}')
print(output)
