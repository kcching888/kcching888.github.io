/* Tax Return Readiness v2 — IBKR slip workflow; source-separated candidates; read-only calculations, explicit server-saved review metadata. */
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
  // Slip workflow reuses existing review records: no new backend record kind.
  const isIBKR=source=>text(source).toUpperCase()==='IBKR';
  const registered=(source,account)=>['RRSP','TFSA','RRIF','FHSA','OTHER_REGISTERED'].includes(settings(source,account).registration);
  const slipDefinitions=[
    ['documents','Applicable tax slips and supporting reports received','Confirm the correct account and tax year, and identify the documents retained. Do not mark complete while required documents are outstanding.'],
    ['amendments','Amended-document check completed','Confirm whether amended slips/reports exist and record which versions will be used. Recheck before filing if documents may change.'],
    ['acb','Capital-gains / ACB exceptions assessed','Check supported acquisition costs and relevant transfers, opening valuations and adjustments for securities sold. A T5008 cost/book value is not automatically a verified tax ACB. If there were no sales, document that and choose NOT_APPLICABLE.']
  ];
  function slipTasks(a){
    return slipDefinitions.map(([code,label,description])=>{
      const automatic=code==='acb'&&registered(a.source,a.account);
      const k=key('review',[year,'ibkr_slip',[a.source,a.account,code],1]);
      const record=records.get(k);
      return {key:k,code,label,description,source:a.source,account:a.account,automatic,
        status:automatic?'NOT_APPLICABLE':ncRecord('review',k)?'RESOLVED':record?.payload.status||'OPEN',
        note:record?.payload.note||'',evidence:record?.payload.evidence||'',revision:record?.revision||0};
    });
  }
  function activeIBKRAccounts(){return accounts().filter(a=>isIBKR(a.source)&&[...input.trades,...input.dividends].some(r=>yearOf(r)===year&&sourceOf(r)===a.source&&accountOf(r)===a.account));}
  function allSlipTasks(){return activeIBKRAccounts().flatMap(slipTasks);}
  const reviewComplete=status=>['RESOLVED','NOT_APPLICABLE','EVIDENCE_REVIEWED'].includes(status);
  function issueLocation(issue){
    const id=issue.identity;
    if(!Array.isArray(id))return {source:'',account:'',item:typeof id==='string'?id:''};
    if(issue.type==='acb')return {source:id[0]||'',account:'Multiple accounts within source',item:id[1]||''};
    return {source:id[0]||'',account:id[1]||'',item:issue.type==='reconciliation'?metrics[id[2]]||id[2]:issue.type==='ibkr_slip'?slipDefinitions.find(d=>d[0]===id[2])?.[1]||id[2]:id.slice(2,4).filter(Boolean).join(' / ')};
  }
  function workflowSnapshot(){return {policy:'IBKR tax-slip-based; HSBC detailed review; source/account calculations unchanged',skippedChecks:activeIBKRAccounts().map(a=>({...a,year,monthlyCoverage:'SKIPPED_TAX_SLIP_WORKFLOW',detailedComparisons:'OPTIONAL',routineDividendReview:'SKIPPED_TAX_SLIP_WORKFLOW'})),annualChecklist:allSlipTasks()};}

  // No-change confirmations are review metadata, never reference amounts.
  function ncStable(v){if(Array.isArray(v))return v.map(ncStable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,ncStable(v[k])]));return v;}
  function ncHash(value){const s=JSON.stringify(ncStable(value));let a=2166136261,b=5381;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}return (a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+s.length;}
  const ncKey=(kind,target)=>key('review',[year,'confirm_no_change',[kind,target],1]);
  function ncSnapshot(kind,target){
    const rows=[...input.trades,...input.dividends,...input.dividendRows,...input.capitalSales];
    let parts=[];try{parts=JSON.parse(target.slice(target.indexOf('|')+1));}catch(e){}
    let source='',account='';
    if(['account','coverage','reconcile'].includes(kind)){source=parts[1];account=parts[2];}
    else if(kind==='review'&&Array.isArray(parts[2])){source=parts[2][0];account=parts[2][1];if(!rows.some(r=>sourceOf(r)===source))source='';if(!rows.some(r=>sourceOf(r)===source&&accountOf(r)===account))account='';}
    const selected=rows.filter(r=>(!source||sourceOf(r)===source)&&(!account||accountOf(r)===account));
    // Include history: an earlier acquisition can change a later sale's ACB.
    const settingsRows=accounts().filter(a=>(!source||a.source===source)&&(!account||a.account===account)).map(a=>[a,settings(a.source,a.account)]);
    return ncHash({year,kind,target,rows:selected,settings:settingsRows,targetPayload:records.get(target)?.payload||null,capitalError:input.capitalError||'',dividendError:input.dividendError||''});
  }
  function ncRecord(kind,target){
    const r=records.get(ncKey(kind,target));if(!r||r.payload?.status!=='RESOLVED')return null;
    try{const d=JSON.parse(r.payload.note);return d.marker==='CONFIRM_NO_CHANGE_V1'&&d.snapshot===ncSnapshot(kind,target)?r:null;}catch(e){return null;}
  }
  function ncTarget(issue){
    const id=issue.identity||(()=>{try{return JSON.parse(issue.key.slice(issue.key.indexOf('|')+1))[2];}catch(e){return null;}})();
    if(Array.isArray(id)&&['account','coverage','reconciliation'].includes(issue.type))return {kind:issue.type==='reconciliation'?'reconcile':issue.type,target:key(issue.type==='reconciliation'?'reconcile':issue.type,[Number(year),...id])};
    return {kind:'review',target:issue.key};
  }
  function buildIssues(){return ncDetectedIssues().filter(i=>{const t=ncTarget(i);return !ncRecord(t.kind,t.target);});}
  function render(){ncOriginalRender();if(root)ncControls();}
  async function ncSave(kind,target,label,reopen=false,options={}){
    if(!input.stateAvailable||!input.tokenConfigured)throw new Error('Readiness backend and write-token configuration are required.');
    if(!writeToken)throw new Error('Enter your existing readiness write token under Google Sheets save authorization first.');
    if(options.expectedYear!==undefined&&String(year)!==String(options.expectedYear))throw new Error('Tax year changed. Reload review state before continuing.');
    const k=ncKey(kind,target),before=records.get(k);
    const payload={status:reopen?'OPEN':'RESOLVED',note:JSON.stringify({marker:'CONFIRM_NO_CHANGE_V1',kind,target,label,year,snapshot:ncSnapshot(kind,target),decision:reopen?'REOPENED':'CONFIRMED_NO_CHANGE',at:new Date().toISOString()}),evidence:'User acknowledgement only; no financial data changed and no independent reconciliation implied.'};
    if(!options.batchApproved&&!confirm((reopen?'Reopen this item?':'Confirm this item as-is, with no financial changes?')+'\n\n'+year+' / '+label+'\n\nNo financial amounts or reference fields will be changed.'))return false;
    const response=await fetch(input.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'saveTaxReadinessRecord',writeToken,kind:'review',key:k,payload,expectedRevision:before?.revision||0})});
    const json=await response.json();if(!response.ok||!json.success||!json.record)throw new Error(json.error||'Confirmation save failed. Reload review state before retrying if the response was lost.');
    records.set(json.record.key,json.record);
    if(!options.deferRender){editor=null;render();root.querySelector('[data-tr-message]').textContent=reopen?'Item reopened. Financial data unchanged.':'Confirmed — no change. Financial data and reference amounts unchanged.';}
    return true;
  }

  function ncControls(){
    const list=accounts();root.__ncBulkTables=[];
    if(!root.__ncBulkSelection)root.__ncBulkSelection=new Set();
    function makeTable(table,items,reopen,title){
      if(!items.some(Boolean))return;
      const index=root.__ncBulkTables.length,scope=String(year)+'|'+title+'|'+index;
      const group={index,scope,reopen,title,items:[],controls:[]};root.__ncBulkTables.push(group);
      const toolbar=document.createElement('div');toolbar.className='tr-bulk-controls';toolbar.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 0';
      const allLabel=document.createElement('label');allLabel.style.cssText='display:inline-flex;align-items:center;gap:6px';
      const all=document.createElement('input');all.type='checkbox';all.setAttribute('aria-label','Select all pending items in '+title);allLabel.append(all,document.createTextNode('Select all'));
      const action=document.createElement('button');action.type='button';action.dataset.trNcBulk=String(index);action.textContent=reopen?'Reopen selected':'Confirm selected — no change';
      const count=document.createElement('span');count.setAttribute('aria-live','polite');toolbar.append(allLabel,action,count);table.parentNode.insertBefore(toolbar,table);
      const head=table.tHead?.rows[0];if(head){const th=document.createElement('th');th.textContent='Select';head.insertBefore(th,head.firstChild);}
      const rows=[...table.tBodies].flatMap(body=>[...body.rows]);
      rows.forEach((row,n)=>{
        const t=items[n],cell=document.createElement('td');row.insertBefore(cell,row.firstChild);
        if(!t){cell.textContent='—';return;}
        const identity=scope+'|'+t.kind+'|'+t.target,confirmed=!!ncRecord(t.kind,t.target),cb=document.createElement('input');
        cb.type='checkbox';cb.disabled=!reopen&&confirmed;cb.checked=!cb.disabled&&root.__ncBulkSelection.has(identity);cb.setAttribute('aria-label',(reopen?'Reopen ':'Confirm ')+t.label);cell.appendChild(cb);
        if(confirmed&&!reopen){const small=document.createElement('small');small.textContent=' Confirmed — no change';cell.appendChild(small);root.__ncBulkSelection.delete(identity);}
        const item={...t,identity,checkbox:cb};group.items.push(item);group.controls.push(cb);
        cb.onchange=()=>{if(cb.checked)root.__ncBulkSelection.add(identity);else root.__ncBulkSelection.delete(identity);update();};
      });
      function update(){const selectable=group.items.filter(t=>!t.checkbox.disabled),selected=selectable.filter(t=>t.checkbox.checked);all.disabled=!selectable.length;all.checked=!!selectable.length&&selected.length===selectable.length;all.indeterminate=selected.length>0&&selected.length<selectable.length;action.disabled=!selected.length||!!root.__ncBulkBusy;count.textContent=selected.length+' selected / '+selectable.length+' available';}
      all.onchange=()=>{for(const t of group.items){if(t.checkbox.disabled)continue;t.checkbox.checked=all.checked;if(all.checked)root.__ncBulkSelection.add(t.identity);else root.__ncBulkSelection.delete(t.identity);}update();};group.update=update;update();
    }
    const tables=[...root.querySelectorAll('table')];
    for(const table of tables){
      const rows=[...table.tBodies].flatMap(body=>[...body.rows]);
      const items=rows.map(row=>{
        let b=row.querySelector('[data-tr-issue]');
        if(b){const i=issues[Number(b.dataset.trIssue)];return i?{...ncTarget(i),label:i.label+' / '+row.textContent.trim()}:null;}
        b=row.querySelector('[data-tr-compare]');
        if(b){const a=list[Number(b.dataset.trCompare)];return a?{kind:'reconcile',target:key('reconcile',[Number(year),a.source,a.account,b.dataset.metric]),label:'Comparison / '+a.source+' / '+a.account+' / '+metrics[b.dataset.metric]}:null;}
        b=row.querySelector('[data-tr-slip]');
        if(b&&typeof allSlipTasks==='function'){const t=allSlipTasks()[Number(b.dataset.trSlip)];return t&&!t.automatic?{kind:'review',target:t.key,label:'IBKR annual task / '+t.account+' / '+t.label}:null;}
        b=row.querySelector('[data-tr-account]');
        if(b){const a=list[Number(b.dataset.trAccount)];return a?{kind:'account',target:key('account',[Number(year),a.source,a.account]),label:'Account settings / '+a.source+' / '+a.account}:null;}
        b=row.querySelector('[data-tr-coverage]');
        if(b){const a=list[Number(b.dataset.trCoverage)];return a?{kind:'coverage',target:key('coverage',[Number(year),a.source,a.account]),label:'Statement coverage / '+a.source+' / '+a.account}:null;}
        return null;
      });
      const section=table.closest('details'),title=section?.querySelector('summary')?.textContent||'Review table';makeTable(table,items,false,title);
    }
    const history=document.createElement('details'),entries=[];
    for(const r of records.values())try{const p=JSON.parse(r.payload?.note||'{}');if(p.marker==='CONFIRM_NO_CHANGE_V1'&&String(p.year)===String(year)&&r.payload.status==='RESOLVED')entries.push({p,active:!!ncRecord(p.kind,p.target)});}catch(e){}
    history.innerHTML='<summary>Confirmations — no change ('+entries.length+')</summary><p>User acknowledgements, not independent verification. Select rows and use Reopen selected to restore their underlying checks where applicable.</p>';
    const wrap=document.createElement('div');wrap.className='tr-scroll';const table=document.createElement('table');table.innerHTML='<thead><tr><th>Item</th><th>Status</th><th>Recorded</th></tr></thead><tbody>'+entries.map(({p,active})=>'<tr><td>'+E(p.label)+'</td><td>'+E(active?'Confirmed — no change':'Changed since confirmation; review again')+'</td><td>'+E(p.at||'')+'</td></tr>').join('')+'</tbody>';wrap.appendChild(table);history.appendChild(wrap);root.appendChild(history);
    makeTable(table,entries.map(({p})=>({kind:p.kind,target:p.target,label:p.label})),true,'Confirmation history');
    const note=document.createElement('p');note.textContent='Select all applies only to the table above it, for the selected year. Account-table selections acknowledge account settings only; coverage can be acknowledged in the review queue. Confirming does not fill missing facts or repair failed calculations. Existing Edit actions remain available.';root.appendChild(note);
    if(!root.__ncBulkBound){root.__ncBulkBound=true;root.addEventListener('click',async e=>{
      const b=e.target.closest('[data-tr-nc-bulk]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(root.__ncBulkBusy)return;
      const group=root.__ncBulkTables[Number(b.dataset.trNcBulk)];if(!group)return;
      const selected=group.items.filter(t=>t.checkbox.checked&&!t.checkbox.disabled);if(!selected.length)return;
      const message=root.querySelector('[data-tr-message]');
      if(!input.stateAvailable||!input.tokenConfigured||!writeToken){message.textContent='Enter your existing readiness write token and ensure the readiness backend is available before confirming.';return;}
      const action=group.reopen?'Reopen':'Confirm — no change';
      if(!confirm(action+' for '+selected.length+' selected item(s) in '+year+'?\n\n'+selected.map((t,i)=>(i+1)+'. '+t.label).join('\n')+'\n\nNo financial amounts or reference fields will be changed. Saves occur individually; a failure stops the remaining saves.'))return;
      root.__ncBulkBusy=true;const batchYear=year,batchInput=input;const previous=[...root.querySelectorAll('button,input,select,textarea')].map(control=>[control,control.disabled]);previous.forEach(([control])=>control.disabled=true);let done=0,error='';
      try{for(const t of selected){if(input!==batchInput||year!==batchYear)throw new Error('Review context changed. Reload review state before continuing.');message.textContent=action+': saving '+(done+1)+' of '+selected.length+'…';await ncSave(t.kind,t.target,t.label,group.reopen,{batchApproved:true,deferRender:true,expectedYear:batchYear});root.__ncBulkSelection.delete(t.identity);done++;}}
      catch(err){error=err.message;}
      finally{root.__ncBulkBusy=false;previous.forEach(([control,disabled])=>control.disabled=disabled);editor=null;render();root.querySelector('[data-tr-message]').textContent=(group.reopen?'Reopened ':'Confirmed — no change: ')+done+' of '+selected.length+'. Financial data unchanged.'+(error?' Stopped: '+error+' Reload review state before retrying; a lost response may still have saved. Remaining unsaved selections are retained where their rows remain available.':'');}
    },true);}
  }

  function ncControlsBulkVersion(){return 1;}
  function ncDetectedIssues(){
    const out=[],counts=new Map();
    function add(type,label,identity,details){
      const base=JSON.stringify([year,type,identity]);const n=(counts.get(base)||0)+1;counts.set(base,n);
      out.push({key:key('review',[year,type,identity,n]),type,label,identity,details});
    }
    if(input.capitalError)add('calculation','Capital calculation unavailable','capital',input.capitalError);
    if(input.dividendError)add('calculation','Dividend review unavailable','dividend',input.dividendError);
    if(!input.trades.some(r=>yearOf(r)===year)&&!input.dividends.some(r=>yearOf(r)===year))add('coverage','No loaded investment transactions for selected year','no-data','No transactions does not establish a zero-income year.');
    for(const a of accounts()){
      const used=[...input.trades,...input.dividends].some(r=>yearOf(r)===year&&sourceOf(r)===a.source&&accountOf(r)===a.account);
      if(!used)continue;
      const set=settings(a.source,a.account),id=[a.source,a.account];
      if(!set.owner||!set.registration||['UNCONFIRMED','OTHER_REVIEW'].includes(set.registration))add('account','Account ownership/registration not confirmed',id,JSON.stringify(a));
      if(isIBKR(a.source)){
        for(const task of slipTasks(a))if(!reviewComplete(task.status))add('ibkr_slip',task.label,[...id,task.code],task.description);
        continue;
      }
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
    for(const r of input.dividendRows.filter(r=>yearOf(r)===year&&!isIBKR(sourceOf(r)))){
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
      const poolKey=JSON.stringify([s,match]);
      if(!pools.has(poolKey))pools.set(poolKey,new Map());pools.get(poolKey).set(JSON.stringify([s,a]),{source:s,account:a,owner:settings(s,a).owner||'Unconfirmed'});
    }
    for(const [poolKey,entries] of pools)if(entries.size>1){const [source,security]=JSON.parse(poolKey);add('acb','Within-source cross-account ACB candidate',[source,security],source+' / '+security+'\n'+JSON.stringify([...entries.values()])+'\nCandidate only: verify identity, ownership, registration and overlapping holdings. Separate account ledgers remain unchanged. Cross-source candidates are suppressed by worksheet policy; this is not a tax-compliance determination.');}
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
  function ncOriginalRender(){
    if(!root)return;issues=buildIssues();
    const years=[...new Set([...input.trades,...input.dividends].map(yearOf).filter(Boolean).concat(String(new Date().getFullYear())))].sort().reverse();
    const groups=[['account','Account setup'],['coverage','Statement coverage'],['dividend','Dividend reconciliation'],['classification','Withholding expectations'],['acb','Within-source ACB candidates'],['ibkr_slip','IBKR annual document checklist'],['adjustment','Adjustments'],['opening','Residency opening evidence'],['reconciliation','Statement/slip comparisons'],['calculation','Calculation availability']];
    const accountRows=accounts().map((a,i)=>{const resolved=resolveAccountSettings(a.source,a.account),p=resolved.payload;return `<tr><td>${E(a.source)}</td><td>${E(a.account)}</td><td>${E(p.owner||'Not confirmed')}<small style="display:block">${E(resolved.scope==='INHERITED'?'Shared confirmation from '+resolved.fromYear:resolved.scope==='YEAR_OVERRIDE'?'Saved for selected year':resolved.conflict?'Conflicting yearly confirmations — confirm this year':'Confirmation required')}</small></td><td>${E(p.registration||'UNCONFIRMED')}</td><td><button data-tr-account="${i}" type="button">Edit</button> <button data-tr-coverage="${i}" type="button">${isIBKR(a.source)?'Coverage (optional)':'Coverage'}</button></td></tr>`;}).join('');
    const stateStatus=input.stateError?'Review state unavailable: '+input.stateError:input.stateAvailable?'Google Sheets review state loaded.':'Backend readiness extension not detected: review workspace is read-only.';
    root.innerHTML=`<h2>Tax Return Readiness</h2><p>Review workspace only. No change to imported transactions, ACB pools, withholding, registration treatment or tax calculations. Saved decisions document review; they do not repair source amounts or certify a return as filing-ready.</p>
      <div class="tr-controls"><label>Tax year<select data-tr-year>${years.map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select></label><button data-tr-action="reload" type="button">Reload review state</button><button data-tr-action="csv" type="button">Export checklist CSV</button><button data-tr-action="package" type="button">Export review package JSON</button></div>
      <details><summary>Google Sheets save authorization</summary><p>${E(stateStatus)} ${input.tokenConfigured?'Write-token setting detected.':'Write token is not configured on the backend.'}</p><label>Readiness write token <input type="password" autocomplete="off" data-tr-token placeholder="Enter private write token; kept in memory only"></label><button type="button" data-tr-action="forget">Forget token</button><p>Use only on your trusted tax page. Token is never included in exports. Saves affect only the dedicated readiness sheets. Do not put the token in GitHub.</p></details>
      <div class="tr-scroll"><table><thead><tr><th>Check</th><th>Detected items</th><th>Open / action required</th></tr></thead><tbody>${groups.map(([type,label])=>{const rows=issues.filter(i=>i.type===type);const open=rows.filter(i=>['account','coverage','reconciliation','calculation'].includes(i.type)||!['RESOLVED','NOT_APPLICABLE','EVIDENCE_REVIEWED'].includes(records.get(i.key)?.payload.status)).length;return `<tr><td>${E(label)}</td><td>${rows.length}</td><td>${open}</td></tr>`;}).join('')}</tbody></table></div>
      <p>IBKR routine monthly coverage and dividend checks are skipped under the tax-slip workflow; comparisons remain optional. Ownership, annual documents and adjustment/opening exceptions still require attention. Cross-source pooling candidates are suppressed; existing source/account ACB calculations are unchanged. This policy is not certification of tax-correct ACB.</p><p>No detected issue is not proof of complete data. Confirm — no change can settle review actions by acknowledgement without changing underlying facts. Other manual statuses remain annotations. Missing inputs and calculation failures are not repaired by acknowledgement.</p>
      <details open><summary>Account ownership and registration — shared confirmations / yearly overrides</summary><div class="tr-scroll"><table><thead><tr><th>Source</th><th>Account</th><th>Owner / taxpayer</th><th>Registration</th><th>Actions</th></tr></thead><tbody>${accountRows}</tbody></table></div><p>Confirm once to reuse these details in years with no saved account settings. Existing year-specific settings take priority. Conflicting confirmed owners/registrations block inheritance; use Edit to save the correct selected-year override. Inheritance applies backward and forward without effective-date limits: use only where details were unchanged. HSBC statement coverage and comparisons remain annual. IBKR monthly coverage and comparisons are optional under the tax-slip workflow. All detected accounts remain in existing reports. This release does not implement ownership allocation, registered-account exclusions or tax ACB pooling.</p></details>
      <details open><summary>IBKR — annual tax-slip workflow (${E(year)})</summary><p>Routine transaction review and monthly coverage: skipped — tax-slip workflow, not verified. Keep applicable tax documents and supporting records. EVIDENCE_REVIEWED / RESOLVED records completion of the named task only; it does not certify all imported amounts or ACB. Use NOT_APPLICABLE only with a documented reason. Registered-account ACB tasks are not applicable to this taxable-sales checklist; no calculation exclusions are introduced.</p><div class="tr-scroll"><table><thead><tr><th>Source / account</th><th>Annual task</th><th>Status</th><th>Evidence / note</th><th>Action</th></tr></thead><tbody>${allSlipTasks().map((t,i)=>`<tr><td>${E(t.source+' / '+t.account)}</td><td>${E(t.label)}</td><td>${E(t.automatic?'NOT_APPLICABLE — confirmed registered account':ncRecord('review',t.key)?'CONFIRMED — NO CHANGE':t.status)}</td><td>${E([t.evidence,t.note].filter(Boolean).join(' — '))}</td><td>${t.automatic?'Not required':`<button type="button" data-tr-slip="${i}">Review annual task</button>`}</td></tr>`).join('')||'<tr><td colspan="5">No IBKR transactions loaded for this year. This does not establish that no tax documents are required.</td></tr>'}</tbody></table></div></details>
      <details><summary>Statement/slip comparisons — selected year (IBKR optional)</summary><div class="tr-scroll"><table><thead><tr><th>Source / Account</th><th>Measure</th><th>App CAD</th><th>Reference CAD</th><th>Difference CAD</th><th>Action</th></tr></thead><tbody>${accounts().map((a,i)=>Object.keys(metrics).map(m=>{const t=total(a.source,a.account,m);if(!t.count&&!t.unavailable)return '';const p=records.get(key('reconcile',[Number(year),a.source,a.account,m]))?.payload;const delta=p&&t.value!==null&&!t.unavailable&&!t.missing?t.value-p.referenceAmount:null;return `<tr><td>${E(a.source+' / '+a.account)}</td><td>${E(metrics[m])}${isIBKR(a.source)?' <small>Optional — tax-slip workflow</small>':''}</td><td>${fmt(t.value)}${t.missing?` · ${t.missing} missing`:''}${t.unavailable?' · calculation unavailable':''}</td><td>${fmt(p?.referenceAmount)}</td><td>${fmt(delta)}</td><td><button type="button" data-tr-compare="${i}" data-metric="${m}">Edit reference</button></td></tr>`;}).join('')).join('')}</tbody></table></div></details>
      <details open><summary>Review queue (${issues.length} detected items)</summary><div class="tr-scroll"><table><thead><tr><th>Year</th><th>Source / account</th><th>Measure / security</th><th>Type</th><th>Issue</th><th>Review status</th><th>Details / review</th></tr></thead><tbody>${issues.map((issue,i)=>{const loc=issueLocation(issue);return `<tr><td>${E(year)}</td><td>${E([loc.source,loc.account].filter(Boolean).join(' / '))}</td><td>${E(loc.item)}</td><td>${E(issue.type)}</td><td>${E(issue.label)}</td><td>${E(records.get(issue.key)?.payload.status||'OPEN')}</td><td><button type="button" data-tr-issue="${i}">${issue.type==='coverage'?'Edit coverage':issue.type==='reconciliation'?'Edit reference':issue.type==='account'?'Edit account':'Open'}</button></td></tr>`;}).join('')||'<tr><td colspan="7">No detected issues; verify scope and evidence manually.</td></tr>'}</tbody></table></div></details>
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
          const rows=[['Year','Source','Account','Measure / security','Issue key','Type','Issue','Status','Note','Evidence','Revision'],...issues.filter(i=>i.type!=='ibkr_slip').map(i=>{const r=records.get(i.key),loc=issueLocation(i);return [year,loc.source,loc.account,loc.item,i.key,i.type,i.label,r?.payload.status||'OPEN',r?.payload.note||'',r?.payload.evidence||'',r?.revision||0];}),...allSlipTasks().map(t=>[year,t.source,t.account,t.label,t.key,'ibkr_slip',t.label,t.status,t.note,t.evidence,t.revision]),...activeIBKRAccounts().map(a=>[year,a.source,a.account,'Routine worksheet review','','workflow','Monthly coverage and routine dividend review skipped; comparisons optional','SKIPPED_TAX_SLIP_WORKFLOW','Not verified; annual document and exception checks retained','',0])];
          for(const r of records.values()){try{const p=JSON.parse(r.payload?.note||'{}');if(p.marker==='CONFIRM_NO_CHANGE_V1'&&String(p.year)===String(year)){const status=r.payload.status==='OPEN'?'REOPENED':ncRecord(p.kind,p.target)?'CONFIRMED_NO_CHANGE':'STALE_CONFIRMATION';rows.push(rows[0].length===11?[year,'','',p.label,r.key,'confirmation',p.label,status,'Acknowledgement only; financial values unchanged',r.payload.evidence||'',r.revision||0]:[year,r.key,'confirmation',p.label,status,'Acknowledgement only; financial values unchanged',r.payload.evidence||'',r.revision||0]);}}catch(e){}}
          const quote=v=>{let s=String(v);if(/^[=+\-@\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
          download('Tax_Review_Checklist_'+year+'.csv','\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8;');return;
        }
        if(action==='package'){
          const snapshot={schemaVersion:1,confirmationPolicy:"User acknowledgement only; no financial changes. See confirmation review records in settingsAndReviews.",workflow:workflowSnapshot(),createdAt:new Date().toISOString(),year,scope:'Investment review preparation only; not a filed return',basis:'Existing transaction-date calculations; no new tax pooling or registration exclusions',resolvedAccountSettings:accounts().map(a=>({...a,...resolveAccountSettings(a.source,a.account)})),inheritedAccountEvidence:[...new Set(accounts().map(a=>resolveAccountSettings(a.source,a.account)).filter(x=>x.scope==='INHERITED').map(x=>x.recordKey))].map(k=>records.get(k)),settingsAndReviews:[...records.values()].filter(r=>{try{return Number(JSON.parse(r.key.slice(r.key.indexOf('|')+1))[0])===Number(year);}catch(e){return false;}}),detectedIssues:issues,capitalError:input.capitalError||'',dividendError:input.dividendError||'',loadedCapitalSales:input.capitalSales.filter(r=>yearOf(r)===year),loadedDividendReview:input.dividendRows.filter(r=>yearOf(r)===year)};
          download('Tax_Review_Package_'+year+'.json',JSON.stringify(snapshot,null,2),'application/json');return;
        }
        if(b.dataset.trSlip!==undefined){const task=allSlipTasks()[Number(b.dataset.trSlip)];if(!task||task.automatic)return;root.querySelector('[data-tr-details]').innerHTML='<h4>'+E(task.label)+'</h4><p>'+E(task.description)+'</p>';openEditor('review',task.key,{},'IBKR annual task: '+year+' / '+task.account+' / '+task.label);return;}
        const list=accounts();
        if(b.dataset.trAccount!==undefined){const a=list[Number(b.dataset.trAccount)];openEditor('account',key('account',[Number(year),a.source,a.account]),{...settings(a.source,a.account),year:Number(year),...a},'Account settings: '+year+' / '+a.source+' / '+a.account);return;}
        if(b.dataset.trCoverage!==undefined){const a=list[Number(b.dataset.trCoverage)];openEditor('coverage',key('coverage',[Number(year),a.source,a.account]),{year:Number(year),...a},'Statement coverage: '+year+' / '+a.source+' / '+a.account);return;}
        if(b.dataset.trCompare!==undefined){const a=list[Number(b.dataset.trCompare)],metric=b.dataset.metric;openEditor('reconcile',key('reconcile',[Number(year),a.source,a.account,metric]),{year:Number(year),...a,metric},'Reference amount: '+year+' / '+a.account+' / '+metrics[metric]);return;}
        if(b.dataset.trIssue!==undefined){
          const i=issues[Number(b.dataset.trIssue)],loc=issueLocation(i),context=[year,loc.source,loc.account,loc.item].filter(Boolean).join(' / ');
          root.querySelector('[data-tr-details]').innerHTML='<h4>'+E(i.label)+'</h4><p>'+E(context)+'</p><pre>'+E(i.details)+'</pre>';
          const id=i.identity;
          if(i.type==='coverage'&&Array.isArray(id)){openEditor('coverage',key('coverage',[Number(year),id[0],id[1]]),{year:Number(year),source:id[0],account:id[1]},'Statement coverage: '+context);return;}
          if(i.type==='account'&&Array.isArray(id)){openEditor('account',key('account',[Number(year),id[0],id[1]]),{...settings(id[0],id[1]),year:Number(year),source:id[0],account:id[1]},'Account settings: '+context);return;}
          if(i.type==='reconciliation'&&Array.isArray(id)){openEditor('reconcile',key('reconcile',[Number(year),...id]),{year:Number(year),source:id[0],account:id[1],metric:id[2]},'Reference amount: '+context);return;}
          openEditor('review',i.key,{},i.label+' — '+context);
        }
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

  // Read-only T1 bridge. No token, editor state, or calculation mutation exposed.
  window.getT1InvestmentSnapshot=function(){
    if(!input)return null;
    return JSON.parse(JSON.stringify({url:input.url,dividendRows:input.dividendRows||[],capitalSales:input.capitalSales||[],capitalError:input.capitalError||'',dividendError:input.dividendError||'',records:[...records.values()]}));
  };
  const t1OriginalReadinessLoader=window.loadTaxReadiness;
  window.loadTaxReadiness=async function(data){const result=await t1OriginalReadinessLoader(data);window.dispatchEvent(new Event('t1-investment-data-ready'));return result;};
})();
