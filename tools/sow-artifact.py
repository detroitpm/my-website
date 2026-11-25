#!/usr/bin/env python3
"""Build a self-saving SOW review page from a state JSON.

Usage: python3 tools/sow-artifact.py state.json out.html

state.json shape:
{"address": "...", "typeOfWork": "...",
 "sections": [{"room": "Kitchen", "items": [
    {"text": "...", "checked": true, "optional": false,
     "badges": ["video"|"new"|"ai"], "img": "<https url or data: uri>",
     "photoId": "123" (optional), "photoUrl": "https://app.companycam.com/..." (optional)}]}],
 "questions": [{"text": "Is the job 100% done?", "answer": ""}]}

Remote image URLs are downloaded and inlined as data: URIs (the artifact CSP
blocks remote images). Publish the result with capabilities {"artifact": {}}.
Each tick/edit then republishes the page with its state embedded, so Claude can
read the current state back with Artifact action "read" (the JSON sits in
<script type="application/json" id="sow-state">).
"""
import json, sys, base64, urllib.request

def inline(u):
    if not u or u.startswith("data:"): return u
    return "data:image/jpeg;base64," + base64.b64encode(urllib.request.urlopen(u).read()).decode()

SKEL_RESET = (":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);"
  "padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}"
  "img{max-width:100%}[hidden]{display:none!important}")
HEAD = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport '
  'content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' + SKEL_RESET +
  '</style></head><body>')

CSS = r"""
:root{--bg:#fff;--fg:#1a1414;--red:#E1432A;--room:#B23A2E;--line:#d9d4d3;--edge:#111;--muted:#8a8282;--vid:#2f5d9e;--new:#2e7d4f;--ai:#a05a00;--font:Inter,system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171313;--fg:#eee8e7;--red:#a8321f;--room:#7e2a21;--line:#3a3332;--edge:#000;--muted:#9a9090;--vid:#6f9be0;--new:#5cc48a;--ai:#e0a050;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#171313;--fg:#eee8e7;--red:#a8321f;--room:#7e2a21;--line:#3a3332;--edge:#000;--muted:#9a9090;--vid:#6f9be0;--new:#5cc48a;--ai:#e0a050;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:var(--font);font-size:15px}
header{background:var(--red);color:#fff;text-align:center;padding-block:28px}
header,main{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
header h1{margin:0;font-size:1.6rem;text-wrap:balance}header p{margin:.3rem 0 0;opacity:.9}
#status{font-size:.78rem;margin-top:.5rem;opacity:.85;min-height:1em}
main{max-width:880px;margin:0 auto;padding-block:20px 48px;display:grid;gap:22px}
h2{margin:0;background:var(--room);color:#fff;padding:8px 12px;font-size:1.05rem;border:2px solid var(--edge);border-bottom:0}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;border:2px solid var(--edge)}
td{border:1px solid var(--line);padding:8px;vertical-align:middle}
.cb{width:34px;text-align:center}.cb input{width:18px;height:18px}
.tx{min-width:0}[contenteditable]{outline:none;line-height:1.45}[contenteditable]:focus{box-shadow:0 0 0 2px var(--red)}
.th{width:96px}.th img{width:88px;height:88px;object-fit:cover;border-radius:3px;display:block}
.badge{display:inline-block;margin:5px 4px 0 0;font-size:.72rem;letter-spacing:.03em;padding:2px 7px;border-radius:10px;border:1px solid currentColor}
.b-video{color:var(--vid)}.b-new{color:var(--new)}.b-ai{color:var(--ai)}
tr.off .tx{color:var(--muted);text-decoration:line-through}
tr.opt .tx{color:var(--muted);font-style:italic}
.opt-t{font-size:.72rem;color:var(--muted);background:none;border:1px solid var(--line);border-radius:10px;padding:2px 7px;margin-top:5px;cursor:pointer}
.ans{min-height:1.4em;border-bottom:1px dashed var(--line)}
"""

JS = r"""
(function(){
const S = JSON.parse(document.getElementById('sow-state').textContent);
const app = document.getElementById('app'), status = document.getElementById('status');
const BADGE = {video:'From video walkthrough', new:'New this pass', ai:'AI-added'};
function el(t, a, kids){const e=document.createElement(t);Object.assign(e,a||{});(kids||[]).forEach(k=>e.append(k));return e;}
function editable(tag, obj, key, cls){const e=el(tag,{className:cls||''});e.contentEditable='true';e.textContent=obj[key]||'';
  e.addEventListener('input',()=>{obj[key]=e.textContent.trim();dirty();});e.addEventListener('blur',flushSoon);return e;}
function render(){
  document.getElementById('h-addr').replaceWith(Object.assign(editable('h1',S,'address'),{id:'h-addr'}));
  document.getElementById('h-type').replaceWith(Object.assign(editable('p',S,'typeOfWork'),{id:'h-type'}));
  app.replaceChildren();
  S.sections.forEach(sec=>{
    const tb=el('table');
    sec.items.forEach(it=>{
      const tr=el('tr');const sync=()=>{tr.className=(it.checked?'':'off')+(it.optional?' opt':'');};
      const cb=el('input',{type:'checkbox',checked:!!it.checked});cb.setAttribute('aria-label','Include item');
      cb.addEventListener('change',()=>{it.checked=cb.checked;sync();dirty();flushSoon();});
      const tx=el('td',{className:'tx'},[editable('div',it,'text')]);
      (it.badges||[]).forEach(b=>tx.append(el('span',{className:'badge b-'+b,textContent:BADGE[b]||b})));
      const ob=el('button',{className:'opt-t',type:'button',textContent:it.optional?'Optional ✓':'Mark optional'});
      ob.addEventListener('click',()=>{it.optional=!it.optional;ob.textContent=it.optional?'Optional ✓':'Mark optional';sync();dirty();flushSoon();});
      tx.append(' ',ob);
      const th=el('td',{className:'th'});if(it.img)th.append(el('img',{src:it.img,alt:''}));
      tr.append(el('td',{className:'cb'},[cb]),tx,th);sync();tb.append(tr);
    });
    app.append(el('section',{},[editable('h2',sec,'room'),el('div',{className:'tw'},[tb])]));
  });
  const qt=el('table');
  (S.questions||[]).forEach(q=>qt.append(el('tr',{},[el('td',{},[editable('div',q,'text'),editable('div',q,'answer','ans')])])));
  app.append(el('section',{},[el('h2',{textContent:'Questions'}),qt]));
}
render();
let art=null, isDirty=false, timer=null, readOnly=false;
claude.use('artifact').then(a=>{art=a;if(!a){status.textContent='Edits on this view are not saved';}});
function dirty(){isDirty=true;if(!readOnly)status.textContent='Unsaved changes…';clearTimeout(timer);timer=setTimeout(flush,4000);}
function flushSoon(){clearTimeout(timer);timer=setTimeout(flush,1500);}
function esc(s){return s.replace(/</g,'\\u003c');}
function doc(){
  return HEAD + "<title>"+document.title.replace(/</g,"&lt;")+"</title><meta name=\"claude:viewport-fit-sides\" content=\"cover\">" + document.getElementById('css').outerHTML
   + BODY + '<script type="application/json" id="sow-state">'+esc(JSON.stringify(S))+'<\/script>'
   + '<script id="app-js">'+document.getElementById('app-js').textContent+'<\/script></body></html>';
}
async function flush(){
  if(!isDirty||!art||readOnly)return;
  if(document.activeElement&&document.activeElement.isContentEditable){timer=setTimeout(flush,2500);return;}
  status.textContent='Saving…';
  try{await art.publish(doc());isDirty=false;status.textContent='Saved';}
  catch(e){const c=e&&e.code;
    if(c==='not_writer'||c==='not_granted'||c==='not_declared'||c==='capability_disabled'||c==='consent_required'){readOnly=true;status.textContent='View only — changes here are not saved';}
    else if(c==='conflict'){status.textContent='Someone else saved — reloading';}
    else{status.textContent='Could not save — will try again';timer=setTimeout(flush,8000);}}
}
})();
"""

BODY = ('<header><h1 id="h-addr"></h1><p id="h-type"></p><div id="status" aria-live="polite"></div></header>'
        '<main id="app"></main>')

def build(state):
    for sec in state["sections"]:
        for it in sec["items"]:
            it["img"] = inline(it.get("img"))
    title = state.get("title") or (state["address"].split(",")[0] + " SOW")
    js = ("const HEAD=" + json.dumps(HEAD) + ";const BODY=" + json.dumps(BODY) + ";" + JS)
    st = json.dumps(state).replace("<", "\\u003c")
    return (HEAD + f"<title>{title}</title>"
            '<meta name="claude:viewport-fit-sides" content="cover">'
            f'<style id="css">{CSS}</style>' + BODY +
            f'<script type="application/json" id="sow-state">{st}</script>'
            f'<script id="app-js">{js}</script></body></html>')

if __name__ == "__main__":
    s = json.load(open(sys.argv[1]))
    open(sys.argv[2], "w").write(build(s))
