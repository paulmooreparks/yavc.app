// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
// Enlarge the public text tokens before a dialog sweep, without browser zoom.
exports.prepare=async function(page){
 if(process.env.YAVC_DIALOG_LARGE_TEXT!=='1')return;
 await page.addInitScript(()=>{
  function apply(){for(const [name,value]of Object.entries({'--text-xs':'16px','--text-sm':'18px','--text-md':'20px','--text-lg':'24px'}))document.documentElement.style.setProperty(name,value);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
 });
};
