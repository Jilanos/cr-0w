// Browser checks against a real dry-run server. Chat and sync require explicit flags.
import { CDP, findChrome, launch, newPage } from './shots.mjs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2);
const opt = (n, d) => args.includes(n) ? args[args.indexOf(n) + 1] : d;
const base = opt('--url', 'http://127.0.0.1:8790');
const out = path.resolve(opt('--out', 'bin/panel_ui/dev/shots'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
await mkdir(out, { recursive: true });
const chrome = await launch(await findChrome());
const cdp = new CDP(chrome.ws);
await cdp.ready;
const page = await newPage(cdp, { width: 1680, height: 1050 });
async function poll(expr, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await page.eval(expr)) return; await sleep(150); }
  throw new Error('timeout: ' + expr);
}
const api = expr => page.eval(`(async()=>{const {api}=await import('/js/api.js');return ${expr};})()`);
async function go(label) {
  await page.click('.rail-item', label);
  await poll(`document.querySelector('.view-title').textContent.includes(${JSON.stringify(label)}) && !document.querySelector('#pane-detail .state-loading')`);
  await sleep(350);
  if (label === 'Mails') await page.click('.segmented button', 'Boîte');
}
async function selectFirst() {
  if (await page.eval(`!!document.querySelector('#pane-list .row')`)) {
    await page.click('#pane-list .row');
    await sleep(800);
  }
}
async function check(name, fn) {
  if (opt('--only', '') && !opt('--only', '').split(',').some(n => name.includes(n))) return;
  const before = page.errors.length;
  try { const detail = await fn(); results.push({name, ok:true, detail:detail ?? null}); console.log('ok ' + name); }
  catch (e) { results.push({name, ok:false, error:e.message}); console.log('FAIL ' + name + ': ' + e.message); await page.shot('failure-' + name); }
  const errors = page.errors.slice(before);
  if(errors.length) {results.push({name:name+'-console',ok:false,errors});console.log(errors.join('\n'));}
  await writeFile(path.join(out,'integration-results.json'),JSON.stringify(results,null,2));
}
try {
  await page.goto(base+'/', 2000);
  await poll(`document.querySelectorAll('.kpi').length > 0`);
  const session = await api("api.get('/api/session')");
  if(session.mode !== 'dry_run') throw new Error('This check requires mode: dry_run');
  await check('all-views', async()=>{
    for (const label of ["Aujourd'hui",'Mails','Relances & échéances','Décisions','Brouillons','Dossiers','Jobs','Comptes']) {
      await go(label); await selectFirst();
      await page.shot('real-light-'+label.replace(/[^a-zA-Z]/g,'_'));
      if(await page.eval(`!!document.querySelector('.state-error')`)) throw new Error('view error: '+label);
    }
  });
  await check('global-search', async()=>{
    const pending = await api("api.get('/api/pending')");
    const row = pending.sections.filter(s=>s.kind==='followups').flatMap(s=>s.items)[0];
    if(!row) throw new Error('A copied pending followup is needed');
    const query = row.title.slice(0,80);
    const found = await api(`api.get('/api/search?q='+encodeURIComponent(${JSON.stringify(query)}))`);
    const target = found.groups.find(g=>g.kind==='pending').items[0];
    if(!target) throw new Error('Pending row absent from global search');
    await page.click('#search-open'); await page.type(query);
    await poll(`!!document.querySelector('#search-results [role=group][aria-label="En attente"] .search-result')`);
    await page.shot('real-global-search');
    await page.click('#search-results [role=group][aria-label="En attente"] .search-result');
    await poll(`!document.querySelector('#dialog[open]') && document.querySelector('#pane-list .row.selected')?.dataset.key===${JSON.stringify(target.key)}`);
    return {groups:found.groups.map(g=>({kind:g.kind,total:g.total})),opened:target.key};
  });
  await check('notifications-status', async()=>{
    const status = await api("api.get('/api/notifications')");
    if(typeof status.enabled !== 'boolean' || status.poll_seconds < 5 || status.min_interval_seconds < 30) throw new Error('Invalid notification status');
    if('powershell_exe' in status || 'app_id' in status) throw new Error('Private notification config exposed');
    return status;
  });
  await check('done-undo',async()=>{
    await go('Relances & échéances');
    await selectFirst();
    const id=await page.eval(`document.querySelector('#pane-list .row.selected').dataset.key`);
    await page.click('.detail .btn','Réglé');
    await poll(`!!document.querySelector('.toast-action')`);
    const doc=await api("api.get('/api/pending')");
    if(!doc.sections.find(s=>s.kind==='done').items.some(i=>i.id===id))throw new Error('item absent from done section');
    await page.shot('real-done-toast');
    await page.click('.toast-action');
    await poll(`!!document.querySelector('#pane-list .row:not(.dim)[data-key="${id}"]')`);
    return {id};
  });
  await check('snooze-undo-followup',async()=>{
    await selectFirst();
    for(const label of ['+2 jours ouvrés','+1 semaine']) {
      await page.click('.detail .btn','Reporter'); await page.click('.menu-item',label);
      await poll(`!!document.querySelector('.toast-action')`);
      await page.click('.toast-action'); await poll(`!document.querySelector('.toast-action')`); await sleep(700);
    }
    await page.click('.detail .btn','Reporter');
    await page.eval(`document.querySelector('.menu input[type=date]').value=new Date(Date.now()+14*86400000).toISOString().slice(0,10)`);
    await page.click('.menu button[type=submit]');
    await poll(`!!document.querySelector('.toast-action')`);
    await page.click('.toast-action'); await poll(`!document.querySelector('.toast-action')`); await sleep(700);
    await page.click('.detail .btn','Relancer');
    await poll(`document.querySelector('.followup-box textarea')?.value.startsWith('Prépare la relance de')`);
    await page.click('.followup-box .btn','Préparer la relance');
    await poll(`document.querySelectorAll('.steps .step-succeeded').length===4`);
    await page.shot('real-followup');
    await page.goto(base+'/', 1600);
    await poll(`!!document.querySelector('.followup-last')`);
    await page.click('.followup-last button','Voir le détail');
    await poll(`document.querySelectorAll('.steps .step-succeeded').length===4`);
    await page.shot('real-followup-after-reload');
  });
  await check('reply-all-dry',async()=>{
    await go('Mails'); await selectFirst();
    await page.click('.detail .btn','Répondre à tous');
    await page.click('.reply-box textarea'); await page.type('Accuser réception. Essai sans écriture.');
    await page.click('.reply-box .btn','Préparer le brouillon');
    await poll(`document.querySelectorAll('.pipeline .step').length===3 || document.querySelectorAll('.steps .step').length===3`);
    await poll(`document.querySelectorAll('.steps .step-succeeded').length===3`);
    await page.shot('real-reply-dry');
    return await api("api.get('/api/operations?active=0').then(d=>d.operations.filter(o=>o.kind==='mail.reply_all').at(-1))");
  });
  await check('triage-dry',async()=>{
    await go('Mails'); await selectFirst();
    await page.click('.detail .btn','Classer');
    await page.shot('real-classer-menu');
    await page.key('Escape');
    await page.click('.segmented button','Propositions');
    await page.eval(`(()=>{const s=document.querySelector('#pane-list select[aria-label=Action]');s.value='move';s.dispatchEvent(new Event('change'));})()`);
    await page.click('.triage-controls .folder-change');
    await page.click('.folder-option:not(:disabled)');
    await page.click('#pane-list input[type=checkbox]:not(:disabled)');
    await page.click('.list-foot .btn','Valider');
    await poll(`document.querySelector('.detail')?.textContent.includes('Exécuter')`);
    if(await page.eval(`document.querySelector('.detail .btn-primary')?.disabled`)) {
      const reason=await page.eval(`document.querySelector('.detail').textContent`);
      return {limited:true,reason};
    }
    await page.shot('real-triage-plan');
    await page.click('.detail .btn','Exécuter');
    await poll(`document.querySelector('.detail')?.textContent.includes('Annuler le lot')`);
    await page.shot('real-triage-result');
    await page.click('.detail .btn','Annuler le lot');
    await sleep(1000);
  });
  if(args.includes('--chat')) await check('chat-sonnet-live',async()=>{
    await go('Relances & échéances'); await selectFirst();
    await page.click('.detail .btn','Chat');
    await page.click('#chat-input');
    await page.eval(`document.getElementById('chat-input').value='';document.getElementById('chat-input').dispatchEvent(new Event('input'))`);
    await page.type('Réponds seulement OK. Aucun outil.');
    await page.click('button[aria-label=Envoyer]');
    await poll(`!!document.querySelector('.msg-crow')`);
    await page.shot('real-chat-running');
    await poll(`document.querySelector('.msg-crow:not(.live) .bubble')?.textContent.includes('OK')`,180000);
    await page.shot('real-chat-complete');
    return await api("api.get('/api/operations?active=0').then(d=>d.operations.filter(o=>o.kind==='chat.message').at(-1))");
  });
  await check('chat-settings',async()=>{
    await go('Dossiers'); await selectFirst();
    await poll(`!!document.querySelector('.chat-foot select[aria-label=Compte]')`);
    const values=await page.eval(`(()=>{
      const a=document.querySelector('.chat-foot select[aria-label=Compte]');
      a.value='workb';a.dispatchEvent(new Event('change'));
      return [...document.querySelector('.chat-foot select[aria-label=Modèle]').options].map(o=>o.value);
    })()`);
    if(!values.length||values.includes('sonnet'))throw new Error('incompatible account models');
    await page.click('.chat-foot .link-btn','Par défaut ici');
    await poll(`[...document.querySelectorAll('.toast')].some(t=>t.textContent.includes('Défaut du sujet')&&t.textContent.includes('workb'))`);
    await page.eval(`(()=>{
      const a=document.querySelector('.chat-foot select[aria-label=Compte]');
      a.value='claude';a.dispatchEvent(new Event('change'));
    })()`);
    await page.click('.chat-foot .link-btn','Par défaut ici');
    await page.shot('real-chat-settings');
    return {models:values,restored_account:'claude',messages_sent:0};
  });
  await check('classer-dry',async()=>{
    await go('Mails'); await selectFirst();
    await page.click('.detail .btn','Classer');
    await page.eval(`(()=>{const s=document.querySelector('.menu select[aria-label=Action]');s.value='move';s.dispatchEvent(new Event('change'));})()`);
    await page.click('.folder-option:not(:disabled)');
    await page.click('.menu .btn','Préparer le lot');
    await poll(`document.querySelector('.detail')?.textContent.includes('Lot de rangement figé')`);
    await page.shot('real-classer-plan');
    await page.click('.detail .btn','Modifier la sélection');
  });
  await check('sse-reconnect',async()=>{
    const op=await api("api.get('/api/operations?active=0').then(d=>d.operations.filter(o=>o.kind==='chat.message'&&o.status==='succeeded').at(-1))");
    if(!op) throw new Error('A completed chat is needed for replay');
    const replay=await page.eval(`(async()=>{
      const url=${JSON.stringify(op.links.events_url)};
      const first=await fetch(url), reader=first.body.getReader();
      const chunk=new TextDecoder().decode((await reader.read()).value);
      await reader.cancel();
      const ids=[...chunk.matchAll(/^id: (\\d+)$/gm)].map(m=>Number(m[1]));
      const after=ids[0];
      if(!after)throw new Error('no event id');
      const rest=await (await fetch(url,{headers:{'Last-Event-ID':String(after)}})).text();
      const remaining=[...rest.matchAll(/^id: (\\d+)$/gm)].map(m=>Number(m[1]));
      if(!remaining.length||remaining.some(n=>n<=after)||new Set(remaining).size!==remaining.length||!rest.includes('event: done'))throw new Error('replay gap or duplicate');
      return {after,remaining};
    })()`);
    return replay;
  });
  await check('file-open-dry',async()=>{
    await go('Relances & échéances');
    const doc=await api("api.get('/api/pending')");
    const item=doc.sections.flatMap(s=>s.items).find(i=>Object.values(i.cells).flat().some(s=>s.t==='file'));
    if(!item)return {limited:true,reason:'No mapped file in the configured pending document'};
    await page.click(`#pane-list .row[data-key="${item.id}"]`);
    await page.click('.detail .file-link');
    await poll(`[...document.querySelectorAll('.toast')].some(t=>t.textContent.includes('Mode essai')&&t.textContent.includes('non ouvert'))`);
    await page.shot('real-file-open-dry');
  });
  for(const label of ['Mise à jour','Mise à jour machine']) await check('routine-'+label.replaceAll(' ','-'),async()=>{
    await page.click('#topbar-actions .btn',label);
    await poll(`document.querySelector('.drawer')?.textContent.includes('Mode essai') || document.querySelector('#drawer')?.textContent.includes('Mode essai')`);
    await page.shot('real-routine-'+label.replaceAll(' ','-'));
    await page.click('#drawer-close');
    await sleep(1500);
  });
  await check('themes-responsive-persistence',async()=>{
    await go('Relances & échéances'); await selectFirst();
    const sel=await page.eval(`document.querySelector('.row.selected').dataset.key`);
    await page.goto(base+'/',1500);
    await poll(`document.querySelector('.row.selected')?.dataset.key===${JSON.stringify(sel)}`);
    await page.click('#theme-toggle'); await page.shot('real-dark');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false},page.sessionId);
    // A separate mobile page keeps desktop state assertions independent.
    const mobile=await newPage(cdp,{width:390,height:844,mobile:true});
    await mobile.goto(base+'/',1800); await mobile.shot('real-mobile'); await mobile.close();
    await page.shot('real-mid');
  });
  if(args.includes('--sync')) await check('mail-sync-live-read',async()=>{
    await go('Mails'); await page.click('button[aria-label="Synchroniser la boîte"]');
    await poll(`document.querySelector('.toast')?.textContent.includes('Synchronisation')`);
    await poll(`[...document.querySelectorAll('.toast')].some(t=>t.textContent.includes('Boîte synchronisée'))`,240000);
    return await api("api.get('/api/mail')");
  });
} finally {
  await writeFile(path.join(out,'integration-results.json'),JSON.stringify(results,null,2));
  await page.close(); chrome.proc.kill();
  await rm(chrome.profile,{recursive:true,force:true}).catch(()=>{});
}
console.log(`${results.filter(r=>r.ok).length}/${results.length} checks passed`);
process.exit(results.some(r=>!r.ok)?1:0);
