"""Pack/unpack large WAV masters without changing a byte (GitHub connector transport)."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / 'assets/art-audio-v1/sources/audio-wav/ambience'
INDEX = MASTERS / 'parts.json'

if len(sys.argv) > 1 and sys.argv[1] == 'pack':
    entries = []
    for path in sorted(MASTERS.glob('*.wav')):
        data = path.read_bytes()
        parts = []
        for offset in range(0, len(data), 3_000_000):
            piece = data[offset:offset + 3_000_000]
            name = f'{path.name}.part{len(parts) + 1:02}'
            (MASTERS / name).write_bytes(piece)
            parts.append({'path': name, 'bytes': len(piece), 'sha256': hashlib.sha256(piece).hexdigest()})
        entries.append({'path': path.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'parts': parts})
    if not entries:
        raise SystemExit('No WAV masters to pack')
    INDEX.write_text(json.dumps({'schema': 'shov.wav-parts.v1', 'masters': entries}, indent=2) + '\n')
    print(f'Packed {len(entries)} WAV masters without compression or resampling.')
else:
    for entry in json.loads(INDEX.read_text())['masters']:
        chunks = []
        for part in entry['parts']:
            data = (MASTERS / part['path']).read_bytes()
            if len(data) != part['bytes'] or hashlib.sha256(data).hexdigest() != part['sha256']:
                raise SystemExit(f'Corrupt WAV part: {part["path"]}')
            chunks.append(data)
        data = b''.join(chunks)
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise SystemExit(f'Corrupt WAV master: {entry["path"]}')
        (MASTERS / entry['path']).write_bytes(data)
        print(f'Restored and verified {entry["path"]} ({len(data)} bytes).')
