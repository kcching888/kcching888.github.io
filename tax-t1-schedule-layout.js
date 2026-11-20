/* Schedule 3 compact rows and included display totals. Load AFTER tax-t1.js. */
(function(){'use strict';
if(window.__t1ScheduleCompactV1)return;
window.__t1ScheduleCompactV1=true;
function cents(value){const s=String(value??'').trim().replace(/,/g,'');if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return null;const n=Number(s),v=Math.round(n*100);return Number.isFinite(n)&&Number.isSafeInteger(v)?v:null;}
function totals(table){const out={included:0,unreviewed:0,slipOnly:0,proceeds:0,acb:0,missingProceeds:0,missingAcb:0,overflow:false};
for(const row of table.querySelectorAll('tbody tr')){const include=row.querySelector('[data-s3-field="included"]');if(!include?.checked)continue;out.included++;if(!row.querySelector('[data-s3-field="reviewed"]')?.checked)out.unreviewed++;
const p=row.querySelector('[data-s3-field="proceeds"]'),a=row.querySelector('[data-s3-field="acb"]');if(!p&&!a){out.slipOnly++;continue;}
const pv=p?cents(p.value):null,av=a?cents(a.value):null;if(pv===null)out.missingProceeds++;else out.proceeds+=pv;if(av===null)out.missingAcb++;else out.acb+=av;
}out.overflow=!Number.isSafeInteger(out.proceeds)||!Number.isSafeInteger(out.acb);return out;}
if(typeof module==='object'&&module.exports){module.exports={cents,totals};return;}
const css=`
#t1-preparation table.s3-compact-table{width:max-content!important;min-width:100%!important;table-layout:auto!important;border-collapse:collapse!important}
#t1-preparation table.s3-compact-table tr{height:auto!important;min-height:0!important}
#t1-preparation table.s3-compact-table th,#t1-preparation table.s3-compact-table td{height:auto!important;min-height:0!important;padding:5px 7px!important;vertical-align:middle!important;white-space:nowrap!important}
#t1-preparation .s3-compact-cell{display:flex!important;align-items:center!important;flex-wrap:nowrap!important;gap:6px!important;white-space:nowrap!important;min-height:30px!important}
#t1-preparation .s3-compact-cell label{display:inline-flex!important;align-items:center!important;gap:4px!important;margin:0!important;padding:0!important;white-space:nowrap!important;min-height:0!important}
#t1-preparation .s3-compact-cell input:not([type=checkbox]){display:inline-block!important;width:115px!important;min-width:90px!important;height:28px!important;min-height:0!important;box-sizing:border-box!important;padding:3px 6px!important;margin:0!important;flex:0 0 auto!important}
#t1-preparation .s3-compact-cell input[data-s3-field=label]{width:150px!important}
#t1-preparation .s3-compact-cell input[data-s3-field=date]{width:120px!important}
#t1-preparation .s3-compact-cell input[data-s3-field=acquisitionYear]{width:90px!important;min-width:80px!important}
#t1-preparation .s3-compact-cell input[type=checkbox]{width:14px!important;height:14px!important;min-width:14px!important;min-height:0!important;margin:0!important;flex:0 0 auto!important}
#t1-preparation .s3-compact-cell textarea{display:inline-block!important;width:210px!important;min-width:150px!important;height:28px!important;min-height:28px!important;max-height:28px!important;box-sizing:border-box!important;resize:none!important;padding:3px 6px!important;margin:0!important;flex:0 0 auto!important}
#t1-preparation .s3-compact-cell small{display:inline-block!important;max-width:230px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;margin:0!important}
#t1-preparation .s3-compact-cell button{display:inline-block!important;height:28px!important;min-height:0!important;padding:3px 7px!important;margin:0!important;white-space:nowrap!important;flex:0 0 auto!important}
#t1-preparation .s3-display-totals{margin:9px 0!important;padding:10px 12px!important;border:1px solid #647e95!important;border-radius:5px!important;background:#172e40!important;color:#eef5fb!important}
#t1-preparation .s3-display-totals-main{display:flex!important;flex-wrap:wrap!important;gap:10px 28px!important;font-size:14px!important}
#t1-preparation .s3-display-totals-note{display:block!important;margin-top:6px!important;font-size:12px!important;line-height:1.4!important;white-space:normal!important}
@media print{#t1-preparation .s3-display-totals{background:white!important;color:black!important}}
`;
function put(el,text){if(el.textContent!==text)el.textContent=text;}
function apply(){const root=document.getElementById('t1-preparation');if(!root)return;
let table=root.querySelector('[data-s3-field="included"]')?.closest('table');
if(!table)table=Array.from(root.querySelectorAll('table')).find(t=>/include\s*\/\s*reviewed/i.test(t.querySelector('thead')?.textContent||''));
if(!table)return;table.classList.add('s3-compact-table');
for(const cell of table.querySelectorAll('tbody td')){if(cell.colSpan>1)continue;if(!cell.querySelector(':scope > .s3-compact-cell')){const wrap=document.createElement('div');wrap.className='s3-compact-cell';while(cell.firstChild)wrap.appendChild(cell.firstChild);cell.appendChild(wrap);}for(const small of cell.querySelectorAll('small'))small.title=small.textContent;for(const field of cell.querySelectorAll('textarea')){field.rows=1;field.title=field.value;field.setAttribute('aria-label','Schedule 3 evidence or correction reason');}}
let panel=root.querySelector('[data-s3-display-totals]');if(!panel){panel=document.createElement('section');panel.className='s3-display-totals';panel.dataset.s3DisplayTotals='';panel.setAttribute('aria-label','Included Schedule 3 display subtotals');const main=document.createElement('div');main.className='s3-display-totals-main';for(const kind of ['count','proceeds','acb']){const span=document.createElement('span');span.dataset.s3Total=kind;main.appendChild(span);}panel.appendChild(main);const note=document.createElement('small');note.className='s3-display-totals-note';note.dataset.s3Total='note';panel.appendChild(note);const anchor=table.closest('.t1-scroll')||table;anchor.parentNode.insertBefore(panel,anchor);}
const t=totals(table),fmt=n=>(n/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
put(panel.querySelector('[data-s3-total="count"]'),'Included entries: '+t.included);
put(panel.querySelector('[data-s3-total="proceeds"]'),'Included proceeds CAD'+(t.missingProceeds?' (partial subtotal)':'')+': '+(t.overflow?'—':fmt(t.proceeds)));
put(panel.querySelector('[data-s3-total="acb"]'),'Included ACB CAD'+(t.missingAcb?' (partial subtotal)':'')+': '+(t.overflow?'—':fmt(t.acb)));
let note='Display subtotals only; source-basis proceeds (net for imported sales), not verified gross proceeds. '+t.unreviewed+' included entries are not marked Reviewed. ';
if(t.missingProceeds||t.missingAcb)note+='Incomplete amounts: proceeds '+t.missingProceeds+', ACB '+t.missingAcb+'. Missing/invalid fields are not assumed zero. ';
if(t.slipOnly)note+=t.slipOnly+' slip-only entries have no disposition proceeds/ACB and are not added to these two subtotals. ';
if(t.overflow)note+='Total exceeds the safely supported display range. ';
note+='Existing source checks, review requirements and line 12700 calculation are unchanged.';
put(panel.querySelector('[data-s3-total="note"]'),note);
}
let pending=false;function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;apply();});}
function start(){const style=document.createElement('style');style.id='t1-schedule-compact-style';style.textContent=css;document.head.appendChild(style);new MutationObserver(records=>{const root=document.getElementById('t1-preparation');if(!root||records.some(r=>r.target===root||root.contains(r.target)||Array.from(r.addedNodes).some(n=>n===root||n.contains?.(root))))schedule();}).observe(document.body,{childList:true,subtree:true});for(const name of ['input','change'])document.addEventListener(name,e=>{if(e.target.closest?.('#t1-preparation')&&e.target.matches?.('[data-s3-field]'))schedule();},true);schedule();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
