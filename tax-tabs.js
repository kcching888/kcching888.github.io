/* Tax workspace tabs v1 — presentation only; no draft/calculation mutation. */
(function(){
  'use strict';
  function init(){
    const main=document.querySelector('main');
    if(!main||document.getElementById('tax-section-tabs'))return;
    main.classList.add('tax-tabs-main');
    const nav=document.createElement('nav');nav.id='tax-section-tabs';nav.className='tax-section-tabs';nav.setAttribute('aria-label','Tax sections');
    const investments=document.createElement('button');investments.type='button';investments.textContent='Investment Worksheets';investments.dataset.taxSection='investments';
    const preparation=document.createElement('button');preparation.type='button';preparation.textContent='T1 Preparation';preparation.dataset.taxSection='t1';preparation.setAttribute('aria-controls','t1-preparation');
    nav.append(investments,preparation);main.insertBefore(nav,main.firstChild);
    let selected=window.location.hash==='#t1-preparation'?'t1':'investments';
    function show(view){
      selected=view==='t1'?'t1':'investments';main.dataset.taxView=selected;
      investments.setAttribute('aria-pressed',String(selected==='investments'));
      preparation.setAttribute('aria-pressed',String(selected==='t1'));
    }
    function sync(){
      const panel=main.querySelector('#t1-preparation');preparation.disabled=!panel;preparation.title=panel?'Open T1 Preparation':'Waiting for the T1 preparation module';
      if(panel){
        const heading=panel.querySelector('h2');
        if(heading){
          const label=heading.textContent.trim(),prefix='T1 Preparation — ';
          let context=panel.querySelector('[data-tax-t1-context]');
          if(label.startsWith(prefix)){
            const detail=label.slice(prefix.length).trim();
            if(!context){context=document.createElement('p');context.dataset.taxT1Context='';context.className='tax-t1-context';heading.parentNode.insertBefore(context,heading.nextSibling);}
            if(context.textContent!==detail)context.textContent=detail;
          }
          if(heading.textContent!=='T1 Preparation')heading.textContent='T1 Preparation';
        }
      }
      show(selected);
    }
    investments.onclick=()=>show('investments');preparation.onclick=()=>{if(!preparation.disabled)show('t1');};
    nav.onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const target=e.key==='Home'?investments:e.key==='End'?preparation:e.target===investments?preparation:investments;
      if(target.disabled)return;e.preventDefault();target.click();target.focus();
    };
    window.addEventListener('hashchange',()=>{if(window.location.hash==='#t1-preparation')show('t1');else if(window.location.hash==='#tax-worksheets')show('investments');});
    // Existing code may create/refresh sections asynchronously. Keep their DOM
    // in place: moving them could break existing main.insertBefore operations.
    const observer=new MutationObserver(sync);observer.observe(main,{childList:true,subtree:true,characterData:true});
    window.addEventListener('beforeprint',sync);
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
