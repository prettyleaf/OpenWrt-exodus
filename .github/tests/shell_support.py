import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ShellCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.opt = self.root / 'opt'
        shutil.copytree(ROOT / 'asuswrt/opt', self.opt)
        for path in self.opt.rglob('*'):
            if path.is_file() and (path.suffix in ('.sh', '.cgi') or path.name in ('exodus','S99exodus')):
                path.write_bytes(path.read_bytes().replace(b'\r\n', b'\n'))
        self.share = self.opt / 'share/exodus'
        self.home = self.opt / 'etc/exodus'
        self.ram = self.root / 'tmp/exodus'
        self.jffs = self.root / 'jffs'
        self.www = self.root / 'www'
        for path in (self.opt / 'bin', self.jffs / 'addons', self.www / 'user'):
            path.mkdir(parents=True, exist_ok=True)
        jq = shutil.which('jq')
        if jq is None:
            raise RuntimeError('Shell tests require jq on PATH.')
        (self.opt / 'bin/jq').symlink_to(jq)
        self.env = {**os.environ, 'EXODUS_OPT': str(self.opt), 'EXODUS_TMP': str(self.ram),
                    'EXODUS_JFFS': str(self.jffs), 'EXODUS_WWW': str(self.www),
                    'EXODUS_HELPER': str(self.root / 'helper.sh')}
        self.sh('prepare_files')

    def sh(self, command, libraries=(), check=True):
        source = f'. "{self.share}/lib/common.sh"\n'
        source += ''.join(f'. "{self.share}/lib/{lib}.sh"\n' for lib in libraries)
        return subprocess.run(['sh', '-c', source + command], env=self.env,
                              capture_output=True, text=True, check=check, timeout=20)

    def api(self, action, **params):
        request = self.root / 'request.json'
        response = self.root / 'response.json'
        request.write_text(json.dumps({'action': action, **params}), encoding='utf8')
        self.sh(f'api_run "{request}" "{response}"', ('api',))
        return json.loads(response.read_text())

    def mock(self, name, content):
        path = self.opt / 'bin' / name
        path.write_text('#!/bin/sh\n' + content + '\n')
        path.chmod(0o755)
