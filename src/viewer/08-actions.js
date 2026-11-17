  const setPressed=(act,on)=>btn(act)?.setAttribute('aria-pressed',String(on));
  const panes={pipeline:drawer,time:timeCard,help:sheet};
  function showPane(name,on){
    for(const [key,node] of Object.entries(panes)){
      const visible=key===name&&on;node.hidden=!visible;setPressed(key,visible);
    }
    more.open=false;syncMonitoring();syncPipeline();
    if(on&&name==='help')sheet.querySelector('button').focus();
  }
  const toggleDrawer=force=>showPane('pipeline',force??drawer.hidden);
  const toggleSheet=force=>showPane('help',force??sheet.hidden);
  const toggleTime=force=>showPane('time',force??timeCard.hidden);
  more.addEventListener('toggle',()=>{if(more.open){for(const [key,node] of Object.entries(panes)){node.hidden=true;setPressed(key,false);}syncMonitoring();}});
  document.addEventListener('pointerdown',event=>{
    if(!more.contains(event.target))more.open=false;
    if(!root.contains(event.target))showPane(null,false);
  });
  const toggleFilm=force=>{
    const on=force??!document.documentElement.classList.contains('cx-film');
    document.documentElement.classList.toggle('cx-film',on);
    if(on){toggleDrawer(false);toggleSheet(false);}
  };
  const photo=async()=>{
    if(typeof captureFrame!=='function'){toast('Screenshot capture is unavailable');return;}
    toast('Capturing screenshot…');
    try{
      const blob=await captureFrame('image/png');
      const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${(lastPack||'shader').replace(/[^\w.-]+/g,'_')}_${stamp}.png`;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),4000);
      toast('Screenshot saved');
    }catch(error){toast('Screenshot failed: '+error.message);}
  };
  const actions={
    open:()=>zipInput.click(),
    builtin:()=>{if(!retry.disabled)retry.click();},
    settings:()=>{showPane(null,false);settingsToggle.click();},
    pipeline:()=>toggleDrawer(),
    time:()=>toggleTime(),
    photo,
    film:()=>toggleFilm(),
    full:()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});},
    help:()=>toggleSheet(),
    inspector:()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'F8',key:'F8',bubbles:true})),
    errors:()=>errBtn.click(),
    record:async()=>{
      const recorder=window.GBufferd?.bufferRecorder,button=btn('record');
      if(!recorder){toast('Buffer recording is unavailable');return;}
      if(recorder.running)return;
      button.disabled=true;toast('Recording every buffer for 8 s …');
      try{
        const {blob,files}=await recorder.start(8);
        const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
        const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=(lastPack||'shader').replace(/[^\w.-]+/g,'_')+'_buffers_'+stamp+'.zip';
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),10000);
        toast('Saved '+files.length+' buffer videos');
      }catch(error){toast('Recording failed: '+error.message);}
      finally{button.disabled=false;}
    }
  };
  root.addEventListener('click',event=>{const target=event.target.closest('[data-act]');if(target&&actions[target.dataset.act]){
    event.stopPropagation();const act=target.dataset.act,fromMenu=more.contains(target);
    if(fromMenu){more.open=false;moreToggle.focus();}
    actions[act]();
    if(target.classList.contains('cx-close'))(act==='help'?moreToggle:btn(act)).focus();
  }});
  errBtn.addEventListener('click',()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'F9',key:'F9',bubbles:true})));
  document.addEventListener('gbufferd-pipeline-toggle',()=>{if(settings&&!settings.hidden)return;if(document.pointerLockElement)document.exitPointerLock?.();toggleDrawer();});
  document.addEventListener('fullscreenchange',()=>setPressed('full',!!document.fullscreenElement));

  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
    if(document.pointerLockElement||(settings&&!settings.hidden)||/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName||'')&&document.activeElement!==range)return;
    if(event.key==='Escape'){
      if(window.GBufferd?.inspector?.open)return;
      if(document.documentElement.classList.contains('cx-film'))toggleFilm(false);
      else if(more.open){more.open=false;moreToggle.focus();}
      else if(!sheet.hidden){toggleSheet(false);moreToggle.focus();}
      else if(!drawer.hidden){toggleDrawer(false);btn('pipeline').focus();}
      else if(!timeCard.hidden){toggleTime(false);btn('time').focus();}
      else return;
      event.preventDefault();return;
    }
    if(event.repeat||document.body.classList.contains('test-mode')&&!document.body.classList.contains('test-panel'))return;
    const key=event.key.toLowerCase();
    if(key==='k'){toggleFilm();event.preventDefault();}
    else if(key==='p'&&!document.documentElement.classList.contains('cx-film')){photo();event.preventDefault();}
    else if(key==='o'&&!retry.disabled){zipInput.click();event.preventDefault();}
    else if(event.key==='?'){toggleSheet();event.preventDefault();}
  });

