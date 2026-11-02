from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright
from browser_smoke import ROOT, MOCK
import json, time

class Backend:
    def __init__(self):
        self.revision=0
        self.envelope=None
        self.requests=[]
        self.block_android=False
        self.android_pushes=0
        self.desktop_pushes=0

def run():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    base='http://127.0.0.1:'+str(server.server_port)+'/index.html'
    backend=Backend()
    try:
        with sync_playwright() as sp:
            browser=sp.chromium.launch(headless=True,args=['--no-sandbox'])
            def create_page(android):
                context=browser.new_context(viewport={'width':390 if android else 1280,'height':800},
                  user_agent=('Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/123 Safari/537.36'
                    if android else 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123 Safari/537.36'),
                  service_workers='block',accept_downloads=True)
                context.add_init_script(MOCK)
                page=context.new_page()
                errors=[]
                page.on('pageerror',lambda err:errors.append(str(err)))
                def route_handler(route):
                    req=route.request
                    path=req.url.split('.co',1)[-1]
                    body=req.post_data_json if req.post_data else {}
                    if '/token?grant_type=password' in req.url:
                        data={'access_token':'fake-token','refresh_token':'fake-refresh',
                              'token_type':'bearer','expires_in':3600,
                              'user':{'id':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','email':'finance-test@example.org'}}
                        return route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
                    if '/auth/v1/user' in req.url:
                        return route.fulfill(status=200,content_type='application/json',body=json.dumps(
                          {'id':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','email':'finance-test@example.org'}))
                    if '/rpc/finance_pull_vault' in req.url:
                        data={'revision':backend.revision,'envelope':backend.envelope}
                        return route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
                    if '/rpc/finance_push_vault' in req.url:
                        backend.requests.append({'android':android,'body':body})
                        if android and backend.block_android:
                            return route.fulfill(status=503,content_type='application/json',body='{"message":"offline simulated"}')
                        if body['p_expected_revision']==backend.revision:
                            backend.revision+=1;backend.envelope=body['p_envelope']
                            if android:backend.android_pushes+=1
                            else:backend.desktop_pushes+=1
                            data={'applied':True,'revision':backend.revision}
                        else:data={'applied':False,'revision':backend.revision,'conflict':True}
                        return route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
                    return route.fulfill(status=404,content_type='application/json',body='{}')
                page.route('https://cvrshlwutczmeyqotqbw.supabase.co/**',route_handler)
                page.goto(base,wait_until='domcontentloaded')
                page.locator('#pass').fill('SenhaDoCofre2026!')
                page.locator('#passConfirm').fill('SenhaDoCofre2026!')
                page.locator('#authButton').click()
                page.locator('#app:not(.hide)').wait_for(timeout=8000)
                page.locator('[data-page="sync"]').click()
                return context,page,errors
            def cloud_login(page):
                page.locator('#cloudEmail').fill('finance-test@example.org')
                page.locator('#cloudPassword').fill('SenhaNuvem2026!!')
                page.locator('#cloudLogin').click()
                page.wait_for_function("cloudState.userId!==null",timeout=10000)
            ctx_android,android,err_android=create_page(True)
            android.evaluate("""async()=>{
              state.accounts=[{id:'conta-android',name:'Conta de teste Android',type:'bank'}];
              state.transactions=[{id:'original-android',type:'expense',description:'Registro Android',amount:19.75,
                purchaseDate:'2026-10-26',paymentDate:'2026-10-26'}];
              await save();
            }""")
            cloud_login(android)
            assert backend.revision==0,'login must not upload Android data automatically'
            android.locator('#cloudAndroidConfirm').check()
            android.once('dialog',lambda d:d.accept())
            android.locator('#cloudPublishAndroid').click()
            android.wait_for_function("cloudState.localMeta?.revision===1",timeout=12000)
            assert backend.revision==1 and backend.android_pushes==1,'first upload should be Android'
            assert backend.desktop_pushes==0,'desktop must not seed cloud'
            assert backend.envelope['schema']=='meu-financeiro-encrypted-v1'

            ctx_desktop,desktop,err_desktop=create_page(False)
            desktop.evaluate("""async()=>{
              state.accounts=[{id:'fake-bank',name:'Conta de testes desktop',type:'bank'}];
              state.transactions=[{id:'desktop-fixture',type:'expense',description:'Teste desktop',amount:100,
                purchaseDate:'2026-10-26',paymentDate:'2026-10-26'}];await save();
            }""")
            cloud_login(desktop)
            assert backend.revision==1 and backend.desktop_pushes==0,'desktop login must never overwrite'
            with desktop.expect_download() as d:desktop.locator('#cloudBackupLocal').click()
            assert d.value.suggested_filename.endswith('.json')
            desktop.locator('#cloudDesktopBackupConfirm').check()
            desktop.locator('#cloudVaultPassword').fill('SenhaDoCofre2026!')
            desktop.once('dialog',lambda d:d.accept())
            desktop.locator('#cloudReceiveDesktop').click()
            desktop.wait_for_function("cloudState.localMeta?.revision===1",timeout=10000)
            assert desktop.evaluate("state.transactions.map(x=>x.id)")==['original-android']
            assert desktop.evaluate("state.accounts[0].id")=='conta-android'
            assert backend.desktop_pushes==0,'receiving must not push test data'

            # Desktop change -> encrypted server revision 2.
            desktop.evaluate("""async()=>{
              state.transactions.push({id:'desktop-new',type:'expense',description:'Lançamento do desktop',
                amount:11.5,purchaseDate:'2026-10-27',paymentDate:'2026-10-27'});await save();
            }""")
            desktop.wait_for_function("cloudState.localMeta?.revision===2",timeout=15000)
            assert backend.revision==2 and backend.desktop_pushes==1
            # The Android auto-downloads when up-to-date and no local pending edits.
            android.evaluate("cloudRefresh()")
            android.wait_for_function("state.transactions.some(x=>x.id==='desktop-new')",timeout=15000)
            assert android.evaluate("state.transactions.length")==2

            # An offline Android edit and a desktop edit create a conflict, never overwrite.
            backend.block_android=True
            android.evaluate("""async()=>{
              state.transactions.push({id:'offline-android',type:'expense',description:'Sem rede',
                amount:9,purchaseDate:'2026-10-28',paymentDate:'2026-10-28'});await save();
            }""")
            android.wait_for_function("cloudState.localMeta?.dirty===true",timeout=8000)
            desktop.evaluate("""async()=>{
              state.transactions.push({id:'desktop-later',type:'expense',description:'Atualizado',
                amount:8,purchaseDate:'2026-10-28',paymentDate:'2026-10-28'});await save();
            }""")
            desktop.wait_for_function("cloudState.localMeta?.revision===3",timeout=15000)
            backend.block_android=False
            android.evaluate("cloudRefresh()")
            android.wait_for_function("cloudState.blocked===true",timeout=12000)
            assert android.evaluate("state.transactions.some(x=>x.id==='offline-android')"),'offline edit must remain'
            assert backend.revision==3,'conflict cannot overwrite latest server revision'
            assert android.evaluate("cloudState.localMeta?.revision")==2,'conflicted device stays at previous revision'
            assert not err_android,err_android
            assert not err_desktop,err_desktop
            print('PASS CLOUD: Android seed, desktop pull, desktop push, Android pull, conflict blocks stale writes')
            ctx_android.close();ctx_desktop.close();browser.close()
    finally:
        server.shutdown();server.server_close()

if __name__=='__main__':
    run()
