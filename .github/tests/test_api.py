import json
from shell_support import ShellCase


class ApiTests(ShellCase):
    def test_all_existing_logs_read_and_clear_only_the_selected_file(self):
        names = ('app', 'core', 'update', 'debug', 'web')
        contents = {name: f'{name}: event\nПривет 😀 <% event %>\n' for name in names}
        for name, content in contents.items():
            (self.ram / f'log/{name}.log').write_text(content, encoding='utf8')
        for name, content in contents.items():
            with self.subTest(name=name):
                response = self.api('log_read', name=name)
                self.assertEqual(response['status'], 200)
                self.assertEqual(response['data']['content'], content)
        self.assertEqual(self.api('log_clear', name='core')['status'], 200)
        for name, content in contents.items():
            self.assertEqual((self.ram / f'log/{name}.log').read_text(), '' if name == 'core' else content)
        for action in ('log_read', 'log_clear'):
            self.assertEqual(self.api(action, name='../outside')['status'], 400)

    def test_log_read_returns_latest_megabyte(self):
        content = b'old event\n' + b'x' * (1048576 - 13) + b'latest event\n'
        (self.ram / 'log/core.log').write_bytes(content)
        response = self.api('log_read', name='core')
        self.assertEqual(response['status'], 200)
        self.assertEqual(response['data']['content'].encode(), content[-1048576:])

    def test_passive_update_read_never_contacts_network(self):
        self.mock('curl','echo called >> "$EXODUS_JFFS/network.calls"; exit 1')
        info=self.api('check_update',cached=True)
        self.assertEqual(info['status'],200)
        self.assertIsNone(info['data']['app_latest'])
        self.assertFalse((self.jffs/'network.calls').exists())

    def test_about_without_build_uses_upstream_asuswrt(self):
        (self.share/'BUILD').unlink(missing_ok=True)
        info=self.api('about')['data']
        self.assertEqual(info['repository'],'prettyleaf/openwrt-exodus')
        self.assertEqual(info['ref'],'asuswrt')

    def test_about_reports_installed_fork(self):
        (self.share/'BUILD').write_text(json.dumps({'repository':'router-owner/Exodus-fork','ref':'asuswrt-native'}))
        info=self.api('about')['data']
        self.assertEqual(info['repository'],'router-owner/Exodus-fork')
        self.assertEqual(info['ref'],'asuswrt-native')

    def test_update_passes_installed_fork_and_ref_to_installer(self):
        (self.share/'BUILD').write_text(json.dumps({'repository':'router-owner/Exodus-fork','ref':'native-test-tag'}))
        installer=self.share/'install.sh'
        installer.write_text('#!/bin/sh\nprintf "%s|%s" "$REPOSITORY" "$REF" > "$EXODUS_JFFS/update-source"\n')
        request=self.root/'request.json'; response=self.root/'response.json'
        request.write_text('{"action":"update"}')
        self.sh(f'daemonize() {{ "$@"; }}; api_run "{request}" "{response}"',('api',))
        self.assertEqual((self.jffs/'update-source').read_text(),'router-owner/Exodus-fork|native-test-tag')

    def test_update_check_uses_installed_fork_and_separates_cache(self):
        (self.share/'BUILD').write_text(json.dumps({'repository':'router-owner/Exodus-fork','ref':'asuswrt-native'}))
        archive=self.root/'fork.tar.gz'
        import tarfile
        with tarfile.open(archive,'w:gz') as bundle:
            bundle.add(self.opt,arcname='repo/asuswrt/opt')
        self.env['FIXTURE_ARCHIVE']=str(archive)
        self.mock('curl','''out=; url=
while [ "$#" -gt 0 ]; do case "$1" in -o) out="$2"; shift ;; http*) url="$1" ;; esac; shift; done
echo "$url" >> "$EXODUS_JFFS/curl.calls"
case "$url" in */archive/*.tar.gz) cp "$FIXTURE_ARCHIVE" "$out" ;; */version.txt) echo v1.19.15 ;; *) exit 1 ;; esac''')
        # A cached result for another fork must not conceal this fork's update.
        self.sh('jq -n --argjson now "$(date +%s)" \'{time:$now,core_type:"meta",ref:"asuswrt-native",repository:"another/fork",app_latest:"old-cache"}\' > "$RUN_TMP/update_check.json"')
        self.api('check_update')
        self.assertTrue((self.jffs/'curl.calls').exists(),'update cache from a different fork was reused')
        self.assertIn('https://github.com/router-owner/Exodus-fork/archive/asuswrt-native.tar.gz',(self.jffs/'curl.calls').read_text())

    def test_native_dispatch_has_no_independent_login_or_password(self):
        for action in ('login','logout','passwd'):
            self.assertEqual(self.api(action)['status'],400)

    def test_load_preserves_config(self):
        original = json.loads((self.home / 'config.json').read_text())
        self.assertEqual(self.api('load')['data']['config'], original)

    def test_config_set_keeps_unknown_fields(self):
        config = json.loads((self.home / 'config.json').read_text())
        config['other_addon'] = {'opaque': 'keep me'}
        result = self.api('config_set', config=config)
        self.assertEqual(result['status'], 200)
        self.assertEqual(json.loads((self.home / 'config.json').read_text()), config)

    def test_service_rejects_unknown_op(self):
        self.assertEqual(self.api('service', op='shell')['status'], 400)

    def test_file_access_rejects_escape_and_symlink(self):
        outside = self.root / 'outside'
        outside.mkdir()
        secret = outside / 'secret.yaml'
        secret.write_text('private')
        profiles = self.home / 'profiles'
        (profiles / 'secret.yaml').symlink_to(secret)
        for path in (profiles / '../config.json', profiles / 'secret.yaml'):
            self.assertEqual(self.api('file_write', path=str(path), content='bad')['status'], 403)
        profiles.rename(self.home / 'old-profiles')
        profiles.symlink_to(outside, target_is_directory=True)
        self.assertEqual(self.api('file_write', path=str(profiles / 'new.yaml'), content='bad')['status'], 403)
        self.assertFalse((outside / 'new.yaml').exists())
        self.assertEqual(secret.read_text(), 'private')

    def test_file_write_round_trip(self):
        path = str(self.home / 'profiles/demo.yaml')
        content = 'name: "Привет 😀 <% test %>"\n'
        self.assertEqual(self.api('file_write', path=path, content=content)['status'], 200)
        self.assertEqual(self.api('file_read', path=path)['data']['content'], content)
