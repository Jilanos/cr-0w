// Focused mail checks through Chromium. Uses the existing dependency-free driver.
import { CDP, findChrome, launch, newPage } from './shots.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const out = args[args.indexOf('--out') + 1];
if (!args.includes('--out') || !out) throw new Error('Pass --out with a private capture directory');
await mkdir(out, { recursive: true });
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname === '/favicon.ico' ? '/favicon.svg' : pathname));
  if (!target.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(target)] || 'text/plain',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launch(await findChrome());
const cdp = new CDP(chrome.ws);
await cdp.ready;
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, mobile: true }]) {
    const page = await newPage(cdp, viewport);
    await page.goto(base + '/favicon.svg', 50);
    await page.eval(`localStorage.clear(); localStorage.setItem('crow.view', '"accounts"'); true`);
    await page.goto(base + '/index.html?fixtures=1', 1000);
    await page.eval(`(async () => {
      const {api} = await import('/js/api.js');
      const original = api.get.bind(api);
      const data = await original('/api/mail');
      const template = data.items.find((m) => m.proposal?.action === 'move');
      const items = Array.from({length:131}, (_, i) => ({...template, id:i ? 'page-'+i : template.id,
        proposal:{...template.proposal,confidence:['high','medium','low'][i%3]}}));
      api.get = async (url) => {
        if (url === '/api/mail' || url.startsWith('/api/mail?')) {
          const query = new URL(url, location.origin).searchParams;
          const offset = Number(query.get('cursor') || 0);
          const end = offset + (offset ? 200 : 50);
          return {...data,items:items.slice(offset,end),next_cursor:end<items.length ? String(end):null};
        }
        return original(url);
      };
      return true;
    })()`);
    if (viewport.mobile) await page.click('#nav-open');
    await page.click('.rail-item', 'Mails');
    await new Promise((r) => setTimeout(r, 600));
    await page.click('.segmented button', 'Propositions');
    const count = await page.eval(`document.querySelectorAll('.triage-row').length`);
    if (count !== 131) throw new Error('Proposals missing after first page: ' + count);
    const headings = await page.eval(`[...document.querySelectorAll('.group-head')].map((e)=>e.textContent)`);
    if (!['haute44','moyenne44','basse43'].every((s) => headings.some((h) => h.includes(s)))) throw new Error('Confidence groups: ' + headings);
    await page.shot(viewport.mobile ? 'mail-confidence-mobile' : 'mail-confidence-desktop');
    await page.click('.triage-controls .folder-change');
    await page.click('.folder-picker input');
    await page.type('serie');
    const matches = await page.eval(`[...document.querySelectorAll('.folder-option')].map((e)=>e.textContent)`);
    if (matches.length !== 1 || !matches[0].includes('Série A')) throw new Error('Accent-insensitive search failed');
    await page.click('.folder-option');
    const safe = await page.eval(`document.querySelector('.list-foot .link-btn').textContent`);
    if (!safe.includes('43')) throw new Error('Edited destination retained high confidence: ' + safe);
    await page.shot(viewport.mobile ? 'mail-corrected-mobile' : 'mail-corrected-desktop');
    await page.eval(`(async()=>{
      const {folderPicker} = await import('/js/folder-picker.js');
      const {popMenu} = await import('/js/ui.js');
      const picker = folderPicker({recent_targets:['leaf'],folders:[
        {id:'root',path:'Projects',allowed_target:true},
        {id:'branch',path:'Projects/Études',parent_id:'root',allowed_target:true},
        {id:'leaf',path:'Projects/Études/Phase <img>',parent_id:'branch',allowed_target:true},
        {id:'blocked',path:'Inbox',allowed_target:false}
      ]},null);
      popMenu(document.getElementById('view-title'),picker.element);picker.focus();return true;
    })()`);
    const tree = await page.eval(`({first:document.querySelector('.folder-option').dataset.folderId, blocked:document.querySelector('[data-folder-id=blocked]').disabled, images:document.querySelectorAll('.folder-options img').length})`);
    if (tree.first !== 'leaf' || !tree.blocked || tree.images) throw new Error('Recent, restricted or hostile folders: ' + JSON.stringify(tree));
    await page.type('ETUDES phase');
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }, page.sessionId);
    await page.key('Enter');
    const chosen = await page.eval(`document.querySelector('.folder-chosen').textContent`);
    if (!chosen.includes('Phase <img>')) throw new Error('Keyboard selection failed: ' + chosen + ' / ' + await page.eval('document.activeElement.outerHTML'));
    await page.shot(viewport.mobile ? 'mail-picker-mobile' : 'mail-picker-desktop');
    if (page.errors.length) throw new Error(page.errors.join('\n'));
    results.push({width:viewport.width,proposals:count,groups:headings,picker:true,errors:page.errors});
    await page.close();
  }
  await writeFile(path.join(out,'mail-results.json'),JSON.stringify(results,null,2));
  console.log('Mail: 131 proposals, three confidence groups, folder corrections, recent targets, nested search and keyboard passed at both widths.');
} finally {
  cdp.sock.close(); chrome.proc.kill(); server.close();
  await rm(chrome.profile, {recursive:true,force:true,maxRetries:5,retryDelay:100});
}
