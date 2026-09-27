// Keep the initial document inert until imports, listeners and first render finish.
// This is a usability gate, not a substitute for server authorization.
export async function startApplication({document,load,setTimer=setTimeout,clearTimer=clearTimeout,timeoutMs=15000}) {
  const root=document.querySelector('#app-root');
  const status=document.querySelector('#startup-status');
  const title=document.querySelector('#startup-title');
  const message=document.querySelector('#startup-message');
  const controls=[...document.querySelectorAll('[data-startup-control]')];
  // The document watchdog can fail before this module is downloaded.
  if(document.documentElement.dataset.startup==='failed')return false;
  let settled=false;
  const block=()=>{root.inert=true;root.setAttribute('aria-busy','false');for(const control of controls)control.disabled=true;};
  const fail=()=>{
    if(settled)return;
    settled=true;block();status.hidden=false;
    title.textContent='Interface could not start';
    message.textContent='Loading failed or took too long. Controls remain unavailable. Reload the page to try again.';
    document.documentElement.dataset.startup='failed';
  };
  root.inert=true;root.setAttribute('aria-busy','true');
  for(const control of controls)control.disabled=true;
  document.documentElement.dataset.startup='loading';
  const timer=setTimer(fail,timeoutMs);
  try {
    await load();
    if(settled||document.documentElement.dataset.startup==='failed'){
      clearTimer(timer);block();return false; // Never reopen after either watchdog.
    }
    settled=true;clearTimer(timer);
    for(const control of controls)control.disabled=false;
    root.setAttribute('aria-busy','false');root.inert=false;
    document.documentElement.dataset.startup='ready';status.hidden=true;
    return true;
  } catch {
    clearTimer(timer);fail();return false; // Do not expose import errors or retry.
  }
}

if(typeof document!=='undefined') {
  void startApplication({document,load:()=>import('./app.js?v=1.3.1')});
}
