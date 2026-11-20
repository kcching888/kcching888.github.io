/* T5008 contextual help: UI only; no draft, financial or storage changes. */
(function () {
 'use strict';
 if (window.__t1TreatmentHelpInstalled) return;
 window.__t1TreatmentHelpInstalled = true;
 let sequence = 0;
 const css = `
 #t1-preparation .t1-treatment-help{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;margin:.5rem 0}
 #t1-preparation .t1-treatment-help>label{margin:0}
 #t1-preparation .t1-treatment-help-button{border:2px solid #75d4a2;background:#165532;color:#fff;border-radius:50%;width:1.9rem;height:1.9rem;min-width:1.9rem;padding:0;font-size:1rem;font-weight:700;line-height:1;cursor:pointer}
 #t1-preparation .t1-treatment-help-button:focus-visible{outline:3px solid #91d3ff;outline-offset:3px}
 #t1-preparation .t1-treatment-help-panel{flex-basis:100%;box-sizing:border-box;min-width:0;max-width:780px;background:#101b2c;color:#e5edf5;border:1px solid #75d4a2;border-radius:6px;padding:1rem;line-height:1.6;overflow-wrap:anywhere}
 #t1-preparation .t1-treatment-help-panel[hidden]{display:none!important}
 #t1-preparation .t1-treatment-help-panel h4{margin:0 0 .6rem;color:#fff}
 #t1-preparation .t1-treatment-help-panel a{color:#91d3ff;text-decoration:underline}
 #t1-preparation .t1-treatment-help-panel li{margin:.4rem 0}
 @media print{#t1-preparation .t1-treatment-help-button{display:none}#t1-preparation .t1-treatment-help-panel{background:#fff;color:#000;border-color:#777}}
 `;
 function attachHelp() {
  document.querySelectorAll('#t1-preparation select[data-disp-field="classification"]').forEach(select => {
   if (select.closest('.t1-treatment-help')) return;
   const label = select.closest('label');
   if (!label || !label.parentNode) return;
   const group = document.createElement('div');
   group.className = 't1-treatment-help';
   label.parentNode.insertBefore(group, label);
   group.appendChild(label);
   const button = document.createElement('button');
   button.type = 'button';
   button.className = 't1-treatment-help-button';
   button.textContent = '?';
   button.title = 'Help: Capital or Income?';
   button.setAttribute('aria-label', 'Help choosing Capital or Income for T5008');
   button.setAttribute('aria-expanded', 'false');
   const panel = document.createElement('section');
   panel.id = 't1-treatment-help-' + (++sequence);
   panel.className = 't1-treatment-help-panel';
   panel.hidden = true;
   panel.setAttribute('aria-labelledby', panel.id + '-heading');
   button.setAttribute('aria-controls', panel.id);
   const heading = document.createElement('h4');
   heading.id = panel.id + '-heading';
   heading.textContent = 'T5008: Capital or Income?';
   panel.appendChild(heading);
   const intro = document.createElement('p');
   intro.textContent = 'For ordinary personal stock investments bought and held for investment growth or dividends, then sold, CAPITAL is generally appropriate. If the transactions are on business/income account, use INCOME. A T5008 and the fact that you bought and sold shares do not by themselves decide the classification.';
   panel.appendChild(intro);
   const list = document.createElement('ul');
   [
    'CAPITAL: investment dispositions; for example, selling or periodically rebalancing stocks held as investments. Capital gains/losses generally go through Schedule 3. Holding for months or years is an indicator, not a guaranteed safe harbour.',
    'INCOME: gains/losses on business or trading account. Extensive buying and selling, rapid turnover and business-like trading can point toward this treatment. It does not mean dividends, sale proceeds, or simply money received into your brokerage account.',
    'REVIEW: leave this selected if your classification is unresolved. Do not mark the transaction fully reviewed merely to make it appear in the capital subtotal.',
    'CRA considers your intentions and whole course of conduct: frequency of transactions, holding periods, securities-market knowledge, time spent studying/trading, margin or other debt financing, and the relationship to your ordinary business. No single factor, transaction count, holding period or annual proceeds total automatically settles the question.',
    'Special transactions, including short sales, can require different treatment. Even an isolated transaction may be on income account. Seek professional advice when the facts are mixed or a special rule/election may apply.',
    'In this worksheet, only fully reviewed CAPITAL records enter the T5008 capital-review subtotals. INCOME needs separate reporting; REVIEW remains unresolved. This help never selects a treatment, changes your amounts, or fills line 12700 for you.'
   ].forEach(text => { const li = document.createElement('li'); li.textContent = text; list.appendChild(li); });
   panel.appendChild(list);
   const source = document.createElement('a');
   source.href = 'https://www.canada.ca/en/revenue-agency/services/tax/technical-information/income-tax-audit-manual-domestic-compliance-programs-branch-dcpb-27.html';
   source.target = '_blank';
   source.rel = 'noopener noreferrer';
   source.textContent = 'CRA guidance: Chapter 27, sections 27.1.2 and 27.1.5 (opens a new tab)';
   panel.appendChild(source);
   function close() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
   button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
   });
   group.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
     event.preventDefault(); event.stopPropagation(); close(); button.focus();
    }
   });
   group.appendChild(button);
   group.appendChild(panel);
  });
 }
 function init() {
  if (!document.getElementById('t1-treatment-help-style')) {
   const style = document.createElement('style');
   style.id = 't1-treatment-help-style'; style.textContent = css;
   document.head.appendChild(style);
  }
  attachHelp();
  const observer = new MutationObserver(attachHelp);
  observer.observe(document.body, { childList: true, subtree: true });
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
 else init();
})();
