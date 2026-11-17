  const pipeline=()=>window.GBufferd?.pipeline;
  const passBody=$('[data-pass-rows]',root),passRows=new Map();
  const ms=value=>Number.isFinite(value)?value.toFixed(2):'–';
  let monitoring=false;
  const syncMonitoring=()=>{
    const hidden=document.hidden||document.documentElement.classList.contains('cx-film')||
      document.body.matches('.playing,.hide-ui,.test-mode:not(.test-panel)')||settings&&!settings.hidden;
    const wanted=!drawer.hidden&&!hidden;
    if(wanted!==monitoring){pipeline()?.monitor(wanted);monitoring=wanted;}
  };
  const costRows=(selector,rows)=>{
    const nodes=rows.map(({name,ms:cost,gpu})=>{
      const row=document.createElement('div'),label=document.createElement('span'),value=document.createElement('span');
      label.textContent=english(name);value.textContent=ms(cost??gpu)+' ms';row.append(label,value);return row;
    });
    $(selector,root).replaceChildren(...nodes);
  };
  const syncPipeline=(snapshot=pipeline()?.snapshot())=>{
    if(drawer.hidden)return;
    if(!snapshot){$('[data-profile-note]',root).textContent='Waiting for the renderer…';return;}
    $('[data-perf=gpu]',root).textContent=ms(snapshot.gpu);
    $('[data-perf=cpu]',root).textContent=ms(snapshot.cpu);
    $('[data-perf=draws]',root).textContent=String(snapshot.draws);
    $('[data-profile-note]',root).textContent=snapshot.gpuAvailable?'GPU timestamps, averaged per rendered frame':'GPU timestamps unavailable on this adapter. CPU timings are available.';
    const keys=new Set(snapshot.rows.map(row=>row.key));
    for(const [key,node] of passRows)if(!keys.has(key)){node.remove();passRows.delete(key);}
    snapshot.rows.forEach((row,index)=>{
      let node=passRows.get(row.key);
      if(!node){
        node=document.createElement('tr');
        const label=document.createElement('td'),name=document.createElement('span'),kind=document.createElement('small');
        name.textContent=row.name;kind.textContent=row.kind==='compute'?'CSH':'render';label.append(name,kind);
        const gpu=document.createElement('td'),cpu=document.createElement('td'),cell=document.createElement('td'),toggle=document.createElement('input');
        toggle.type='checkbox';toggle.setAttribute('aria-label','Enable '+row.name+' '+row.kind+' pass');
        toggle.addEventListener('change',()=>{
          if(!pipeline()?.toggle(row.key,toggle.checked))toast('This pass is no longer available');
          syncPipeline();
        });
        cell.append(toggle);node.append(label,gpu,cpu,cell);passRows.set(row.key,node);
      }
      node.dataset.enabled=String(row.enabled);
      node.children[1].textContent=row.enabled?ms(row.gpu):'–';node.children[2].textContent=row.enabled?ms(row.cpu):'–';
      node.querySelector('input').checked=row.enabled;
      if(passBody.children[index]!==node)passBody.insertBefore(node,passBody.children[index]||null);
    });
    $('[data-reset]',root).disabled=!snapshot.rows.some(row=>!row.enabled);
    costRows('[data-cpu-rows]',snapshot.cpuPhases);
    costRows('[data-overhead-rows]',snapshot.overhead);
  };
  $('[data-reset]',root).addEventListener('click',()=>{pipeline()?.reset();syncPipeline();});
  const refresh=()=>{
    syncMonitoring();
    const snapshot=pipeline()?.snapshot();
    $('[data-hud=fps]',root).textContent=snapshot?String(snapshot.fps):'–';
    $('[data-hud=ms]',root).textContent=Number.isFinite(snapshot?.frametime)?snapshot.frametime.toFixed(1):'–';
    const ticks=snapshot?.worldTime??engine()?.WORLD_TIME;
    $('[data-hud=time]',root).textContent=Number.isFinite(ticks)?String(ticks):'–';
    $('[data-hud=frame]',root).textContent=snapshot?String(snapshot.frameCounter):'–';
    fpsEl.textContent=snapshot&&Number.isFinite(snapshot.frametime)?snapshot.fps+'fps '+snapshot.frametime.toFixed(1)+'ms':'';
    if(!dragging&&Number.isFinite(ticks))showTime(ticks);
    if(snapshot){profileTag.hidden=false;profileTag.innerHTML='Current Profile: <b></b>';profileTag.lastChild.textContent=english(snapshot.profile);}
    syncStatus();
    syncPipeline(snapshot);
  };
  new MutationObserver(syncMonitoring).observe(document.body,{attributes:true,attributeFilter:['class']});
  if(settings)new MutationObserver(syncMonitoring).observe(settings,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',syncMonitoring);
  addEventListener('pagehide',()=>pipeline()?.monitor(false));
  setInterval(refresh,500);refresh();

