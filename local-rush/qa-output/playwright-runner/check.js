const { chromium } = require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:8000',{waitUntil:'networkidle'});
 await page.selectOption('select[name="category"]','restaurant');
 await page.fill('input[name="limit"]','5');
 await Promise.all([page.waitForResponse(r=>r.url().includes('/api/search'),{timeout:70000}), page.click('#search-button')]);
 await page.waitForSelector('#results-body tr[data-company-id]');
 await page.click('#results-body tr[data-company-id] td:first-child strong');
 await page.waitForTimeout(500);
 const data=await page.evaluate(()=>{
   const selected=document.querySelector('#results-body tr[data-company-id]');
   const offenders=[];
   document.querySelectorAll('body *').forEach(el=>{const r=el.getBoundingClientRect(); if(r.right>window.innerWidth+1 || r.left<-1){offenders.push({tag:el.tagName, cls:el.className, id:el.id, left:r.left,right:r.right,width:r.width, scrollWidth:el.scrollWidth, clientWidth:el.clientWidth, text:(el.textContent||'').trim().slice(0,40)});}});
   return {className:selected.className, aria:selected.getAttribute('aria-selected'), mapStatus:document.querySelector('#map-status').textContent, docScrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, offenders: offenders.slice(0,20)};
 });
 console.log(JSON.stringify(data,null,2));
 await browser.close();
})();
