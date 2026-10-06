import json
import subprocess
import shutil
import tarfile
import os
import pty
import select
import time
import re
from shell_support import ROOT
import test_webui


class MigrationTests(test_webui.WebuiTests):
    def setUp(self):
        super().setUp()
        self.nv.update(productid='MOCK', **{'jffs2_scripts':'1'})
        self.write_nv()
        self.env.update(CORE='meta', GH_PROXY='', PATH=str(self.opt/'bin')+':'+os.environ['PATH'])
        self.addCleanup(self.stop_cache)
        self.mock('opkg', 'echo "$*" >> "$EXODUS_JFFS/opkg.calls"\n[ "$1" != print-architecture ] || echo "arch aarch64 10"')
        for name in ('iptables','iptables-save','iptables-restore','ipset','pidof','ip'):
            self.mock(name, 'exit 1')
        libexec=self.opt/'libexec'
        (libexec/'exodus').mkdir(parents=True)
        for path,text in [(libexec/'exodus/yq','echo "yq mikefarah v4"'),(libexec/'exodus/mihomo','echo "Mihomo Meta v1.19.15"')]:
            path.write_text('#!/bin/sh\n'+text+'\n'); path.chmod(0o755)
        config=json.loads((self.home/'config.json').read_text())
        config['web']={'port':12345}
        config['mixin']['api_secret']='keep-api-secret'
        config['mixin']['password']='keep-proxy-secret'
        config['config']['hwid']='keep-device'
        config['update']['core']='meta'
        (self.home/'config.json').write_text(json.dumps(config))
        (self.home/'web.auth').write_text('legacy:hash')
        (self.share/'BUILD').write_text('{"code":"fixture"}')
        self.installer=self.root/'install.sh'
        self.installer.write_text((ROOT/'install.sh').read_text())

    def stop_cache(self):
        if (self.share/'exodus').is_file():
            self.sh(f'"{self.share}/exodus" web stop',check=False)

    def bundle(self):
        source=self.root/'source'
        shutil.copytree(ROOT/'asuswrt', source/'repo/asuswrt')
        shutil.copy(ROOT/'install.sh',source/'repo/install.sh')
        shutil.copy(ROOT/'uninstall.sh',source/'repo/uninstall.sh')
        for p in source.rglob('*'):
            if p.is_file() and (p.suffix=='.sh' or p.name in ('exodus','S99exodus')):
                p.write_bytes(p.read_bytes().replace(b'\r\n',b'\n'))
        archive=self.root/'source.tar.gz'
        with tarfile.open(archive,'w:gz') as tar: tar.add(source/'repo',arcname='repo')
        self.env['FIXTURE_ARCHIVE']=str(archive)
        self.mock('curl', '''out=; url=
while [ "$#" -gt 0 ]; do
 case "$1" in -o) out="$2"; shift ;; http*) url="$1" ;; esac
 shift
done
echo "$url" >> "$EXODUS_JFFS/curl.calls"
case "$url" in
 */archive/legacy-webui.tar.gz) cp "$FIXTURE_LEGACY_ARCHIVE" "$out" ;;
 */archive/*.tar.gz) cp "$FIXTURE_ARCHIVE" "$out" ;;
 */VERSION) if [ -n "$out" ]; then printf '1.27.4\\n' > "$out"; else printf '1.27.4\\n'; fi ;;
 */version.txt) printf '%s\\n' "${FIXTURE_CORE_VERSION:-v1.19.15}" ;;
 */mihomo-*.gz) cp "$FIXTURE_CORE_GZ" "$out" ;;
 */yq_linux_*.tar.gz) cp "$FIXTURE_YQ_TAR" "$out" ;;
 *) exit 1 ;;
esac''')

    def install(self):
        return subprocess.run(['sh',str(self.installer)],env=self.env,capture_output=True,text=True,timeout=30,start_new_session=True)

    def foreign_mihomo(self):
        self.mock('pidof', '[ "$1" = mihomo ] && echo 12345')
        proc=self.root/'proc/12345';proc.mkdir(parents=True)
        (proc/'exe').symlink_to('/another-addon/mihomo')
        self.env['EXODUS_INSTALL_PROC']=str(proc.parent)

    def test_yq_is_verified_with_dependencies_and_completion_is_one_line(self):
        self.bundle()
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertLess(result.stdout.index('yq is already installed and working.'),
                        result.stdout.index('3/6'))
        self.assertEqual(result.stdout.strip().splitlines()[-1].strip(),'[ OK ] Installation complete.')
        self.assertNotIn('\nsuccess\n',result.stdout)

    def test_yq_download_failure_keeps_old_code_and_binary(self):
        self.bundle()
        yq=self.opt/'libexec/exodus/yq'
        previous=b'#!/bin/sh\nexit 1\n'
        yq.write_bytes(previous)
        build=(self.share/'BUILD').read_bytes()
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertIn('yq download failed',result.stdout)
        self.assertEqual(yq.read_bytes(),previous)
        self.assertEqual((self.share/'BUILD').read_bytes(),build)
        self.assertNotIn('/archive/',(self.jffs/'curl.calls').read_text())

    def test_staged_yq_restores_old_binary_if_registration_fails(self):
        self.bundle()
        yq=self.opt/'libexec/exodus/yq'
        previous=b'#!/bin/sh\nexit 1\n'
        yq.write_bytes(previous)
        candidate=self.root/'candidate-yq'
        candidate.write_bytes(b'#!/bin/sh\necho "yq mikefarah v4.99"\n')
        archive=self.root/'yq.tar.gz'
        with tarfile.open(archive,'w:gz') as tar:
            for arch in ('amd64','arm64','arm','mips','mipsle'):
                tar.add(candidate,arcname='yq_linux_'+arch)
        self.env['FIXTURE_YQ_TAR']=str(archive)
        for i in range(1,21): (self.www/f'user/user{i}.asp').write_text('foreign')
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertIn('native WebUI registration failed',result.stdout)
        self.assertEqual(yq.read_bytes(),previous)
        self.assertLess(result.stdout.index('Downloading and validating yq...'),
                        result.stdout.index('3/6'))

    def test_foreign_mihomo_requires_confirmation_before_dependencies(self):
        self.foreign_mihomo()
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertIn('ALLOW_RUNNING_MIHOMO=1',result.stdout)
        self.assertFalse((self.jffs/'opkg.calls').exists())
        self.assertFalse((self.jffs/'curl.calls').exists())
        self.assertFalse((self.opt/'tmp/exodus-install.lock').exists())

    def test_foreign_mihomo_explicit_noninteractive_override(self):
        self.foreign_mihomo();self.bundle();self.env['ALLOW_RUNNING_MIHOMO']='1'
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(result.stdout.strip().splitlines()[-1].strip(),'[ OK ] Installation complete.')
        self.assertNotIn('\x1b',result.stdout)

    def test_owned_mihomo_resolves_entware_symlinks_before_warning(self):
        self.bundle();self.mock('pidof','[ "$1" = mihomo ] && echo 12345')
        proc=self.root/'proc/12345';proc.mkdir(parents=True)
        (proc/'exe').symlink_to(self.opt/'libexec/exodus/mihomo')
        alias=self.root/'mounted-opt';alias.symlink_to(self.opt,target_is_directory=True)
        self.env.update(EXODUS_OPT=str(alias),EXODUS_INSTALL_PROC=str(proc.parent))
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertNotIn('another Mihomo',result.stdout)

    def install_at_terminal(self, answers):
        env={**self.env,'TERM':'xterm-256color'}
        env.pop('NO_COLOR',None)
        pid,terminal=pty.fork()
        if pid==0:
            os.execve('/bin/sh',['sh',str(self.installer)],env)
        output=b'';sent=0;deadline=time.monotonic()+30;status=None;done=0
        try:
            while time.monotonic()<deadline:
                if select.select([terminal],[],[],0.1)[0]:
                    try: chunk=os.read(terminal,65536)
                    except OSError: break
                    if not chunk: break
                    output+=chunk
                    prompts=output.count(b'[y/N,')
                    if prompts>sent and sent<len(answers):
                        os.write(terminal,(answers[sent]+'\n').encode())
                        sent+=1
                done,status=os.waitpid(pid,os.WNOHANG)
                if done: break
            if time.monotonic()>=deadline and not done:
                os.kill(pid,9);os.waitpid(pid,0)
                self.fail('terminal installer timed out: '+output.decode())
            if not done: _,status=os.waitpid(pid,0)
            return os.waitstatus_to_exitcode(status),output.decode()
        finally:
            os.close(terminal)

    def test_terminal_no_and_enter_cancel_before_any_dependencies(self):
        self.foreign_mihomo()
        for answer in ('Нет',''):
            with self.subTest(answer=answer):
                status,output=self.install_at_terminal([answer])
                self.assertNotEqual(status,0,output)
                self.assertIn('cancelled',output)
                self.assertIn('\x1b[93m',output)
                self.assertFalse((self.jffs/'opkg.calls').exists())
                self.assertFalse((self.jffs/'curl.calls').exists())

    def test_terminal_invalid_then_yes_continues_after_warning(self):
        self.foreign_mihomo();self.bundle()
        status,output=self.install_at_terminal(['maybe','Да'])
        self.assertEqual(status,0,output)
        self.assertIn('Enter Yes / Да',output)
        self.assertLess(output.index('[WARN]'),output.index('Dependencies and architecture'))
        last=re.sub(r'\x1b\[[0-9;]*m','',output.strip().splitlines()[-1]).strip()
        self.assertEqual(last,'[ OK ] Installation complete.')
        self.assertTrue((self.jffs/'opkg.calls').exists())

    def test_native_health_event_restarts_dead_cache_without_proxy_or_jffs_changes(self):
        self.mock('curl','exit 1')
        self.sh(f'"{self.share}/exodus" web start')
        pid=int((self.ram/'run/webui/cache.pid').read_text())
        # SIGKILL models OOM/crash: no EXIT trap can clear the PID or loop lock.
        os.kill(pid,9)
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            state=self.sh(f'cat /proc/{pid}/status',check=False)
            if state.returncode!=0 or 'State:\tZ' in state.stdout: break
            time.sleep(0.1)
        settings=self.jffs/'addons/custom_settings.txt'
        settings.write_text('foreign Cool Addon\nempty \n')
        config=(self.home/'config.json').read_bytes()
        ident='d'*32
        self.sh(f'webui_event restart exodus_ui_health_{ident}',('api','webui-api'))
        response=self.ram/f'run/webui/responses/{ident}.json'
        deadline=time.monotonic()+10
        while not response.exists() and time.monotonic()<deadline: time.sleep(0.1)
        self.assertTrue(response.exists())
        self.assertEqual(json.loads(response.read_text())['status'],200,response.read_text())
        self.assertNotEqual(int((self.ram/'run/webui/cache.pid').read_text()),pid)
        self.assertEqual(settings.read_text(),'foreign Cool Addon\nempty \n')
        self.assertEqual((self.home/'config.json').read_bytes(),config)
        self.assertFalse((self.ram/'run/supervisor.pid').exists())

    def test_cache_stop_cancels_hung_foreground_descendant(self):
        webui=self.ram/'run/webui';webui.mkdir(parents=True,exist_ok=True)
        child=subprocess.Popen(['sh','-c',
            'trap "exit 0" TERM; sh -c \'echo $$ > "$EXODUS_TMP/run/webui/stuck.pid"; exec sleep 300\'',
            str(self.share/'exodus'),'web','cache'],env=self.env,start_new_session=True)
        def cleanup():
            try: os.killpg(child.pid,9)
            except ProcessLookupError: pass
            child.wait(timeout=5)
        self.addCleanup(cleanup)
        (webui/'cache.pid').write_text(str(child.pid))
        deadline=time.monotonic()+5
        while not (webui/'stuck.pid').exists() and time.monotonic()<deadline: time.sleep(0.01)
        self.assertTrue((webui/'stuck.pid').exists())
        descendant=int((webui/'stuck.pid').read_text())
        result=self.web('msleep() { sleep 0.01; }; webui_cache_stop',False)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        child.wait(timeout=5)
        state=self.sh(f'cat /proc/{descendant}/status',check=False)
        self.assertTrue(state.returncode!=0 or 'State:\tZ' in state.stdout,'foreground child survived')
        self.assertFalse((webui/'cache.pid').exists())

    def legacy_bundle(self):
        source=self.root/'source/repo'
        archive=self.root/'legacy-source.tar.gz'
        with tarfile.open(archive,'w:gz') as tar:
            tar.add(source,arcname='repo',filter=lambda entry:
                    None if entry.name.endswith(('/Exodus.asp','/merlin.js')) else entry)
        self.env['FIXTURE_LEGACY_ARCHIVE']=str(archive)

    def test_upstream_asuswrt_is_default_download_source(self):
        self.bundle()
        self.legacy_bundle()
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        build=json.loads((self.share/'BUILD').read_text())
        self.assertEqual(build['ref'],'asuswrt')
        self.assertEqual(build['repository'],'prettyleaf/openwrt-exodus')
        calls=(self.jffs/'curl.calls').read_text()
        self.assertIn('https://github.com/prettyleaf/openwrt-exodus/archive/asuswrt.tar.gz',calls)
        self.assertNotIn('IKitKatt/',calls)
        self.assertIn('coreutils-base64',(self.jffs/'opkg.calls').read_text())

    def test_explicit_legacy_ref_reports_source_before_replacing_code(self):
        self.bundle();self.legacy_bundle()
        self.env['REF']='legacy-webui'
        previous=(self.share/'BUILD').read_bytes()
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertIn('incomplete application payload: asuswrt/opt/share/exodus/www/Exodus.asp',result.stdout)
        self.assertIn('prettyleaf/openwrt-exodus@legacy-webui',result.stdout)
        self.assertIn('native WebUI',result.stdout)
        self.assertEqual((self.share/'BUILD').read_bytes(),previous)
        self.assertFalse((self.jffs/'addons/exodus').exists())

    def test_explicit_ref_is_used_and_saved(self):
        self.bundle()
        self.env['REF']='native-test-tag'
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(json.loads((self.share/'BUILD').read_text())['ref'],'native-test-tag')
        self.assertIn('/archive/native-test-tag.tar.gz',(self.jffs/'curl.calls').read_text())

    def test_published_native_fork_can_be_selected_before_upstream_merge(self):
        self.bundle()
        self.env.update(REPOSITORY='IKitKatt/openwrt-exodus',REF='asuswrt-native')
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        build=json.loads((self.share/'BUILD').read_text())
        self.assertEqual(build['repository'],'IKitKatt/openwrt-exodus')
        self.assertEqual(build['ref'],'asuswrt-native')
        self.assertIn('https://github.com/IKitKatt/openwrt-exodus/archive/asuswrt-native.tar.gz',(self.jffs/'curl.calls').read_text())

    def test_installer_rejects_unusable_base64_before_replacing_code(self):
        self.mock('base64', 'exit 127')
        previous=(self.home/'config.json').read_bytes()
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertIn('base64',result.stdout)
        self.assertEqual((self.home/'config.json').read_bytes(),previous)
        self.assertFalse((self.jffs/'curl.calls').exists())

    def test_fork_repository_is_used_and_saved(self):
        self.bundle()
        self.env['REPOSITORY']='router-owner/Exodus-fork'
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        build=json.loads((self.share/'BUILD').read_text())
        self.assertEqual(build.get('repository'),'router-owner/Exodus-fork')
        self.assertEqual(build['ref'],'asuswrt')
        self.assertIn('https://github.com/router-owner/Exodus-fork/archive/asuswrt.tar.gz',(self.jffs/'curl.calls').read_text())

    def test_ax86u_3004_388_12_2_installs_native_ui(self):
        self.bundle()
        self.nv.update(productid='RT-AX86U',firmver='3.0.0.4',buildno='388.12',extendno='2')
        self.write_nv()
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.web('webui_status')
        self.assertEqual(json.loads((self.share/'BUILD').read_text())['repository'],'prettyleaf/openwrt-exodus')

    def repack(self):
        with tarfile.open(self.env['FIXTURE_ARCHIVE'],'w:gz') as tar:
            tar.add(self.root/'source/repo',arcname='repo')

    def fail_payload(self, action):
        cli=self.root/'source/repo/asuswrt/opt/share/exodus/exodus'
        cli.write_text(cli.read_text().replace('#!/bin/sh\n',f'#!/bin/sh\n[ "$1" != "{action}" ] || exit 1\n',1))
        self.repack()

    def test_local_source_installs_current_assets_and_uninstaller(self):
        self.bundle()
        source=self.root/'source/repo'
        css=source/'asuswrt/opt/share/exodus/www/style.css'
        css.write_text(css.read_text()+'\n/* local source fixture */\n')
        self.env['SOURCE_DIR']=str(source)
        self.env['FIXTURE_ARCHIVE']=str(self.root/'no-download.tar.gz')
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('local source fixture',(self.share/'www/style.css').read_text())
        self.assertTrue((self.share/'uninstall.sh').is_file())

    def test_incomplete_payload_is_rejected_before_stopping_old_ui(self):
        self.bundle(); self.sh(f'"{self.share}/exodus" web start')
        (self.root/'source/repo/asuswrt/opt/share/exodus/www/app.js').unlink()
        self.repack()
        result=self.install()
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.sh('pid_alive "$WEBUI_DIR/cache.pid"')
        self.assertEqual(json.loads((self.share/'BUILD').read_text())['code'],'fixture')

    def test_init_failure_rolls_back_and_error_is_last_line(self):
        self.bundle(); self.fail_payload('init')
        self.web('webui_mount')
        before=(self.home/'config.json').read_bytes()
        result=self.install()
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual((self.home/'config.json').read_bytes(),before)
        self.assertEqual(json.loads((self.share/'BUILD').read_text())['code'],'fixture')
        self.assertTrue(result.stdout.strip().splitlines()[-1].startswith('error:'))
        self.web('webui_status')

    def test_cache_encoder_failure_rolls_back_instead_of_reporting_success(self):
        self.bundle()
        api=self.root/'source/repo/asuswrt/opt/share/exodus/lib/webui-api.sh'
        api.write_text(api.read_text()+'\nbase64() { return 1; }\n')
        self.repack()
        previous=(self.home/'config.json').read_bytes()
        result=self.install()
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('base64 encoding failed',result.stderr)
        self.assertTrue(result.stdout.strip().splitlines()[-1].startswith('error:'))
        self.assertEqual((self.home/'config.json').read_bytes(),previous)
        self.assertEqual(json.loads((self.share/'BUILD').read_text())['code'],'fixture')

    def test_web_url_failure_or_empty_output_rolls_back(self):
        self.bundle()
        cli=self.root/'source/repo/asuswrt/opt/share/exodus/exodus'
        original=cli.read_text()
        before=(self.home/'config.json').read_bytes()
        for status in (0,1):
            with self.subTest(url_exit_status=status):
                cli.write_text(original.replace('#!/bin/sh\n',f'#!/bin/sh\n[ "$1 $2" != "web url" ] || exit {status}\n',1))
                self.repack()
                result=self.install()
                self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertEqual((self.home/'config.json').read_bytes(),before)
                self.assertEqual(json.loads((self.share/'BUILD').read_text())['code'],'fixture')
                self.assertEqual(result.stdout.strip().splitlines()[-1],'error: native WebUI URL unavailable')

    def test_term_during_initialization_rolls_back(self):
        self.bundle()
        cli=self.root/'source/repo/asuswrt/opt/share/exodus/exodus'
        cli.write_text(cli.read_text().replace('#!/bin/sh\n','#!/bin/sh\n[ "$1" != init ] || { kill -TERM "$PPID"; exit 1; }\n',1))
        self.repack()
        before=(self.home/'config.json').read_bytes()
        result=self.install()
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual((self.home/'config.json').read_bytes(),before)
        self.assertEqual(json.loads((self.share/'BUILD').read_text())['code'],'fixture')
        self.assertIn('interrupted by TERM',result.stdout.strip().splitlines()[-1])
        self.assertFalse((self.opt/'tmp/exodus-install.lock').exists())

    def test_unresolved_recovery_backup_is_not_overwritten(self):
        self.bundle()
        backup=self.opt/'tmp/exodus-install/backup'; backup.mkdir(parents=True)
        preserved=backup/'config.json'; preserved.write_text('recovery fixture')
        (backup.parent/'recovery-required').touch()
        result=self.install()
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(preserved.read_text(),'recovery fixture')
        self.assertNotIn('install packages',result.stdout)

    def test_service_failure_retains_rollback_until_activation(self):
        config=json.loads((self.home/'config.json').read_text()); config['config']['enabled']=True
        (self.home/'config.json').write_text(json.dumps(config))
        self.bundle(); self.fail_payload('restart')
        before=(self.home/'config.json').read_bytes()
        result=self.install()
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual((self.home/'config.json').read_bytes(),before)
        self.assertEqual(json.loads((self.share/'BUILD').read_text())['code'],'fixture')
        self.assertTrue(result.stdout.strip().splitlines()[-1].startswith('error:'))

    def test_hook_write_failure_rolls_back(self):
        self.bundle()
        self.mock('mv','for arg in "$@"; do case "$arg" in */scripts/service-event) exit 1 ;; esac; done\nexec /bin/mv "$@"')
        result=self.install()
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(json.loads((self.share/'BUILD').read_text())['code'],'fixture')

    def test_hook_read_failure_preserves_foreign_commands(self):
        self.bundle()
        (self.jffs/'scripts').mkdir()
        hook=self.jffs/'scripts/firewall-start'
        before='#!/bin/sh\necho foreign-addon\nexit 0\n'
        hook.write_text(before)
        for tool in ('tail','sed'):
            self.mock(tool,f'for arg in "$@"; do case "$arg" in */scripts/firewall-start) exit 1 ;; esac; done\nexec /bin/{tool} "$@"')
        result=self.install()
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(hook.read_text(),before)
        self.assertEqual(json.loads((self.share/'BUILD').read_text())['code'],'fixture')

    def test_uninstall_holds_installation_lock_during_cleanup(self):
        import time
        self.bundle()
        signal=self.root/'paused'; resume=self.root/'resume'
        self.mock('touch',f'case "$1" in */run/stop.flag) touch_marker="{signal}"; /bin/touch "$touch_marker"; while [ ! -f "{resume}" ]; do sleep 0.05; done ;; esac\nexec /bin/touch "$@"')
        script=self.root/'uninstall.sh'; script.write_text((ROOT/'uninstall.sh').read_text())
        child=subprocess.Popen(['sh',str(script)],env=self.env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        def cleanup():
            resume.touch()
            if child.poll() is None: child.terminate()
            child.communicate(timeout=10)
        self.addCleanup(cleanup)
        deadline=time.monotonic()+5
        while not signal.exists() and time.monotonic()<deadline: time.sleep(0.05)
        self.assertTrue(signal.exists(),'uninstaller did not reach pause')
        result=self.install()
        resume.touch()
        output,error=child.communicate(timeout=20)
        self.assertEqual(child.returncode,0,output+error)
        self.assertNotEqual(result.returncode,0,'installation succeeded inside uninstall cleanup')

    def test_uninstall_stops_core_renamed_into_recovery_backup(self):
        import sys
        core=self.opt/'libexec/exodus/mihomo'
        shutil.copyfile(sys.executable,core); core.chmod(0o755)
        child=subprocess.Popen([str(core),'-c','import time; time.sleep(60)','-d',str(self.home/'run')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        def cleanup():
            if child.poll() is None: child.terminate()
            child.wait(timeout=5)
        self.addCleanup(cleanup)
        backup=self.opt/'tmp/exodus-install/backup'; backup.mkdir(parents=True)
        core.rename(backup/'mihomo')
        (self.ram/'run/core.pid').write_text(str(child.pid))
        (self.share/'exodus').write_text('#!/bin/sh\nexit 1\n')
        script=self.root/'uninstall.sh'; script.write_text((ROOT/'uninstall.sh').read_text())
        result=subprocess.run(['sh',str(script)],env=self.env,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIsNotNone(child.poll(),'renamed owned core remained alive')

    def test_uninstall_stops_core_with_symlinked_opt_mount(self):
        import sys
        core=self.opt/'libexec/exodus/mihomo'
        shutil.copyfile(sys.executable,core); core.chmod(0o755)
        alias=self.root/'opt-link'; alias.symlink_to(self.opt,target_is_directory=True)
        self.env['EXODUS_OPT']=str(alias)
        child=subprocess.Popen([str(alias/'libexec/exodus/mihomo'),'-c','import time; time.sleep(60)','-d',str(alias/'etc/exodus/run')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        def cleanup():
            if child.poll() is None: child.terminate()
            child.wait(timeout=5)
        self.addCleanup(cleanup)
        (self.ram/'run/core.pid').write_text(str(child.pid))
        (self.share/'exodus').write_text('#!/bin/sh\nexit 1\n')
        script=self.root/'uninstall.sh'; script.write_text((ROOT/'uninstall.sh').read_text())
        result=subprocess.run(['sh',str(script)],env=self.env,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIsNotNone(child.poll(),'owned core on symlinked Entware mount remained alive')

    def test_registration_failure_restores_replaced_core(self):
        import gzip
        self.bundle()
        core=self.opt/'libexec/exodus/mihomo'; before=core.read_bytes()
        fixture=self.root/'core.gz'
        fixture.write_bytes(gzip.compress(b'#!/bin/sh\necho "Mihomo Meta v1.99.0"\n'))
        self.env.update(FIXTURE_CORE_VERSION='v1.99.0',FIXTURE_CORE_GZ=str(fixture))
        for i in range(1,21): (self.www/f'user/user{i}.asp').write_text('foreign')
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(core.read_bytes(),before)
        self.assertTrue(result.stdout.strip().splitlines()[-1].startswith('error:'))

    def test_broken_cli_uninstall_stops_owned_watch(self):
        self.mock('id', 'echo "sh: id: not found" >&2; exit 127')
        (self.share/'exodus').write_text('#!/bin/sh\nexit 1\n')
        child=subprocess.Popen(['sh','-c','trap "exit 0" TERM; while :; do sleep 1; done',str(self.share/'exodus'),'watch'],env=self.env)
        def cleanup():
            if child.poll() is None: child.terminate(); child.wait(timeout=5)
        self.addCleanup(cleanup)
        (self.ram/'run/watch.pid').write_text(str(child.pid))
        script=self.root/'uninstall.sh'; script.write_text((ROOT/'uninstall.sh').read_text())
        result=subprocess.run(['sh',str(script)],env=self.env,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIsNotNone(child.poll(),'owned watcher still running after uninstall')
        self.assertNotIn('id: not found',result.stderr)

    def test_uninstall_menu_failure_keeps_files_and_reports_error(self):
        self.web('webui_mount')
        (self.share/'exodus').write_text('#!/bin/sh\nexit 1\n')
        self.mock('mount','exit 1')
        self.mock('ip','echo "$*" >> "$EXODUS_JFFS/ip.calls"\nexit 1')
        script=self.root/'uninstall.sh'; script.write_text((ROOT/'uninstall.sh').read_text())
        result=subprocess.run(['sh',str(script)],env=self.env,capture_output=True,text=True,timeout=20)
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertTrue(self.share.exists())
        self.assertTrue(self.home.exists())
        self.assertTrue(result.stdout.strip().splitlines()[-1].startswith('error:'))
        self.assertIn('route flush table 7892',(self.jffs/'ip.calls').read_text())

    def test_live_installer_lock_blocks_install_and_uninstall(self):
        self.bundle()
        lock=self.opt/'tmp/exodus-install.lock'; lock.mkdir(parents=True)
        (lock/'pid').write_text(str(os.getpid()))
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.jffs/'opkg.calls').read_text().strip(),'print-architecture')
        script=self.root/'uninstall.sh'; script.write_text((ROOT/'uninstall.sh').read_text())
        result=subprocess.run(['sh',str(script)],env=self.env,capture_output=True,text=True,timeout=20)
        self.assertNotEqual(result.returncode,0)
        self.assertTrue(self.share.exists())

    def test_preflight_failure_keeps_old_install(self):
        self.nv['extendno']='0'; self.write_nv()
        before=(self.home/'config.json').read_bytes()
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.home/'config.json').read_bytes(),before)
        self.assertFalse((self.jffs/'opkg.calls').exists())
        self.assertTrue((self.share/'exodus').is_file())
        self.assertIn('unsupported firmware',result.stdout)

    def test_installer_and_helper_version_bounds_agree(self):
        self.mock('curl','exit 1')
        for firm,build,ext,expected in test_webui.FIRMWARE_CASES:
            self.nv.update(firmver=firm,buildno=build,extendno=ext); self.write_nv()
            calls=self.jffs/'opkg.calls'; calls.unlink(missing_ok=True)
            valid=self.web('webui_preflight',False).returncode==0
            self.assertEqual(valid,expected,(firm,build,ext))
            self.install()
            self.assertEqual(calls.exists(),valid,(firm,build,ext))

    def test_migration_preserves_data_and_hooks_are_idempotent(self):
        self.bundle()
        (self.jffs/'scripts').mkdir()
        foreign=self.jffs/'scripts/service-event'
        foreign.write_text('#!/bin/sh\necho foreign # other addon\n')
        for _ in range(2):
            result=self.install()
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        config=json.loads((self.home/'config.json').read_text())
        self.assertEqual(config['web']['port'],12345)
        self.assertEqual(config['mixin']['api_secret'],'keep-api-secret')
        self.assertEqual(config['mixin']['password'],'keep-proxy-secret')
        self.assertEqual((self.home/'web.auth').read_text(),'legacy:hash')
        self.assertEqual(foreign.read_text().count('# exodus'),1)
        self.assertIn('other addon',foreign.read_text())
        self.assertNotIn('lighttpd',(self.jffs/'opkg.calls').read_text())
        self.assertIn('user1.asp',result.stdout)
        self.sh(f'"{self.share}/exodus" web stop')

    def test_only_old_exodus_web_stopped(self):
        self.env['EXODUS_PROC']=str(self.root/'proc')
        proc=self.root/'proc/99999'; proc.mkdir(parents=True)
        (proc/'cmdline').write_bytes(b'foreign-server\0')
        (self.ram/'run/web.pid').write_text('99999')
        signal=self.root/'signal'
        self.web(f'kill() {{ echo "$*" >> "{signal}"; }}; webui_stop_legacy')
        self.assertFalse(signal.exists())

    def test_verified_legacy_pid_is_stopped(self):
        self.env['EXODUS_PROC']=str(self.root/'proc')
        proc=self.root/'proc/99999'; proc.mkdir(parents=True)
        executable=self.opt/'sbin/lighttpd'; executable.parent.mkdir(exist_ok=True)
        executable.write_text('fixture')
        (proc/'exe').symlink_to(executable)
        (proc/'status').write_text('Uid:\t0\t0\t0\t0\n')
        (proc/'cmdline').write_bytes((str(executable)+'\0-f\0'+str(self.ram/'run/lighttpd.conf')+'\0').encode())
        (self.ram/'run/web.pid').write_text('99999')
        signal=self.root/'signal'
        self.web(f'kill() {{ echo "$*" >> "{signal}"; }}; webui_stop_legacy')
        self.assertEqual(signal.read_text().strip(),'99999')
        self.assertFalse((self.ram/'run/web.pid').exists())

    def test_update_preserves_ram_response_and_proxy_stop_keeps_ui(self):
        self.bundle()
        self.web('webui_mount')
        response=self.ram/'run/webui/responses'/('a'*32+'.json')
        response.write_text('{"fixture":"pending update response"}')
        result=self.install()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertEqual(response.read_text(),'{"fixture":"pending update response"}')
        self.sh(f'"{self.share}/exodus" stop',check=False)
        self.web('webui_status')
        self.assertTrue((self.ram/'run/webui/cache.pid').exists())

    def test_late_usb_boot_stub_restores_ui(self):
        self.web('webui_mount; webui_unmount')
        delayed=self.share.with_name('exodus.delayed')
        self.share.rename(delayed)
        # The first retry simulates Entware becoming available.
        self.mock('sleep', f'if [ -d "{delayed}" ]; then mv "{delayed}" "{self.share}"; else /bin/sleep "$@"; fi')
        boot=self.jffs/'addons/exodus/boot.sh'
        result=subprocess.run(['sh',str(boot)],env=self.env,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.web('webui_status')

    def test_cache_restart_keeps_current_worker_pid(self):
        result=self.sh(f'"{self.share}/exodus" web start && "{self.share}/exodus" web restart && sleep 6; pid_alive "$WEBUI_DIR/cache.pid"',check=False)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_web_stop_stops_owned_update_check_without_cache_pid(self):
        child=subprocess.Popen(['sh','-c','trap \'rm -f "$EXODUS_TMP/run/webui/update.pid"; exit 0\' TERM; while :; do sleep 1; done',str(self.share/'exodus'),'web','updates'],env=self.env)
        def cleanup():
            if child.poll() is None: child.terminate(); child.wait(timeout=5)
        self.addCleanup(cleanup)
        (self.ram/'run/webui').mkdir(parents=True,exist_ok=True)
        (self.ram/'run/webui/update.pid').write_text(str(child.pid))
        self.web('webui_cache_stop')
        self.assertIsNotNone(child.poll(),'background update still runs after stopping native WebUI')

    def test_web_stop_cancels_real_update_worker_before_cache_publication(self):
        import time
        import threading
        (self.ram/'run/webui').mkdir(parents=True,exist_ok=True)
        self.mock('curl', '''touch "$EXODUS_JFFS/curl-running"
sleep 3
printf 'v9.9.9\\n'
touch "$EXODUS_JFFS/curl-finished"''')
        child=subprocess.Popen([str(self.share/'exodus'),'web','updates'],env=self.env,
                               stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        reaper=threading.Thread(target=child.wait,daemon=True)
        reaper.start()  # Emulate init reaping the detached CLI, including on TERM.
        def cleanup():
            if child.poll() is None:
                child.kill()
            reaper.join(timeout=5)
        self.addCleanup(cleanup)
        deadline=time.monotonic()+5
        while not (self.jffs/'curl-running').exists() and time.monotonic()<deadline:
            time.sleep(.05)
        self.assertTrue((self.jffs/'curl-running').exists(),'real update check did not start')
        self.web('msleep() { sleep 0.1; }; webui_cache_stop')
        reaper.join(timeout=5)
        self.assertFalse((self.ram/'run/webui/update.pid').exists())
        self.assertFalse(list((self.ram/'run').glob('latest.*')),'interrupted archive left files in RAM')
        time.sleep(3.5)
        self.assertFalse((self.jffs/'curl-finished').exists(),'network child survived WebUI stop')
        self.assertFalse((self.ram/'run/webui/cache/check_update.json').exists(),
                         'stopped update check published a late cache response')

    def test_uninstall_broken_cli_removes_only_owned_registration(self):
        self.web('webui_mount')
        target=self.www/'require/modules/menuTree.js'
        visible=target.read_text()+'\n// latest foreign menu entry\n'
        target.unlink(); target.write_text(visible)
        (self.share/'exodus').write_text('#!/bin/sh\nexit 1\n')
        script=self.root/'uninstall.sh'; script.write_text((ROOT/'uninstall.sh').read_text())
        result=subprocess.run(['sh',str(script)],env=self.env,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertFalse(self.home.exists())
        self.assertFalse((self.www/'user/user1.asp').exists())
        self.assertIn('Other addon',(self.root/'tmp/menuTree.js').read_text())
        self.assertIn('latest foreign menu entry',target.read_text())
        self.assertEqual((self.www/'user/user20.asp').read_text(),'foreign page')

    def test_registration_failure_has_no_success(self):
        self.bundle()
        for i in range(1,21): (self.www/f'user/user{i}.asp').write_text('foreign')
        before=(self.home/'config.json').read_bytes()
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('\nsuccess\n',result.stdout)
        self.assertEqual((self.home/'config.json').read_bytes(),before)
        self.assertNotIn('[ OK ] Installation complete.',result.stdout)
        self.assertTrue((self.share/'BUILD').read_text().startswith('{"code":"fixture"}'))

    def test_staging_failure_keeps_previous_webui_running(self):
        self.bundle(); self.sh(f'"{self.share}/exodus" web start')
        before=(self.home/'config.json').read_bytes()
        self.mock('cp','case "$1" in -R) exit 1 ;; esac\nexec /bin/cp "$@"')
        result=self.install()
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.home/'config.json').read_bytes(),before)
        self.sh('pid_alive "$WEBUI_DIR/cache.pid"')
        self.web('webui_status')

    def test_broken_cli_uninstall_stops_live_owned_cache(self):
        self.sh(f'"{self.share}/exodus" web start')
        pid=int((self.ram/'run/webui/cache.pid').read_text())
        def cleanup():
            from pathlib import Path
            cmd=Path('/proc')/str(pid)/'cmdline'
            if cmd.exists() and str(self.share/'exodus').encode() in cmd.read_bytes().split(b'\0'):
                try: os.kill(pid,9)
                except ProcessLookupError: pass
        self.addCleanup(cleanup)
        (self.share/'exodus').write_text('#!/bin/sh\nexit 1\n')
        script=self.root/'uninstall.sh'; script.write_text((ROOT/'uninstall.sh').read_text())
        result=subprocess.run(['sh',str(script)],env=self.env,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        import time
        time.sleep(6)
        self.assertFalse(self.ram.exists())
        # Zombies are stopped processes, not executing cache daemons.
        state=(__import__('pathlib').Path('/proc')/str(pid)/'status')
        self.assertTrue(not state.exists() or 'State:\tZ' in state.read_text())

    def test_passwd_does_not_read_or_replace_legacy_auth(self):
        auth=(self.home/'web.auth').read_bytes()
        result=self.sh(f'"{self.share}/exodus" passwd',check=False)
        self.assertIn('Merlin',result.stdout)
        self.assertEqual((self.home/'web.auth').read_bytes(),auth)

    def test_uninstall_keeps_foreign_addons_and_keep_config(self):
        self.web('webui_mount')
        settings=self.jffs/'addons/custom_settings.txt'
        settings.write_text('other keep\nexodus_packet {}\n')
        script=self.root/'uninstall.sh'; script.write_text((ROOT/'uninstall.sh').read_text())
        self.env['KEEP_CONFIG']='1'
        result=subprocess.run(['sh',str(script)],env=self.env,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertTrue((self.home/'config.json').exists())
        self.assertEqual((self.www/'user/user20.asp').read_text(),'foreign page')
        self.assertEqual(settings.read_text(),'other keep\n')
