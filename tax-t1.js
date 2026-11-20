/* FOREIGN25-INTEGRATED-V2 */
/* Supporting forms update: limited Schedule8/T776/T777 worksheets and reviewed total-income calculation. */
/* T3 box26 less box31 apply-to-13000; retains T5008 selection visibility/manual-link repair. */
/* T1 preparation drafts v4 — T4E/11900 and ordinary Schedule 3 supporting worksheet: worksheet only; no tax-rate engine or filing transmission. */
(function(){'use strict';
const LINES=[["10100", "Employment income", 1], ["11900", "Employment insurance and other benefits", 1], ["12000", "Taxable dividends from Canadian corporations", 1], ["12100", "Interest and other investment income", 1], ["12599", "Gross rental income \u2014 reporting support, not added to total income", 1], ["12600", "Net rental income", 1], ["12700", "Taxable capital gains", 1], ["13000", "Other income", 1], ["15000", "Total income", 2], ["20700", "Registered pension plan deduction (supported amount)", 2], ["21200", "Annual union/professional dues (supported amount)", 2], ["22100", "Carrying charges and interest expenses", 2], ["22215", "Enhanced CPP/QPP deduction on employment income", 2], ["22900", "Other employment expenses \u2014 reviewed T777", 2], ["23200", "Other deductions", 2], ["23600", "Net income", 2], ["24900", "Security options deductions", 2], ["25000", "Other payments deduction", 2], ["25300", "Net capital losses of other years", 2], ["26000", "Taxable income", 2], ["30000", "Basic personal amount", 3], ["30300", "Spouse or common-law partner amount", 3], ["30800", "CPP/QPP contributions on employment income", 3], ["31200", "EI premiums on employment income", 3], ["31260", "Canada employment amount", 3], ["32300", "Tuition, education and textbook amount", 3], ["32400", "Tuition amount transferred from a child", 3], ["32600", "Amounts transferred from your partner", 3], ["33200", "Medical expenses (claim amount from applicable worksheet)", 3], ["34900", "Donations and gifts", 3], ["35000", "Total federal non-refundable tax credits", 4], ["40425", "Federal dividend tax credit", 4], ["40500", "Federal foreign tax credit", 4], ["41500", "Canada workers benefit advance payments (verify year applicability)", 4], ["42000", "Net federal tax", 4], ["42800", "Provincial or territorial tax", 4], ["43500", "Total payable", 4], ["43700", "Total income tax deducted", 5], ["44800", "CPP/QPP overpayment \u2014 reviewed schedule", 5], ["45200", "Refundable medical expense supplement", 5], ["45300", "Canada workers benefit", 5], ["47600", "Tax paid by instalments", 5], ["48200", "Total credits", 5], ["48400", "Refund", 6], ["48500", "Balance owing", 6]];
const steps=['Profile','Income & investment suggestions','Deductions & income totals','Personal amounts & expenses','Tax & credits','Payments & refundable credits','Final review'];
const provinces=['','AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(v)?v.toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
function hash(v){const s=JSON.stringify(stable(v));let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16)+'-'+s.length;}
function parseMoney(v){const s=String(v??'').trim().replace(/,/g,'');if(!s)return null;if(!/^-?\d+(?:\.\d{0,2})?$/.test(s))throw Error('Enter a CAD amount with at most two decimal places.');const n=Number(s);if(!Number.isFinite(n)||Math.abs(n)>1e12)throw Error('Amount out of range.');return n;}
const emptyLine=()=>({amount:null,status:'UNANSWERED',source:'',note:'',basisHash:'',componentHash:''});
function blank(year=2025,id='patrick',name='Patrick'){return {schemaVersion:1,taxpayer:{id,name},year,province:year===2025&&id==='patrick'?'AB':'',provinceConfirmed:year===2025&&id==='patrick',profileConfirmed:false,residencyNote:year===2021&&id==='patrick'?'Canadian residency date previously supplied: 2021-12-05. Verify part-year reporting and opening-cost treatment.':'',step:0,lines:Object.fromEntries(LINES.map(([c])=>[c,emptyLine()])),contributions:[],otherLinesNote:'',otherLinesReviewed:false};}
const componentHash=d=>hash(d.contributions.filter(c=>c.included&&(!c.target||c.target==='12100')).map(c=>({id:c.id,amount:c.amount,snapshot:c.snapshot,kind:c.kind})).sort((a,b)=>a.id.localeCompare(b.id)));
function validateDraft(d){
 validateInvestment(d);validateDispositions(d);validateSchedule3(d);validateBenefits(d);validateForms5(d);validateForeign25(d);
 if(!d||d.schemaVersion!==1||!Number.isInteger(d.year)||d.year<2021||d.year>2200||!d.taxpayer||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(d.taxpayer.id)||typeof d.taxpayer.name!=='string'||!d.taxpayer.name.trim()||d.taxpayer.name.length>120)throw Error('Invalid draft identity.');
 if(!provinces.includes(d.province)||typeof d.profileConfirmed!=='boolean'||typeof d.provinceConfirmed!=='boolean'||!Number.isInteger(d.step)||d.step<0||d.step>6||typeof d.otherLinesReviewed!=='boolean'||typeof d.otherLinesNote!=='string'||typeof d.residencyNote!=='string')throw Error('Invalid draft profile.');
 if(Object.keys(d).some(k=>!['schemaVersion','taxpayer','year','province','provinceConfirmed','profileConfirmed','residencyNote','step','lines','contributions','otherLinesNote','otherLinesReviewed','slips','investmentTab','slipReviewConfirmed','dispositions','schedule3','forms5','foreignTax'].includes(k)))throw Error('Unexpected draft field.');
 if(!d.lines||Array.isArray(d.lines)||Object.keys(d.lines).some(c=>!LINES.some(l=>l[0]===c)))throw Error('Invalid line collection.');
 for(const [c,l] of Object.entries(d.lines)){if(!l||Object.keys(l).some(k=>!['amount','status','source','note','basisHash','componentHash'].includes(k))||l.amount!==null&&(!Number.isFinite(l.amount)||Math.abs(l.amount)>1e12)||!['UNANSWERED','ENTERED','CONFIRMED','NA'].includes(l.status)||['source','note','basisHash','componentHash'].some(k=>typeof l[k]!=='string'||l[k].length>6000)||['CONFIRMED','NA'].includes(l.status)&&l.amount===null||l.status==='NA'&&l.amount!==0)throw Error('Invalid line '+c);}
 if(!Array.isArray(d.contributions)||d.contributions.length>1000)throw Error('Invalid contributions.');const seen=new Set();
 for(const c of d.contributions){if(!c||typeof c.id!=='string'||seen.has(c.id)||!['HSBC','MANUAL'].includes(c.kind)||typeof c.included!=='boolean'||!Number.isFinite(c.amount)||Math.abs(c.amount)>1e12||['label','account','snapshot'].some(k=>typeof c[k]!=='string')||Object.keys(c).some(k=>!['id','label','kind','account','amount','snapshot','included','target','rowKeys'].includes(k)))throw Error('Invalid contribution.');seen.add(c.id);}
 if(JSON.stringify(d).length>45000)throw Error('Draft too large; reduce notes or components.');return d;
}
function resolveSettings(records,year,source,account){const explicit=records.find(r=>r.key==='account|'+JSON.stringify([year,source,account]));if(explicit)return explicit.payload||{};const options=[];for(const r of records){if(!String(r.key).startsWith('account|'))continue;let a;try{a=JSON.parse(r.key.slice(8));}catch(e){continue;}const p=r.payload||{};if(a[1]===source&&a[2]===account&&p.owner&&p.registration&&!['UNCONFIRMED','OTHER_REVIEW'].includes(p.registration))options.push(p);}return new Set(options.map(p=>JSON.stringify([p.owner.trim(),p.registration]))).size===1?options[0]:{};}
function investmentCandidates(snapshot,d){if(!snapshot)return [];const groups=new Map();for(const r of snapshot.dividendRows||[]){if(String(r.date||'').slice(0,4)!==String(d.year)||r.source!=='HSBC'||r.classification==='Unmatched withholding')continue;const a=String(r.account||''),p=resolveSettings(snapshot.records||[],d.year,'HSBC',a);if(String(p.owner||'').trim().toLowerCase()!==d.taxpayer.name.trim().toLowerCase()||p.registration!=='NON_REGISTERED')continue;if(!groups.has(a))groups.set(a,[]);groups.get(a).push(r);}return [...groups].map(([account,rows])=>({id:'HSBC:'+account,account,rows,amount:Math.round(rows.reduce((s,r)=>s+(Number.isFinite(r.grossCad)?r.grossCad:0),0)*100)/100,missing:rows.filter(r=>!Number.isFinite(r.grossCad)).length,snapshot:hash({rows,settings:resolveSettings(snapshot.records||[],d.year,'HSBC',account)})}));}
function staleComponents(d,candidates,snapshotAvailable){return d.contributions.filter(c=>c.included&&c.kind==='HSBC'&&(!snapshotAvailable||!candidates.some(g=>g.id===c.id&&g.snapshot===c.snapshot)));}
function statusOf(d,code,candidates=[],snapshotAvailable=false,scheduleSnapshot=null){const l=d.lines[code]||emptyLine();if(l.basisHash?.startsWith('FT25:')&&l.basisHash!==foreign25Basis(d))return 'NEEDS_REVIEW';if(l.basisHash?.startsWith('F5:')){const key=l.basisHash.split(':')[1];if(!['income','cpp','rental','employment'].includes(key)||l.basisHash!==form5Basis(d,key,scheduleSnapshot))return 'NEEDS_REVIEW';}if(l.basisHash?.startsWith('T3O1:')&&l.basisHash!==t3OtherIncomeBasis(d))return 'NEEDS_REVIEW';if(l.basisHash?.startsWith('EI4:')&&l.basisHash!==benefitsBasis(d))return 'NEEDS_REVIEW';if(l.basisHash?.startsWith('WITH4:')&&l.basisHash!==withholdingBasis(d))return 'NEEDS_REVIEW';if(l.basisHash?.startsWith('S34:')&&l.basisHash!==scheduleBasis(d,scheduleSnapshot))return 'NEEDS_REVIEW';if(code==='43700'&&l.basisHash?.startsWith('EMP3:')&&activeSlips(d).some(s=>s.type==='T4E'&&['22','23','24'].some(k=>s.boxes[k]>0)))return 'NEEDS_REVIEW';if(l.basisHash?.startsWith('EMP3:')&&l.basisHash!==employmentBasis(d))return 'NEEDS_REVIEW';if(l.basisHash?.startsWith('INV2:')&&l.basisHash!==investmentBasis(d,candidates,snapshotAvailable))return 'NEEDS_REVIEW';if(code==='12100'&&l.componentHash&&(l.componentHash!==componentHash(d)||staleComponents(d,candidates,snapshotAvailable).length))return 'NEEDS_REVIEW';if(['48400','48500'].includes(code)&&l.basisHash&&l.basisHash!==refundBasis(d))return 'NEEDS_REVIEW';return l.status;}
const refundBasis=d=>hash(['43500','48200'].map(c=>[c,d.lines[c]?.amount,d.lines[c]?.status]));
function refundSuggestions(d){const a=d.lines['43500'],b=d.lines['48200'];if(![a,b].every(l=>l&&Number.isFinite(l.amount)&&l.amount>=0&&['CONFIRMED','NA'].includes(l.status)))return null;const cents=Math.round(a.amount*100)-Math.round(b.amount*100);return {'48400':Math.max(0,-cents)/100,'48500':Math.max(0,cents)/100};}

const SLIP_BOXES={"T5": {"10": "Actual non-eligible dividends (reference)", "11": "Taxable non-eligible dividends \u2192 12000 / 12010", "12": "Non-eligible dividend tax credit \u2192 40425 support", "13": "Canadian interest \u2192 12100", "14": "Other Canadian investment income \u2192 12100", "15": "Foreign income \u2192 12100", "16": "Foreign tax paid (credit support only)", "17": "Royalties \u2014 conditional; review separately", "18": "Capital gains dividends \u2014 separate Schedule 3 review", "19": "Accrued income / annuity \u2014 conditional; review separately", "24": "Actual eligible dividends (reference)", "25": "Taxable eligible dividends \u2192 12000", "26": "Eligible dividend tax credit \u2192 40425 support", "30": "Equity-linked notes interest \u2192 12100"}, "T3": {"21": "Capital gains \u2014 separate Schedule 3 review", "23": "Actual non-eligible dividends (reference)", "24": "Foreign business income \u2014 review separately", "25": "Foreign non-business income \u2192 12100", "26": "Other income \u2014 separate line 13000 review", "31": "Qualifying pension income — included in box 26; separate line 11500 review", "32": "Taxable non-eligible dividends \u2192 12000 / 12010", "33": "Foreign business income tax paid (separate review)", "34": "Foreign non-business tax paid (credit support only)", "39": "Non-eligible dividend tax credit \u2192 40425 support", "42": "Cost-base adjustments \u2014 separate ACB review", "49": "Actual eligible dividends (reference)", "50": "Taxable eligible dividends \u2192 12000", "51": "Eligible dividend tax credit \u2192 40425 support"}, "T4": {"14": "Employment income \u2192 10100 subtotal", "16": "CPP contributions \u2014 Schedule 8 / RC381 support", "16A": "Second CPP contributions \u2014 2024+ schedule support", "17": "QPP contributions \u2014 schedule support", "17A": "Second QPP contributions \u2014 2024+ schedule support", "18": "EI premiums \u2014 limits/overpayment review for 31200", "20": "RPP contributions \u2014 20700 support", "22": "Canadian income tax deducted \u2192 43700 subtotal", "24": "EI insurable earnings (reference only)", "26": "CPP/QPP pensionable earnings (reference only)", "40": "Taxable benefits (generally included in box 14; do not add again)", "42": "Employment commissions \u2014 support line 10120; already included in box 14", "44": "Union dues \u2014 21200 support", "46": "Payroll donations \u2014 34900 support only", "52": "Pension adjustment \u2014 separate line 20600 review", "55": "QPIP premiums \u2014 separate review", "56": "QPIP insurable earnings (reference only)", "38": "Security option benefits \u2014 generally already included in box 14", "39": "Security option deduction 110(1)(d) \u2014 separate line 24900 review", "41": "Security option deduction 110(1)(d.1) \u2014 separate line 24900 review", "43": "Forces/police deduction \u2014 separate line 24400 review", "66": "Eligible retiring allowance \u2014 separate line 13000 review", "67": "Non-eligible retiring allowance \u2014 separate line 13000 review", "74": "Past-service RPP contribution \u2014 separate 20700 review", "75": "Past-service RPP contribution \u2014 separate 20700 review", "77": "Workers compensation repaid \u2014 separate 22900 review", "85": "Employee-paid health-plan premiums \u2014 medical-expense support"}, "T4E": {"7": "Repayment rate (%) \u2014 reference, NOT a CAD amount", "14": "Total benefits paid \u2192 11900 before subtracting box 18", "15": "Regular/other benefits \u2014 already included in box 14", "17": "Employment support benefits \u2014 already included in box 14", "18": "Tax-exempt benefits \u2014 subtract from box 14 for 11900", "20": "Taxable tuition assistance \u2014 included in box 14; separate tuition review", "21": "Non-taxable tuition assistance \u2014 separate deduction line 25600 review", "22": "Income tax deducted \u2192 43700 support", "23": "Quebec income tax \u2014 federal 43700 only for non-Quebec year-end residents", "24": "Non-resident tax deducted \u2192 43700 support", "26": "Overpayment recovered/repaid \u2014 included in box 30", "27": "Reversal of income tax deducted \u2014 included in box 30", "30": "Total repayment \u2192 23200 support; do NOT subtract again from 11900", "33": "Consolidated revenue fund payments \u2014 already included in box 14", "36": "Provincial parental insurance benefits \u2014 already included in box 14", "37": "EI maternity/parental benefits \u2014 already included in box 14"}};
const INVESTMENT_TABS=['T5 Slips','T3 Slips','HSBC Income','Other Income','Line Summary','T4 Slips','T5008','T4E Slips','Schedule 3'];
function migrateInvestment(d){if(!d.slips)d.slips=[];if(d.investmentTab===undefined)d.investmentTab=4;if(d.slipReviewConfirmed===undefined)d.slipReviewConfirmed=false;if(!d.dispositions)d.dispositions=[];for(const c of ['11900','12599','22900','44800','20700','21200'])if(!d.lines[c])d.lines[c]=emptyLine();return d;}
const componentTarget=c=>c.target||'12100';
function slipIssues(slip){
 const issues=[];if(slip.type==='T4E'){if(slip.boxes['14']==null)issues.push('box 14 required');if((slip.boxes['18']||0)>(slip.boxes['14']||0))issues.push('box 18 exceeds box 14');}if(!slip.confirmed)issues.push('not confirmed');if(!slip.cadConfirmed)issues.push('CAD conversion not confirmed');if(!slip.ownershipConfirmed)issues.push('taxpayer/year/allocated share not confirmed');
 const pairs=['T4','T4E'].includes(slip.type)?[]:slip.type==='T5'?[['10','11'],['24','25']]:[['23','32'],['49','50']];
 for(const [actual,taxable] of pairs)if(Math.abs(slip.boxes[actual]||0)>0&&slip.boxes[taxable]==null)issues.push('taxable box '+taxable+' missing; no gross-up will be guessed');
 const separate=slip.type==='T4E'?['7','20','21','23','24','30']:slip.type==='T4'?['39','41','42','43','52','55','66','67','74','75','77','85']:slip.type==='T5'?['17','18','19']:['21','24','26','31','33','42'];
 if(separate.some(k=>Math.abs(slip.boxes[k]||0)>0)&&!slip.otherBoxesReviewed)issues.push('other/conditional boxes need separate-schedule acknowledgement');return issues;
}
function validateInvestment(d){
 if(d.slips!==undefined&&!Array.isArray(d.slips))throw Error('Invalid tax-slip list.');if((d.slips||[]).length>150)throw Error('Too many slips.');
 if(d.investmentTab!==undefined&&(!Number.isInteger(d.investmentTab)||d.investmentTab<0||d.investmentTab>8))throw Error('Invalid investment tab.');if(d.slipReviewConfirmed!==undefined&&typeof d.slipReviewConfirmed!=='boolean')throw Error('Invalid duplicate-review flag.');
 const ids=new Set();for(const slip of d.slips||[]){
  if(!slip||Object.keys(slip).some(k=>!['id','type','issuer','account','reference','state','replaces','included','confirmed','cadConfirmed','ownershipConfirmed','otherBoxesReviewed','boxes','note'].includes(k))||typeof slip.id!=='string'||!slip.id||slip.id.length>200||ids.has(slip.id)||!SLIP_BOXES[slip.type]||!['ORIGINAL','AMENDED','CANCELLED'].includes(slip.state))throw Error('Invalid/duplicate slip identity.');ids.add(slip.id);
  if(['issuer','account','reference','replaces','note'].some(k=>typeof slip[k]!=='string'||slip[k].length>(k==='note'?6000:300))||!slip.issuer.trim()||['included','confirmed','cadConfirmed','ownershipConfirmed','otherBoxesReviewed'].some(k=>typeof slip[k]!=='boolean'))throw Error('Invalid slip metadata.');
  if(!slip.boxes||Array.isArray(slip.boxes)||typeof slip.boxes!=='object'||Object.keys(slip.boxes).some(k=>!Object.hasOwn(SLIP_BOXES[slip.type],k)))throw Error('Unsupported slip box.');
  if(slip.type==='T4'&&d.year<2024&&['16A','17A'].some(k=>(slip.boxes[k]||0)!==0))throw Error('T4 boxes 16A/17A are only applicable from 2024 onward.');
  for(const [k,v] of Object.entries(slip.boxes))if(v!==null&&(!Number.isFinite(v)||v<0&&!(slip.type==='T3'&&k==='42')||Math.abs(v)>1e12||Math.abs(v*100-Math.round(v*100))>.001))throw Error('Mapped slip boxes require non-negative CAD amounts with at most two decimals; T3 box 42 is a signed reference field. Enter amended replacement amounts, not differences.');
  if(slip.state==='AMENDED'&&!slip.replaces)throw Error('An amended slip must identify the earlier slip.');if(slip.state!=='AMENDED'&&slip.replaces)throw Error('Only amended slips may replace another slip.');
 }
 for(const slip of d.slips||[]){if(!slip.replaces)continue;const seen=new Set([slip.id]);let current=slip;while(current.replaces){const parent=(d.slips||[]).find(s=>s.id===current.replaces);if(!parent||parent.type!==slip.type||seen.has(parent.id))throw Error('Invalid or circular amended-slip reference.');if(parent.issuer.trim().toUpperCase()!==slip.issuer.trim().toUpperCase()||parent.account.trim().toUpperCase()!==slip.account.trim().toUpperCase())throw Error('Amended slip must match the earlier issuer and account; use consistent verified labels.');seen.add(parent.id);current=parent;}}
 for(const c of d.contributions||[]){if(c.target!==undefined&&!['12000','12100'].includes(c.target)||c.kind==='HSBC'&&componentTarget(c)!=='12100')throw Error('Invalid component target.');if(c.rowKeys!==undefined&&(!Array.isArray(c.rowKeys)||c.rowKeys.length>2000||c.rowKeys.some(k=>typeof k!=='string'||k.length>100)||new Set(c.rowKeys).size!==c.rowKeys.length))throw Error('Invalid HSBC row selection.');}
 return d;
}
function activeSlips(d){const all=d.slips||[],slips=all.filter(s=>s.included&&s.state!=='CANCELLED'),replaced=new Set();for(const slip of slips){let current=slip;const seen=new Set();while(current?.replaces&&!seen.has(current.replaces)){seen.add(current.replaces);replaced.add(current.replaces);current=all.find(s=>s.id===current.replaces);}}return slips.filter(s=>!replaced.has(s.id));}
function rowKey(row,index){return hash({row,index});}
function hsbcRowAllowed(r){return Number.isFinite(r.grossCad)&&!/return of capital|capital gain|canadian security|unmatched withholding/i.test(r.classification||'');}
function investmentSummary(d,groups=[],available=false){
 const totals={'12000':0,'12010':0,'12100':0,'40425':0,foreignTaxPaid:0},rows=[],blockers=[],notices=[],slips=activeSlips(d).filter(s=>['T5','T3'].includes(s.type)),seen=new Set();
 function add(line,amount,label,source){if(amount===null||amount===undefined||amount===0)return;totals[line]+=amount;rows.push({line,amount,label,source});}
 for(const slip of slips){
  const dup=JSON.stringify([slip.type,slip.issuer.trim().toUpperCase(),slip.account.trim().toUpperCase(),slip.reference.trim().toUpperCase()]);if(seen.has(dup))blockers.push('Possible duplicate active '+slip.type+' slip: '+slip.issuer+'. Exclude it or use distinct verified references.');seen.add(dup);
  for(const issue of slipIssues(slip))blockers.push(slip.type+' / '+slip.issuer+': '+issue);
  const box=k=>slip.boxes[k]??0,prefix=slip.type+' / '+slip.issuer+(slip.account?' / '+slip.account:'');
  for(const k of slip.type==='T5'?['11','25']:['32','50'])add('12000',box(k),prefix+' box '+k,'SLIP');
  add('12010',box(slip.type==='T5'?'11':'32'),prefix+' non-eligible taxable dividend subset','SUPPORT_ONLY');
  for(const k of slip.type==='T5'?['13','14','15','30']:['25'])add('12100',box(k),prefix+' box '+k,'SLIP');
  for(const k of slip.type==='T5'?['12','26']:['39','51'])add('40425',box(k),prefix+' box '+k,'CREDIT_SUPPORT');
  const foreign=box(slip.type==='T5'?'16':'34');totals.foreignTaxPaid+=foreign;
  if(foreign)notices.push(prefix+': '+fmt(foreign)+' foreign tax paid is support only, not an automatic line 40500 claim.');
  const separate=slip.type==='T4E'?['7','20','21','23','24','30']:slip.type==='T4'?['39','41','42','43','52','55','66','67','74','75','77','85']:slip.type==='T5'?['17','18','19']:['21','24','26','31','33','42'];for(const k of separate)if(box(k))notices.push(prefix+' box '+k+' '+fmt(box(k))+': not included in 12000/12100; complete its separate treatment.');
 }
 for(const c of d.contributions.filter(c=>c.included))add(componentTarget(c),c.amount,c.label,c.kind);
 if(d.contributions.some(c=>c.included&&componentTarget(c)==='12000'))notices.push('Line 12010 and dividend-credit support contain entered-slip amounts only. Classify manual 12000 additions and complete any additional credit/subset amounts separately.');
 const stale=staleComponents(d,groups,available);if(stale.length)blockers.push(stale.length+' included HSBC component(s) changed or cannot be checked; refresh/reselect before applying.');
 if(slips.length&&d.contributions.some(c=>c.included&&c.kind==='MANUAL')&&!d.slipReviewConfirmed)blockers.push('Review legacy/manual components for amounts already included on slips, then confirm the duplicate-review checkbox.');
 for(const k of Object.keys(totals))totals[k]=Math.round(totals[k]*100)/100;
 return {totals,rows,blockers:[...new Set(blockers)],notices:[...new Set(notices)],slips};
}
function investmentBasis(d,groups=[],available=false){return 'INV2:'+hash({slips:(d.slips||[]).filter(s=>['T5','T3'].includes(s.type)),components:d.contributions.filter(c=>c.included),duplicateReview:!!d.slipReviewConfirmed,stale:staleComponents(d,groups,available).map(c=>c.id)});}
function slipLabel(s){return s.type+' / '+s.issuer+(s.account?' / '+s.account:'')+(s.reference?' / '+s.reference:'');}


function employmentSummary(d){
 const slips=activeSlips(d).filter(s=>s.type==='T4'),totals={'10100':0,'43700':0,'20700':0,'21200':0,cpp:0,cpp2:0,qpp:0,qpp2:0,ei:0,donations:0,pensionAdjustment:0},blockers=[],seen=new Set();
 for(const s of slips){const k=JSON.stringify([s.issuer.trim().toUpperCase(),s.account.trim().toUpperCase(),s.reference.trim().toUpperCase()]);if(seen.has(k))blockers.push('Possible duplicate active T4: '+s.issuer);seen.add(k);blockers.push(...slipIssues(s).map(i=>s.issuer+': '+i));for(const [target,box] of Object.entries({'10100':'14','43700':'22','20700':'20','21200':'44',cpp:'16',cpp2:'16A',qpp:'17',qpp2:'17A',ei:'18',donations:'46',pensionAdjustment:'52'}))totals[target]+=s.boxes[box]??0;}
 for(const k of Object.keys(totals))totals[k]=Math.round(totals[k]*100)/100;
 return {slips,totals,blockers:[...new Set(blockers)]};
}
const employmentBasis=d=>'EMP3:'+hash((d.slips||[]).filter(s=>s.type==='T4'));
function validateDispositions(d){
 if(d.dispositions===undefined)return;if(!Array.isArray(d.dispositions)||d.dispositions.length>300)throw Error('Invalid T5008 transaction list.');
 const allowed=['id','issuer','account','source','reference','state','replaces','included','date','security','isin','quantity','currency','reportedCost','reportedProceeds','reviewedAcbCad','proceedsCad','sellingCostsCad','proceedsBasis','classification','confirmed','acbConfirmed','fxConfirmed','ownershipConfirmed','overlapReviewed','matchedImportKey','overlapNote','note'];
 const ids=new Set();for(const r of d.dispositions){
  if(!r||Object.keys(r).some(k=>!allowed.includes(k))||typeof r.id!=='string'||!r.id||r.id.length>200||ids.has(r.id))throw Error('Invalid/duplicate T5008 identity.');ids.add(r.id);
  for(const k of ['issuer','account','source','reference','replaces','date','security','isin','currency','matchedImportKey','overlapNote','note'])if(typeof r[k]!=='string'||r[k].length>(['note','overlapNote'].includes(k)?6000:300))throw Error('Invalid T5008 text field: '+k);
  if(!r.issuer.trim()||!['IBKR','HSBC','OTHER'].includes(r.source)||!['ORIGINAL','AMENDED','CANCELLED'].includes(r.state)||!['GROSS','NET'].includes(r.proceedsBasis)||!['CAPITAL','INCOME','REVIEW'].includes(r.classification)||!(/^[A-Z]{3}$/).test(r.currency))throw Error('Invalid T5008 metadata.');
  if(r.date){const parsed=new Date(r.date+'T12:00:00Z');if(!(/^\d{4}-\d{2}-\d{2}$/).test(r.date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==r.date||Number(r.date.slice(0,4))!==d.year)throw Error('T5008 date must be valid and in the selected tax year.');}
  for(const k of ['included','confirmed','acbConfirmed','fxConfirmed','ownershipConfirmed','overlapReviewed'])if(typeof r[k]!=='boolean')throw Error('Invalid T5008 confirmation flag.');
  for(const k of ['quantity','reportedCost','reportedProceeds','reviewedAcbCad','proceedsCad','sellingCostsCad'])if(r[k]!==null&&(!Number.isFinite(r[k])||r[k]<0||r[k]>1e12||(k!=='quantity'&&Math.abs(r[k]*100-Math.round(r[k]*100))>.001)))throw Error('Invalid T5008 number: '+k);
  if(r.state==='AMENDED'&&!r.replaces||r.state!=='AMENDED'&&r.replaces)throw Error('Invalid T5008 amendment reference.');
  if(r.confirmed&&dispositionStructuralIssues(r).length)throw Error('Resolve T5008 review fields before marking confirmed: '+dispositionStructuralIssues(r).join('; '));
 }
 for(const r of d.dispositions){const seen=new Set([r.id]);let current=r;while(current.replaces){const parent=d.dispositions.find(p=>p.id===current.replaces);if(!parent||seen.has(parent.id))throw Error('Missing/circular T5008 amendment reference.');if(parent.issuer.trim().toUpperCase()!==r.issuer.trim().toUpperCase()||parent.account.trim().toUpperCase()!==r.account.trim().toUpperCase()||parent.source!==r.source)throw Error('T5008 amendment must match earlier broker/source/account.');seen.add(parent.id);current=parent;}}
}
function dispositionStructuralIssues(r){const out=[];
 if(!r.date||!r.security.trim()||!r.account.trim()||r.quantity===null||r.quantity<=0)out.push('date, security, account and positive quantity required');
 if(!r.confirmed)out.push('final transaction review not confirmed');if(!r.acbConfirmed)out.push('independent CAD ACB not confirmed');if(!r.fxConfirmed)out.push('CAD conversion/proceeds not confirmed');if(!r.ownershipConfirmed)out.push('taxpayer and taxable account not confirmed');if(!r.overlapReviewed)out.push('overlap with imported broker sales not reviewed');
 if(r.classification==='REVIEW')out.push('capital/income classification unresolved');
 if([r.reviewedAcbCad,r.proceedsCad,r.sellingCostsCad].some(v=>v===null))out.push('reviewed CAD ACB, CAD proceeds and explicit selling costs required');
 if(r.proceedsBasis==='NET'&&r.sellingCostsCad!==null&&r.sellingCostsCad!==0)out.push('NET proceeds already include costs: additional selling costs must be zero');return out;
}
function activeDispositions(d){const all=d.dispositions||[],items=all.filter(r=>r.included&&r.state!=='CANCELLED'),replaced=new Set();for(const r of items){let current=r;const seen=new Set();while(current?.replaces&&!seen.has(current.replaces)){seen.add(current.replaces);replaced.add(current.replaces);current=all.find(x=>x.id===current.replaces);}}return items.filter(r=>!replaced.has(r.id));}
function capitalImportKey(r){return hash({source:String(r.source||r._source||'').toUpperCase(),account:String(r.account||r.accountId||''),date:String(r.date||'').slice(0,10),security:String(r.symbol||'').toUpperCase(),qty:r.qtySold??r.quantity??null,proceeds:r.proceedsCad??null,acb:r.acbCad??null,reference:r.raw?.reference||r.reference||''});}
function matchingCapitalSales(r,snap){return (snap?.capitalSales||[]).filter(x=>String(x.source||x._source||'').toUpperCase()===r.source&&String(x.account||x.accountId||'')===r.account&&String(x.date||'').slice(0,10)===r.date&&(String(x.symbol||'').toUpperCase()===r.security.trim().toUpperCase()||r.isin&&String(x.raw?.isin||'').toUpperCase()===r.isin.trim().toUpperCase()));}
function dispositionIssues(r,snap,d){const out=dispositionStructuralIssues(r),imports=snap?.capitalSales||[];
 if(r.matchedImportKey&&(!snap||snap.capitalError||!imports.some(x=>capitalImportKey(x)===r.matchedImportKey)))out.push('linked imported sale is unavailable or changed; refresh and re-review');
 const match=imports.find(x=>capitalImportKey(x)===r.matchedImportKey);
 if(match&&(String(match.source||match._source||'').toUpperCase()!==r.source||String(match.account||match.accountId||'')!==r.account))out.push('linked sale belongs to a different source/account');
 if(match&&(!matchingCapitalSales(r,snap).some(x=>capitalImportKey(x)===r.matchedImportKey)||(Number.isFinite(match.qtySold)&&r.quantity!==null&&Math.abs(match.qtySold-r.quantity)>1e-8))&&!r.overlapNote.trim())out.push('linked sale date/security/quantity differs; document the reconciliation');
 if(!r.matchedImportKey&&matchingCapitalSales(r,snap).length&&!r.overlapNote.trim())out.push('possible imported match: link it or explain why it is not the same sale');
 if(snap&&d){const p=resolveSettings(snap.records||[],d.year,r.source,r.account);if(p.registration&&p.registration!=='NON_REGISTERED'&&!['UNCONFIRMED','OTHER_REVIEW'].includes(p.registration))out.push('account is confirmed registered; exclude from this taxable-sales review');if(p.owner&&p.owner.trim().toLowerCase()!==d.taxpayer.name.trim().toLowerCase())out.push('account owner differs from selected taxpayer');}
 return [...new Set(out)];
}
function dispositionGain(r){if([r.proceedsCad,r.reviewedAcbCad,r.sellingCostsCad].some(v=>!Number.isFinite(v))||r.proceedsBasis==='NET'&&r.sellingCostsCad!==0)return null;return Math.round((r.proceedsCad-r.reviewedAcbCad-(r.proceedsBasis==='GROSS'?r.sellingCostsCad:0))*100)/100;}
function dispositionSummary(d,snap){const active=activeDispositions(d),rows=[],blockers=[],groups=new Map(),counts=new Map(),links=new Map();
 const identity=r=>JSON.stringify([r.source,r.issuer.trim().toUpperCase(),r.account,r.reference.trim()||[r.date,r.security,r.quantity,r.reportedProceeds].join('|')]);
 for(const r of active){const key=identity(r);counts.set(key,(counts.get(key)||0)+1);if(r.matchedImportKey)links.set(r.matchedImportKey,(links.get(r.matchedImportKey)||0)+1);}
 for(const r of active){const issues=dispositionIssues(r,snap,d);if(counts.get(identity(r))>1)issues.push('possible duplicate active T5008 transaction');if(r.matchedImportKey&&links.get(r.matchedImportKey)>1)issues.push('same imported sale linked more than once');blockers.push(...issues.map(s=>r.issuer+' / '+r.security+': '+s));const gain=dispositionGain(r);rows.push({record:r,gain,issues});
 if(!issues.length&&r.classification==='CAPITAL'){const id=r.source+' / '+r.account;if(!groups.has(id))groups.set(id,{account:id,proceeds:0,acb:0,expenses:0,gain:0,count:0});const g=groups.get(id);g.proceeds+=r.proceedsCad;g.acb+=r.reviewedAcbCad;g.expenses+=r.proceedsBasis==='GROSS'?r.sellingCostsCad:0;g.gain+=gain;g.count++;}}
 for(const g of groups.values())for(const k of ['proceeds','acb','expenses','gain'])g[k]=Math.round(g[k]*100)/100;
 return {rows,groups:[...groups.values()],blockers:[...new Set(blockers)]};
}


function validateBenefits(d){for(const s of d.slips||[]){if(s.type!=='T4E')continue;const v=s.boxes;if(v['7']!==null&&v['7']!==undefined&&![0,30].includes(v['7']))throw Error('T4E box 7 is a percentage: enter 0 or 30.');if(s.confirmed&&s.included&&s.state!=='CANCELLED'){if(v['14']==null)throw Error('A confirmed T4E requires box 14 (explicit zero is allowed).');if((v['18']||0)>v['14'])throw Error('T4E tax-exempt box 18 exceeds total benefits in box 14.');}}}
const benefitsBasis=d=>'EI4:'+hash((d.slips||[]).filter(s=>s.type==='T4E'));
const withholdingBasis=d=>'WITH4:'+hash({slips:(d.slips||[]).filter(s=>['T4','T4E'].includes(s.type)),province:d.province,provinceConfirmed:d.provinceConfirmed});
function benefitsSummary(d){const slips=activeSlips(d).filter(s=>s.type==='T4E'),totals={'11900':0,'23200':0,'25600':0,withheld:0,quebecTax:0},blockers=[],seen=new Set();for(const s of slips){const k=JSON.stringify([s.issuer.trim().toUpperCase(),s.account.trim().toUpperCase(),s.reference.trim().toUpperCase()]);if(seen.has(k))blockers.push('Possible duplicate active T4E: '+s.issuer);seen.add(k);blockers.push(...slipIssues(s).map(x=>s.issuer+': '+x));if(s.boxes['14']==null)blockers.push('T4E '+s.issuer+': box 14 required.');if((s.boxes['18']||0)>(s.boxes['14']||0))blockers.push('T4E box 18 exceeds box 14.');totals['11900']+=(s.boxes['14']||0)-(s.boxes['18']||0);totals['23200']+=s.boxes['30']||0;totals['25600']+=s.boxes['21']||0;totals.withheld+=(s.boxes['22']||0)+(s.boxes['24']||0);totals.quebecTax+=s.boxes['23']||0;}
 if(totals.quebecTax&&(!d.provinceConfirmed||!d.province))blockers.push('Confirm year-end province before assigning T4E box 23.');if(d.provinceConfirmed&&d.province&&d.province!=='QC')totals.withheld+=totals.quebecTax;for(const k of Object.keys(totals))totals[k]=Math.round(totals[k]*100)/100;return {slips,totals,blockers:[...new Set(blockers)]};}
function freshSchedule3(){return {version:1,rows:[],coverageConfirmed:false,overlapConfirmed:false,scopeConfirmed:false,note:''};}
function scheduleState(d){return d.schedule3||freshSchedule3();}
const S3_NUMBERS=['proceeds','acb','expenses','capitalAmount','adjustment'];
function validateSchedule3(d){if(d.schedule3===undefined)return;const c=d.schedule3;if(!c||Array.isArray(c)||Object.keys(c).some(k=>!['version','rows','coverageConfirmed','overlapConfirmed','scopeConfirmed','note'].includes(k))||c.version!==1||!Array.isArray(c.rows)||c.rows.length>300||['coverageConfirmed','overlapConfirmed','scopeConfirmed'].some(k=>typeof c[k]!=='boolean')||typeof c.note!=='string'||c.note.length>6000)throw Error('Invalid Schedule 3 settings.');const ids=new Set();const allowed=['id','origin','ref','source','account','label','acquisitionYear','date','proceeds','acb','expenses','capitalAmount','adjustment','reason','included','reviewed','upstreamHash','linkedImportKey'];for(const r of c.rows){if(!r||Object.keys(r).some(k=>!allowed.includes(k))||['id','origin','ref','source','account','label','acquisitionYear','date','reason','upstreamHash','linkedImportKey'].some(k=>typeof r[k]!=='string'||r[k].length>(k==='reason'?6000:300))||!r.id||ids.has(r.id)||!['IMPORT','T5008','SLIP','MANUAL'].includes(r.origin)||typeof r.included!=='boolean'||typeof r.reviewed!=='boolean')throw Error('Invalid/duplicate Schedule 3 row.');ids.add(r.id);for(const k of S3_NUMBERS)if(r[k]!==null&&(!Number.isFinite(r[k])||Math.abs(r[k])>1e12||Math.abs(r[k]*100-Math.round(r[k]*100))>.001||['proceeds','acb','expenses'].includes(k)&&r[k]<0))throw Error('Invalid Schedule 3 amount: '+k);if(r.adjustment===null)throw Error('Schedule 3 adjustment must be explicit (zero if none).');if(r.origin!=='MANUAL'&&(!r.ref||!r.upstreamHash))throw Error('Schedule 3 source reference is required.');if(r.origin==='MANUAL'&&(r.ref||r.upstreamHash||r.linkedImportKey))throw Error('Manual Schedule 3 rows cannot impersonate source links.');if(r.origin==='SLIP'&&[r.proceeds,r.acb,r.expenses].some(v=>v!==null)||r.origin!=='SLIP'&&r.capitalAmount!==null)throw Error('Invalid Schedule 3 row amount layout.');if(r.acquisitionYear&&!(/^\d{4}$/.test(r.acquisitionYear)&&Number(r.acquisitionYear)>=1800&&Number(r.acquisitionYear)<=d.year)&&r.acquisitionYear!=='Various')throw Error('Enter an acquisition year no later than the tax year, or Various.');if(r.date){const t=new Date(r.date+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==r.date||Number(r.date.slice(0,4))!==d.year)throw Error('Schedule 3 disposition date must be in the selected year.');}if(r.reviewed&&scheduleRowIssues(r).length)throw Error('Resolve Schedule 3 row before confirming: '+scheduleRowIssues(r).join('; '));}}
function scheduleRowIssues(r){const out=[];if(!r.reviewed)out.push('row not reviewed');if(!r.label.trim())out.push('description required');if(r.origin==='SLIP'){if(r.capitalAmount===null)out.push('slip capital gain required');}else{if(!r.source.trim()||!r.account.trim()||!r.date||!r.acquisitionYear)out.push('source/account/disposition date/acquisition year required');if([r.proceeds,r.acb,r.expenses].some(v=>v===null))out.push('CAD proceeds, ACB and explicit expenses required');}if(r.adjustment&&!r.reason.trim())out.push('adjustment requires evidence/reason');return out;}
function scheduleRowGain(r){const cents=v=>Math.round(v*100);if(r.origin==='SLIP')return r.capitalAmount===null?null:(cents(r.capitalAmount)+cents(r.adjustment))/100;if([r.proceeds,r.acb,r.expenses].some(v=>v===null))return null;return (cents(r.proceeds)-cents(r.acb)-cents(r.expenses)+cents(r.adjustment))/100;}
function scheduleCandidates(d,snap){const list=[],occurrences=new Map();const shape={origin:'',ref:'',source:'',account:'',label:'',acquisitionYear:'',date:'',proceeds:null,acb:null,expenses:null,capitalAmount:null,adjustment:0,reason:'',included:true,reviewed:false,upstreamHash:'',linkedImportKey:''};
 for(const x of snap?.capitalSales||[]){if(String(x.date||'').slice(0,4)!==String(d.year)||x.forecast||x.includeInTotals===false)continue;const source=String(x.source||x._source||'').toUpperCase(),account=String(x.account||x.accountId||''),p=resolveSettings(snap.records||[],d.year,source,account),issues=[];if(snap.capitalError)issues.push('capital calculation unavailable');if(String(p.owner||'').trim().toLowerCase()!==d.taxpayer.name.trim().toLowerCase()||p.registration!=='NON_REGISTERED')issues.push('confirm selected taxpayer ownership and NON_REGISTERED account first');if(!Number.isFinite(x.proceedsCad)||x.proceedsCad<0||!Number.isFinite(x.acbCad)||x.acbCad<0)issues.push('CAD proceeds/ACB unavailable');if(x.outlaysCad)issues.push('unexpected imported outlays: reconcile externally before entry');if(Number.isFinite(x.gainCad)&&Number.isFinite(x.proceedsCad)&&Number.isFinite(x.acbCad)&&Math.abs(x.gainCad-(x.proceedsCad-x.acbCad))>.02)issues.push('imported gain does not reconcile to net proceeds minus ACB');const base=hash({source,account,date:String(x.date||'').slice(0,10),symbol:String(x.symbol||''),quantity:x.qtySold??x.quantity??null,identity:String(x.raw?.id||x.raw?.reference||x.raw?.statementKey||x.reference||'')}),ordinal=occurrences.get(base)||0;occurrences.set(base,ordinal+1);const ref=base+':'+ordinal,r={...shape,origin:'IMPORT',ref,source,account,label:String(x.symbol||'Security'),date:String(x.date||'').slice(0,10),proceeds:Number.isFinite(x.proceedsCad)?Math.round(x.proceedsCad*100)/100:null,acb:Number.isFinite(x.acbCad)?Math.round(x.acbCad*100)/100:null,expenses:0,linkedImportKey:capitalImportKey(x)};r.upstreamHash=hash({r,rawCad:[x.proceedsCad,x.acbCad,x.gainCad],quantity:x.qtySold??null,owner:p.owner,registration:p.registration,issues});list.push({row:r,issues,label:source+' / '+account+' / '+r.date+' / '+r.label});}
 const ds=dispositionSummary(d,snap);for(const x of ds.rows){const v=x.record;if(v.classification!=='CAPITAL')continue;const r={...shape,origin:'T5008',ref:v.id,source:v.source,account:v.account,label:v.security,date:v.date,proceeds:v.proceedsCad,acb:v.reviewedAcbCad,expenses:v.proceedsBasis==='GROSS'?v.sellingCostsCad:0,linkedImportKey:v.matchedImportKey};r.upstreamHash=hash(v);list.push({row:r,issues:x.issues,label:'T5008 / '+v.source+' / '+v.account+' / '+v.security});}
 for(const x of activeSlips(d)){const box=x.type==='T3'?'21':x.type==='T5'?'18':null;if(!box||!x.boxes[box])continue;const r={...shape,origin:'SLIP',ref:x.id,source:x.type,account:x.account,label:x.type+' '+x.issuer+' box '+box,capitalAmount:x.boxes[box]};r.upstreamHash=hash(x);list.push({row:r,issues:slipIssues(x),label:r.label});}return list;}
function scheduleSummary(d,snap){const c=scheduleState(d),available=scheduleCandidates(d,snap),out=[],rows=[],seen=new Set(),imports=new Set(c.rows.filter(r=>r.included&&r.origin==='IMPORT').map(r=>r.linkedImportKey||r.ref));let cents=0;
 if(!c.coverageConfirmed)out.push('Confirm complete capital source coverage, or explicitly no applicable amounts.');if(!c.overlapConfirmed)out.push('Confirm duplicate/overlap reconciliation.');if(!c.scopeConfirmed)out.push('Confirm ordinary capital treatment and review of special Schedule 3 cases.');const rate=d.year>=2021&&d.year<=2025?.5:null;if(rate===null)out.push('Automatic inclusion calculation is verified only for 2021–2025 ordinary capital amounts; use the correct year-specific external Schedule 3 for this year.');
 for(const r of c.rows.filter(r=>r.included)){const issues=scheduleRowIssues(r),source=available.find(x=>x.row.origin===r.origin&&x.row.ref===r.ref);if(r.origin!=='MANUAL'){const k=r.origin+':'+r.ref;if(seen.has(k))issues.push('same source accepted more than once');seen.add(k);if(!source)issues.push('source unavailable/excluded; refresh or remove this row');else{if(r.upstreamHash!==source.row.upstreamHash)issues.push('source changed; refresh this row and review again');issues.push(...source.issues);if(['source','account','label','date','linkedImportKey',...S3_NUMBERS].some(k=>r[k]!==source.row[k])&&!r.reason.trim())issues.push('edited source values require evidence/reason');}}
 if(r.origin==='T5008'){if(r.linkedImportKey&&imports.has(r.linkedImportKey))issues.push('same disposition included as imported sale AND T5008; exclude one representation');const v=(d.dispositions||[]).find(x=>x.id===r.ref);if(v&&!v.matchedImportKey&&matchingCapitalSales(v,snap).some(x=>imports.has(capitalImportKey(x))))issues.push('possible imported/T5008 overlap: select one representation');}
 const gain=scheduleRowGain(r);if(gain===null)issues.push('gain unavailable');else cents+=Math.round(gain*100);out.push(...issues.map(x=>r.label+': '+x));rows.push({record:r,gain,issues:[...new Set(issues)]});}
 if(!Number.isSafeInteger(cents)||Math.abs(cents)>1e14)out.push('Schedule total exceeds the supported amount range.');const raw=cents/100,taxable=rate===null?null:Math.round(Math.max(0,cents)*rate)/100,loss=rate===null?null:Math.round(Math.max(0,-cents)*rate)/100;return {rows,blockers:[...new Set(out)],raw,rate,taxable,loss};}
function scheduleBasis(d,snap){const c=scheduleState(d),sources=scheduleCandidates(d,snap);return 'S34:'+hash({year:d.year,taxpayer:d.taxpayer,config:c,live:c.rows.filter(r=>r.included&&r.origin!=='MANUAL').map(r=>{const x=sources.find(x=>x.row.origin===r.origin&&x.row.ref===r.ref);return [r.origin,r.ref,x?.row.upstreamHash||'UNAVAILABLE',x?.issues||[]];})});}


function planT5008FilingSelection(d, snap, reference) {
  const candidate = scheduleCandidates(d, snap).find(
    x => x.row.origin === 'T5008' && x.row.ref === reference
  );
  if (!candidate || candidate.issues.length) {
    throw Error(candidate?.issues.join('; ') || 'Reviewed T5008 source unavailable.');
  }
  const transaction = activeDispositions(d).find(x => x.id === reference);
  const key = transaction?.matchedImportKey;
  const warnings = [];

  const matches = key ? (snap?.capitalSales || []).filter(x => capitalImportKey(x) === key) : [];
  const imported = matches.length === 1 ? matches[0] : null;
  const exact = !!(imported && matchingCapitalSales(transaction, snap).includes(imported) &&
    Number.isFinite(imported.qtySold) && Number.isFinite(transaction.quantity) &&
    Math.abs(imported.qtySold - transaction.quantity) <= 1e-8);
  if (!exact) warnings.push('MANUAL RECONCILIATION: no exact one-to-one imported-sale link. No imported rows will be excluded automatically. Exclude any overlapping imported/manual rows before approving Schedule 3.');

  const next = JSON.parse(JSON.stringify(d));
  const config = next.schedule3 || (next.schedule3 = freshSchedule3());
  const old = config.rows.filter(x => x.origin === 'T5008' && x.ref === reference);
  if (old.length > 1) throw Error('Resolve duplicate accepted T5008 rows first.');

  const excluded = [];
  for (const row of config.rows) {
    if (exact && row.origin === 'IMPORT' && row.included &&
        (row.linkedImportKey || row.ref) === key) {
      excluded.push({id: row.id, label: row.label, proceeds: row.proceeds, acb: row.acb});
      row.included = false;
    }
  }

  const annotation = 'Filing source: reviewed T5008. Source reference: ' + reference +
    (exact ? '. Exact imported-sale link reviewed; matching included import rows excluded.' : '. Manual overlap reconciliation required; no automatic import exclusions.');
  const previousReason = old[0]?.reason || '';
  const reason = previousReason.includes(annotation) ? previousReason : [previousReason, annotation].filter(Boolean).join('\n');
  if (reason.length > 6000) throw Error('Shorten the existing evidence note before continuing.');

  const selected = {
    ...candidate.row,
    id: old[0]?.id || 's3:t5008:' + reference,
    acquisitionYear: old[0]?.acquisitionYear || '',
    reason,
    included: true,
    reviewed: false
  };
  config.rows = config.rows.filter(x => !(x.origin === 'T5008' && x.ref === reference));
  config.rows.unshift(selected);

  config.coverageConfirmed = false;
  config.overlapConfirmed = false;
  config.scopeConfirmed = false;
  validateDraft(next);
  return {draft: next, selected, excluded, replaced: old[0] || null, warnings, exact};
}


function t3OtherIncomeBasis(d){
 return 'T3O1:'+hash({year:d.year,taxpayer:d.taxpayer,slips:(d.slips||[]).filter(s=>s.type==='T3')});
}
function t3OtherIncomeSummary(d){
 const slips=activeSlips(d).filter(s=>s.type==='T3'),rows=[],blockers=[],seen=new Set();
 let cents=0;
 for(const s of slips){
  const key=JSON.stringify([s.issuer.trim().toUpperCase(),s.account.trim().toUpperCase(),s.reference.trim().toUpperCase()]);
  if(seen.has(key))blockers.push('Possible duplicate included T3: '+s.issuer);seen.add(key);
  blockers.push(...slipIssues(s).map(x=>s.issuer+': '+x));
  const box26=s.boxes['26']??0,box31=s.boxes['31']??0;
  if(!Number.isFinite(box26)||!Number.isFinite(box31)||box26<0||box31<0){blockers.push(s.issuer+': invalid box26/31 amount.');continue;}
  if(box31>box26)blockers.push(s.issuer+': box31 exceeds box26. Check both boxes before applying.');
  const amountCents=Math.round(box26*100)-Math.round(box31*100);
  cents+=amountCents;rows.push({id:s.id,label:slipLabel(s),box26,box31,amount:amountCents/100});
 }
 if(!Number.isSafeInteger(cents)||Math.abs(cents)>1e14)blockers.push('T3 other-income subtotal exceeds the supported range.');
 return {slips,rows,amount:cents/100,blockers:[...new Set(blockers)]};
}
function planT3OtherIncome(d){
 const x=t3OtherIncomeSummary(d);
 if(!x.slips.length)throw Error('No included T3 slips.');
 if(x.blockers.length)throw Error(x.blockers.join('; '));
 const next=JSON.parse(JSON.stringify(d));
 next.lines['13000']={...emptyLine(),...(next.lines['13000']||{}),amount:x.amount,status:'ENTERED',
  source:'T3 box26 less box31 subtotal — verify whole-line coverage and special treatment',
  basisHash:t3OtherIncomeBasis(next),componentHash:''};
 validateDraft(next);return next;
}


const F5_CORE=['10100','11900','12000','12100','12600','12700','13000'];
const F5_RENT=['rent','otherIncome','advertising','insurance','interest','management','repairs','taxes','utilities','otherExpenses'];
const F5_EMP=['supplies','travel','motor','other','workspace'];
function freshForms5(){return {version:1,income:{extra:null,note:'',coverage:false},cpp:{mode:'BASIC',reviewed:false,scope:false,note:'',deduction:null,base:null,overpayment:null},rental:{mode:'BASIC',reviewed:false,scope:false,note:'',gross:null,net:null,properties:[]},employment:{mode:'BASIC',reviewed:false,scope:false,note:'',amount:null,expenses:Object.fromEntries(F5_EMP.map(k=>[k,null]))}};}
function forms5State(d){return d.forms5||freshForms5();}
function validateForms5(d){
 if(d.forms5===undefined)return;
 const f=d.forms5,keys=(o,a)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===a.length&&Object.keys(o).every(k=>a.includes(k));
 const money=(v,signed=false)=>v===null||Number.isFinite(v)&&Math.abs(v)<=1e12&&(signed||v>=0)&&Math.abs(v*100-Math.round(v*100))<.001;
 if(!keys(f,['version','income','cpp','rental','employment'])||f.version!==1)throw Error('Invalid supporting forms.');
 if(!keys(f.income,['extra','note','coverage'])||!money(f.income.extra,true)||typeof f.income.coverage!=='boolean'||typeof f.income.note!=='string'||f.income.note.length>6000)throw Error('Invalid total-income inputs.');
 const specs={cpp:['mode','reviewed','scope','note','deduction','base','overpayment'],rental:['mode','reviewed','scope','note','gross','net','properties'],employment:['mode','reviewed','scope','note','amount','expenses']};
 for(const k of Object.keys(specs)){const a=f[k];if(!keys(a,specs[k])||!['BASIC','EXTERNAL','NONE'].includes(a.mode)||typeof a.reviewed!=='boolean'||typeof a.scope!=='boolean'||typeof a.note!=='string'||a.note.length>6000)throw Error('Invalid '+k+' form settings.');}
 for(const k of ['deduction','base','overpayment'])if(!money(f.cpp[k]))throw Error('Invalid Schedule8 result.');
 if(!money(f.rental.gross)||!money(f.rental.net,true)||!Array.isArray(f.rental.properties)||f.rental.properties.length>25)throw Error('Invalid T776 inputs.');
 const ids=new Set();for(const p of f.rental.properties){if(!keys(p,['id','label','included',...F5_RENT])||typeof p.id!=='string'||!p.id||p.id.length>200||ids.has(p.id)||typeof p.label!=='string'||p.label.length>300||typeof p.included!=='boolean'||F5_RENT.some(k=>!money(p[k])))throw Error('Invalid rental property.');ids.add(p.id);}
 if(!money(f.employment.amount)||!keys(f.employment.expenses,F5_EMP)||F5_EMP.some(k=>!money(f.employment.expenses[k])))throw Error('Invalid T777 inputs.');
}
function form5Basis(d,key,snap=null){
 const f=forms5State(d);
 if(key==='income')return 'F5:income:'+hash({year:d.year,settings:f.income,lines:F5_CORE.map(c=>[c,d.lines[c]?.amount,statusOf(d,c,snap?investmentCandidates({...snap,records:snap.records||[],dividendRows:snap.dividendRows||[]},d):[],!!snap,snap),d.lines[c]?.basisHash||''])});
 return 'F5:'+key+':'+hash({...(key==='cpp'?{calculationVersion:'S8P3-2025-v1'}:{}),year:d.year,province:d.province,profile:d.profileConfirmed,provinceConfirmed:d.provinceConfirmed,form:f[key],t4:key==='cpp'||key==='employment'?(d.slips||[]).filter(s=>s.type==='T4'):[]});
}
function schedule8Part3_2025(slips) {
  const L={}, used=[];
  const put=(n,v)=>{L[n]=v;used.push(n);return v;};
  const rate=(n,p,q)=>Number((BigInt(n)*BigInt(p)+BigInt(q)/2n)/BigInt(q));
  const blank=v=>v===null||v===undefined||v==='';
  const cad=(v,label)=>{if(blank(v)||typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e9||Math.abs(v*100-Math.round(v*100))>.001)throw Error('Enter a valid nonnegative CAD amount for '+label+' (explicit 0 if none).');return Math.round(v*100);};
  if(!Array.isArray(slips)||!slips.length)throw Error('Include at least one reviewed T4.');
  let earnings=0,contrib=0,cpp2=0;
  slips.forEach((s,i)=>{const b=s.boxes||{},prefix='T4 '+(i+1)+' ';if((b['17']||0)>0||(b['17A']||0)>0)throw Error('QPP contributions require RC381, not this Schedule8.');
    earnings+=Math.min(8120000,cad(blank(b['26'])?b['14']:b['26'],prefix+(blank(b['26'])?'box14 (box26 blank)':'box26')));
    contrib+=cad(b['16'],prefix+'box16');cpp2+=cad(b['16A'],prefix+'box16A');
  });
  // Part2: full12-month eligibility only. Other Part2 cases use EXTERNAL mode.
  put(1,earnings);put(2,Math.min(8120000,L[1]));put(3,7130000);
  put(4,Math.max(0,L[2]-L[3]));put(5,Math.max(0,L[2]-L[4]));put(6,350000);
  put(7,Math.max(0,L[5]-L[6]));put(8,contrib);put(9,rate(L[8],831933,1000000));put(10,L[8]-L[9]);
  put(11,rate(L[7],495,10000));put(12,rate(L[7],1,100));put(13,L[11]+L[12]);
  put(14,L[9]);put(15,L[11]);put(16,L[14]-L[15]);put(17,L[10]);put(18,L[12]);
  put(19,L[17]-L[18]);put(20,L[16]+L[19]);put(21,cpp2);put(22,rate(L[4],4,100));
  put(23,L[21]-L[22]);put(24,L[20]+L[23]);
  let branch,results;
  if(L[24]>0){
    branch='3a';put(25,L[15]);put(26,L[18]);put(27,L[22]);put(28,L[26]+L[27]);put(29,L[24]);
    results={'30800':L[25]/100,'22215':L[28]/100,'44800':L[29]/100};
  }else{
    branch='3b';
    if(L[16]>=0){put(30,L[15]);put(36,L[15]);}
    else{put(30,L[14]);put(31,-L[16]);put(32,L[19]>0?Math.min(L[19],L[31]):0);put(33,L[31]-L[32]);put(34,L[30]+L[32]);put(35,L[23]>0&&L[33]>0?Math.min(L[23],L[33]):0);put(36,L[34]+L[35]);}
    if(L[19]>=0){put(37,L[18]);put(43,L[18]);}
    else{put(37,L[17]);put(38,-L[19]);put(39,L[16]>0?Math.min(L[16],L[38]):0);put(40,L[38]-L[39]);put(41,L[37]+L[39]);put(42,L[23]>0&&L[40]>0?Math.min(L[40],L[23]-(L[35]||0)):0);put(43,L[41]+L[42]);}
    if(L[23]>=0){put(44,L[22]);put(47,L[22]);}
    else{put(44,L[21]);put(45,-L[23]);put(46,L[20]>0?Math.min(L[20],L[45]):0);put(47,L[44]+L[46]);}
    put(48,L[43]+L[47]);results={'30800':L[36]/100,'22215':L[48]/100,'44800':0};
  }
  return {lines:L,used,branch,results};
}
function form5Summary(d,key,snap=null){
 const state=forms5State(d),f=state[key],out={blockers:[],results:{},steps:[]};
 const block=t=>out.blockers.push(t),cents=v=>Math.round(v*100),val=(v,label)=>{if(v===null||!Number.isFinite(v)){block('Enter '+label+' (explicit zero if none).');return 0;}return cents(v);};
 if(key==='income'){
  let total=0;
  for(const c of F5_CORE){const l=d.lines[c],status=statusOf(d,c,snap?investmentCandidates({...snap,records:snap.records||[],dividendRows:snap.dividendRows||[]},d):[],!!snap,snap);if(!l||l.amount===null||!['ENTERED','CONFIRMED','NA'].includes(status))block('Review/enter income line '+c+'; unanswered/stale inputs are not zero.');if(Number.isFinite(l?.amount)){total+=cents(l.amount);out.steps.push(c+' = '+l.amount.toFixed(2));}}
  total+=val(f.extra,'other applicable income not displayed');out.steps.push('Other income not displayed = '+(f.extra===null?'unanswered':f.extra.toFixed(2)));
  if(!f.coverage)block('Confirm all applicable total-income sources, including unlisted pension/business/other payments.');
  if(f.extra!==null&&f.extra!==0&&!f.note.trim())block('Document the unlisted income lines and amounts.');
  if(!Number.isSafeInteger(total)||Math.abs(total)>1e14)block('Total income exceeds the supported amount range.');out.results['15000']=total/100;return out;
 }
 if(!f.reviewed)block('Review '+key+' inputs/results.');if(!f.scope)block('Confirm scope/eligibility and supporting records.');
 if(f.mode==='EXTERNAL'){
  if(!f.note.trim())block('Reference the completed official form/schedule and any adjustments.');
  if(key==='cpp'){out.results={'22215':val(f.deduction,'reviewed22215')/100,'30800':val(f.base,'reviewed30800')/100,'44800':val(f.overpayment,'reviewed44800')/100};}
  if(key==='rental'){out.results={'12599':val(f.gross,'reviewed gross rental reporting12599')/100,'12600':val(f.net,'reviewed net rental12600')/100};}
  if(key==='employment')out.results['22900']=val(f.amount,'reviewed allowable T777 result')/100;
  out.steps.push('Externally calculated and reviewed results; no form engine applied.');return out;
 }
 if(f.mode==='NONE'){
  if(key==='cpp'&&activeSlips(d).some(s=>s.type==='T4'&&['16','16A','17','17A'].some(k=>(s.boxes[k]||0)>0)))block('T4 contributions exist; use the applicable schedule rather than no-CPP mode.');
  out.results=key==='cpp'?{'22215':0,'30800':0,'44800':0}:key==='rental'?{'12599':0,'12600':0}:{'22900':0};out.steps.push('Explicit no-applicable-income/deduction selection; not inferred from blank fields.');return out;
 }
 if(d.year!==2025)block('Basic calculation verified for2025 only. Use reviewed external results for other years.');
 if(key==='cpp'){
  // S8P3-2025-v1: Part3 including3a/3b; Part2 fixed at12 months.
  const slips=activeSlips(d).filter(s=>s.type==='T4');
  if(!d.provinceConfirmed||!d.province||d.province==='QC')block('Confirm non-Quebec year-end residency.');
  if(d.year!==2025)block('This Part3 implementation is for2025 only.');
  slips.forEach(s=>out.blockers.push(...slipIssues(s)));
  try{
    const calc=schedule8Part3_2025(slips);out.results=calc.results;
    out.steps.push('2025 Schedule8 Part2: A=12, B=71300.00, C=9900.00, D=81200.00, E=3500.00. Confirm full-year eligibility; use EXTERNAL for all proration or Part5 cases.');
    out.steps.push(...calc.used.map(n=>'Part3 line '+n+' = '+(calc.lines[n]/100).toFixed(2)));
    out.steps.push('Line24 '+(calc.lines[24]>0?'>0: Part3a':'<=0: Part3b (no election for additional contributions)'),calc.branch==='3a'?'30800 <- line25; 22215 <- line28; 44800 <- line29.':'30800 <- line36; 22215 <- line48; 44800=0 under Part3b.');
  }catch(err){block(err.message);}
 }
 if(key==='rental'){
  const properties=f.properties.filter(p=>p.included);if(!properties.length)block('Add an included property, or explicitly choose no rental activity.');
  let gross=0,expenses=0;
  for(const p of properties){if(!p.label.trim())block('Enter property description.');let pg=0,pe=0;for(const k of F5_RENT){const n=val(p[k],p.label+' '+k);if(k==='rent'||k==='otherIncome')pg+=n;else pe+=n;}gross+=pg;expenses+=pe;out.steps.push((p.label||'Property')+': gross '+(pg/100).toFixed(2)+' − expenses '+(pe/100).toFixed(2)+' = '+((pg-pe)/100).toFixed(2));}
  out.results={'12599':gross/100,'12600':(gross-expenses)/100};
 }
 if(key==='employment'){
  let total=0;for(const k of F5_EMP){const n=val(f.expenses[k],'reviewed allowable '+k);total+=n;out.steps.push(k+' = '+(n/100).toFixed(2));}
  if(total>0&&!f.note.trim())block('Reference your allowable-expense/T777 workings, including any workspace or motor limits.');
  out.results['22900']=total/100;out.steps.push('Only previously determined allowable amounts after reimbursements, allocations and all applicable limits are summed.');
 }
 for(const v of Object.values(out.results))if(!Number.isFinite(v)||Math.abs(v)>1e12)block('Form result outside supported amount range.');
 return out;
}
function planForm5(d,key,snap=null){
 const result=form5Summary(d,key,snap);if(result.blockers.length)throw Error(result.blockers.join('; '));
 const next=JSON.parse(JSON.stringify(d));for(const [c,amount] of Object.entries(result.results))next.lines[c]={...emptyLine(),...(next.lines[c]||{}),amount,status:'ENTERED',source:'Reviewed '+key+' supporting worksheet — verify complete line coverage',basisHash:form5Basis(d,key,snap),componentHash:''};
 validateDraft(next);return next;
}


function freshForeign25(){return {version:2,mode:'CALC',scope:false,reviewed:false,note:'',netIncome:null,tax42900:null,dividend40425:null,ab63:null,ab68:null,other23200:null,externalFederal:null,externalAlberta:null,external23200:null,countries:[],provincial:{amount:null,basis:''}};}
function validateForeign25(d){
 if(d.foreignTax===undefined)return;const f=d.foreignTax;
 const keys=(o,ks)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===ks.length&&Object.keys(o).every(k=>ks.includes(k));
 const money=v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e9&&Math.abs(v*100-Math.round(v*100))<.001;
 const text=(v,max)=>typeof v==='string'&&v.length<=max;
 const fields=['version','mode','scope','reviewed','note','netIncome','tax42900','dividend40425','ab63','ab68','other23200','externalFederal','externalAlberta','external23200','countries','provincial'];
 if(!keys(f,fields)||f.version!==2||!['CALC','EXTERNAL','NONE'].includes(f.mode)||typeof f.scope!=='boolean'||typeof f.reviewed!=='boolean'||!text(f.note,6000))throw Error('Invalid foreignTax v2 settings.');
 for(const k of ['netIncome','tax42900','dividend40425','ab63','ab68','other23200','externalFederal','externalAlberta','external23200'])if(!money(f[k]))throw Error('Invalid foreign-tax amount: '+k);
 if(!Array.isArray(f.countries)||f.countries.length>40)throw Error('Too many foreign country records.');
 const ids=new Set(),names=new Set();for(const c of f.countries){if(!keys(c,['id','country','netBefore','taxBefore','d11','d12','reference'])||!text(c.id,150)||!c.id||ids.has(c.id)||!text(c.country,120)||!text(c.reference,3000)||['netBefore','taxBefore','d11','d12'].some(k=>!money(c[k])))throw Error('Invalid foreign country record.');ids.add(c.id);const name=c.country.trim().toUpperCase();if(name&&names.has(name))throw Error('Use one consolidated row per country, preserving account details in references.');if(name)names.add(name);}
 if(!keys(f.provincial,['amount','basis'])||!money(f.provincial.amount)||!text(f.provincial.basis,200))throw Error('Invalid accepted provincial worksheet result.');
}
function foreign25Basis(d){const f=JSON.parse(JSON.stringify(d.foreignTax||freshForeign25()));delete f.provincial;return 'FT25:'+hash({year:d.year,province:d.province,provinceConfirmed:d.provinceConfirmed,taxpayer:d.taxpayer,form:f,deductionLine:d.lines?.['23200']?.amount??null,lines:Object.fromEntries(Object.entries(d.lines||{}).filter(([k])=>!['40500','23200'].includes(k))),slips:d.slips,contributions:d.contributions,forms5:d.forms5});}
function foreign25Summary(d){
 const f=d.foreignTax||freshForeign25(),r={blockers:[],countries:[],federal:0,alberta:0,deductions:0,total23200:0};
 const block=t=>r.blockers.push(t),get=(v,label)=>{if(v===null||typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e9){block('Enter '+label+'; explicit0 if none.');return 0;}return Math.round(v*100);};
 const ratio=(n,t,den)=>Number((BigInt(n)*BigInt(t)+BigInt(den)/2n)/BigInt(den));
 if(d.year!==2025||d.province!=='AB'||!d.provinceConfirmed)block('Requires2025 and confirmed Alberta year-end residence.');
 if(!f.scope)block('Confirm the displayed eligibility/scope and updated return inputs.');if(!f.reviewed)block('Review these country records and results.');
 if(f.mode==='EXTERNAL'){if(!f.note.trim())block('Reference the completed official forms/software results.');r.federal=get(f.externalFederal,'reviewed T2209 line13')/100;r.alberta=get(f.externalAlberta,'reviewed T2036 total line5')/100;r.total23200=get(f.external23200,'reviewed COMPLETE line23200')/100;return r;}
 if(f.mode==='NONE'){r.total23200=get(f.other23200,'non-foreign deductions for23200')/100;return r;}
 const den=get(f.netIncome,'T2209 note3 adjusted net income AFTER selected deductions'),federalCap=get(f.tax42900,'T1 line42900 AFTER selected deductions'),basic=federalCap+get(f.dividend40425,'line40425'),abTax=get(f.ab63,'AB428 line63 AFTER selected deductions')+get(f.ab68,'AB428 line68 AFTER selected deductions');
 const other=get(f.other23200,'other non-foreign23200 deductions');if(den<=0)block('Zero/negative adjusted net income requires reviewed external results.');
 if(!f.countries.length)block('Add one reviewed consolidated row per country, or select NONE.');
 let totalFed=0,totalProv=0,ded=0;
 for(const c of f.countries){
  if(!c.country.trim()||!c.reference.trim())block('Each country needs a name and source/eligibility/deduction reference.');
  const net=get(c.netBefore,c.country+' net income before20(11)/(12)'),tax=get(c.taxBefore,c.country+' reviewed eligible tax before20(11)/(12)'),d11=get(c.d11,c.country+' reviewed20(11) deductible tax'),d12=get(c.d12,c.country+' selected reviewed20(12) deduction');
  if(d11+d12>tax)block(c.country+': deductions exceed the reviewed eligible foreign-tax budget.');
  const line1=Math.max(0,tax-d11-d12),foreign=Math.min(Math.max(0,net-d11-d12),den),line2=den>0?ratio(foreign,basic,den):0;
  const line3=Math.min(line1,line2,federalCap),p3=Math.max(0,line1-line3),p4=den>0?ratio(foreign,abTax,den):0,p5=Math.min(p3,p4,abTax);
  r.countries.push({country:c.country,t2209:{line1:line1/100,netForeign:foreign/100,line2:line2/100,line3:line3/100,line12:line3/100,line13:line3/100},t2036:{line1:line1/100,line2:line3/100,line3:p3/100,line4:p4/100,line5:p5/100},deduction:(d11+d12)/100,unused:(line1-line3-p5)/100});
  totalFed+=line3;totalProv+=p5;ded+=d11+d12;
 }
 if(totalFed>federalCap)block('Country credit totals exceed federal limit; reviewed external allocation is required.');if(totalProv>abTax)block('Country credit totals exceed Alberta tax otherwise payable; use reviewed external allocation.');
 r.federal=totalFed/100;r.alberta=totalProv/100;r.deductions=ded/100;r.total23200=(ded+other)/100;
 for(const v of [r.federal,r.alberta,r.total23200])if(v>1e9)block('Result exceeds supported range.');return r;
}
function planForeign25(d,provincialOnly=false){const r=foreign25Summary(d);if(r.blockers.length)throw Error(r.blockers.join('; '));const next=JSON.parse(JSON.stringify(d));next.foreignTax=next.foreignTax||freshForeign25();if(provincialOnly)next.foreignTax.provincial={amount:r.alberta,basis:foreign25Basis(d)};else{for(const [c,amount] of Object.entries({'40500':r.federal,'23200':r.total23200}))next.lines[c]={...emptyLine(),...(next.lines[c]||{}),amount,status:'ENTERED',source:'Reviewed T2209 / foreign-tax deduction worksheet (complete line)',basisHash:'',componentHash:''};const basis=foreign25Basis(next);next.lines['40500'].basisHash=basis;next.lines['23200'].basisHash=basis;}validateDraft(next);return next;}

const API={LINES,blank,parseMoney,hash,validateDraft,resolveSettings,investmentCandidates,componentHash,staleComponents,statusOf,refundSuggestions,refundBasis,SLIP_BOXES,migrateInvestment,validateInvestment,activeSlips,investmentSummary,investmentBasis,rowKey,hsbcRowAllowed,employmentSummary,employmentBasis,validateDispositions,activeDispositions,dispositionStructuralIssues,dispositionIssues,dispositionGain,dispositionSummary,capitalImportKey,matchingCapitalSales,validateBenefits,benefitsSummary,benefitsBasis,withholdingBasis,freshSchedule3,scheduleState,validateSchedule3,scheduleCandidates,scheduleRowIssues,scheduleRowGain,scheduleSummary,scheduleBasis,planT5008FilingSelection,t3OtherIncomeBasis,t3OtherIncomeSummary,planT3OtherIncome,freshForms5,forms5State,validateForms5,form5Basis,form5Summary,planForm5,freshForeign25,validateForeign25,foreign25Basis,foreign25Summary,planForeign25};
if(typeof module!=='undefined'&&module.exports){module.exports=API;return;}

let draft=blank(),revision=0,dirty=false,token,host,snapshot=null,candidates,busy=false,message='Draft not yet saved. Financial data is not stored in browser localStorage.';
let rememberToken=false;
let autoLoadAttempted=false;
const TOKEN_STORAGE_PREFIX='t1WriteToken:';

function backendUrl(){
  return snapshot?.url||localStorage.getItem('ibkrgasurl')||'';
}

function tokenKey(){
  const url=backendUrl();
  if(!url)throw Error('Backend URL unavailable. Load investment data or configure your existing Apps Script URL.');
  return TOKEN_STORAGE_PREFIX+hash(url);
}

function readStoredToken(){
  try{
    return localStorage.getItem(tokenKey())||'';
  }catch(e){
    return '';
  }
}

function storeToken(value){
  try{
    if(value)localStorage.setItem(tokenKey(),value);
    else localStorage.removeItem(tokenKey());
  }catch(e){
    throw Error('Browser storage is unavailable. The token cannot be remembered.');
  }
}

async function autoLoadServerDraft(){
  if(autoLoadAttempted||busy||dirty||slipEditorDirty||dispositionDirty)return;
  if(!backendUrl()||!token)return;
  autoLoadAttempted=true;
  busy=true;
  try{
    const result=await request('getT1PreparationDraft');
    if(result.draft){
      draft=validateDraft(result.draft);
      refreshSuggestions();
      dirty=false;
      revision=result.revision||0;
      message='Saved draft loaded automatically.';
    }else{
      message='No saved draft found for this taxpayer and year.';
    }
    render();
  }catch(err){
    autoLoadAttempted=false;
    message=err.message;
    render();
  }finally{
    busy=false;
  }
}
function touch(){dirty=true;}
function refreshSuggestions(){snapshot=typeof window.getT1InvestmentSnapshot==='function'?window.getT1InvestmentSnapshot():null;candidates=investmentCandidates(snapshot,draft);}
function warnings(){const out=[];out.push(...benefitsSummary(draft).blockers);if(draft.schedule3)out.push(...scheduleSummary(draft,snapshot).blockers);const emp=employmentSummary(draft);out.push(...emp.blockers);if((draft.dispositions||[]).length){const cap=dispositionSummary(draft,snapshot);out.push(...cap.blockers);if(cap.rows.some(x=>x.record.classification==='INCOME'))out.push('T5008 income-account transactions require separate reporting and are excluded from capital subtotals.');}if((draft.slips||[]).length||draft.contributions.some(c=>c.included)){const x=investmentSummary(draft,candidates,!!snapshot);out.push(...x.blockers);out.push(...x.notices);for(const c of ['12000','12100'])if(Number.isFinite(draft.lines[c]?.amount)&&Math.abs(draft.lines[c].amount-x.totals[c])>.005)out.push('Line '+c+' differs from the proposed investment summary; review/apply or document the independently supported amount. No overwrite was made.');}if(!draft.profileConfirmed||!draft.provinceConfirmed||!draft.province)out.push('Confirm taxpayer, province and residency profile.');if(draft.year!==2025)out.push('Verify all lines against this year’s return. Only the listed ordinary Schedule 3 calculation is enabled for supported years; other tax/credit calculations remain manual.');if(!draft.otherLinesReviewed)out.push('Review other applicable T1 lines/schedules; the listed lines are not the complete return.');if(snapshot?.capitalError)out.push('Existing capital calculation error: '+snapshot.capitalError);if(snapshot?.dividendError)out.push('Existing dividend calculation error: '+snapshot.dividendError);const missing=LINES.filter(([c])=>!['CONFIRMED','NA'].includes(statusOf(draft,c,candidates,!!snapshot,snapshot)));if(missing.length)out.push(missing.length+' listed lines are unanswered, unconfirmed or need re-review.');if(staleComponents(draft,candidates,!!snapshot).length)out.push('An accepted HSBC component changed or cannot currently be checked. Refresh/review it.');for(const c of ['12700','43500','48200','48400','48500'])if((draft.lines[c]?.amount??0)<0)out.push('Line '+c+' requires a non-negative amount; review the supporting calculation.');const f=refundSuggestions(draft);if(f&&['48400','48500'].some(c=>draft.lines[c]?.amount!==null&&Math.abs(draft.lines[c].amount-f[c])>.005))out.push('Entered refund/balance differs from confirmed payable/credits arithmetic.');return out;}
function helper(code){return ({'12000':'Canadian taxable dividend amount, not cash received. Foreign dividends do not go here.','12100':'Include all relevant interest and foreign investment income. HSBC candidates need income-character verification. Do not duplicate IBKR slip amounts.','12600':'Net amount from the rental schedule, not gross rent.','12700':'Use the Schedule 3 tab to review selected dispositions and slip gains, current-year losses and the supported inclusion rate. Prior-year net capital loss claims remain separate at 25300. Special cases require external schedules.','15000':'Review the live arithmetic below the amount, include any unlisted income in the supporting total-income panel, and explicitly apply the reviewed complete total.','22100':'Enter eligible expenses from supporting records; no automatic fee deduction is made.','22215':'Use the applicable CPP/QPP schedule; not the entire CPP contribution.','23600':'Use the complete net-income calculation, including applicable deductions/repayments not shown here.','25300':'Enter the supported claim, not your entire loss carryforward balance.','26000':'Use the complete taxable-income calculation.','30000':'Year- and income-dependent; no fixed personal amount is hard-coded.','31260':'Year-dependent employment amount; not simply all employment income.','33200':'Use the applicable medical-expense worksheet and thresholds.','35000':'This is not a straight sum of personal/expense face amounts. Enter the schedule/software result.','40425':'Canadian dividend tax credit from the applicable slip/schedule.','40500':'Use the allowable foreign-tax-credit calculation, not simply total withholding.','41500':'Verify this line’s applicability and label for the selected year.','42000':'Enter the federal-tax schedule/software result. No bracket engine is included.','42800':'Enter the province-specific schedule/software result.','43500':'Enter total payable from the complete return, not only federal plus provincial tax.','43700':'Canadian income tax deducted; do not insert foreign dividend withholding.','48200':'Total credits from the complete return; includes payments/credits beyond the lines shown here.'})[code]||'Enter the applicable amount from the tax slip, supporting schedule or tax software. Zero / not applicable must be explicitly confirmed.';}
function row([c,label]){const l=draft.lines[c]||emptyLine(),s=statusOf(draft,c,candidates,!!snapshot,snapshot);return `<tr><td>${c}</td><td>${esc(label)}<small>${esc(helper(c))}</small>${c==='12700'?'<button type="button" data-action="open-schedule">Open Schedule 3</button>':''}${['22215','30800','44800','12600','12599','22900'].includes(c)?`<button type="button" data-f5-action="open" data-name="${['22215','30800','44800'].includes(c)?'cpp':['12600','12599'].includes(c)?'rental':'employment'}">Open supporting form</button>`:''}</td><td><input aria-label="Line ${c} CAD" inputmode="decimal" data-line="${c}" data-field="amount" value="${l.amount===null?'':l.amount}" placeholder="Unanswered">${c==='15000'?income15000Details():''}</td><td><select data-line="${c}" data-field="status" aria-label="Line ${c} status">${['UNANSWERED','ENTERED','CONFIRMED','NA'].map(v=>`<option value="${v}" ${l.status===v?'selected':''}>${v==='NA'?'ZERO / NOT APPLICABLE':v}</option>`).join('')}</select><small>${s==='NEEDS_REVIEW'?'Source/dependencies changed — needs review':''}</small></td><td><input data-line="${c}" data-field="source" aria-label="Line ${c} source" value="${esc(l.source)}" placeholder="Slip / schedule / source"><input data-line="${c}" data-field="note" aria-label="Line ${c} note" value="${esc(l.note)}" placeholder="Optional note"></td></tr>`;}

let slipEditor=null,slipEditorDirty=false;
function freshSlip(type){return {id:'slip:'+Date.now()+':'+Math.random().toString(36).slice(2,9),type,issuer:'',account:'',reference:'',state:'ORIGINAL',replaces:'',included:true,confirmed:false,cadConfirmed:false,ownershipConfirmed:false,otherBoxesReviewed:false,boxes:Object.fromEntries(Object.keys(SLIP_BOXES[type]).map(k=>[k,null])),note:''};}

let dispositionEditor=null,dispositionDirty=false;
function employmentTab(){const x=employmentSummary(draft);return `<section><h4>T4 employment and payment subtotals</h4><p>CPP/QPP boxes 16/17 and 16A/17A require Schedule 8/RC381 calculations. EI box 18 needs annual-limit/overpayment review. These amounts are not automatically copied to 30800, 22215 or 31200. Boxes 40/42 are not added to employment income again. Commissions may still require line 10120; pension adjustment, stock-option deductions, retiring allowances, health premiums and past-service items require separate return/schedule review. Only the displayed standard subtotals have apply buttons.</p><div class="t1-scroll"><table><thead><tr><th>Purpose</th><th>T4 subtotal CAD</th></tr></thead><tbody>${[['10100','Employment income (box 14)'],['43700','Income tax deducted (box 22)'],['20700','RPP contributions support (box 20)'],['21200','Union dues support (box 44)'],['cpp','CPP contributions'],['cpp2','Second CPP contributions'],['qpp','QPP contributions'],['qpp2','Second QPP contributions'],['ei','EI premiums support'],['donations','Payroll donations support (not all donations)'],['pensionAdjustment','Pension adjustment — review line 20600 separately']].map(([k,label])=>`<tr><td>${esc(label)}</td><td>${fmt(x.totals[k])}</td></tr>`).join('')}</tbody></table></div><ul>${x.blockers.map(n=>`<li>${esc(n)}</li>`).join('')}</ul><button type="button" data-work-action="apply-employment" data-target="10100" ${!x.slips.length||x.blockers.length?'disabled':''}>Use T4 employment subtotal for 10100</button> <button type="button" data-work-action="apply-employment" data-target="43700" ${!x.slips.length||x.blockers.length?'disabled':''}>Use T4 tax-deducted subtotal for 43700</button> <button type="button" data-work-action="apply-employment" data-target="20700,21200" ${!x.slips.length||x.blockers.length?'disabled':''}>Use T4 deduction subtotals for 20700 / 21200</button><p>Each action replaces the selected WHOLE line(s) only after approval, preserves notes and marks ENTERED. These subtotals can be incomplete: combine other applicable income, withholding, pension deductions or dues manually when necessary. Do not replace a supported combined total with a partial T4 subtotal.</p></section>`;}
function freshDisposition(){return {id:'t5008:'+Date.now()+':'+Math.random().toString(36).slice(2,9),issuer:'',account:'',source:'IBKR',reference:'',state:'ORIGINAL',replaces:'',included:true,date:'',security:'',isin:'',quantity:null,currency:'CAD',reportedCost:null,reportedProceeds:null,reviewedAcbCad:null,proceedsCad:null,sellingCostsCad:null,proceedsBasis:'GROSS',classification:'REVIEW',confirmed:false,acbConfirmed:false,fxConfirmed:false,ownershipConfirmed:false,overlapReviewed:false,matchedImportKey:'',overlapNote:'',note:''};}
function dispositionTab(){const data=draft.dispositions||[],active=new Set(activeDispositions(draft).map(r=>r.id));return `<p>Manual T5008 entry and reviewed-disposition worksheet only. Box 20 is reported book value, NOT automatically verified ACB. Enter independently supported CAD ACB and proceeds. No imported trade or ACB pool is changed, and no taxable gain is automatically placed on 12700.</p><button type="button" data-work-action="add-disposition">Add T5008 transaction</button><div class="t1-scroll"><table><thead><tr><th>Include</th><th>Broker / account / security</th><th>Date / version</th><th>Draft gain CAD</th><th>Review</th><th>Action</th></tr></thead><tbody>${data.map((r,i)=>`<tr><td><input type="checkbox" data-disp-include="${i}" ${r.included?'checked':''} ${r.state==='CANCELLED'?'disabled':''} aria-label="Include ${esc(r.security)}"></td><td>${esc(r.source+' / '+r.issuer+' / '+r.account+' / '+r.security)}</td><td>${esc(r.date+' / '+r.state)}</td><td>${fmt(dispositionGain(r))}</td><td>${!active.has(r.id)?'Excluded / superseded':esc(dispositionIssues(r,snapshot,draft).join('; ')||'Reviewed — reference only')}</td><td><button type="button" data-work-action="edit-disposition" data-index="${i}">Edit</button> <button type="button" data-work-action="remove-disposition" data-index="${i}">Remove</button></td></tr>`).join('')||'<tr><td colspan="6">No T5008 transactions entered.</td></tr>'}</tbody></table></div>${dispositionEditor?dispositionEditorUI():''}${dispositionOverview()}`;}
function dispositionEditorUI(){const r=dispositionEditor,records=snapshot?.capitalSales||[],matches=matchingCapitalSales(r,snapshot);const text=(k,label,type='text')=>`<label>${label}<input type="${type}" data-disp-field="${k}" value="${esc(r[k]??'')}" maxlength="300"></label>`;
 return `<fieldset><legend>T5008 transaction — ${esc(draft.taxpayer.name)} / ${draft.year}</legend><div class="t1-controls">${text('issuer','Broker / issuer *')}${text('account','Taxable account *')}${text('reference','Unique transaction reference')}<label>Source<select data-disp-field="source">${['IBKR','HSBC','OTHER'].map(v=>`<option ${r.source===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Version<select data-disp-field="state">${['ORIGINAL','AMENDED','CANCELLED'].map(v=>`<option ${r.state===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Earlier transaction replaced<select data-disp-field="replaces"><option value="">None</option>${(draft.dispositions||[]).filter(p=>p.id!==r.id).map(p=>`<option value="${esc(p.id)}" ${r.replaces===p.id?'selected':''}>${esc(p.issuer+' / '+p.account+' / '+p.date+' / '+p.security+' / '+p.reference)}</option>`).join('')}</select></label>${text('date','Disposition date *','date')}${text('security','Symbol / security *')}${text('isin','ISIN / CUSIP (optional)')}${text('quantity','Quantity *')}${text('currency','Reported currency (3-letter code)')}</div><div class="t1-scroll"><table><thead><tr><th>Field</th><th>Amount</th><th>Meaning</th></tr></thead><tbody>${[['reportedCost','Box 20 — reported cost/book value','Reported currency; reference only, never copied into reviewed ACB'],['reportedProceeds','Box 21 — reported proceeds','Reported currency; convert as appropriate outside this worksheet'],['proceedsCad','Reviewed proceeds CAD','State gross or net below; no automatic FX conversion'],['reviewedAcbCad','Independently reviewed ACB CAD','Required even when box 20 is present; explicit zero is allowed if supported'],['sellingCostsCad','Additional selling expenses CAD','Enter explicit zero when none; must be zero for NET proceeds']].map(([k,label,help])=>`<tr><td>${esc(label)}</td><td><input data-disp-field="${k}" inputmode="decimal" value="${esc(r[k]??'')}" placeholder="Unanswered" aria-label="${esc(label)}"></td><td>${esc(help)}</td></tr>`).join('')}</tbody></table></div><label>CAD proceeds basis<select data-disp-field="proceedsBasis">${['GROSS','NET'].map(v=>`<option ${r.proceedsBasis===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Tax treatment<select data-disp-field="classification">${['REVIEW','CAPITAL','INCOME'].map(v=>`<option ${r.classification===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Link imported sale for reconciliation (not added again)<select data-disp-field="matchedImportKey"><option value="">No linked sale — review overlap below</option>${records.filter(x=>String(x.date||'').slice(0,4)===String(draft.year)).map(x=>`<option value="${esc(capitalImportKey(x))}" ${r.matchedImportKey===capitalImportKey(x)?'selected':''}>${esc([x.source,x.account,String(x.date||'').slice(0,10),x.symbol].join(' / '))} — net proceeds ${fmt(x.proceedsCad)}, calculated ACB ${fmt(x.acbCad)}</option>`).join('')}</select></label><p>${matches.length} possible imported match(es) by source/account/date/security. Imported values are reference only and are not copied or counted in the T5008 subtotal. For aggregate/consolidated records, document the reconciliation explicitly.</p><label>Overlap explanation / reconciliation<textarea data-disp-field="overlapNote" maxlength="6000">${esc(r.overlapNote)}</textarea></label>${[['included','Include this transaction (unless superseded/cancelled)'],['acbConfirmed','I independently reviewed CAD ACB; box 20 was not assumed tax-correct'],['fxConfirmed','CAD proceeds/conversions are supported; selling expenses are not deducted twice'],['ownershipConfirmed','This is the selected taxpayer’s taxable account, not a registered account'],['overlapReviewed','I reconciled overlaps and will not add this sale again from imported broker records'],['confirmed','Transaction reviewed; classification and supporting figures are complete']].map(([k,label])=>`<label><input type="checkbox" data-disp-field="${k}" ${r[k]?'checked':''}> ${esc(label)}</label>`).join('')}<label>Evidence / notes<textarea data-disp-field="note" maxlength="6000">${esc(r.note)}</textarea></label><button type="button" data-work-action="save-disposition">Save transaction to draft</button><button type="button" data-work-action="cancel-disposition">Cancel editing</button></fieldset>`;
}
function dispositionOverview(){const x=dispositionSummary(draft,snapshot);return `<section><h4>T5008 disposition-review summary</h4><p>Only included, fully reviewed CAPITAL transactions appear in these subtotals. INCOME transactions need separate income-account reporting; unresolved rows are excluded. These are T5008-only reference totals: do not add them again to matching imported gains. Complete Schedule 3 and other applicable calculations before entering taxable capital gains on line 12700. No inclusion rate is assumed.</p><div class="t1-scroll"><table><thead><tr><th>Source / account</th><th>Transactions</th><th>Reviewed proceeds</th><th>Reviewed ACB</th><th>Additional expenses</th><th>Raw gain / loss CAD</th></tr></thead><tbody>${x.groups.map(g=>`<tr><td>${esc(g.account)}</td><td>${g.count}</td><td>${fmt(g.proceeds)}</td><td>${fmt(g.acb)}</td><td>${fmt(g.expenses)}</td><td>${fmt(g.gain)}</td></tr>`).join('')||'<tr><td colspan="6">No fully reviewed capital transactions.</td></tr>'}</tbody></table></div><ul>${x.blockers.map(n=>`<li>${esc(n)}</li>`).join('')}${x.rows.filter(x=>x.record.classification==='INCOME').map(x=>`<li>${esc(x.record.issuer+' / '+x.record.security)} classified INCOME: excluded from capital subtotals; report separately as appropriate.</li>`).join('')}</ul><button type="button" data-work-action="export-dispositions">Export T5008 review CSV</button> <button type="button" data-action="open-schedule">Open Schedule 3 supporting calculation</button></section>`;}
function installWorkEvents(){
 function update(t){if(!dispositionEditor)return;const k=t.dataset.dispField;dispositionEditor[k]=t.type==='checkbox'?t.checked:t.value;if(t.type!=='checkbox'&&!['note','overlapNote'].includes(k)){dispositionEditor.confirmed=false;const check=host.querySelector('[data-disp-field="confirmed"]');if(check)check.checked=false;}dispositionDirty=true;touch();}
 host.addEventListener('input',e=>{if(e.target.dataset.dispField===undefined)return;e.stopImmediatePropagation();update(e.target);},true);
 host.addEventListener('change',e=>{const t=e.target;if(t.dataset.dispField!==undefined){e.stopImmediatePropagation();update(t);return;}if(t.dataset.dispInclude!==undefined){e.stopImmediatePropagation();draft.dispositions[Number(t.dataset.dispInclude)].included=t.checked;touch();render();return;}},true);
 host.addEventListener('click',e=>{
  const b=e.target.closest('button[data-work-action]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;const a=b.dataset.workAction;
  try{
   if(a==='add-disposition'||a==='edit-disposition'){if(slipEditorDirty||dispositionDirty)throw Error('Save/cancel the open slip or transaction form first.');dispositionEditor=a==='add-disposition'?freshDisposition():JSON.parse(JSON.stringify(draft.dispositions[Number(b.dataset.index)]));dispositionDirty=false;}
   if(a==='cancel-disposition'){if(dispositionDirty&&!confirm('Discard uncommitted transaction edits?'))return;dispositionEditor=null;dispositionDirty=false;}
   if(a==='save-disposition'){
    const edit=JSON.parse(JSON.stringify(dispositionEditor));if(!edit)throw Error('No transaction form is open.');for(const k of ['reportedCost','reportedProceeds','reviewedAcbCad','proceedsCad','sellingCostsCad'])edit[k]=parseMoney(edit[k]);
    const q=String(edit.quantity??'').trim().replace(/,/g,'');edit.quantity=q===''?null:/^\d+(?:\.\d{0,8})?$/.test(q)?Number(q):NaN;edit.currency=edit.currency.trim().toUpperCase();if(edit.state==='CANCELLED')edit.included=false;
    const proposed=JSON.parse(JSON.stringify(draft)),i=proposed.dispositions.findIndex(r=>r.id===edit.id);if(i<0)proposed.dispositions.push(edit);else proposed.dispositions[i]=edit;validateDraft(proposed);
    if(edit.confirmed&&dispositionIssues(edit,snapshot,proposed).length)throw Error(dispositionIssues(edit,snapshot,proposed).join('; '));
    if(edit.state==='AMENDED'){if(!confirm('Replace the earlier T5008 transaction? It will be excluded but retained. Enter replacement amounts, not differences.'))return;proposed.dispositions.find(r=>r.id===edit.replaces).included=false;}
    draft.dispositions=proposed.dispositions;dispositionEditor=null;dispositionDirty=false;touch();message='T5008 transaction saved in memory. Save draft to Sheets to persist it.';
   }
   if(a==='remove-disposition'){const r=draft.dispositions[Number(b.dataset.index)];if(draft.dispositions.some(p=>p.replaces===r.id))throw Error('A later amendment refers to this transaction. Retain/exclude it, or remove the amendment first.');if(confirm('Remove this T5008 draft transaction? Imported broker records remain unchanged.')){draft.dispositions.splice(Number(b.dataset.index),1);if(dispositionEditor?.id===r.id){dispositionEditor=null;dispositionDirty=false;}touch();}}
   if(a==='apply-employment'){
    if(slipEditorDirty||dispositionDirty)throw Error('Save/cancel the open slip or transaction form first.');const x=employmentSummary(draft);if(!x.slips.length||x.blockers.length)throw Error(x.blockers.join('; ')||'No included T4 slips.');const targets=b.dataset.target.split(',');if(targets.some(c=>!['10100','43700','20700','21200'].includes(c)))throw Error('Invalid employment target.');
    if(!confirm('REPLACE '+targets.map(c=>'line '+c+' with the T4 subtotal '+fmt(x.totals[c])+' CAD').join(' and ')+'?\nThis may be incomplete if other slips/amounts apply. Preserve a supported combined total instead when needed. Notes are kept; amounts become ENTERED, not CONFIRMED.'))return;
    for(const c of targets)draft.lines[c]={...emptyLine(),...(draft.lines[c]||{}),amount:x.totals[c],status:'ENTERED',source:'T4 subtotal — verify whole-line coverage, limits and eligibility',basisHash:employmentBasis(draft),componentHash:''};touch();
   }
   if(a==='export-dispositions'){if(slipEditorDirty||dispositionDirty)throw Error('Save/cancel the open slip or transaction form before exporting.');const x=dispositionSummary(draft,snapshot),q=v=>'"'+String(v??'').replace(/^[=+@\t\r\n-]/,"'$&").replace(/"/g,'""')+'"';const rows=[['Taxpayer','Year','Source','Account','Security','Date','CAD proceeds','Reviewed ACB CAD','Additional expenses CAD','Basis','Classification','Raw gain CAD','Review issues','Matched import','Note'],...x.rows.map(({record:r,gain,issues})=>[draft.taxpayer.name,draft.year,r.source,r.account,r.security,r.date,r.proceedsCad??'',r.reviewedAcbCad??'',r.sellingCostsCad??'',r.proceedsBasis,r.classification,gain??'',issues.join('; '),r.matchedImportKey,r.note])];download('T5008_review_'+draft.taxpayer.id+'_'+draft.year+'.csv','\uFEFF'+rows.map(r=>r.map(q).join(',')).join('\r\n'),'text/csv;charset=utf-8;');}
   render();
  }catch(err){message=err.message;render();}
 },true);
}



function t3OtherIncomeTab(){
 const x=t3OtherIncomeSummary(draft);
 return `<section><h4>T3 other income — line 13000</h4>
 <p>Proposed subtotal = box 26 minus box 31 from included, current-version T3 slips. Box 31 is already in box 26; handle its pension-income reporting separately at 11500. Blank supported boxes count as not applicable only after slip review.</p>
 <div class="t1-scroll"><table><thead><tr><th>Included T3</th><th>Box 26 CAD</th><th>Box 31 CAD</th><th>13000 subtotal CAD</th></tr></thead><tbody>${x.rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${fmt(r.box26)}</td><td>${fmt(r.box31)}</td><td>${fmt(r.amount)}</td></tr>`).join('')||'<tr><td colspan="4">No included T3 slips.</td></tr>'}</tbody></table></div>
 <p>Proposed T3 box 26 less box 31 subtotal: ${fmt(x.amount)} CAD. Current whole line 13000: ${fmt(draft.lines['13000']?.amount)} CAD.</p>
 <ul>${x.blockers.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
 <button type="button" data-supp-action="apply-t3-other" ${!x.slips.length||x.blockers.length?'disabled':''}>Apply T3 box 26 − box 31 to 13000</button>
 <p>Approval REPLACES the whole line, preserves notes and marks ENTERED, not CONFIRMED. This is not all possible 13000 income: box22 lump-sum pension income, other slips or income may also apply. Death-benefit exemptions (including box35) and other special treatment are NOT calculated. If those affect the subtotal, enter a supported adjusted/combined line manually instead. Do not apply an incomplete subtotal over a correct combined total. Save draft to Sheets to persist.</p></section>`;
}

function benefitsTab(){const x=benefitsSummary(draft),e=employmentSummary(draft),blocked=x.blockers.length;return `<section><h4>T4E / line 11900</h4><p>11900 = box 14 minus box 18. Do not add boxes 15/17/33/36/37 again. Box 30 repayments are separate 23200 support, not a second subtraction from 11900. Box 7 at 30% requires the T4E repayment chart and separate 23500/42200 review; no benefit clawback is calculated here.</p><div class="t1-scroll"><table><thead><tr><th>Purpose</th><th>CAD subtotal</th></tr></thead><tbody>${[['11900','Proposed EI/other benefits'],['23200','T4E repayments support (box 30)'],['25600','Non-taxable tuition assistance support (box 21; handle separately)'],['withheld','T4E federal income-tax-deducted support'],['quebecTax','Box 23 (included in federal support only when appropriate)']].map(([k,label])=>`<tr><td>${esc(label)}</td><td>${fmt(x.totals[k])}</td></tr>`).join('')}<tr><td>Combined T4 + T4E tax deducted (not necessarily complete 43700)</td><td>${fmt(e.totals['43700']+x.totals.withheld)}</td></tr></tbody></table></div><ul>${x.blockers.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><button type="button" data-supp-action="apply-benefits" data-target="11900" ${!x.slips.length||blocked?'disabled':''}>Use T4E subtotal for 11900</button> <button type="button" data-supp-action="apply-benefits" data-target="23200" ${!x.slips.length||blocked?'disabled':''}>Use T4E repayment subtotal for 23200</button> <button type="button" data-supp-action="apply-benefits" data-target="43700" ${!x.slips.length&&!e.slips.length||blocked||e.blockers.length?'disabled':''}>Use combined T4 + T4E tax deducted for 43700</button><p>Approval replaces the WHOLE selected draft line, preserves notes and marks ENTERED. Other tax slips, deductions or withholding may also apply: do not overwrite a supported combined amount with an incomplete subtotal. Box 21 requires separate line 25600 handling outside this abbreviated panel. Update complete-return totals such as 15000/23600 separately. Use Save draft to Sheets to persist.</p></section>`;}
let scheduleFeedback = '';
function scheduleTab() {
  const c = scheduleState(draft);
  const x = scheduleSummary(draft, snapshot);
  const items = scheduleCandidates(draft, snapshot);

  const added = new Set(
    c.rows
      .filter(r => r.origin !== 'MANUAL')
      .map(r => r.origin + ':' + r.ref)
  );

  const edit = (r, i, k, label) => `
    <input
      data-s3-index="${i}"
      data-s3-field="${k}"
      value="${esc(r[k] ?? '')}"
      aria-label="${esc(label)}"
      ${S3_NUMBERS.includes(k) ? 'inputmode="decimal"' : ''}
    >
  `;

  return `
    <section>
      <h4>Schedule 3 — ordinary securities supporting worksheet</h4>
      ${scheduleFeedback ? `<p data-s3-feedback role="status" aria-live="polite" style="padding:10px;border:1px solid #8eb9dc;border-radius:4px">${esc(scheduleFeedback)}</p>` : ''}

      <p>
        This is a supporting calculation for ordinary capital stock/fund
        dispositions and ordinary T3/T5 capital gains, not the complete CRA
        five-part form. It does not determine whether you are trading on
        income account, verify tax-correct ACB pooling, or calculate
        superficial losses, reserves, donations/zero-inclusion gains,
        principal-residence exemptions, QSBC/farm deductions, LPP restrictions,
        AMT or partnership adjustments. If those treatments apply, complete
        the official schedules externally and enter the supported 12700
        manually. Existing source/account-separated ledgers remain unchanged.
      </p>

      <p>
        Only 2021–2025 ordinary calculations are enabled at a 50% inclusion
        rate. Other years require external year-specific calculation.
        Current-year losses offset current-year gains before inclusion.
        Prior-year losses belong in a separate supported 25300 claim,
        NOT as a subtraction here.
      </p>

      <details>
        <summary>
          Add source amounts for review (${items.length} candidates)
        </summary>

        <p>
          Imported sale proceeds are already NET of selling commissions,
          so additional expenses start at zero. Do not subtract commissions
          again. CAD amounts are rounded to cents per supporting row;
          underlying ledger precision is preserved. Penny differences from
          aggregate unrounded totals may need reconciliation. Net source
          proceeds are not a substitute for a separately reconciled
          gross-proceeds figure on an official form. Candidates are NOT
          automatically included. Select one representation for each sale:
          imported, T5008 or manual.
        </p>

        <button
          type="button"
          data-supp-action="s3-add-imports"
        >
          Add eligible imported sales as unreviewed rows
        </button>

        <div class="t1-scroll">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Raw gain CAD</th>
                <th>Source checks</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              ${
                items.map((v, i) => `
                  <tr>
                    <td>${esc(v.label)}</td>

                    <td>${fmt(scheduleRowGain(v.row))}</td>

                    <td>
                      ${
                        esc(
                          v.issues.join('; ') ||
                          'Available — independent review still required'
                        )
                      }
                    </td>

                    <td>
                      ${
                        v.row.origin === 'T5008'
                          ? `
                            <button
                              type="button"
                              data-supp-action="s3-use-t5008"
                              data-ref="${esc(v.row.ref)}"
                              ${v.issues.length ? 'disabled' : ''}
                            >
                              Use reviewed T5008 for filing
                            </button>
                          `
                          : `
                            <button
                              type="button"
                              data-supp-action="s3-add"
                              data-index="${i}"
                              ${
                                v.issues.length ||
                                added.has(
                                  v.row.origin + ':' + v.row.ref
                                )
                                  ? 'disabled'
                                  : ''
                              }
                            >
                              ${
                                added.has(
                                  v.row.origin + ':' + v.row.ref
                                )
                                  ? 'Already added'
                                  : 'Add for review'
                              }
                            </button>
                          `
                      }
                    </td>
                  </tr>
                `).join('') ||
                `
                  <tr>
                    <td colspan="4">
                      No source candidates. Load source data, verify account
                      settings, or add a supported manual disposition.
                    </td>
                  </tr>
                `
              }
            </tbody>
          </table>
        </div>
      </details>

      <button
        type="button"
        data-supp-action="s3-manual"
      >
        Add manual stock/fund disposition
      </button>

      <div class="t1-scroll">
        <table>
          <thead>
            <tr>
              <th>Include / reviewed</th>
              <th>Source / account / description</th>
              <th>Acquisition year / disposition date</th>
              <th>Proceeds CAD (source basis)</th>
              <th>ACB CAD</th>
              <th>Additional expenses CAD</th>
              <th>Slip gain CAD</th>
              <th>Signed gain adjustment CAD</th>
              <th>Raw adjusted gain/loss</th>
              <th>Evidence / review / action</th>
            </tr>
          </thead>

          <tbody>
            ${
              c.rows.map((r, i) => {
                const review = x.rows.find(
                  v => v.record.id === r.id
                );

                return `
                  <tr>
                    <td>
                      <label>
                        <input
                          type="checkbox"
                          data-s3-index="${i}"
                          data-s3-field="included"
                          ${r.included ? 'checked' : ''}
                        >
                        Include
                      </label>

                      <label>
                        <input
                          type="checkbox"
                          data-s3-index="${i}"
                          data-s3-field="reviewed"
                          ${r.reviewed ? 'checked' : ''}
                        >
                        Reviewed
                      </label>
                    </td>

                    <td>
                      ${esc(r.origin)}

                      ${
                        r.origin === 'MANUAL'
                          ? edit(r, i, 'source', 'Source') +
                            edit(r, i, 'account', 'Account')
                          : esc(r.source + ' / ' + r.account)
                      }

                      ${edit(r, i, 'label', 'Description')}
                    </td>

                    <td>
                      ${
                        r.origin === 'SLIP'
                          ? 'Slip-reported capital gain'
                          : edit(
                              r,
                              i,
                              'acquisitionYear',
                              'Acquisition year or Various'
                            ) +
                            edit(
                              r,
                              i,
                              'date',
                              'Disposition YYYY-MM-DD'
                            )
                      }
                    </td>

                    <td>
                      ${
                        r.origin === 'SLIP'
                          ? '—'
                          : edit(r, i, 'proceeds', 'CAD proceeds')
                      }
                    </td>

                    <td>
                      ${
                        r.origin === 'SLIP'
                          ? '—'
                          : edit(r, i, 'acb', 'CAD ACB')
                      }
                    </td>

                    <td>
                      ${
                        r.origin === 'SLIP'
                          ? '—'
                          : edit(
                              r,
                              i,
                              'expenses',
                              'Additional expenses CAD'
                            )
                      }
                    </td>

                    <td>
                      ${
                        r.origin === 'SLIP'
                          ? edit(
                              r,
                              i,
                              'capitalAmount',
                              'Slip capital gain'
                            )
                          : '—'
                      }
                    </td>

                    <td>
                      ${
                        edit(
                          r,
                          i,
                          'adjustment',
                          'Signed supported gain adjustment'
                        )
                      }
                    </td>

                    <td>${fmt(scheduleRowGain(r))}</td>

                    <td>
                      <textarea
                        data-s3-index="${i}"
                        data-s3-field="reason"
                        maxlength="6000"
                        aria-label="Evidence and correction reason"
                      >${esc(r.reason)}</textarea>

                      <small>
                        ${
                          esc(
                            review?.issues.join('; ') ||
                            (
                              r.included
                                ? 'Reviewed ordinary row'
                                : 'Excluded'
                            )
                          )
                        }
                      </small>

                      ${
                        r.origin !== 'MANUAL'
                          ? `
                            <button
                              type="button"
                              data-supp-action="s3-refresh"
                              data-index="${i}"
                            >
                              Refresh source
                            </button>
                          `
                          : ''
                      }

                      <button
                        type="button"
                        data-supp-action="s3-remove"
                        data-index="${i}"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                `;
              }).join('') ||
              `
                <tr>
                  <td colspan="10">
                    No accepted source rows. No transactions is not proof
                    of zero gains.
                  </td>
                </tr>
              `
            }
          </tbody>
        </table>
      </div>

      <p>
        Adjustments are signed changes to gain/loss, not to tax. Example:
        a separately established disallowed $100 loss is +100 to the
        gain/loss calculation. Document all adjustments. This does not
        update the source ACB ledger or carryforward records. T3 box 21
        and T5 box 18 must not be duplicated in other accepted entries,
        and special slip treatments need external review.
      </p>

      ${
        [
          [
            'coverageConfirmed',
            'All applicable ordinary capital amounts are covered ' +
            '(or I explicitly confirm none), including sources not loaded here.'
          ],
          [
            'overlapConfirmed',
            'I reconciled imported sales, T5008 totals, slips and manual ' +
            'entries; no disposition is counted twice.'
          ],
          [
            'scopeConfirmed',
            'Only supported ordinary capital amounts are included. ' +
            'I reviewed all other Schedule 3 parts/special cases; none ' +
            'needs an unmodelled calculation here.'
          ]
        ].map(([k, t]) => `
          <label>
            <input
              type="checkbox"
              data-s3-setting="${k}"
              ${c[k] ? 'checked' : ''}
            >
            ${esc(t)}
          </label>
        `).join('')
      }

      <label>
        Schedule 3 evidence / other-parts review
        <textarea
          data-s3-setting="note"
          maxlength="6000"
        >${esc(c.note)}</textarea>
      </label>

      <dl>
        <dt>Net ordinary capital gains / losses before inclusion</dt>
        <dd>${fmt(x.raw)} CAD</dd>

        <dt>Supported ordinary inclusion rate</dt>
        <dd>
          ${
            x.rate === null
              ? 'Not enabled for this year'
              : (x.rate * 100) + '%'
          }
        </dd>

        <dt>
          Preview taxable capital gains for 12700 (not tax payable)
        </dt>
        <dd>${fmt(x.taxable)} CAD</dd>

        <dt>Provisional current-year net capital loss, if applicable</dt>
        <dd>
          ${fmt(x.loss)} CAD — review outside this panel;
          not automatically carried forward
        </dd>

        <dt>Current draft 12700</dt>
        <dd>${fmt(draft.lines['12700']?.amount)} CAD</dd>
      </dl>

      <ul>
        ${
          x.blockers.map(t => `<li>${esc(t)}</li>`).join('') ||
          `
            <li>
              No worksheet blockers. Verify complete reporting before applying.
            </li>
          `
        }
      </ul>

      <button
        type="button"
        data-supp-action="s3-apply"
        ${x.blockers.length ? 'disabled' : ''}
      >
        Apply reviewed calculation to 12700
      </button>

      <button
        type="button"
        data-supp-action="s3-export"
      >
        Export Schedule 3 supporting CSV
      </button>

      <p>
        Applying replaces only 12700, preserves notes and marks ENTERED.
        Negative net gains give zero at 12700; the loss is retained in
        this worksheet for separate review. No tax payable, prior-year
        loss claim, gross-up or filing is performed.
      </p>
    </section>
  `;
}
function installSupplementEvents(){
 const ensure=()=>draft.schedule3||(draft.schedule3=freshSchedule3());
 const unconfirm=c=>{c.coverageConfirmed=false;c.overlapConfirmed=false;c.scopeConfirmed=false;};
 host.addEventListener('change',e=>{const t=e.target;if(t.dataset.s3Setting===undefined&&t.dataset.s3Field===undefined)return;e.stopImmediatePropagation();try{const c=ensure();if(t.dataset.s3Setting!==undefined){const k=t.dataset.s3Setting;if(!['coverageConfirmed','overlapConfirmed','scopeConfirmed','note'].includes(k))throw Error('Invalid Schedule setting.');c[k]=t.type==='checkbox'?t.checked:t.value;}else{const r=c.rows[Number(t.dataset.s3Index)],k=t.dataset.s3Field;if(!r||!['included','reviewed','source','account','label','acquisitionYear','date','reason',...S3_NUMBERS].includes(k))throw Error('Invalid Schedule field.');const value=t.type==='checkbox'?t.checked:S3_NUMBERS.includes(k)?parseMoney(t.value):t.value;const proposed={...r,[k]:value};if(k==='reviewed'&&value){const issues=scheduleRowIssues(proposed);if(issues.length)throw Error(issues.join('; '));}r[k]=value;if(!['included','reviewed'].includes(k))r.reviewed=false;unconfirm(c);}touch();render();}catch(err){message=err.message;render();}},true);
 host.addEventListener('click',e=>{const button=e.target.closest('button[data-supp-action]');if(!button)return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;try{if(slipEditorDirty||dispositionDirty)throw Error('Save/cancel the open slip or transaction form first.');const a=button.dataset.suppAction;

 if(a==='apply-t3-other'){
  const x=t3OtherIncomeSummary(draft),next=planT3OtherIncome(draft);
  if(!confirm('REPLACE the WHOLE line 13000 with '+fmt(x.amount)+' CAD (included T3 box26 minus box31)? Current line: '+fmt(draft.lines['13000']?.amount)+' CAD.\n\nThis omits other13000 income and does NOT calculate death-benefit exemptions or other special treatment. Continue only if this unadjusted subtotal is appropriate and complete for your line. Otherwise cancel and enter a supported combined/adjusted total manually.\nNotes are preserved; status becomes ENTERED.'))return;
  draft=next;touch();message='Line13000 replaced from reviewed T3 box26 less box31. Verify whole-line coverage, confirm when appropriate, then save to Sheets.';render();
  host.querySelector('[data-line="13000"][data-field="amount"]')?.scrollIntoView?.({block:'center'});
  return;
 }
 if(a==='apply-benefits'){const x=benefitsSummary(draft),v=employmentSummary(draft),target=button.dataset.target;if(!['11900','23200','43700'].includes(target))throw Error('Invalid benefit target.');if(x.blockers.length||target==='43700'&&v.blockers.length)throw Error([...x.blockers,...(target==='43700'?v.blockers:[])].join('; '));if(target!=='43700'&&!x.slips.length||target==='43700'&&!x.slips.length&&!v.slips.length)throw Error('No applicable included slips.');const amount=target==='43700'?x.totals.withheld+v.totals['43700']:x.totals[target];if(!confirm('REPLACE the WHOLE line '+target+' with '+fmt(amount)+' CAD from '+(target==='43700'?'combined T4/T4E withholding':'the T4E subtotal')+'? Other slips/deductions may apply; retain a supported combined amount instead if needed. Notes are preserved; amount becomes ENTERED.'))return;draft.lines[target]={...emptyLine(),...(draft.lines[target]||{}),amount:Math.round(amount*100)/100,status:'ENTERED',source:target==='43700'?'Combined T4/T4E tax deducted — verify all other withholding':'T4E subtotal — verify whole-line coverage',basisHash:target==='43700'?withholdingBasis(draft):benefitsBasis(draft),componentHash:''};touch();}
 if (a === 's3-use-t5008') {
  const plan = planT5008FilingSelection(
    draft,
    snapshot,
    button.dataset.ref
  );

  const chosen = plan.selected;
  const replaced = plan.replaced;

  const details = [
    'Use reviewed T5008 as the filing source for ' +
      chosen.label + '?',

    'Proceeds CAD: ' + fmt(chosen.proceeds),
    'Reviewed ACB CAD: ' + fmt(chosen.acb),
    'Additional expenses CAD: ' + fmt(chosen.expenses),

    'The selected supporting row will require review again.'
  ];

  if (replaced) {
    details.push(
      'Replace existing supporting-row values: proceeds ' +
      fmt(replaced.proceeds) +
      ', ACB ' + fmt(replaced.acb) +
      ', expenses ' + fmt(replaced.expenses) +
      ', adjustment ' + fmt(replaced.adjustment) +
      '. Amount corrections/adjustments reset to current ' +
      'reviewed T5008 source values; notes retained.'
    );
  }

  details.push(...plan.warnings);
  details.push(
    ...plan.excluded.map(x =>
      'Exclude imported row ' + x.label +
      ': proceeds ' + fmt(x.proceeds) +
      ', ACB ' + fmt(x.acb)
    )
  );

  details.push(
    'Original trades and ACB pools remain unchanged. ' +
    'Line 12700 is NOT replaced.'
  );

  if (!confirm(details.join('\n'))) return;

  draft = plan.draft;
  touch();

  message =
    'T5008 filing source selected in memory. ' +
    'Review the row, reconfirm coverage/overlap/scope, ' +
    'then apply 12700 and save to Sheets.';

  scheduleFeedback = 'Last Schedule 3 action: added ' + chosen.label +
    ' at the TOP of the supporting table with Include checked and Reviewed unchecked. ' +
    plan.excluded.length + ' matching imported row(s) excluded. ' + plan.warnings.join(' ') +
    ' Review the row, then apply 12700 and save to Sheets.';
  render();
  const selectedControl = host.querySelector('input[data-s3-field="included"][data-s3-index="0"]');
  const selectedRow = selectedControl?.closest('tr');
  if (selectedRow) {
    selectedRow.style.outline = '2px solid #8ed1ff';
    selectedRow.scrollIntoView?.({block:'center', inline:'nearest'});
    selectedControl.focus?.({preventScroll:true});
  }
  return;
}

 if(a.startsWith('s3-')){const c=ensure(),items=scheduleCandidates(draft,snapshot);const add=item=>{if(!item||item.issues.length)throw Error(item?.issues.join('; ')||'Source unavailable.');if(c.rows.some(r=>r.origin===item.row.origin&&r.ref===item.row.ref))throw Error('Source already added (include its existing row instead).');c.rows.push({...item.row,id:'s3:'+Date.now()+':'+Math.random().toString(36).slice(2,10)});};
 if(a==='s3-add'){add(items[Number(button.dataset.index)]);unconfirm(c);touch();}
 if(a==='s3-add-imports'){const eligible=items.filter(v=>v.row.origin==='IMPORT'&&!v.issues.length&&!c.rows.some(r=>r.origin===v.row.origin&&r.ref===v.row.ref));if(!eligible.length)throw Error('No new eligible imported rows. Confirm account settings and source availability.');if(!confirm('Add '+eligible.length+' imported sales as UNREVIEWED Schedule 3 rows? Imported proceeds are net; choose one representation for each sale and do not duplicate T5008 totals.'))return;eligible.forEach(add);unconfirm(c);touch();}
 if(a==='s3-manual'){c.rows.push({id:'s3:manual:'+Date.now()+':'+Math.random().toString(36).slice(2,10),origin:'MANUAL',ref:'',source:'OTHER',account:'',label:'',acquisitionYear:'',date:'',proceeds:null,acb:null,expenses:null,capitalAmount:null,adjustment:0,reason:'',included:true,reviewed:false,upstreamHash:'',linkedImportKey:''});unconfirm(c);touch();}
 if(a==='s3-remove'){if(confirm('Remove this Schedule 3 supporting row? Original imported trades/slips remain unchanged.')){c.rows.splice(Number(button.dataset.index),1);unconfirm(c);touch();}}
 if(a==='s3-refresh'){const r=c.rows[Number(button.dataset.index)],v=items.find(x=>x.row.origin===r?.origin&&x.row.ref===r?.ref);if(!v||v.issues.length)throw Error(v?.issues.join('; ')||'Source unavailable. Restore/review the source or exclude/remove this row.');if(!confirm('Replace this Schedule 3 row with current source values? Manual amount corrections and adjustments will be reset; notes/acquisition year retained. Review again before applying.'))return;Object.assign(r,v.row,{id:r.id,acquisitionYear:r.acquisitionYear,reason:r.reason,reviewed:false});unconfirm(c);touch();}
 if(a==='s3-apply'){validateDraft(draft);const x=scheduleSummary(draft,snapshot);if(x.blockers.length)throw Error(x.blockers.join('; '));if(!confirm('REPLACE line 12700 with '+fmt(x.taxable)+' CAD? Net ordinary gains/losses '+fmt(x.raw)+' × '+(x.rate*100)+'%, floored at zero for T1. This is taxable income, not tax payable. Prior-year losses remain separate at 25300.'))return;draft.lines['12700']={...emptyLine(),...(draft.lines['12700']||{}),amount:x.taxable,status:'ENTERED',source:'Reviewed ordinary Schedule 3 supporting calculation — '+draft.year,basisHash:scheduleBasis(draft,snapshot),componentHash:''};touch();}
 if(a==='s3-export'){const x=scheduleSummary(draft,snapshot),quote=v=>'"'+String(v??'').replace(/^[=+@\t\r\n-]/,"'$&").replace(/"/g,'""')+'"',rows=[['Taxpayer','Year','Origin','Source','Account','Description','Acquisition year','Disposition date','Proceeds CAD (source basis; net for imports)','ACB CAD','Additional expenses CAD','Slip gain CAD','Gain adjustment CAD','Raw adjusted gain/loss CAD','Review issues','Evidence'],...x.rows.map(({record:r,gain,issues})=>[draft.taxpayer.name,draft.year,r.origin,r.source,r.account,r.label,r.acquisitionYear,r.date,r.proceeds??'',r.acb??'',r.expenses??'',r.capitalAmount??'',r.adjustment,gain??'',issues.join('; '),r.reason]),['SUMMARY',draft.year,'Net ordinary gain/loss',x.raw],['SUMMARY',draft.year,'Inclusion rate',x.rate??''],['SUMMARY',draft.year,'Preview 12700',x.taxable??''],['SUMMARY',draft.year,'Provisional loss',x.loss??''],...x.blockers.map(t=>['BLOCKER',draft.year,t])];download('Schedule3_support_'+draft.taxpayer.id+'_'+draft.year+'.csv','\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8;');}}
 render();}catch(err){
  message=err.message;
  if(button.dataset.suppAction.startsWith('s3-')) scheduleFeedback='Last Schedule 3 action blocked: '+err.message;
  render();
  host.querySelector('[data-s3-feedback]')?.scrollIntoView?.({block:'center'});
 }},true);
}


let forms5Tab='cpp';
function forms5UI(){
 const all=forms5State(draft),key=forms5Tab,f=all[key],r=form5Summary(draft,key,snapshot);
 const titles={cpp:'Schedule 8 — CPP support',rental:'T776 — rental support',employment:'T777 — employment-expense support',income:'Line 15000 — total-income calculation'};
 const num=(k,label,v)=>`<label>${esc(label)}<input inputmode="decimal" data-f5-key="${key}" data-f5-field="${k}" value="${esc(v??'')}"></label>`;
 const note=key==='income'?f.note:f.note;
 let body='';
 if(key==='income')body=num('extra','Other applicable income NOT in the listed lines (explicit 0 if none)',f.extra)+`<p>Enter only the net total of other applicable income lines: e.g.10400, pensions including11500, business net income, other payments14700. Do not repeat12599 gross rent, taxable dividend subsets12010, raw capital gains, or components already on displayed lines. This is NOT a complete list of the return’s income lines.</p><label><input type="checkbox" data-f5-key="income" data-f5-field="coverage" ${f.coverage?'checked':''}> All applicable total-income sources are accounted for exactly once, including unlisted income and required residency/year treatment.</label>`;
 else{
  body=`<label>Calculation method<select data-f5-key="${key}" data-f5-field="mode">${[['BASIC','Limited supporting calculation'],['EXTERNAL','Reviewed result from official form/software'],['NONE','Explicitly not applicable / zero']].map(([v,t])=>`<option value="${v}" ${f.mode===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
  if(f.mode==='BASIC'){
   if(key==='cpp')body+=`<p>2025 Schedule8 Part3, including Part3a and3b, using ALL included reviewed T4s. Part2 is restricted to12-month eligibility: B71300, C9900, D81200, E3500. Check scope only if you had no Quebec earned income or QPP, no self-employment/Part5 income or election for additional CPP, no CPP retirement commencement requiring basic-exemption proration, and no age/disability/election/death proration. Other cases require EXTERNAL reviewed results.</p><p>Box26 is used for each slip, falling back to box14 only when box26 is blank; explicit box26=0 stays0. Line8 uses box16 totals; line21 uses box16A totals (enter explicit0 if none). Positive line24 follows3a:30800=line25,22215=line28,44800=line29. Otherwise3b:30800=line36,22215=line48,44800=0. Amounts are rounded in integer cents; no dollar-to-cent conversion is applied twice.</p>`;
   if(key==='rental')body+=`<p>2025 basic scope: ordinary eligible rental, 100% owned, no personal use, no CCA/recapture/terminal loss, partnership, non-compliant short-term rental, capital-expense classification issue or special adjustment. Enter reviewed allowable CURRENT expenses only; not mortgage principal or capital improvements. Co-ownership/allocations, CCA and special cases require EXTERNAL mode. No automatic CCA calculation is implemented.</p><button type="button" data-f5-action="add-property">Add property</button>${f.properties.map((p,i)=>`<fieldset><legend>Property ${i+1}</legend><label><input type="checkbox" data-f5-prop="${i}" data-f5-field="included" ${p.included?'checked':''}> Include</label><label>Description<input data-f5-prop="${i}" data-f5-field="label" maxlength="300" value="${esc(p.label)}"></label>${F5_RENT.map(k=>`<label>${esc(k)} CAD<input inputmode="decimal" data-f5-prop="${i}" data-f5-field="${k}" value="${esc(p[k]??'')}"></label>`).join('')}<button type="button" data-f5-action="remove-property" data-index="${i}">Remove supporting property</button></fieldset>`).join('')}`;
   if(key==='employment')body+=`<p>2025 support only: enter ALREADY DETERMINED ALLOWABLE amounts from your T777 workings, after reimbursements, personal-use allocation and limits. This panel sums those amounts; it does NOT decide eligibility, calculate motor-vehicle/CCA limits, commission-employee limits, work-space apportionment, income caps or carryforwards. Workspace must already be the allowable amount AFTER its income limit. Complete those calculations externally first, or use EXTERNAL for the final T777 result. Review T2200/employer certification where required. This is not a salary-based automatic deduction.</p>${F5_EMP.map(k=>num('expense:'+k,'Reviewed allowable '+k+' CAD',f.expenses[k])).join('')}`;
  }
  if(f.mode==='EXTERNAL'){
   if(key==='cpp')body+=num('deduction','Official reviewed22215 deduction',f.deduction)+num('base','Official reviewed30800 contribution credit BASE (not tax credit at a rate)',f.base)+num('overpayment','Official reviewed44800 overpayment',f.overpayment);
   if(key==='rental')body+=num('gross','Official reviewed12599 gross rental income',f.gross)+num('net','Official reviewed12600 net income / loss (negative permitted)',f.net);
   if(key==='employment')body+=num('amount','Official reviewed22900 allowable expense claim',f.amount);
  }
  if(f.mode==='NONE')body+='<p>This explicitly replaces the affected lines with zero after approval. No missing input is inferred as zero.</p>';
  body+=`<label><input type="checkbox" data-f5-key="${key}" data-f5-field="scope" ${f.scope?'checked':''}> I verified eligibility and records; the displayed BASIC restrictions all apply, or I have completed the correct official schedules externally. This is not a tax-compliance certification.</label><label><input type="checkbox" data-f5-key="${key}" data-f5-field="reviewed" ${f.reviewed?'checked':''}> I reviewed these inputs/results for this taxpayer and tax year.</label>`;
 }
 return `<section class="t1-supporting-forms"><h3>Supporting forms and total income</h3><nav class="t1-controls">${Object.entries(titles).map(([k,t])=>`<button type="button" data-f5-action="open" data-name="${k}" aria-pressed="${key===k}">${esc(t)}</button>`).join('')}</nav><h4>${esc(titles[key])}</h4><p>Supporting worksheets, NOT complete reproductions of the official forms. Read scope restrictions before using any result. Unsupported cases require reviewed official-form/software results.</p>${body}<label>Evidence / form references / unlisted income details<textarea maxlength="6000" data-f5-key="${key}" data-f5-field="note">${esc(note)}</textarea></label><div>${r.steps.map(t=>`<div>${esc(t)}</div>`).join('')}</div><ul>${Object.entries(r.results).map(([c,v])=>`<li>Proposed ${c}: ${fmt(v)} CAD; current line: ${fmt(draft.lines[c]?.amount)} CAD.</li>`).join('')}${r.blockers.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><button type="button" data-f5-action="apply" data-name="${key}" ${r.blockers.length?'disabled':''}>Apply reviewed result(s) to T1 draft</button><p>Approval replaces the WHOLE affected line(s), preserves notes and marks ENTERED. It does not add to existing totals, confirm the lines or save to Sheets automatically.</p></section>`;
}
function income15000Details(){
 const r=form5Summary(draft,'income',snapshot);
 return `<div class="t1-income-breakdown"><small>Displayed-income calculation (not complete until all sources are reviewed):</small>${r.steps.map(t=>`<small>${esc(t)}</small>`).join('')}<small>Proposed15000 = ${fmt(r.results['15000'])} CAD</small>${r.blockers.map(t=>`<small>${esc(t)}</small>`).join('')}<button type="button" data-f5-action="open" data-name="income">Review / apply total income</button></div>`;
}
function installForms5Events(){
 const ensure=()=>draft.forms5||(draft.forms5=freshForms5());
 host.addEventListener('change',e=>{const t=e.target;if(t.dataset.f5Key===undefined&&t.dataset.f5Prop===undefined)return;e.stopImmediatePropagation();if(busy)return;try{const f=ensure(),field=t.dataset.f5Field;
  if(t.dataset.f5Prop!==undefined){const p=f.rental.properties[Number(t.dataset.f5Prop)];if(!p||!['label','included',...F5_RENT].includes(field))throw Error('Invalid property field.');p[field]=t.type==='checkbox'?t.checked:field==='label'?t.value:parseMoney(t.value);f.rental.reviewed=false;f.rental.scope=false;}
  else{const key=t.dataset.f5Key,a=f[key];if(!a)throw Error('Invalid form.');if(field.startsWith('expense:')){const name=field.slice(8);if(key!=='employment'||!F5_EMP.includes(name))throw Error('Invalid expense.');a.expenses[name]=parseMoney(t.value);}else{if(!Object.hasOwn(a,field)||['properties','expenses'].includes(field))throw Error('Invalid form field.');a[field]=t.type==='checkbox'?t.checked:['note','mode'].includes(field)?t.value:parseMoney(t.value);}if(key==='income'){if(field!=='coverage')a.coverage=false;}else if(!['reviewed','scope'].includes(field)){a.reviewed=false;a.scope=false;}}
  touch();render();
 }catch(err){message=err.message;render();}},true);
 host.addEventListener('click',e=>{const b=e.target.closest('button[data-f5-action]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;try{
  if(slipEditorDirty||dispositionDirty)throw Error('Save/cancel the open slip/transaction editor first.');
  const a=b.dataset.f5Action,key=b.dataset.name;
  if(a==='open'){if(!['cpp','rental','employment','income'].includes(key))throw Error('Invalid form.');forms5Tab=key;draft.step=2;touch();render();host.querySelector('.t1-supporting-forms')?.scrollIntoView?.({block:'start'});return;}
  if(a==='add-property'){const f=ensure();if(f.rental.properties.length>=25)throw Error('Maximum25 supporting properties.');f.rental.properties.push({id:'property:'+Date.now()+':'+Math.random().toString(36).slice(2,8),label:'',included:true,...Object.fromEntries(F5_RENT.map(k=>[k,null]))});f.rental.reviewed=false;f.rental.scope=false;touch();}
  if(a==='remove-property'){if(!confirm('Remove this supporting property? Previously applied T1 amounts are not automatically replaced.'))return;const f=ensure();f.rental.properties.splice(Number(b.dataset.index),1);f.rental.reviewed=false;f.rental.scope=false;touch();}
  if(a==='apply'){if(!['cpp','rental','employment','income'].includes(key))throw Error('Invalid form.');const r=form5Summary(draft,key,snapshot),next=planForm5(draft,key,snapshot);const prompt=['REPLACE WHOLE T1 lines with these reviewed '+key+' results?',...Object.entries(r.results).map(([c,v])=>c+': '+fmt(draft.lines[c]?.amount)+' -> '+fmt(v)+' CAD'),...r.steps,'Other applicable amounts may exist. Cancel if these are incomplete whole-line totals. Notes kept; status ENTERED, not CONFIRMED. No Sheets save or filing is performed.'];if(!confirm(prompt.join('\n')))return;draft=next;touch();message='Supporting '+key+' results applied as ENTERED. Review and save draft to Sheets.';}
  render();
 }catch(err){message=err.message;render();}},true);
}


function foreign25UI(){
 const f=draft.foreignTax||freshForeign25(),r=foreign25Summary(draft),money=(field,label)=>`<label>${esc(label)} CAD<input inputmode="decimal" data-ft25-field="${field}" value="${esc(f[field]??'')}"></label>`;
 const fields={netIncome:'T2209 adjusted net income — note3, AFTER the selected deductions (not automatically23600)',tax42900:'T1 line42900 basic federal tax AFTER the selected deductions',dividend40425:'Federal dividend tax credit40425',ab63:'AB428 line63 AFTER the selected deductions',ab68:'AB428 line68 AFTER the selected deductions',other23200:'Other23200 deductions EXCLUDING the foreign tax listed below'};
 return `<section id="foreign-tax-v2"><h3>T2209 / T2036 — Alberta2025</h3><p>Amounts are CAD, reviewed and already converted. One row per country; retain source/account details in references. No FX-rate fetching or automatic eligibility/treaty determination. This worksheet is saved with this taxpayer/year draft, not shared browser local storage.</p>
 <label>Method<select data-ft25-field="mode">${[['CALC','Calculate non-business credits from reviewed inputs'],['EXTERNAL','Reviewed official-form/software results'],['NONE','Explicit no foreign credit/deduction']].map(([v,t])=>`<option value="${v}" ${f.mode===v?'selected':''}>${t}</option>`).join('')}</select></label>
 ${f.mode==='CALC'?`<p>Supported: full-year Canadian/Alberta resident, non-business foreign income only; no minimum tax, T2203 multi-jurisdiction allocation, surtax, Quebec/First Nations abatement, pension splitting, business credit/carryovers, or other special adjustments. Note3 adjusted net income must be calculated with ALL applicable deductions, not merely copied from23600. Note4 basic federal tax is42900+40425 only within this restricted scope. T2036 Alberta tax otherwise payable=AB428 line63+line68.</p><p>The20(11)/20(12) fields are REVIEWED eligible deduction choices, not an optimizer. Eligible tax must exclude refundable/treaty-excess/TFSA/exempt/other-person amounts and satisfy applicable property-tax-credit restrictions. Do not also deduct these taxes in T776. Countries with net losses or unsupported eligibility/limits use EXTERNAL.</p>${Object.entries(fields).map(([k,v])=>money(k,v)).join('')}
 <button type="button" data-ft25-action="add">Add country</button>${f.countries.map((c,i)=>`<fieldset><legend>Country ${i+1}</legend><label>Country<input data-ft25-row="${i}" data-ft25-field="country" value="${esc(c.country)}" maxlength="120"></label>${[['netBefore','Net foreign income after other allowable expenses, BEFORE20(11)/(12)'],['taxBefore','Reviewed eligible foreign income tax, BEFORE20(11)/(12)'],['d11','Reviewed tax deductible under20(11) (explicit0 if none)'],['d12','Selected allowable20(12) deduction (explicit0 if none)']].map(([k,l])=>`<label>${l} CAD<input inputmode="decimal" data-ft25-row="${i}" data-ft25-field="${k}" value="${esc(c[k]??'')}"></label>`).join('')}<label>Source/account references and eligibility/deduction evidence<textarea data-ft25-row="${i}" data-ft25-field="reference" maxlength="3000">${esc(c.reference)}</textarea></label><button type="button" data-ft25-action="remove" data-index="${i}">Remove country</button></fieldset>`).join('')}
 <p>Changing deductions requires you to recompute the full return and re-enter adjusted net income,42900 and AB428 inputs before checking scope/review again. This app does NOT recompute tax brackets or optimize20(12). Do not apply results based on pre-deduction tax figures.</p>`:f.mode==='EXTERNAL'?money('externalFederal','Completed T2209 line13 / COMPLETE40500')+money('externalAlberta','Completed T2036 total line5')+money('external23200','COMPLETE23200 including non-foreign deductions'):money('other23200','Other non-foreign23200 deductions (retained with no foreign claim)')}
 <label>Return recalculation / form references<textarea maxlength="6000" data-ft25-field="note">${esc(f.note)}</textarea></label>
 <label><input type="checkbox" data-ft25-field="scope" ${f.scope?'checked':''}> I verified the displayed CALC restrictions, tax eligibility/limits, absence of double claims, and that all return inputs reflect the selected deductions; otherwise I used completed official EXTERNAL results.</label>
 <label><input type="checkbox" data-ft25-field="reviewed" ${f.reviewed?'checked':''}> I reviewed this taxpayer/year’s results and COMPLETE T1 line totals.</label>
 ${r.countries.map(c=>`<h4>${esc(c.country)}</h4><p>T2209: line1=${fmt(c.t2209.line1)}; line43300 numerator=${fmt(c.t2209.netForeign)}; line2=${fmt(c.t2209.line2)}; line3/12/13=${fmt(c.t2209.line3)}.</p><p>T2036: line1=${fmt(c.t2036.line1)}; line2=${fmt(c.t2036.line2)}; line3=${fmt(c.t2036.line3)}; line4=${fmt(c.t2036.line4)}; line5=${fmt(c.t2036.line5)}.</p><p>Selected foreign-tax deductions=${fmt(c.deduction)}; unused eligible-tax remainder=${fmt(c.unused)} (NOT automatically deductible).</p>`).join('')}
 <p>Proposed COMPLETE40500=${fmt(r.federal)}; COMPLETE23200=${fmt(r.total23200)}; Alberta foreign credit=${fmt(r.alberta)}.</p>
 <ul>${r.blockers.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
 <button type="button" data-ft25-action="apply" ${r.blockers.length?'disabled':''}>Review / replace40500 and23200</button><button type="button" data-ft25-action="provincial" ${r.blockers.length?'disabled':''}>Accept Alberta credit in supporting worksheet only</button>
 <p>Accepted Alberta support: ${fmt(f.provincial.amount)} ${f.provincial.basis&&f.provincial.basis!==foreign25Basis(draft)?'— NEEDS REVIEW':''}. This never writes40500 or replaces42800. Carry the accepted credit to the provincial foreign-credit line of AB428; calculate the complete provincial return separately.</p><p>Apply preserves line notes, sets ENTERED, and replaces WHOLE lines after approval. Save draft to Sheets explicitly to persist. Unrelated income, CPP, ACB and transaction records are not changed.</p></section>`;
}
function installForeign25Events(){
 const ensure=()=>draft.foreignTax||(draft.foreignTax=freshForeign25());
 host.addEventListener('change',e=>{const t=e.target;if(t.dataset.ft25Field===undefined)return;e.stopImmediatePropagation();if(busy)return;try{const f=ensure(),k=t.dataset.ft25Field;if(t.dataset.ft25Row!==undefined){const c=f.countries[Number(t.dataset.ft25Row)];if(!c||!['country','netBefore','taxBefore','d11','d12','reference'].includes(k))throw Error('Invalid country field.');const value=['country','reference'].includes(k)?t.value:parseMoney(t.value);c[k]=value;}else{if(!Object.hasOwn(f,k)||['countries','provincial','version'].includes(k))throw Error('Invalid foreign-tax field.');f[k]=t.type==='checkbox'?t.checked:['mode','note'].includes(k)?t.value:parseMoney(t.value);}if(!['scope','reviewed'].includes(k)){f.scope=false;f.reviewed=false;}touch();render();}catch(err){message=err.message;render();}},true);
 host.addEventListener('click',e=>{const b=e.target.closest('button[data-ft25-action]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;try{if(slipEditorDirty||dispositionDirty)throw Error('Save or cancel the open editor first.');const a=b.dataset.ft25Action;if(a==='add'){const f=ensure();if(f.countries.length>=40)throw Error('Maximum40 countries.');f.countries.push({id:'country:'+Date.now()+':'+Math.random().toString(36).slice(2),country:'',netBefore:null,taxBefore:null,d11:null,d12:null,reference:''});f.reviewed=false;f.scope=false;touch();}else if(a==='remove'){if(!confirm('Remove this country worksheet? Previously applied T1 amounts stay unchanged until reapplied.'))return;const f=ensure();f.countries.splice(Number(b.dataset.index),1);f.scope=false;f.reviewed=false;touch();}else{const r=foreign25Summary(draft),prov=a==='provincial';if(!['apply','provincial'].includes(a))throw Error('Invalid action.');const next=planForeign25(draft,prov);if(!confirm(prov?'Accept Alberta worksheet credit '+fmt(r.alberta)+' CAD? This does NOT change40500,42800 or any provincial tax return. Save draft explicitly.':'REPLACE COMPLETE T1 lines?\n40500: '+fmt(draft.lines['40500']?.amount)+' -> '+fmt(r.federal)+'\n23200: '+fmt(draft.lines['23200']?.amount)+' -> '+fmt(r.total23200)+'\nCAD. Confirm other23200 deductions are included and all return inputs reflect selected foreign-tax deductions. Notes retained; ENTERED only; not automatically saved.'))return;draft=next;touch();message='Foreign-tax result accepted. Review and save draft explicitly.';}render();}catch(err){message=err.message;render();}},true);
}

function newInvestmentUI(){
 migrateInvestment(draft);const tab=draft.investmentTab,view=INVESTMENT_TABS[tab];
 return `<section class="t1-investment-inputs"><h3>Tax slips and investment inputs</h3><p>Taxpayer ${esc(draft.taxpayer.name)} / ${draft.year}. Enter box amounts in CAD for this taxpayer’s supported share. No PDF/OCR extraction is performed: totals are extracted from the box fields you enter. Original slip documents remain your evidence.</p><nav class="t1-controls" aria-label="Investment input tabs">${[5,7,0,1,6,8,2,3,4].map(i=>{const label=INVESTMENT_TABS[i];return `<button type="button" data-inv-action="tab" data-index="${i}" aria-pressed="${i===tab}">${esc(label)}</button>`;}).join('')}</nav><h4>${esc(view)}</h4>${tab===7?slipTab('T4E')+benefitsTab():tab===8?scheduleTab():tab===5?slipTab('T4')+employmentTab():tab===6?dispositionTab():tab===0||tab===1?slipTab(tab===0?'T5':'T3'):tab===2?hsbcTab():tab===3?otherTab():summaryTab()+employmentTab()+benefitsTab()+dispositionOverview()}</section>`;
}
function slipTab(type){
 const all=draft.slips,active=new Set(activeSlips(draft).map(s=>s.id)),items=all.map((slip,index)=>({slip,index})).filter(x=>x.slip.type===type);
 return `<button type="button" data-inv-action="add-slip" data-type="${type}">Add ${type} slip</button><p>${type==='T4E'?'Line 11900 uses box 14 minus box 18. Boxes 15/17/33/36/37 are not added again. Box 30 is separate deduction support; box 7 is a percentage, not CAD.':type==='T4'?'Box 14 includes commissions/benefits reported within it; do not add boxes 40/42 again. CPP/QPP and EI fields are supporting inputs, not automatic final credit/deduction claims.':'Use taxable Canadian dividend boxes directly; do not gross up again.'} Store amended slips as replacement amounts, not differences. Confirming a slip means its blank supported boxes are not applicable, and its entered amounts belong to this taxpayer/year in CAD. Conditional and unmapped boxes require separate treatment.</p><div class="t1-scroll"><table><thead><tr><th>Include</th><th>Issuer / account / reference</th><th>Version</th><th>Status</th><th>Action</th></tr></thead><tbody>${items.map(({slip:t,index})=>`<tr><td><input type="checkbox" data-inv-include="${index}" ${t.included?'checked':''} ${t.state==='CANCELLED'?'disabled':''} aria-label="Include ${esc(slipLabel(t))}"></td><td>${esc(slipLabel(t))}</td><td>${esc(t.state)}${t.replaces?'<small>Replaces '+esc(all.find(s=>s.id===t.replaces)?.reference||t.replaces)+'</small>':''}</td><td>${active.has(t.id)?(slipIssues(t).length?'Needs review: '+esc(slipIssues(t).join('; ')):'Included — confirmed'):(t.included?'Superseded / cancelled':'Excluded')}</td><td><button type="button" data-inv-action="edit-slip" data-index="${index}">Edit</button> <button type="button" data-inv-action="remove-slip" data-index="${index}">Remove</button></td></tr>`).join('')||'<tr><td colspan="5">No slips entered.</td></tr>'}</tbody></table></div>${slipEditor&&slipEditor.type===type?slipEditorUI():''}${type==='T3'?t3OtherIncomeTab():''}`;
}
function slipEditorUI(){const e=slipEditor;return `<fieldset><legend>${esc(e.type)} slip entry — ${esc(draft.taxpayer.name)} / ${draft.year}</legend><div class="t1-controls">${[['issuer','Issuer *'],['account','Account / statement reference'],['reference','Unique slip reference']].map(([k,label])=>`<label>${label}<input data-inv-field="${k}" value="${esc(e[k])}" maxlength="300"></label>`).join('')}<label>Version<select data-inv-field="state">${['ORIGINAL','AMENDED','CANCELLED'].map(v=>`<option ${e.state===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Earlier slip replaced (amended only)<select data-inv-field="replaces"><option value="">None</option>${draft.slips.filter(s=>s.type===e.type&&s.id!==e.id).map(s=>`<option value="${esc(s.id)}" ${e.replaces===s.id?'selected':''}>${esc(slipLabel(s))}</option>`).join('')}</select></label></div><div class="t1-scroll"><table><thead><tr><th>Box</th><th>Meaning / destination</th><th>${e.type==='T4E'?'CAD amount / box 7 %':'CAD amount'}</th></tr></thead><tbody>${Object.entries(SLIP_BOXES[e.type]).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([k,label])=>`<tr><td>${k}</td><td>${esc(label)}</td><td><input data-inv-box="${k}" inputmode="decimal" value="${esc(e.boxes[k]??'')}" placeholder="Not entered / not applicable" aria-label="${e.type} box ${k}"></td></tr>`).join('')}</tbody></table></div>${[['included','Include this slip (unless superseded/cancelled)'],['cadConfirmed','Amounts are CAD; any required conversion has been checked and is not applied twice'],['ownershipConfirmed','This slip belongs to the selected taxpayer/year and amounts are their supported share'],['otherBoxesReviewed','Conditional/unmapped boxes are handled separately; they are not part of these proposed totals'],['confirmed','Reviewed: supported boxes are complete; blank supported boxes are not applicable']].map(([k,label])=>`<label><input type="checkbox" data-inv-field="${k}" ${e[k]?'checked':''}> ${esc(e.type==='T4E'&&k==='otherBoxesReviewed'?'Repayment chart, tuition and province-specific items reviewed separately; included boxes are not counted twice':label)}</label>`).join('')}<label>Evidence / notes<textarea data-inv-field="note" maxlength="6000">${esc(e.note)}</textarea></label><button type="button" data-inv-action="save-slip">Save slip to draft</button><button type="button" data-inv-action="cancel-slip">Cancel editing</button><p>Save slip updates only the in-memory draft. Use “Save draft to Sheets” to persist it. Amending a slip excludes the replaced record while retaining it for reference.</p></fieldset>`;}
function hsbcTab(){return `<p>Accepted HSBC foreign investment income is a named component of line 12100, separate from entered T5/T3 slips. Select the relevant payments, then accept the subtotal. Registered accounts and accounts not explicitly assigned to this taxpayer are not suggested. Gross CAD is used, not net dividend cash.</p>${candidates.map((g,i)=>{const c=draft.contributions.find(c=>c.id===g.id);return `<details open><summary>HSBC / ${esc(g.account)} — candidate gross ${fmt(g.amount)} CAD${g.missing?' · '+g.missing+' missing CAD amount(s) excluded':''}</summary><label><input type="checkbox" data-inv-hsbc-all="${i}"> Select all eligible rows in this account</label><div class="t1-scroll"><table><thead><tr><th>Include</th><th>Date</th><th>Symbol</th><th>Classification — verify</th><th>Gross CAD</th></tr></thead><tbody>${g.rows.map((r,j)=>{const allowed=hsbcRowAllowed(r),checked=c?.rowKeys?c.rowKeys.includes(rowKey(r,j)):allowed;return `<tr><td><input type="checkbox" data-inv-hsbc-row="${i}" data-row-index="${j}" ${allowed?'':'disabled'} ${allowed&&checked?'checked':''} aria-label="Select ${esc(r.date+' '+r.symbol)}"></td><td>${esc(r.date)}</td><td>${esc(r.symbol)}</td><td>${esc(r.classification)}</td><td>${fmt(r.grossCad)}</td></tr>`;}).join('')}</tbody></table></div><button type="button" data-inv-action="accept-hsbc" data-index="${i}" ${snapshot?.dividendError?'disabled':''}>Use/update selected HSBC component</button></details>`;}).join('')||'<p>No eligible HSBC accounts loaded. Refresh suggestions and verify account settings; this does not establish zero income.</p>'}<p>Known return-of-capital/capital-gain classifications and missing amounts cannot be selected. Other fund distributions still require your classification decision. The current dividend snapshot does not include HSBC interest: add verified HSBC interest in Other Income instead of assuming it is zero.</p>${componentTable('HSBC')}`;}
function componentTable(kind){const rows=draft.contributions.map((c,index)=>({c,index})).filter(x=>x.c.kind===kind);return `<div class="t1-scroll"><table><thead><tr><th>Include</th><th>Component</th><th>T1 line</th><th>CAD</th><th>State</th><th>Action</th></tr></thead><tbody>${rows.map(({c,index})=>`<tr><td><input type="checkbox" data-inv-component-include="${index}" ${c.included?'checked':''} aria-label="Include ${esc(c.label)}"></td><td>${esc(c.label)}</td><td>${esc(componentTarget(c))}</td><td>${fmt(c.amount)}</td><td>${c.kind==='HSBC'?(candidates.some(g=>g.id===c.id&&g.snapshot===c.snapshot)?'Current accepted component':'Changed/unavailable — review'):'Manual component — verify no slip duplication'}</td><td><button type="button" data-inv-action="remove-component" data-index="${index}">Remove</button></td></tr>`).join('')||'<tr><td colspan="6">No components.</td></tr>'}</tbody></table></div>`;}
function otherTab(){return `<p>Use this for supported amounts not already on an included slip or HSBC dividend component: for example, additional bank interest, HSBC interest, or a separately supported adjustment. Old manual components are retained here and still default to line 12100. Do not include a whole IBKR slip again after entering its boxes.</p><button type="button" data-inv-action="manual">Add other/manual component</button>${componentTable('MANUAL')}`;}
function summaryTab(){const x=investmentSummary(draft,candidates,!!snapshot);return `<p>These are proposed totals, not automatically confirmed T1 amounts. Slips are the primary inputs for IBKR; imported IBKR dividends are not added. HSBC accepted components are added to 12100 once. Review the entire breakdown before applying.</p><div class="t1-scroll"><table><thead><tr><th>Destination</th><th>Component</th><th>CAD</th></tr></thead><tbody>${x.rows.map(r=>`<tr><td>${esc(r.line)}</td><td>${esc(r.label)}</td><td>${fmt(r.amount)}</td></tr>`).join('')||'<tr><td colspan="3">No included amounts. A proposed zero is not evidence that all income is covered.</td></tr>'}</tbody></table></div><dl><dt>Proposed line 12000</dt><dd>${fmt(x.totals['12000'])}</dd><dt>Supporting line 12010 subset — entered slips only (not added again)</dt><dd>${fmt(x.totals['12010'])}</dd><dt>Current draft line 12000</dt><dd>${fmt(draft.lines['12000']?.amount)}</dd><dt>Proposed line 12100 — including HSBC components</dt><dd>${fmt(x.totals['12100'])}</dd><dt>Current draft line 12100</dt><dd>${fmt(draft.lines['12100']?.amount)}</dd><dt>Dividend credit support for 40425</dt><dd>${fmt(x.totals['40425'])}</dd><dt>Foreign tax paid support — NOT automatically 40500</dt><dd>${fmt(x.totals.foreignTaxPaid)}</dd></dl><label><input type="checkbox" data-inv-duplicate-reviewed ${draft.slipReviewConfirmed?'checked':''}> I reviewed manual/legacy components and excluded amounts already represented by the included slips</label><h4>Before applying</h4><ul>${x.blockers.map(n=>`<li>${esc(n)}</li>`).join('')||'<li>No input blockers detected. Verify all sources and applicable tax treatment.</li>'}${x.notices.map(n=>`<li>${esc(n)}</li>`).join('')}</ul><button type="button" data-inv-action="apply-lines" ${x.blockers.length?'disabled':''}>Apply 12000 and 12100 to T1 draft</button><button type="button" data-inv-action="apply-credit" ${x.blockers.length?'disabled':''}>Apply dividend-credit support to 40425</button><button type="button" data-inv-action="export-breakdown">Export investment breakdown CSV</button><p>Applying REPLACES the whole selected line amounts and marks them ENTERED, not CONFIRMED. Empty sources require explicit zero confirmation; prior amounts are never added on top. Other interest/income, all relevant slips and conditional boxes still need review.</p>`;}
function installInvestmentEvents(){
 host.addEventListener('input',e=>{const t=e.target;if(t.dataset.invField===undefined&&t.dataset.invBox===undefined)return;if(!slipEditor)return;e.stopImmediatePropagation();if(t.dataset.invBox!==undefined){slipEditor.boxes[t.dataset.invBox]=t.value;}else slipEditor[t.dataset.invField]=t.type==='checkbox'?t.checked:t.value;slipEditorDirty=true;touch();},true);
 host.addEventListener('change',e=>{const t=e.target;
  try{
   if(t.dataset.invField!==undefined||t.dataset.invBox!==undefined){e.stopImmediatePropagation();if(slipEditor){if(t.dataset.invBox!==undefined)slipEditor.boxes[t.dataset.invBox]=t.value;else slipEditor[t.dataset.invField]=t.type==='checkbox'?t.checked:t.value;slipEditorDirty=true;touch();}return;}
   if(t.dataset.invHsbcRow!==undefined){e.stopImmediatePropagation();return;}
   if(t.dataset.invHsbcAll!==undefined){e.stopImmediatePropagation();host.querySelectorAll('[data-inv-hsbc-row="'+t.dataset.invHsbcAll+'"]').forEach(c=>{if(!c.disabled)c.checked=t.checked;});return;}
   if(t.dataset.invInclude!==undefined){e.stopImmediatePropagation();draft.slips[Number(t.dataset.invInclude)].included=t.checked;draft.slipReviewConfirmed=false;touch();render();return;}
   if(t.dataset.invComponentInclude!==undefined){e.stopImmediatePropagation();draft.contributions[Number(t.dataset.invComponentInclude)].included=t.checked;draft.slipReviewConfirmed=false;touch();render();return;}
   if(t.matches('[data-inv-duplicate-reviewed]')){e.stopImmediatePropagation();draft.slipReviewConfirmed=t.checked;touch();render();return;}
   if(t.matches('[data-import]')&&(slipEditorDirty||dispositionDirty)){e.stopImmediatePropagation();t.value='';throw Error('Save or cancel the open slip/transaction form before restoring a draft.');}
  }catch(err){message=err.message;render();}
 },true);
 host.addEventListener('click',e=>{
  const legacy=e.target.closest('button[data-action]');if(legacy){const a=legacy.dataset.action;if((slipEditorDirty||dispositionDirty)&&['save','load','switch','json','csv','print','step','back','next','open-schedule'].includes(a)){e.preventDefault();e.stopImmediatePropagation();message='Save or cancel the open slip/transaction form before continuing; its edits are not yet part of the draft.';render();return;}if(['load','switch'].includes(a)){slipEditor=null;dispositionEditor=null;}}
  const b=e.target.closest('button[data-inv-action]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(busy)return;const a=b.dataset.invAction;
  try{
   migrateInvestment(draft);
   if(a==='tab'){if(slipEditorDirty||dispositionDirty)throw Error('Save or cancel the open slip/transaction form before changing investment tabs.');draft.investmentTab=Number(b.dataset.index);touch();}
   if(a==='add-slip'||a==='edit-slip'){if(slipEditorDirty)throw Error('Save or cancel the current slip form first.');slipEditor=a==='add-slip'?freshSlip(b.dataset.type):JSON.parse(JSON.stringify(draft.slips[Number(b.dataset.index)]));slipEditorDirty=false;}
   if(a==='cancel-slip'){if(slipEditorDirty&&!confirm('Discard the uncommitted slip-form edits?'))return;slipEditor=null;slipEditorDirty=false;}
   if(a==='save-slip'){
    const edit=JSON.parse(JSON.stringify(slipEditor));if(!edit)throw Error('No slip form is open.');for(const k of Object.keys(edit.boxes))edit.boxes[k]=parseMoney(edit.boxes[k]);
    if(edit.state==='CANCELLED')edit.included=false;
    const proposed=JSON.parse(JSON.stringify(draft)),i=proposed.slips.findIndex(s=>s.id===edit.id);if(i<0)proposed.slips.push(edit);else proposed.slips[i]=edit;validateDraft(proposed);
    if(edit.confirmed&&slipIssues(edit).length)throw Error('Resolve these before marking confirmed: '+slipIssues(edit).join('; '));
    if(edit.state==='AMENDED'){if(!confirm('This amendment replaces the earlier slip, which will be excluded but retained. Entered amounts are replacement amounts, not differences. Continue?'))return;proposed.slips.find(s=>s.id===edit.replaces).included=false;}
    draft.slips=proposed.slips;draft.slipReviewConfirmed=false;slipEditor=null;slipEditorDirty=false;touch();message='Slip saved to the in-memory draft. Save draft to Sheets to persist it.';
   }
   if(a==='remove-slip'){const t=draft.slips[Number(b.dataset.index)];if(draft.slips.some(s=>s.replaces===t.id))throw Error('A later amendment refers to this slip. Retain/exclude it, or remove the later amendment first.');if(confirm('Remove this slip from the draft? Any older slip remains excluded until you explicitly include it.')){draft.slips.splice(Number(b.dataset.index),1);draft.slipReviewConfirmed=false;if(slipEditor?.id===t.id){slipEditor=null;slipEditorDirty=false;}touch();}}
   if(a==='accept-hsbc'){
    const g=candidates[Number(b.dataset.index)],chosen=[...host.querySelectorAll('[data-inv-hsbc-row="'+b.dataset.index+'"]')].filter(c=>c.checked&&!c.disabled).map(c=>Number(c.dataset.rowIndex));if(!chosen.length)throw Error('Select at least one eligible payment.');if(snapshot?.dividendError)throw Error('Dividend calculation is unavailable.');const selected=chosen.map(i=>g.rows[i]);if(selected.some(r=>!hsbcRowAllowed(r)))throw Error('Unsupported payment selected.');const amount=Math.round(selected.reduce((v,r)=>v+r.grossCad,0)*100)/100;
    if(!confirm('Use '+chosen.length+' selected HSBC payment(s) for '+g.account+', '+fmt(amount)+' CAD, as a line 12100 component?\nConfirm all selected payments are taxable foreign investment income, not return of capital or another income type. This replaces this account’s existing component. Excluded or missing payments and interest still need separate review.'))return;
    const c={id:g.id,label:'HSBC / '+g.account+' — '+chosen.length+' selected foreign-income payments',kind:'HSBC',account:g.account,amount,snapshot:g.snapshot,included:true,target:'12100',rowKeys:chosen.map(i=>rowKey(g.rows[i],i))},i=draft.contributions.findIndex(c=>c.id===g.id);if(i<0)draft.contributions.push(c);else draft.contributions[i]=c;draft.slipReviewConfirmed=false;touch();
   }
   if(a==='manual'){const label=prompt('Source label, e.g. HSBC interest, bank interest, or supported taxable Canadian dividend amount:');if(!label)return;const target=prompt('Destination: 12000 or 12100?','12100');if(target===null)return;if(!['12000','12100'].includes(target.trim()))throw Error('Choose 12000 or 12100.');const raw=prompt('CAD amount (not already included on an entered slip):');if(raw===null)return;const amount=parseMoney(raw);if(amount===null)throw Error('Amount required.');draft.contributions.push({id:'manual:'+Date.now()+':'+Math.random().toString(36).slice(2,8),label,kind:'MANUAL',account:'',amount,snapshot:'',included:true,target:target.trim()});draft.slipReviewConfirmed=false;touch();}
   if(a==='remove-component'){if(confirm('Remove this component? Imported records are unchanged.')){draft.contributions.splice(Number(b.dataset.index),1);draft.slipReviewConfirmed=false;touch();}}
   if(a==='apply-lines'||a==='apply-credit'){
    const x=investmentSummary(draft,candidates,!!snapshot);if(x.blockers.length)throw Error(x.blockers.join(' '));const targets=a==='apply-lines'?['12000','12100']:['40425'];
    if(!confirm('REPLACE '+targets.map(c=>'line '+c+' with '+fmt(x.totals[c])+' CAD').join(' and ')+'?\nReview ALL relevant sources, including amounts not on slips. Proposed zero amounts will explicitly become zero. This does not add to previous amounts and does not mark them confirmed.'))return;
    for(const c of targets)draft.lines[c]={...emptyLine(),...(draft.lines[c]||{}),amount:x.totals[c],status:'ENTERED',source:'Investment input summary — accepted slips/components; verify complete coverage',componentHash:'',basisHash:investmentBasis(draft,candidates,!!snapshot)};touch();message='Draft lines replaced from the investment summary. Review the whole amounts before confirming them.';
   }
   if(a==='export-breakdown'){const x=investmentSummary(draft,candidates,!!snapshot),quote=v=>'"'+String(v??'').replace(/^[=+@\t\r\n-]/,"'$&").replace(/"/g,'""')+'"';const rows=[['Taxpayer','Year','Destination','Component','CAD','Source'],...x.rows.map(r=>[draft.taxpayer.name,draft.year,r.line,r.label,r.amount,r.source]),['','','FOREIGN_TAX_SUPPORT','Not automatically line 40500',x.totals.foreignTaxPaid,'SUPPORT_ONLY'],...x.blockers.map(t=>['','','BLOCKER',t,'','']),...x.notices.map(t=>['','','NOTICE',t,'',''])];download('T1_investment_'+draft.taxpayer.id+'_'+draft.year+'.csv','\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8;');}
   render();
  }catch(err){message=err.message;render();}
 },true);
}

function investments(){return newInvestmentUI()+`<details><summary>Capital gains — reference only</summary><p>Use Schedule 3; no raw gains are applied to 12700.</p><ul>${capitalReferences().map(x=>`<li>${esc(x.account)}: ${fmt(x.amount)} CAD raw gain/loss; ${x.missing} missing amounts.</li>`).join('')}</ul></details>`;}
function capitalReferences(){const result=new Map();for(const r of snapshot?.capitalSales||[]){if(String(r.date||'').slice(0,4)!==String(draft.year)||String(r.source||r._source).toUpperCase()!=='HSBC')continue;const account=String(r.account||r.accountId||''),p=resolveSettings(snapshot.records||[],draft.year,'HSBC',account);if(p.registration!=='NON_REGISTERED'||String(p.owner||'').trim().toLowerCase()!==draft.taxpayer.name.trim().toLowerCase())continue;if(!result.has(account))result.set(account,{account,amount:0,count:0,missing:0});const x=result.get(account);x.count++;if(Number.isFinite(r.gainCad))x.amount+=r.gainCad;else x.missing++;}return [...result.values()];}
function render(){if(!host)return;migrateInvestment(draft);const w=warnings(),done=LINES.filter(([c])=>['CONFIRMED','NA'].includes(statusOf(draft,c,candidates,!!snapshot,snapshot))).length;
 host.innerHTML=`<h2>T1 Preparation — ${esc(draft.taxpayer.name)} / ${draft.year}</h2><p>Draft worksheet only. No NETFILE or complete income-tax/credit engine. All amounts CAD. Suggestions require acceptance; acknowledgement is not tax verification. Current selection is independent of the investment tables above.</p><div class="t1-controls"><label>Taxpayer ID<input data-profile-id value="${esc(draft.taxpayer.id)}"></label><label>Name<input data-profile-name value="${esc(draft.taxpayer.name)}"></label><label>Tax year<select data-select-year>${Array.from({length:Math.max(new Date().getFullYear()+1,draft.year)-2020},(_,i)=>2021+i).reverse().map(y=>`<option ${draft.year===y?'selected':''}>${y}</option>`).join('')}</select></label><button type="button" data-action="switch">Open/new selected taxpayer/year</button><button type="button" data-action="refresh">Refresh investment suggestions</button></div>
 
<details>
 <summary>Draft saving existing readiness token</summary>
 <label>Write token
  <input type="password" autocomplete="off" data-token value="${esc(token)}">
 </label>
 <label>
  <input type="checkbox" data-token-remember ${rememberToken?'checked':''}>
  Remember token on this browser for this Apps Script deployment
 </label>
 <button type="button" data-action="forget">Forget token</button>
 <p>Optional token memory uses browser localStorage and is readable by scripts on this site. Use it only on a trusted personal browser. T1 draft and financial data are not stored in browser localStorage.</p>
 <p>Authenticated reads and writes use dedicated T1Drafts T1Audit sheets. Export unsaved work before switching/reloading.</p>
</details>
 
 <div class="t1-controls"><button type="button" data-action="save">Save draft to Sheets</button><button type="button" data-action="load">Load server draft</button><button type="button" data-action="json">Export JSON backup</button><button type="button" data-action="csv">Export line CSV</button><label>Restore JSON<input type="file" data-import accept=".json,application/json"></label><button type="button" data-action="print">Print worksheet</button></div><p role="status" data-t1-message>${esc(message)} ${dirty?'Unsaved changes.':''} Revision ${revision}. ${done}/${LINES.length} listed lines confirmed or explicitly zero.</p><nav class="t1-steps">${steps.map((s,i)=>`<button type="button" data-action="step" data-index="${i}" ${draft.step===i?'aria-current="step"':''}>${i+1}. ${esc(s)}</button>`).join('')}</nav>
 
 ${draft.step===0?`<div class="t1-profile"><label>Province/territory at year-end<select data-province>${provinces.map(p=>`<option value="${p}" ${p===draft.province?'selected':''}>${p||'Select — not assumed'}</option>`).join('')}</select></label><label><input type="checkbox" data-province-confirmed ${draft.provinceConfirmed?'checked':''}>Province confirmed for this year</label><label>Residency / part-year / other profile notes<textarea data-residency>${esc(draft.residencyNote)}</textarea></label><label><input type="checkbox" data-profile-confirmed ${draft.profileConfirmed?'checked':''}>I have reviewed the taxpayer/year/province and applicable residency facts</label><p>No SIN or account password is required. Earlier years do not inherit 2025 tax rules or province. For 2021, review part-year residency and opening investment basis separately.</p></div>`:''}
 ${draft.step===1?investments():''}
 ${draft.step>0?`<div class="t1-scroll"><table><thead><tr><th>Line</th><th>Description / guidance</th><th>Amount CAD</th><th>Status</th><th>Source / note</th></tr></thead><tbody>${LINES.filter(x=>x[2]===draft.step).map(row).join('')}</tbody></table></div>`:''}
 ${draft.step===2?forms5UI()+foreign25UI():''}${draft.step===6?`<button type="button" data-action="refund">Suggest refund / balance from confirmed 43500 and 48200</button><p>This is arithmetic only, not tax payable calculation. Both totals must come from a complete return or supporting software/schedules.</p><label><input type="checkbox" data-other-reviewed ${draft.otherLinesReviewed?'checked':''}>Other applicable return lines and schedules have been reviewed outside this abbreviated panel</label><label>Other lines / schedule references<textarea data-other-note>${esc(draft.otherLinesNote)}</textarea></label><h3>Outstanding checks</h3><ul>${w.map(x=>`<li>${esc(x)}</li>`).join('')||'<li>Listed worksheet checks complete. This is not a certification that the return is correct or ready to file.</li>'}</ul><details open><summary>All requested T1 lines</summary><div class="t1-scroll"><table><thead><tr><th>Line</th><th>Description</th><th>CAD</th><th>Status</th><th>Source</th></tr></thead><tbody>${LINES.map(([c,l])=>`<tr><td>${c}</td><td>${esc(l)}</td><td>${fmt(draft.lines[c]?.amount)}</td><td>${esc(statusOf(draft,c,candidates,!!snapshot,snapshot))}</td><td>${esc(draft.lines[c]?.source||'')}</td></tr>`).join('')}</tbody></table></div></details>`:''}<div class="t1-controls"><button type="button" data-action="back" ${draft.step===0?'disabled':''}>Back</button><button type="button" data-action="next" ${draft.step===6?'disabled':''}>Next</button></div>`;
}
function download(name,data,type){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);}
async function request(action){const url=snapshot?.url||localStorage.getItem('ibkr_gas_url');if(!url)throw Error('Backend URL unavailable. Load investment data or configure your existing Apps Script URL.');if(!token)throw Error('Enter the existing readiness write token first.');const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,writeToken:token,taxpayerId:draft.taxpayer.id,year:draft.year,...(action==='saveT1PreparationDraft'?{draft,expectedRevision:revision}:{})})});const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'T1 backend request failed.');return data;}
function discard(){return !dirty||confirm('This draft has unsaved changes. Export a JSON backup or save first. Discard these unsaved changes and continue?');}
function setLine(c,field,value){const l=draft.lines[c]||emptyLine();if(field==='amount'){l.amount=parseMoney(value);l.status=l.amount===null?'UNANSWERED':'ENTERED';l.basisHash='';l.componentHash='';}else if(field==='status'){if(value==='NA'){if(!confirm('Set line '+c+' to zero / not applicable?'))return;l.amount=0;l.basisHash='';l.componentHash='';}if(value==='CONFIRMED'&&l.amount===null)throw Error('Enter an amount first; use explicit zero when appropriate.');if(value==='CONFIRMED'&&statusOf(draft,c,candidates,!!snapshot,snapshot)==='NEEDS_REVIEW')throw Error('Rebuild this amount from current source/dependencies, or manually re-enter it with a supported source before confirming.');if(value==='UNANSWERED')l.amount=null;l.status=value;}else{l[field]=value;if(l.status==='CONFIRMED')l.status='ENTERED';}draft.lines[c]=l;touch();}

const T1_THEME_V3="/* Integrated T1 dark-blue/green theme. */\n#t1-preparation{color:#e5edf5}\n#t1-preparation button{background:#253449;color:#e5edf5;border:1px solid #64768f;border-radius:5px;padding:.45rem .7rem}\n#t1-preparation button:hover:not(:disabled){background:#334863;color:#fff;border-color:#a6bfdc}\n#t1-preparation button[aria-pressed=\"true\"],#t1-preparation button[aria-selected=\"true\"],#t1-preparation button[aria-current=\"step\"]{background:#165532!important;color:#fff!important;border:2px solid #75d4a2!important;box-shadow:inset 0 -3px #75d4a2;font-weight:700}\n#t1-preparation button:disabled{opacity:.5;cursor:not-allowed}\n#t1-preparation input:not([type=checkbox]),#t1-preparation select,#t1-preparation textarea{background:#101b2c;color:#e5edf5;border:1px solid #8290a8;color-scheme:dark}\n#t1-preparation option{background:#1e2b3f;color:#e5edf5}#t1-preparation option:checked{background:#165532;color:#fff}\n#t1-preparation input[type=checkbox]{accent-color:#75d4a2}\n#t1-preparation input::placeholder,#t1-preparation textarea::placeholder{color:#adbed1;opacity:1}\n#t1-preparation button:focus-visible,#t1-preparation input:focus-visible,#t1-preparation select:focus-visible,#t1-preparation textarea:focus-visible{outline:3px solid #91d3ff;outline-offset:2px}\n#t1-preparation thead th{background:#165532;color:#fff}\n#t1-preparation tbody tr:nth-child(odd){background:#1e2b3f;color:#e5edf5}#t1-preparation tbody tr:nth-child(even){background:#253449;color:#e5edf5}\n#t1-preparation tbody tr[aria-selected=\"true\"],#t1-preparation tbody tr:has(input[type=checkbox]:checked){background:#165532;color:#fff}\n#t1-preparation tbody tr:hover{box-shadow:inset 3px 0 #75d4a2}#t1-preparation small{color:#c5d1e3}\n#t1-preparation fieldset{border:1px solid #64768f;margin:1rem 0;padding:1rem}#t1-preparation legend{color:#e5edf5}\n#t1-preparation ::selection{background:#267548;color:#fff}\n@media print{#t1-preparation,#t1-preparation table,#t1-preparation th,#t1-preparation td,#t1-preparation small{background:white!important;color:black!important}#t1-preparation tbody tr:nth-child(odd),#t1-preparation tbody tr:nth-child(even){background:white!important;color:black!important}}\n";
function installT1Theme(){if(document.getElementById('t1-theme-v3'))return;const style=document.createElement('style');style.id='t1-theme-v3';style.textContent=T1_THEME_V3;document.head.appendChild(style);}
function init(){
 installT1Theme();
 host=document.createElement('section');
 host.className='card t1-panel';
 host.id='t1-preparation';
 document.querySelector('main').appendChild(host);
 migrateInvestment(draft);
 refreshSuggestions();
 token=readStoredToken();
 rememberToken=Boolean(token);
 render();
 installForms5Events();
 installForeign25Events();
 installSupplementEvents();
 installWorkEvents();
 installInvestmentEvents();
 host.oninput=e=>{
 if(e.target.matches('[data-token]')){
  token=e.target.value;
  if(rememberToken)storeToken(token);
 }
};
 host.onchange = async e => {
  const t = e.target;
  try {
    if (t.dataset.line) {
      setLine(t.dataset.line, t.dataset.field, t.value);
      render();
      return;
    }

    if (t.dataset.component !== undefined) {
      draft.contributions[Number(t.dataset.component)].included = t.checked;
      touch();
      render();
      return;
    }

    if (t.matches('[data-province]')) {
      draft.province = t.value;
      draft.provinceConfirmed = false;
      draft.profileConfirmed = false;
      touch();
    }

    if (t.matches('[data-province-confirmed]')) {
      draft.provinceConfirmed = t.checked;
      touch();
    }

    if (t.matches('[data-profile-confirmed]')) {
      draft.profileConfirmed = t.checked;
      touch();
    }

    if (t.matches('[data-residency]')) {
      draft.residencyNote = t.value;
      touch();
    }

    if (t.matches('[data-other-reviewed]')) {
      draft.otherLinesReviewed = t.checked;
      touch();
    }

    if (t.matches('[data-other-note]')) {
      draft.otherLinesNote = t.value;
      touch();
    }

    if (t.matches('[data-import]')) {
      const obj = JSON.parse(await t.files[0].text());
      const incoming = validateDraft(obj.draft || obj);
      if (!discard()) return;
      draft = incoming;
      revision = 0;
      touch();
      refreshSuggestions();
      message = 'JSON restored as unsaved work. Server revision reset to zero; saving over an existing draft will conflict. Export this copy before loading/merging the server draft.';
    }

    if (t.matches('[data-token-remember]')) {
      rememberToken = t.checked;
      if (rememberToken) {
        if (!token) throw Error('Enter the write token before remembering it.');
        storeToken(token);
      } else {
        storeToken('');
      }
    }

    if (!t.matches('[data-token],[data-token-remember],[data-select-year],[data-profile-id],[data-profile-name]')) {
      render();
    }
  } catch (err) {
    message = err.message;
    render();
  }
};
 host.onclick=async e=>{const b=e.target.closest('button[data-action]');if(!b||busy)return;const a=b.dataset.action;try{
 if(a==='open-schedule'){draft.step=1;draft.investmentTab=8;touch();}if(a==='step'){draft.step=Number(b.dataset.index);touch();}if(a==='next'||a==='back'){draft.step=Math.max(0,Math.min(6,draft.step+(a==='next'?1:-1)));touch();}
 if(a==='switch'){const id=host.querySelector('[data-profile-id]').value.trim().toLowerCase(),name=host.querySelector('[data-profile-name]').value.trim(),year=Number(host.querySelector('[data-select-year]').value);if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)||!name)throw Error('Enter a stable taxpayer ID and display name.');if(id===draft.taxpayer.id&&year===draft.year){draft.taxpayer.name=name;draft.profileConfirmed=false;touch();}else if(discard()){draft=blank(year,id,name);revision=0;dirty=false;message='New in-memory draft. Load server draft if one already exists.';}refreshSuggestions();}
 if(a==='refresh'){refreshSuggestions();message='Investment suggestions refreshed; saved amounts were not overwritten.';}
if(a==='forget'){
 token='';
 rememberToken=false;
 storeToken('');
}
message='Token forgotten from this browser.';
 if(a==='include'){const g=candidates[Number(b.dataset.index)];if(!g||g.missing||snapshot?.dividendError)throw Error('Candidate has unavailable amounts.');if(!confirm('Include/update '+g.account+' gross amount '+fmt(g.amount)+' CAD as a line 12100 component?\n\nConfirm that ALL listed distributions in this group are taxable foreign investment income, not return of capital, Canadian dividends or another income type. Otherwise cancel and add only the supported amount manually.'))return;const component={id:g.id,label:'HSBC / '+g.account+' — user-classified foreign investment income',kind:'HSBC',account:g.account,amount:g.amount,snapshot:g.snapshot,included:true},i=draft.contributions.findIndex(c=>c.id===g.id);if(i<0)draft.contributions.push(component);else draft.contributions[i]=component;touch();}
 if(a==='component'){const label=prompt('Component label, e.g. IBKR T5 foreign income or bank interest:');if(!label)return;const raw=prompt('CAD amount (use the relevant income amount, not withholding):');if(raw===null)return;const amount=parseMoney(raw);if(amount===null)throw Error('Amount is required.');draft.contributions.push({id:'manual:'+Date.now()+':'+Math.random().toString(36).slice(2,8),label,kind:'MANUAL',account:'',amount,snapshot:'',included:true});touch();}
 if(a==='remove-component'){if(confirm('Remove this component from the draft? Imported records remain unchanged.')){draft.contributions.splice(Number(b.dataset.index),1);touch();}}
 if(a==='components-to-line'){const chosen=draft.contributions.filter(c=>c.included&&componentTarget(c)==='12100');if(!chosen.length)throw Error('Select at least one component.');if(staleComponents(draft,candidates,!!snapshot).length)throw Error('Refresh/review stale HSBC components first.');if(!confirm('Replace the WHOLE line 12100 draft amount with the included component subtotal? Existing amounts are not added. Ensure IBKR slips, bank interest and other relevant sources are included before confirming this line.'))return;draft.lines['12100']={...emptyLine(),amount:Math.round(chosen.reduce((s,c)=>s+c.amount,0)*100)/100,status:'ENTERED',source:'Accepted component subtotal; verify all sources are included',componentHash:componentHash(draft)};touch();}
 if(a==='refund'){const f=refundSuggestions(draft);if(!f)throw Error('Confirm non-negative amounts on lines 43500 and 48200 first.');if(!confirm('Replace the refund and balance-owing draft lines with arithmetic based on confirmed payable/credits totals? This does not calculate tax payable.'))return;for(const c of ['48400','48500'])draft.lines[c]={...emptyLine(),amount:f[c],status:'ENTERED',source:'Arithmetic: confirmed lines 43500 and 48200',basisHash:refundBasis(draft)};touch();}
 if(a==='save'||a==='load'){if(a==='load'&&!discard())return;if(a==='save'){validateDraft(draft);if(!confirm('Save this private T1 draft to the dedicated T1_Drafts / T1_Audit sheets?\n'+draft.taxpayer.name+' / '+draft.year))return;}busy=true;host.querySelectorAll('button,input,select,textarea').forEach(t=>t.disabled=true);try{const result=await request(a==='save'?'saveT1PreparationDraft':'getT1PreparationDraft');if(a==='load'){if(result.draft){draft=validateDraft(result.draft);refreshSuggestions();dirty=false;message='Server draft loaded.';}else{dirty=true;message='No server draft exists. Current in-memory draft retained; save to create it.';}}else{dirty=false;message='Draft saved to Google Sheets.';}revision=result.revision||0;}finally{busy=false;}}
 if(a==='json'){download('T1_'+draft.taxpayer.id+'_'+draft.year+'.json',JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),scope:'Draft preparation worksheet; not filed or tax-certified',draft,serverRevision:revision,checks:warnings()},null,2),'application/json');}
 if(a==='csv'){const q=v=>'"'+String(v??'').replace(/^[=+@\t\r\n-]/,"'$&").replace(/"/g,'""')+'"',rows=[['Taxpayer','Year','Province','Line','Description','CAD','Status','Source','Note'],...LINES.map(([c,l])=>[draft.taxpayer.name,draft.year,draft.province,c,l,draft.lines[c]?.amount??'',statusOf(draft,c,candidates,!!snapshot,snapshot),draft.lines[c]?.source||'',draft.lines[c]?.note||''])];download('T1_'+draft.taxpayer.id+'_'+draft.year+'.csv','\uFEFF'+rows.map(r=>r.map(q).join(',')).join('\r\n'),'text/csv;charset=utf-8;');}
 if(a==='print'){draft.step=6;render();window.print();return;}render();
 }catch(err){busy=false;message=err.message+(a==='save'?' If the response was lost, export your draft and load server state before retrying.':'');render();}};

window.addEventListener('t1-investment-data-ready',()=>{
  refreshSuggestions();
  autoLoadServerDraft();
}); 
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();





