from pathlib import Path
from playwright.sync_api import sync_playwright
import re

ROOT=Path(__file__).resolve().parent.parent

def html_page(modular):
    html=(ROOT/('index.html' if modular else 'baseline.html')).read_text()
    if modular:
        def css_replace(m):
            url=m.group(1).removeprefix('./')
            assert url.startswith('css/')
            return '<style>'+ (ROOT/url).read_text()+'</style>'
        html=re.sub(r'<link rel="stylesheet" href="([^\"]+)"\s*/>',css_replace,html)
        def js_replace(m):
            url=m.group(1).removeprefix('./')
            assert url.startswith('js/')
            return '<script>'+ (ROOT/url).read_text()+'</script>'
        html=re.sub(r'<script src="([^\"]+)"></script>',js_replace,html)
    return html

MOCK = r'''() => {
  Object.defineProperty(window,'isSecureContext',{configurable:true,get:()=>true});
  const native=window.crypto;
  Object.defineProperty(window,'crypto',{configurable:true,value:{
    getRandomValues:arr=>native.getRandomValues(arr),
    randomUUID:()=>String(Date.now())+'-'+String(Math.random()),
    subtle:{
      importKey:async(_format,data)=>data,
      deriveKey:async(_alg,base)=>base,
      encrypt:async(_settings,_key,data)=>data,
      decrypt:async(_settings,_key,data)=>data
    }
  }});
  const memory=new Map();window.__memory=memory;
  Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){
    const request={result:null,onupgradeneeded:null,onsuccess:null,onerror:null};
    queueMicrotask(()=>{
      request.result={createObjectStore(){},transaction(){
        const tx={oncomplete:null,onerror:null};
        tx.objectStore=()=>({
          get(key){const r={result:null};queueMicrotask(()=>{r.result=memory.get(key);r.onsuccess?.();tx.oncomplete?.()});return r;},
          put(value,key){const r={};queueMicrotask(()=>{memory.set(key,value);r.onsuccess?.();tx.oncomplete?.()});return r;},
          delete(key){const r={};queueMicrotask(()=>{memory.delete(key);r.onsuccess?.();tx.oncomplete?.()});return r;}
        });return tx;
      }};request.onupgradeneeded?.();request.onsuccess?.();
    });return request;
  }}});
  window.__bio={cancel:false};
  const id=Uint8Array.from(Array.from({length:16},(_,i)=>i+1)),key=new Uint8Array(32).fill(7);
  Object.defineProperty(window,'PublicKeyCredential',{configurable:true,value:class {
    static async getClientCapabilities(){return {'extension:prf':true}}
    static async isUserVerifyingPlatformAuthenticatorAvailable(){return true}
  }});
  Object.defineProperty(navigator,'credentials',{configurable:true,value:{
    async create(){return {rawId:id,getClientExtensionResults(){return {prf:{enabled:true,results:{first:key}}}}}},
    async get(){if(window.__bio.cancel)throw new DOMException('Cancelled','NotAllowedError');return {rawId:id,getClientExtensionResults(){return {prf:{results:{first:key}}}}}}
  }});
}'''

def test_one(browser,modular,width):
    p=browser.new_page(viewport={'width':width,'height':790},service_workers='block')
    errors=[];p.on('pageerror',lambda e: errors.append(str(e)))
    p.evaluate(MOCK)
    p.set_content(html_page(modular),wait_until='domcontentloaded',timeout=12000)
    assert p.locator('#auth').is_visible(), f'Login not visible {errors}'
    p.locator('#pass').fill('SenhaTestes2026!')
    p.locator('#passConfirm').fill('SenhaTestes2026!')
    p.locator('#authButton').click()
    p.locator('#app:not(.hide)').wait_for(timeout=8000)
    assert not errors,errors
    # Goal UI: overrides, save and period aggregation.
    p.locator('[data-page="metas"]').click()
    p.locator('#newGoal').click()
    assert p.locator('[data-goal-month]').count()==12
    p.locator('#goal-0').fill('1500')
    p.locator('#goal-2').fill('1750')
    p.locator('#goal-0').fill('1600')
    assert p.locator('#goal-1').input_value()=='1600'
    assert p.locator('#goal-2').input_value()=='1750'
    p.locator('#modalForm button[type="submit"]').click()
    p.wait_for_timeout(35)
    assert p.evaluate("state.goals[0].monthly['2027-01']")==1750,p.locator('#goalsTable').inner_text()
    # range 3 months
    p.locator('#month').fill('2027-01');p.locator('#month').dispatch_event('change')
    p.locator('#periodMonths').select_option('3')
    p.locator('[data-page="resumo"]').click()
    assert p.locator('#periodMonths').input_value()=='3'
    assert '4.950,00' in p.locator('#budgetSummary').inner_text(),p.locator('#budgetSummary').inner_text()
    # Card registration
    p.locator('[data-page="cartoes"]').click()
    p.locator('#newAccount').click()
    p.locator('#modalForm input[name="name"]').fill('Nubank')
    p.locator('#modalForm select[name="type"]').select_option('card')
    p.locator('#modalForm input[name="closing"]').fill('5')
    p.locator('#modalForm input[name="due"]').fill('15')
    p.locator('#modalForm button[type="submit"]').click()
    p.wait_for_timeout(25)
    # Basic voice-like interpreted text. No actual speech in test.
    p.locator('#newEntry').click()
    p.locator('#agentText').fill('Gastei quinze reais e cinquenta centavos de combustível no Pix hoje')
    p.locator('#modalForm button[type="submit"]').click()
    assert p.locator('#modalForm input[name="amount"]').input_value()=='15.5'
    assert p.locator('#modalForm input[name="paymentMethod"]').count()==0
    assert p.locator('#modalForm select[name="paymentMethod"]').input_value()=='pix'
    assert p.locator('#modalForm .modal-actions-top').count()==1
    p.locator('#modalForm button[type="submit"]').click()
    p.wait_for_timeout(80)
    assert len(p.evaluate('state.transactions'))==1
    # cancel must not write
    p.locator('#newEntry').click()
    p.locator('#agentText').fill('Paguei cinquenta reais no supermercado no Pix')
    p.locator('#modalForm button[type="submit"]').click()
    p.locator('#cancelModal').click()
    assert len(p.evaluate('state.transactions'))==1
    # one credit card purchase, payments split over six months
    p.locator('#newEntry').click()
    p.locator('#agentText').fill('Comprei supermercado de 1200 reais no cartão Nubank em 6 parcelas no dia 03/11/2026')
    p.locator('#modalForm button[type="submit"]').click()
    assert float(p.locator('#modalForm input[name="amount"]').input_value())==1200
    p.locator('#modalForm button[type="submit"]').click()
    p.wait_for_timeout(50)
    assert len(p.evaluate('state.transactions'))==2, (p.locator('#modalError').inner_text() if p.locator('#modalError').count() else '')
    result=p.evaluate('''()=>({
      total:state.transactions.length,
      split:installments(state.transactions.find(t=>t.cardId)).map(x=>x.amount),
      competence:txExpenses('2026-11','competence').reduce((s,t)=>s+t.amount,0),
      dec:txExpenses('2026-12','cash').reduce((s,t)=>s+t.amount,0),
      sep:periodSums(['2026-11','2026-12']),
      goal:goalTargetPeriod(state.goals[0],['2026-11','2026-12','2027-01']),
      vaultFormat:(()=>{return document.title})()
    })''')
    assert result['competence']==1200,result
    assert sum(result['split'])==1200,result
    assert result['goal']==4950,result
    assert not errors,errors
    p.locator('[data-page="projecoes"]').click()
    assert p.locator('#projectionFull').count()==1
    for pageid in ['resumo','fluxo','movimentos','cartoes','metas','projecoes','investimentos','config']:
        p.locator(f'[data-page="{pageid}"]').click()
        assert p.evaluate('document.documentElement.scrollWidth <= innerWidth'),('mobile overflow',width,pageid)
    # Voice recognition with disagreement between alternatives: must request amount confirmation.
    p.evaluate("""() => { window.SpeechRecognition = class {
      start() { queueMicrotask(() => this.onresult({ results: [[
        {transcript: 'Gastei doze reais de lanche no Pix'},
        {transcript: 'Gastei vinte e dois reais de lanche no Pix'}
      ]] })); }
      stop() {}
    }; }""")
    p.locator('#newEntry').click()
    p.locator('#agentMic').click()
    p.wait_for_timeout(40)
    assert 'doze' in p.locator('#agentText').input_value().lower()
    assert p.locator('#agentText').get_attribute('data-voice-uncertain')=='1'
    p.locator('#modalForm button[type="submit"]').click()
    assert p.locator('#amountConfirmed').count()==1
    old_count=len(p.evaluate('state.transactions'))
    p.locator('#modalForm button[type="submit"]').click()
    assert len(p.evaluate('state.transactions'))==old_count, 'Unchecked value must not save'
    p.locator('#amountConfirmed').check()
    p.locator('#modalForm button[type="submit"]').click()
    p.wait_for_timeout(80)
    assert len(p.evaluate('state.transactions'))==old_count+1
    # OCR integration with a fake local reader: no external service in smoke test.
    p.evaluate(r"""() => { window.Tesseract={ createWorker:async()=>({
      recognize:async()=>({data:{text:'COMPROVANTE\nVALOR TOTAL R$ 25,90\nPAGAMENTO PIX'}}),
      terminate:async()=>{}
    }) }; }""")
    p.locator('#newEntry').click()
    p.locator('#agentFile').set_input_files({'name':'recibo.png','mimeType':'image/png','buffer':b'\x89PNG\r\n\x1a\nFAKE'})
    p.wait_for_timeout(120)
    assert '25,90' in p.locator('#agentText').input_value()
    p.locator('#modalForm button[type="submit"]').click()
    assert float(p.locator('#modalForm input[name="amount"]').input_value())==25.90
    assert p.locator('#amountConfirmed').count()==1
    p.locator('#amountConfirmed').check()
    p.locator('#modalForm button[type="submit"]').click()
    p.wait_for_timeout(90)
    assert len(p.evaluate('state.transactions'))==old_count+2
    assert not any('data:image' in str(t) for t in p.evaluate('state.transactions'))
    # biometric mocked activation, can still enter via password
    p.locator('[data-page="config"]').click();p.locator('#enableBiometric').click()
    p.wait_for_timeout(50)
    assert 'ativad' in p.locator('#bioSettingsStatus').inner_text().lower(),p.locator('#bioSettingsStatus').inner_text()
    p.evaluate('''()=>{state=null;passphrase='';salt=null;document.querySelector('#app').classList.add('hide');document.querySelector('#auth').classList.remove('hide');start()}''')
    p.locator('#bioUnlockBtn').wait_for(state='visible')
    p.locator('#bioUnlockBtn').click()
    p.locator('#app:not(.hide)').wait_for(timeout=4000)
    assert len(p.evaluate('state.transactions'))==4
    # rollback cancel -> original pass still works
    p.evaluate('''()=>{state=null;passphrase='';salt=null;document.querySelector('#app').classList.add('hide');document.querySelector('#auth').classList.remove('hide');window.__bio.cancel=true;start()}''')
    p.locator('#bioUnlockBtn').click();p.wait_for_timeout(70)
    assert p.locator('#app').is_hidden()
    p.locator('#pass').fill('SenhaTestes2026!');p.locator('#authButton').click()
    p.locator('#app:not(.hide)').wait_for(timeout=4000)
    assert len(p.evaluate('state.transactions'))==4
    assert not errors,errors
    p.close()
    return result

if __name__=='__main__':
    with sync_playwright() as sp:
        b=sp.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        for w in [320,360,390,412,768,1280]:
            for modular in [True]:
                try:
                    r=test_one(b,modular,w)
                    print('PASS',('MODULAR' if modular else 'BASELINE'),w,r)
                except Exception as e:
                    print('FAIL',('MODULAR' if modular else 'BASELINE'),w,str(e));raise
        b.close()
