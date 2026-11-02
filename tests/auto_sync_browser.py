from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright
from browser_smoke import ROOT,MOCK
import json

def main():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*a): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    remote={'revision':0,'envelope':None,'android_pushes':0,'desktop_pushes':0,'offline_android':False,'calls':0}
    url='http://127.0.0.1:'+str(server.server_port)+'/index.html'
    try:
        with sync_playwright() as sp:
            browser=sp.chromium.launch(headless=True,args=['--no-sandbox'])
            def device(android,passphrase='SenhaCofreOficial2026!'):
                ctx=browser.new_context(viewport={'width':390 if android else 1280,'height':800},
                  user_agent=('Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36'
                    if android else 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'),
                  service_workers='block')
                ctx.add_init_script(MOCK)
                p=ctx.new_page();errs=[];p.on('pageerror',lambda e:errs.append(str(e)))
                def backend(route):
                    q=route.request;body=q.post_data_json if q.post_data else {}
                    remote['calls']+=1
                    if '/auth/v1/signup' in q.url or '/auth/v1/token?' in q.url:
                        return route.fulfill(status=200,content_type='application/json',body=json.dumps({
                            'access_token':'test-access','refresh_token':'test-refresh','expires_in':3600,
                            'user':{'id':'aaaa0000-aaaa-4000-aaaa-aaaaaaaaaaaa','email':'fake@example.com'}
                        }))
                    if '/rest/v1/rpc/finance_pull_vault' in q.url:
                        return route.fulfill(status=200,content_type='application/json',body=json.dumps({
                            'revision':remote['revision'],'envelope':remote['envelope']
                        }))
                    if '/rest/v1/rpc/finance_push_vault' in q.url:
                        if android and remote['offline_android']:
                            return route.fulfill(status=503,content_type='application/json',body='{"message":"offline simulated"}')
                        if body['p_expected_revision']!=remote['revision']:
                            data={'revision':remote['revision'],'applied':False,'conflict':True}
                        else:
                            remote['revision']+=1;remote['envelope']=body['p_envelope']
                            remote['android_pushes' if android else 'desktop_pushes']+=1
                            data={'revision':remote['revision'],'applied':True}
                        return route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
                    return route.fulfill(status=404,content_type='application/json',body='{}')
                p.route('https://cvrshlwutczmeyqotqbw.supabase.co/**',backend)
                p.goto(url,wait_until='domcontentloaded')
                p.locator('#pass').fill(passphrase)
                p.locator('#passConfirm').fill(passphrase)
                p.locator('#authButton').click()
                p.locator('#app:not(.hide)').wait_for(timeout=10000)
                return ctx,p,errs
            def link(p):
                p.locator('#autoEmail').fill('fake@example.com')
                p.locator('#autoPassword').fill('SenhaDaConta2026!')
                p.locator('#autoConnectForm button[type=submit]').click()
                p.wait_for_function("auto.session?.user?.id!==undefined",timeout=10000)
            ca,a,ea=device(True)
            a.evaluate("""async()=>{
                state.accounts=[{id:'android-bank',name:'Conta Android',type:'bank'}];
                state.transactions=[{id:'android-real',type:'expense',description:'Compra fictícia Android',amount:25,
                purchaseDate:'2026-10-26',paymentDate:'2026-10-26'}];await save();
            }""")
            assert remote['revision']==0
            link(a)
            a.wait_for_function("auto.meta?.revision===1",timeout=16000)
            assert remote['revision']==1 and remote['android_pushes']==1 and remote['desktop_pushes']==0
            assert not json.dumps(remote['envelope']).find('Compra fictícia Android')>=0

            cd,d,ed=device(False)
            d.evaluate("""async()=>{
                state.accounts=[{id:'desktop-fake',name:'Fictícia',type:'bank'}];
                state.transactions=[{id:'desktop-test',type:'expense',description:'Teste desktop',amount:999}];await save();
            }""")
            link(d)
            d.wait_for_function("auto.meta?.revision===1",timeout=16000)
            assert remote['desktop_pushes']==0, 'desktop tests cannot upload as first official data'
            assert d.evaluate("state.transactions.map(x=>x.id)")==['android-real']
            assert d.evaluate("autoLocal('autoQuarantineVault','get').then(x=>!!x)") is True
            assert not d.locator('[data-page=sync]').count(),'No manual sync tab allowed'

            # Desktop new record -> Android automatically downloads.
            d.evaluate("""async()=>{
              state.transactions.push({id:'desktop-new',type:'expense',description:'Nova compra',amount:12.5});await save();
            }""")
            d.wait_for_function("auto.meta?.revision===2",timeout=15000)
            a.evaluate('autoRefresh()')
            a.wait_for_function("state.transactions.some(x=>x.id==='desktop-new')",timeout=10000)
            assert a.evaluate('state.transactions.length')==2

            # Different records edited offline should merge without loss.
            remote['offline_android']=True
            a.evaluate("""async()=>{
              state.transactions.push({id:'android-offline',type:'expense',description:'Compra desconectada',amount:3.8});
              await save();
            }""")
            a.wait_for_function("auto.meta?.dirty===true",timeout=8000)
            d.evaluate("""async()=>{
              state.transactions.push({id:'desktop-later',type:'expense',description:'Outra compra',amount:4.3});
              await save();
            }""")
            d.wait_for_function("auto.meta?.revision===3",timeout=15000)
            remote['offline_android']=False
            a.evaluate('autoRefresh()')
            a.wait_for_function("auto.meta?.revision===4",timeout=15000)
            a.wait_for_function("auto.meta?.dirty===false",timeout=15000)
            d.evaluate('autoRefresh()')
            d.wait_for_function("state.transactions.some(x=>x.id==='android-offline')",timeout=10000)
            assert d.evaluate('state.transactions.length')==4

            # Same record modified differently: conflict preserved and server unchanged.
            remote['offline_android']=True
            a.evaluate("""async()=>{
              state.transactions.find(x=>x.id==='android-real').amount=101;await save();
            }""")
            a.wait_for_function("auto.meta?.dirty===true",timeout=8000)
            d.evaluate("""async()=>{
              state.transactions.find(x=>x.id==='android-real').amount=202;await save();
            }""")
            d.wait_for_function("auto.meta?.revision===5",timeout=15000)
            remote['offline_android']=False
            a.evaluate('autoRefresh()')
            a.wait_for_function("auto.blocked===true",timeout=10000)
            assert remote['revision']==5,'Server must keep last confirmed revision'
            assert a.evaluate("state.transactions.find(x=>x.id==='android-real').amount")==101,'Keep offline change'
            assert a.evaluate("autoLocal('autoSyncConflict','get').then(x=>x.fields.includes('transactions:android-real'))"),'Keep encrypted conflict snapshots'
            assert not ea,ea
            assert not ed,ed
            print('PASS AUTO: Android bootstrap, desktop replaces tests automatically, bidirectional sync, offline merge, same-ID conflict',flush=True)
            ca.close();cd.close();browser.close()
    finally:server.shutdown();server.server_close()

if __name__=='__main__':main()
