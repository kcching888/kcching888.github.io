/* Tax Return Readiness v1 — read-only calculations, explicit server-saved review metadata. */
(function () {
  'use strict';
  let input=null,root=null,records=new Map(),writeToken='',year='',issues=[],editor=null;
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=v=>String(v??'').trim();
  const date=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'';};
  const number=v=>v===null||v===undefined||text(v)===''?null:Number.isFinite(Number(String(v).replace(/,/g,'')))?Number(String(v).replace(/,/g,'')):null;
  const fmt=v=>Number.isFinite(v)?v.toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const key=(kind,parts)=>kind+'|'+JSON.stringify(parts);
  const accountOf=r=>text(r.account||r.accountId)||'(missing account)';
  const sourceOf=r=>text(r.source||r._source).toUpperCase()||'UNKNOWN';
  const symbolOf=r=>text(r.symbol||r._symbol).toUpperCase();
  const yearOf=r=>date(r.date||r._date||r.tradeDate).slice(0,4);
  // Account confirmation inheritance v1. No new backend record kind/key required.
  function resolveAccountSettings(source,account){
    const explicit=records.get(key('account',[Number(year),source,account]));
    if(explicit)return {payload:explicit.payload||{},scope:'YEAR_OVERRIDE',fromYear:Number(year),recordKey:explicit.key,conflict:false};
    const candidates=[];
    for(const record of records.values()){
      if(!text(record.key).startsWith('account|'))continue;
      let parts;try{parts=JSON.parse(record.key.slice(record.key.indexOf('|')+1));}catch(error){continue;}
      if(!Array.isArray(parts)||parts.length!==3||!Number.isInteger(Number(parts[0]))||parts[1]!==source||parts[2]!==account)continue;
      const p=record.payload||{};
      if(!text(p.owner)||!registrations.includes(p.registration)||['UNCONFIRMED','OTHER_REVIEW'].includes(p.registration))continue;
      candidates.push({record,fromYear:Number(parts[0])});
    }
    const signatures=new Set(candidates.map(({record})=>JSON.stringify([text(record.payload.owner),record.payload.registration])));
    if(signatures.size>1)return {payload:{},scope:'CONFLICT',fromYear:null,recordKey:null,conflict:true};
    if(!candidates.length)return {payload:{},scope:'UNCONFIRMED',fromYear:null,recordKey:null,conflict:false};
    candidates.sort((a,b)=>b.fromYear-a.fromYear);
    const chosen=candidates[0];
    return {payload:chosen.record.payload,scope:'INHERITED',fromYear:chosen.fromYear,recordKey:chosen.record.key,conflict:false};
  }
  const settings=(source,account)=>resolveAccountSettings(source,account).payload;

  const registrations=['UNCONFIRMED','NON_REGISTERED','RRSP','TFSA','RRIF','FHSA','OTHER_REGISTERED','OTHER_REVIEW'];
  const statuses=['OPEN','EVIDENCE_REVIEWED','ADJUSTMENT_REQUIRED','RESOLVED','NOT_APPLICABLE'];
  const metrics={grossCad:'Gross dividends',withholdingCad:'Withholding',feeCad:'Collection fees',netCad:'Net dividend cash',proceedsCad:'Net sale proceeds',acbCad:'ACB sold',gainCad:'Realized gain/loss'};
  function accounts(){
    const result=new Map();
    [...input.trades,...input.dividends].forEach(r=>{const s=sourceOf(r),a=accountOf(r);result.set(JSON.stringify([s,a]),{source:s,account:a});});
    return [...result.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  function yearRows(list,source,account){return list.filter(r=>yearOf(r)===year&&sourceOf(r)===source&&accountOf(r)===account);}
  function total(source,account,metric){
    const gains=['proceedsCad','acbCad','gainCad'].includes(metric);
    let rows=yearRows(gains?input.capitalSales:input.dividendRows,source,account);
    if(!gains&&metric!=='withholdingCad')rows=rows.filter(r=>r.classification!=='Unmatched withholding');
    const known=rows.filter(r=>Number.isFinite(r[metric]));
    return {value:known.length?known.reduce((a,r)=>a+r[metric],0):null,missing:rows.length-known.length,count:rows.length,unavailable:gains?!!input.capitalError:!!input.dividendError};
  }
  function buildIssues(){
    const out=[],counts=new Map();
    function add(type,label,identity,details){
      const base=JSON.stringify([year,type,identity]);const n=(counts.get(base)||0)+1;counts.set(base,n);
      out.push({key:key('review',[year,type,identity,n]),type,label,details});
    }
    if(input.capitalError)add('calculation','Capital calculation unavailable','capital',input.capitalError);
    if(input.dividendError)add('calculation','Dividend review unavailable','dividend',input.dividendError);
    if(!input.trades.some(r=>yearOf(r)===year)&&!input.dividends.some(r=>yearOf(r)===year))add('coverage','No loaded investment transactions for selected year','no-data','No transactions does not establish a zero-income year.');
    for(const a of accounts()){
      const used=[...input.trades,...input.dividends].some(r=>yearOf(r)===year&&sourceOf(r)===a.source&&accountOf(r)===a.account);
      if(!used)continue;
      const set=settings(a.source,a.account),id=[a.source,a.account];
      if(!set.owner||!set.registration||['UNCONFIRMED','OTHER_REVIEW'].includes(set.registration))add('account','Account ownership/registration not confirmed',id,JSON.stringify(a));
      const cover=records.get(key('coverage',[Number(year),...id]))?.payload;
      const required=cover?cover.endMonth-cover.startMonth+1:12;
      if(!cover||cover.months.length<required)add('coverage','Statement coverage not confirmed',id,cover?`${cover.months.length}/${required} months confirmed for chosen review period`:'Review period and monthly evidence not confirmed. A missing month may be a no-activity month; confirm against statements.');
      const relevant=['grossCad','withholdingCad','proceedsCad'].filter(m=>total(a.source,a.account,m).count>0);
      for(const m of relevant){
        const ref=records.get(key('reconcile',[Number(year),...id,m]))?.payload;
        const actual=total(a.source,a.account,m);
        if(!ref)add('reconciliation','Statement/slip comparison not entered',[...id,m],metrics[m]);
        else if(actual.unavailable||actual.missing||actual.value===null||Math.abs(actual.value-ref.referenceAmount)>.02)add('reconciliation','Statement/slip comparison unresolved',[...id,m],metrics[m]+': app '+fmt(actual.value)+', reference '+fmt(ref.referenceAmount)+', missing '+actual.missing);
      }
    }
    for(const r of input.dividendRows.filter(r=>yearOf(r)===year)){
      const identity=[sourceOf(r),accountOf(r),r.date,symbolOf(r),r.currency,r.reference,r.gross,r.withholding,r.net,r.grossCad,r.withholdingCad,r.feeCad,r.netCad,r.expectedWithholdingPct];
      if(!['balanced','recordedTax'].includes(r.reconciliationCategory)&&!(sourceOf(r)==='IBKR'&&r.classification==='Unmatched withholding'&&Number.isFinite(r.withholdingCad)))add('dividend',r.reconciliationLabel||'Dividend requires review',identity,JSON.stringify(r));
      if(sourceOf(r)==='HSBC'&&r.expectedWithholdingPct===null&&r.classification!=='Unmatched withholding')add('classification','Withholding expectation not configured',identity,JSON.stringify(r));
    }
    const pools=new Map();
    for(const r of input.trades){
      const s=sourceOf(r),a=accountOf(r),reg=settings(s,a).registration;
      if(reg&& !['UNCONFIRMED','NON_REGISTERED','OTHER_REVIEW'].includes(reg))continue;
      if(yearOf(r)>year)continue;
      const isin=[r.isin,r.ISIN,r.securityId,r.description].map(text).join(' ').toUpperCase().match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/)?.[1];
      const match=isin?'ISIN '+isin:'Symbol '+symbolOf(r);if(!symbolOf(r)&&!isin)continue;
      if(!pools.has(match))pools.set(match,new Map());pools.get(match).set(JSON.stringify([s,a]),{source:s,account:a,owner:settings(s,a).owner||'Unconfirmed'});
    }
    for(const [security,entries] of pools)if(entries.size>1)add('acb','Cross-account cost-pool candidate',security,security+'\n'+JSON.stringify([...entries.values()])+'\nCandidate only: verify identity, ownership, registration and overlapping holdings. No pooling/recalculation has been performed.');
    for(const r of input.trades.filter(r=>yearOf(r)===year)){
      const label=text(r.action||r.type||r._type),desc=text(r.description);
      const identity=[sourceOf(r),accountOf(r),r.date||r._date,symbolOf(r),r.reference||r.statementKey||'',r.quantity,r.amount];
      if(/landing/i.test(label))add('opening','Residency opening valuation evidence',identity,JSON.stringify(r));
      if(/corporate|transfer|return of capital|reinvest|split|merger/i.test(label+' '+desc))add('adjustment','Transfer/corporate-action/ACB adjustment review',identity,JSON.stringify(r));
    }
    for(const r of input.dividends.filter(r=>yearOf(r)===year&&/return of capital|reinvest/i.test(text(r.action)+' '+text(r.description))))add('adjustment','Distribution-related ACB adjustment review',[sourceOf(r),accountOf(r),r.date,symbolOf(r),r.reference,r.amount],JSON.stringify(r));
    return out;
  }
  function select(name,values,value){return `<select name="${name}">${values.map(v=>`<option value="${E(v)}" ${v===value?'selected':''}>${E(v.replace(/_/g,' '))}</option>`).join('')}</select>`;}
  function fields(kind,p){
    const note=`<label>Review note<textarea name="note" rows="3">${E(p.note||'')}</textarea></label>`;
    const evidence=`<label>Evidence / statement reference<input name="evidence" value="${E(p.evidence||'')}"></label>`;
    if(kind==='account')return `<label>Owner / taxpayer identifier<input name="owner" required value="${E(p.owner||'')}" placeholder="Confirm owner; document joint interests in note"></label><label>Registration${select('registration',registrations,p.registration||'UNCONFIRMED')}</label>${note}`;
    if(kind==='review')return `<label>Status${select('status',statuses,p.status||'OPEN')}</label>${evidence}${note}`;
    if(kind==='coverage')return `<label>Start month<input name="startMonth" type="number" min="1" max="12" value="${p.startMonth||1}" required></label><label>End month<input name="endMonth" type="number" min="1" max="12" value="${p.endMonth||12}" required></label><label>Confirmed months (comma separated)<input name="months" value="${E((p.months||[]).join(','))}" placeholder="1,2,3"></label>${evidence}${note}<p>Explicit manual confirmation only; transaction presence does not prove monthly statement completeness. Explain partial-year scope in the note.</p>`;
    return `<label>Reference amount CAD<input name="referenceAmount" type="number" step="any" value="${E(p.referenceAmount??'')}" required></label>${evidence}${note}<p>Enter a matching gross/net amount and period. This reference is compared, never added to imported income or proceeds. For proceeds, the app uses net sale proceeds; reconcile fees before comparing a gross slip value.</p>`;
  }
  function renderEditor(){
    const node=root.querySelector('[data-tr-editor]');if(!editor){node.innerHTML='';return;}
    const r=records.get(editor.key);const p=r?.payload||editor.defaults;
    node.innerHTML=`<h4>${E(editor.title)}</h4><form data-tr-save>${fields(editor.kind,p)}<button type="submit">Review and save to Google Sheets</button><button type="button" data-tr-action="cancel">Cancel</button></form>`;
  }
  function render(){
    if(!root)return;issues=buildIssues();
    const years=[...new Set([...input.trades,...input.dividends].map(yearOf).filter(Boolean).concat(String(new Date().getFullYear())))].sort().reverse();
    const groups=[['account','Account setup'],['coverage','Statement coverage'],['dividend','Dividend reconciliation'],['classification','Withholding expectations'],['acb','Cross-account ACB candidates'],['adjustment','Adjustments'],['opening','Residency opening evidence'],['reconciliation','Statement/slip comparisons'],['calculation','Calculation availability']];
    const accountRows=accounts().map((a,i)=>{const resolved=resolveAccountSettings(a.source,a.account),p=resolved.payload;return `<tr><td>${E(a.source)}</td><td>${E(a.account)}</td><td>${E(p.owner||'Not confirmed')}<small style="display:block">${E(resolved.scope==='INHERITED'?'Shared confirmation from '+resolved.fromYear:resolved.scope==='YEAR_OVERRIDE'?'Saved for selected year':resolved.conflict?'Conflicting yearly confirmations — confirm this year':'Confirmation required')}</small></td><td>${E(p.registration||'UNCONFIRMED')}</td><td><button data-tr-account="${i}" type="button">Edit</button> <button data-tr-coverage="${i}" type="button">Coverage</button></td></tr>`;}).join('');
    const stateStatus=input.stateError?'Review state unavailable: '+input.stateError:input.stateAvailable?'Google Sheets review state loaded.':'Backend readiness extension not detected: review workspace is read-only.';
    root.innerHTML=`<h2>Tax Return Readiness</h2><p>Review workspace only. No change to imported transactions, ACB pools, withholding, registration treatment or tax calculations. Saved decisions document review; they do not repair source amounts or certify a return as filing-ready.</p>
      <div class="tr-controls"><label>Tax year<select data-tr-year>${years.map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select></label><button data-tr-action="reload" type="button">Reload review state</button><button data-tr-action="csv" type="button">Export checklist CSV</button><button data-tr-action="package" type="button">Export review package JSON</button></div>
      <details><summary>Google Sheets save authorization</summary><p>${E(stateStatus)} ${input.tokenConfigured?'Write-token setting detected.':'Write token is not configured on the backend.'}</p><label>Readiness write token <input type="password" autocomplete="off" data-tr-token placeholder="Enter private write token; kept in memory only"></label><button type="button" data-tr-action="forget">Forget token</button><p>Use only on your trusted tax page. Token is never included in exports. Saves affect only the dedicated readiness sheets. Do not put the token in GitHub.</p></details>
      <div class="tr-scroll"><table><thead><tr><th>Check</th><th>Detected items</th><th>Open / action required</th></tr></thead><tbody>${groups.map(([type,label])=>{const rows=issues.filter(i=>i.type===type);const open=rows.filter(i=>['account','coverage','reconciliation','calculation'].includes(i.type)||!['RESOLVED','NOT_APPLICABLE','EVIDENCE_REVIEWED'].includes(records.get(i.key)?.payload.status)).length;return `<tr><td>${E(label)}</td><td>${rows.length}</td><td>${open}</td></tr>`;}).join('')}</tbody></table></div>
      <p>No detected issue is not proof of complete data. Manual review statuses never remove the underlying detected checks. Account, coverage, comparison and calculation checks stay open until their underlying conditions change; a queue note cannot clear them. Other review decisions remain annotations, not calculation adjustments.</p>
      <details open><summary>Account ownership and registration — shared confirmations / yearly overrides</summary><div class="tr-scroll"><table><thead><tr><th>Source</th><th>Account</th><th>Owner / taxpayer</th><th>Registration</th><th>Actions</th></tr></thead><tbody>${accountRows}</tbody></table></div><p>Confirm once to reuse these details in years with no saved account settings. Existing year-specific settings take priority. Conflicting confirmed owners/registrations block inheritance; use Edit to save the correct selected-year override. Inheritance applies backward and forward without effective-date limits: use only where details were unchanged. Statement coverage and comparisons remain annual. All detected accounts remain in existing reports. This release does not implement ownership allocation, registered-account exclusions or tax ACB pooling.</p></details>
      <details><summary>Statement/slip comparisons — selected year</summary><div class="tr-scroll"><table><thead><tr><th>Source / Account</th><th>Measure</th><th>App CAD</th><th>Reference CAD</th><th>Difference CAD</th><th>Action</th></tr></thead><tbody>${accounts().map((a,i)=>Object.keys(metrics).map(m=>{const t=total(a.source,a.account,m);if(!t.count&&!t.unavailable)return '';const p=records.get(key('reconcile',[Number(year),a.source,a.account,m]))?.payload;const delta=p&&t.value!==null&&!t.unavailable&&!t.missing?t.value-p.referenceAmount:null;return `<tr><td>${E(a.source+' / '+a.account)}</td><td>${E(metrics[m])}</td><td>${fmt(t.value)}${t.missing?` · ${t.missing} missing`:''}${t.unavailable?' · calculation unavailable':''}</td><td>${fmt(p?.referenceAmount)}</td><td>${fmt(delta)}</td><td><button type="button" data-tr-compare="${i}" data-metric="${m}">Edit reference</button></td></tr>`;}).join('')).join('')}</tbody></table></div></details>
      <details open><summary>Review queue (${issues.length} detected items)</summary><div class="tr-scroll"><table><thead><tr><th>Type</th><th>Issue</th><th>Review status</th><th>Details / review</th></tr></thead><tbody>${issues.map((issue,i)=>`<tr><td>${E(issue.type)}</td><td>${E(issue.label)}</td><td>${E(records.get(issue.key)?.payload.status||'OPEN')}</td><td><button type="button" data-tr-issue="${i}">Open</button></td></tr>`).join('')||'<tr><td colspan="4">No detected issues; verify scope and evidence manually.</td></tr>'}</tbody></table></div></details>
      <div data-tr-details></div><div data-tr-editor></div><p data-tr-message role="status"></p>`;
    root.querySelector('[data-tr-token]').value=writeToken;renderEditor();
  }
  function openEditor(kind,k,defaults,title){editor={kind,key:k,defaults,title};renderEditor();root.querySelector('[data-tr-editor]').scrollIntoView({block:'nearest',behavior:'smooth'});}
  function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function reload(){
    const response=await fetch(input.url+'?action=getTaxReadinessState&t='+Date.now());const json=await response.json();
    if(!response.ok||!json.success||json.state?.schemaVersion!==1)throw new Error(json.error||'Review-state endpoint unavailable.');
    setState(json.state);editor=null;render();
  }
  function setState(state){input.stateAvailable=state?.schemaVersion===1&&!state.error;input.stateError=state?.error||'';input.tokenConfigured=!!state?.writeTokenConfigured;records=new Map((state?.records||[]).map(r=>[r.key,r]));}
  window.loadTaxReadiness=async function(data){
    input={...data,trades:data.trades||[],dividends:data.dividends||[],dividendRows:data.dividendRows||[],capitalSales:data.capitalSales||[]};
    year=year||String(new Date().getFullYear());setState(data.state);editor=null;
    if(!root){root=document.createElement('section');root.id='tax-readiness';root.className='card';document.querySelector('main').appendChild(root);}
    root.oninput=e=>{if(e.target.matches('[data-tr-token]'))writeToken=e.target.value;};
    root.onchange=e=>{if(e.target.matches('[data-tr-year]')){year=e.target.value;editor=null;render();}};
    root.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;
      try{
        const action=b.dataset.trAction;
        if(action==='cancel'){editor=null;renderEditor();return;}
        if(action==='forget'){writeToken='';root.querySelector('[data-tr-token]').value='';return;}
        if(action==='reload'){if(confirm('Reload saved review metadata? Unsaved form entries will be discarded.'))await reload();return;}
        if(action==='csv'){
          const rows=[['Year','Issue key','Type','Issue','Status','Note','Evidence','Revision'],...issues.map(i=>{const r=records.get(i.key);return [year,i.key,i.type,i.label,r?.payload.status||'OPEN',r?.payload.note||'',r?.payload.evidence||'',r?.revision||0];})];
          const quote=v=>{let s=String(v);if(/^[=+\-@\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
          download('Tax_Review_Checklist_'+year+'.csv','\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8;');return;
        }
        if(action==='package'){
          const snapshot={schemaVersion:1,createdAt:new Date().toISOString(),year,scope:'Investment review preparation only; not a filed return',basis:'Existing transaction-date calculations; no new tax pooling or registration exclusions',resolvedAccountSettings:accounts().map(a=>({...a,...resolveAccountSettings(a.source,a.account)})),inheritedAccountEvidence:[...new Set(accounts().map(a=>resolveAccountSettings(a.source,a.account)).filter(x=>x.scope==='INHERITED').map(x=>x.recordKey))].map(k=>records.get(k)),settingsAndReviews:[...records.values()].filter(r=>{try{return Number(JSON.parse(r.key.slice(r.key.indexOf('|')+1))[0])===Number(year);}catch(e){return false;}}),detectedIssues:issues,capitalError:input.capitalError||'',dividendError:input.dividendError||'',loadedCapitalSales:input.capitalSales.filter(r=>yearOf(r)===year),loadedDividendReview:input.dividendRows.filter(r=>yearOf(r)===year)};
          download('Tax_Review_Package_'+year+'.json',JSON.stringify(snapshot,null,2),'application/json');return;
        }
        const list=accounts();
        if(b.dataset.trAccount!==undefined){const a=list[Number(b.dataset.trAccount)];openEditor('account',key('account',[Number(year),a.source,a.account]),{...settings(a.source,a.account),year:Number(year),...a},'Account settings: '+year+' / '+a.source+' / '+a.account);return;}
        if(b.dataset.trCoverage!==undefined){const a=list[Number(b.dataset.trCoverage)];openEditor('coverage',key('coverage',[Number(year),a.source,a.account]),{year:Number(year),...a},'Statement coverage: '+year+' / '+a.source+' / '+a.account);return;}
        if(b.dataset.trCompare!==undefined){const a=list[Number(b.dataset.trCompare)],metric=b.dataset.metric;openEditor('reconcile',key('reconcile',[Number(year),a.source,a.account,metric]),{year:Number(year),...a,metric},'Reference amount: '+year+' / '+a.account+' / '+metrics[metric]);return;}
        if(b.dataset.trIssue!==undefined){const i=issues[Number(b.dataset.trIssue)];root.querySelector('[data-tr-details]').innerHTML='<h4>'+E(i.label)+'</h4><pre>'+E(i.details)+'</pre>';openEditor('review',i.key,{},i.label);}
      }catch(err){root.querySelector('[data-tr-message]').textContent=err.message;}
    };
    root.onsubmit=async e=>{
      if(!e.target.matches('[data-tr-save]'))return;e.preventDefault();const form=e.target;
      if(!input.stateAvailable||!input.tokenConfigured){alert('Deploy the readiness backend and configure the write token before saving.');return;}
      if(!writeToken){alert('Enter the readiness write token first.');return;}
      const before=records.get(editor.key),f=new FormData(form),p={...(before?.payload||editor.defaults)};
      const value=n=>text(f.get(n));
      if(editor.kind==='account'){p.owner=value('owner');p.registration=value('registration');p.note=value('note');}
      if(editor.kind==='review'){p.status=value('status');p.note=value('note');p.evidence=value('evidence');}
      if(editor.kind==='coverage'){p.startMonth=Number(value('startMonth'));p.endMonth=Number(value('endMonth'));p.months=value('months')?value('months').split(',').map(t=>Number(t.trim())):[];p.note=value('note');p.evidence=value('evidence');}
      if(editor.kind==='reconcile'){p.referenceAmount=number(value('referenceAmount'));p.note=value('note');p.evidence=value('evidence');}
      if(!confirm('Save this review metadata to the dedicated Google Sheets readiness state and audit sheets?\n\n'+editor.title+'\n'+JSON.stringify(p,null,2)))return;
      const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
      try{
        const request={action:'saveTaxReadinessRecord',writeToken,kind:editor.kind,key:editor.key,payload:p,expectedRevision:before?.revision||0};
        const response=await fetch(input.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(request)});
        const json=await response.json();if(!response.ok||!json.success)throw new Error(json.error||'Save failed.');
        records.set(json.record.key,json.record);editor=null;render();root.querySelector('[data-tr-message]').textContent='Saved to Google Sheets. Underlying tax calculations were not changed.';
      }catch(err){root.querySelector('[data-tr-message]').textContent=err.message+' If the network response was lost, reload review state before retrying; the server may already have saved it.';}
      finally{buttons.forEach(b=>b.disabled=false);}
    };
    render();
  };
})();
