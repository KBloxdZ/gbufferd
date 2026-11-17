  {
    const insp=()=>window.GBufferd?.inspector;
    const bar=$('.cx-dbg-bar',root),pickLayer=$('.cx-dbg-pick',root),lens=$('.cx-dbg-lens',root),panel=$('.cx-dbg',root),tip=$('.cx-dbg-tip',root);
    const CM='https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
    let picking=false,lensBusy=false,lensWanted=null,session=null,cmLoad=null,cm=null,previews=new Map();
    let warm={key:null,state:'idle'};
    const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
    const button=(label,title,run,disabled=false)=>{const b=el('button',null,label);b.type='button';b.title=title;b.disabled=disabled;b.addEventListener('click',run);return b;};
    const hold={timer:0,key:null};
    function stopHold(){clearTimeout(hold.timer);hold.timer=0;hold.key=null;}
    function startHold(run,key){
      stopHold();hold.key=key;run();const started=performance.now();
      const tick=()=>{if(hold.key!==key)return;const t=performance.now()-started,n=t>2300?4:t>1100?2:1;for(let i=0;i<n;i++)run();hold.timer=setTimeout(tick,30);};
      hold.timer=setTimeout(tick,300);
    }
    const holdButton=(label,title,run)=>{
      const b=el('button',null,label);b.type='button';b.title=title;
      b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();try{b.setPointerCapture(e.pointerId);}catch{}startHold(run,'pointer');});
      for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>{if(hold.key==='pointer')stopHold();});
      b.addEventListener('click',e=>{if(e.detail===0)run();});
      return b;
    };
    let renderQueued=false;
    function scheduleRender(){
      if(renderQueued)return;renderQueued=true;
      const draw=()=>{if(!renderQueued)return;renderQueued=false;if(session&&!panel.hidden)renderStep();};
      requestAnimationFrame(draw);setTimeout(draw,50);
    }
    const loadCM=()=>cmLoad??=new Promise((resolve,reject)=>{
      if(window.CodeMirror?.modes?.clike)return resolve(window.CodeMirror);
      for(const href of ['codemirror.min.css','theme/material-darker.min.css']){const l=document.createElement('link');l.rel='stylesheet';l.href=CM+href;document.head.append(l);}
      const add=(src,next)=>{const s=document.createElement('script');s.src=CM+src;s.onload=next;s.onerror=()=>{cmLoad=null;reject(new Error('CodeMirror could not be loaded ('+src+'). Is the internet connection available?'));};document.head.append(s);};
      add('codemirror.min.js',()=>add('mode/clike/clike.min.js',()=>resolve(window.CodeMirror)));
    });
    const num=v=>typeof v==='boolean'?String(v):!Number.isFinite(v)?String(v):Number.isInteger(v)&&Math.abs(v)<1e7?String(v):
      Math.abs(v)>=1e5||(v!==0&&Math.abs(v)<1e-4)?v.toExponential(4):String(+v.toFixed(5));
    const fmt=(value,type)=>{
      if(!value)return '—';
      if(value.columns)return type+'('+value.columns.map(c=>'['+c.map(num).join(', ')+']').join(', ')+')';
      const raw=value.raw;return raw.length===1?num(raw[0]):(type||'vec'+raw.length)+'('+raw.map(num).join(', ')+')';
    };
    const swatchOf=(value,type)=>{
      if(!value||value.columns||!/^vec[34]$/.test(type||''))return null;
      const c=v=>Math.round(Math.max(0,Math.min(1,v))*255),s=el('i','cx-dbg-sw');s.style.background='rgb('+c(value.raw[0])+','+c(value.raw[1])+','+c(value.raw[2])+')';return s;
    };
    const canvasRect=()=>{const c=[...document.querySelectorAll('canvas')].filter(c=>!c.closest('#cx')).sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0];return c?.getBoundingClientRect();};
    const debuggable=()=>{const api=insp(),step=api?.steps()[api.index];return !!step&&step.kind!=='final'&&!/^compute:/.test(step.pass);};
    const builds=new Map();
    const lastBuild=pass=>{try{return Number(localStorage.getItem('gbufferd-dbg-build:'+pass))||0;}catch{return 0;}};
    const clock=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
    const buildOf=pass=>{let b=builds.get(pass);if(!b){b={pass,start:performance.now(),phase:'compile',pending:0,total:0,done:false,estimate:lastBuild(pass)};builds.set(pass,b);}return b;};
    const progressFor=pass=>p=>{const b=buildOf(pass);b.phase=p.phase;if(p.pending!=null){b.pending=p.pending;b.total=Math.max(b.total,p.pending);}tickBuilds();};
    const finishBuild=(pass,error)=>{const b=builds.get(pass);if(!b||b.done)return;b.done=true;b.error=error||null;
      const seconds=(performance.now()-b.start)/1000;if(!error&&seconds>3)try{localStorage.setItem('gbufferd-dbg-build:'+pass,String(Math.round(seconds)));}catch{}
      tickBuilds();};
    const buildText=b=>{
      const s=(performance.now()-b.start)/1000,est=b.estimate?', last time about '+clock(b.estimate):'';
      if(b.phase==='compile')return 'Translating the shader… '+clock(s)+est;
      return 'GPU driver building pipelines'+(b.total?' ('+(b.total-b.pending)+' of '+b.total+' ready)':'')+', '+clock(s)+est;
    };
    function tickBuilds(){
      for(const node of root.querySelectorAll('[data-build]')){
        const b=builds.get(node.dataset.build);if(!b)continue;
        const s=(performance.now()-b.start)/1000;
        const text=node.querySelector('.cx-dbg-wtext');if(text)text.textContent=buildText(b);
        const fill=node.querySelector('.cx-dbg-wfill');
        if(fill){
          if(b.estimate){fill.classList.remove('cx-dbg-indet');fill.style.width=Math.min(96,s/b.estimate*100)+'%';}
          else{fill.classList.add('cx-dbg-indet');fill.style.width='100%';}
        }
      }
    }
    setInterval(()=>{if([...builds.values()].some(b=>!b.done))tickBuilds();},500);
    const waitCard=(pass,what)=>{
      const card=el('div','cx-dbg-wait');card.dataset.build=pass;
      const spin=el('div','cx-dbg-spin'),body=el('div','cx-dbg-wbody');
      body.append(el('b',null,what),el('span','cx-dbg-wtext',buildText(buildOf(pass))));
      const barEl=el('div','cx-dbg-wbar');barEl.append(el('i','cx-dbg-wfill'));body.append(barEl);
      card.append(spin,body);return card;
    };
    const hintBusy=(pass,label)=>{const s=el('span','cx-dbg-hint cx-dbg-hbusy');s.dataset.build=pass;s.append(el('i','cx-dbg-spin cx-dbg-spin-s'),el('span',null,label+': '),el('span','cx-dbg-wtext',buildText(buildOf(pass))));return s;};
    const warmUp=()=>{
      const api=insp(),step=api.steps()[api.index],key=step?.pass;
      if(!key||warm.key===key)return;
      warm={key,state:'busy'};loadCM().catch(()=>{});
      const b=builds.get(key);if(b&&b.done&&!b.error){warm.state='ready';return;}
      if(b&&!b.done)return;
      builds.delete(key);buildOf(key);
      api.warmDebugger(progressFor(key))
        .then(ok=>{finishBuild(key);if(warm.key===key){warm.state=ok?'ready':'idle';renderBar();}})
        .catch(error=>{finishBuild(key,error);if(warm.key===key){warm.state='error';warm.error=String(error?.message||error).slice(0,140);renderBar();}});
    };
    const renderBar=()=>{
      const api=insp(),open=!!api?.open;
      bar.hidden=!open;
      if(!open){if(api?.paused)api.resume();stopPick();closePanel();return;}
      const paused=api.paused;
      bar.replaceChildren(
        button(paused?'▶  Resume':'❚❚  Pause',paused?'Continue rendering':'Freeze this frame (exact replay for the debugger)',()=>{warm={key:null,state:'idle'};paused?api.resume():api.pause();}),
        button(picking?'✕  Cancel pick':'⌖  Pick pixel','Choose a pixel of the selected pass output and step through its shader',()=>picking?stopPick():startPick(),!paused||!debuggable()),
        (()=>{const on=!!api.triangleEdges,ok=api.triangleEdgesSupported?.()!==false;
          const b=button('Show triangle edges',ok?'Outline every triangle the selected pass draws (only the front ones)':'Needs the WebGPU feature primitive-index, which this browser or GPU does not offer',()=>{api.setTriangleEdges(!api.triangleEdges);renderBar();},!ok);
          b.setAttribute('aria-pressed',String(on));b.classList.add('cx-dbg-edges');return b;})(),
        ...(api.writeSwitchCount?.()?[button('↺  Enable all ('+api.writeSwitchCount()+')','Switch every pass and every buffer write back on',()=>{api.enableAll();document.dispatchEvent(new CustomEvent('gbufferd-inspector'));if(api.paused)try{api.replay();}catch(e){console.warn(e);}})]:[]),
        el('span','cx-dbg-hint',!paused?'Pause to debug a pixel':!debuggable()?'Select a pass output (not the final image)':picking?'Click a pixel (Esc cancels)':warm.state==='ready'?'Debugger ready, pick a pixel':warm.state==='error'?'Debugger: '+warm.error:'Paused'));
      if(paused&&debuggable())warmUp();
      {const step=api.steps()[api.index],b=step&&builds.get(step.pass);
        if(paused&&!picking&&b&&!b.done){bar.lastChild.replaceWith(hintBusy(step.pass,'Preparing the debugger'));tickBuilds();}}
      document.documentElement.classList.toggle('cx-dbg-paused',paused);
    };
    const texAt=(cx,cy)=>{
      const size=insp()?.textureSize(),r=canvasRect();if(!size||!r)return null;
      const x=Math.floor((cx-r.left)/r.width*size[0]),top=Math.floor((cy-r.top)/r.height*size[1]);
      if(x<0||top<0||x>=size[0]||top>=size[1])return null;
      return {x,y:size[1]-1-top,size};
    };
    const N=15,CELL=11;
    const drawLens=async()=>{
      if(lensBusy||!lensWanted)return;
      const want=lensWanted;lensWanted=null;lensBusy=true;
      try{
        const {x,y,size}=want,x0=Math.max(0,Math.min(size[0]-N,x-7)),y0=Math.max(0,Math.min(size[1]-N,y-7));
        const r=await insp().readPixels(x0,y0,N,N);
        const g=lens.getContext('2d');g.fillStyle='#111';g.fillRect(0,0,lens.width,lens.height);
        const texels=r?.texels||[];const w=Math.min(N,size[0]),h=Math.min(N,size[1]);
        const show=v=>{v=Number(v)||0;if(v>1)v=v/(1+v)*2;return Math.round(Math.max(0,Math.min(1,v))*255);};
        const api=insp(),stepName=String(api.steps()[api.index]?.name||'');
        let color=t=>'rgb('+show(t[0])+','+show(t[1])+','+show(t[2])+')';
        if(/depth/i.test(stepName)||/depth/i.test(String(r?.format||''))){
          let lo=Infinity,hi=-Infinity;for(const t of texels){const d=Number(t?.[0]);if(d<1&&d>=0){lo=Math.min(lo,d);hi=Math.max(hi,d);}}
          color=t=>{const d=Number(t[0]);const v=!(d<1)?0:hi>lo?Math.round((0.15+0.85*(1-(d-lo)/(hi-lo)))*255):200;return 'rgb('+v+','+v+','+v+')';};
        }
        for(let j=0;j<h;j++)for(let i=0;i<w;i++){const t=texels[j*w+i]||[0,0,0,1];g.fillStyle=color(t);g.fillRect(i*CELL,(h-1-j)*CELL,CELL,CELL);}
        const ci=x-x0,cj=y-y0;g.strokeStyle='#ffe066';g.lineWidth=2;g.strokeRect(ci*CELL+1,(h-1-cj)*CELL+1,CELL-2,CELL-2);
        const c=texels[cj*w+ci]||[0,0,0,0];
        g.fillStyle='#e8ebe1';g.font='11px ui-monospace,Consolas,monospace';
        g.fillText('pixel '+x+', '+y,4,N*CELL+14);
        g.fillText(c.slice(0,4).map(v=>num(Number(v))).join('  ').slice(0,30),4,N*CELL+28);
      }catch{}finally{lensBusy=false;if(lensWanted)drawLens();}
    };
    const onPickMove=e=>{
      const at=texAt(e.clientX,e.clientY);
      if(!at){lens.hidden=true;return;}
      lens.hidden=false;
      const lx=e.clientX+24+lens.offsetWidth>innerWidth?e.clientX-24-lens.offsetWidth:e.clientX+24,ly=e.clientY+24+lens.offsetHeight>innerHeight?e.clientY-24-lens.offsetHeight:e.clientY+24;
      lens.style.left=lx+'px';lens.style.top=ly+'px';
      lensWanted=at;drawLens();
    };
    const onPickClick=e=>{const at=texAt(e.clientX,e.clientY);if(!at)return;e.preventDefault();stopPick();debugPixel(at.x,at.y);};
    const onKey=e=>{if(e.key==='Escape'&&picking){stopPick();e.preventDefault();e.stopPropagation();}};
    function startPick(){picking=true;pickLayer.hidden=false;document.addEventListener('keydown',onKey,true);renderBar();}
    function stopPick(){if(!picking)return;picking=false;pickLayer.hidden=true;lens.hidden=true;document.removeEventListener('keydown',onKey,true);renderBar();}
    pickLayer.addEventListener('mousemove',onPickMove);pickLayer.addEventListener('click',onPickClick);
    pickLayer.addEventListener('mouseleave',()=>{lens.hidden=true;});
    let keyFocus='insp',setKeyFocus=()=>{};
    function closePanel(){panel.hidden=true;tip.hidden=true;session=null;document.documentElement.classList.remove('cx-dbg-open');setKeyFocus('insp');}
    const message=(title,text,error=false)=>{
      panel.hidden=false;document.documentElement.classList.add('cx-dbg-open');
      const head=el('header');head.append(el('b',null,'Pixel debugger'),el('span','cx-dbg-sub',title),button('✕','Close',closePanel));
      const body=el('div','cx-dbg-msg'+(error?' cx-dbg-err':''),text);panel.replaceChildren(head,body);
    };
    async function debugPixel(x,y){
      const api=insp(),step=api.steps()[api.index];
      const title=step.pass+' at pixel '+x+', '+y;
      message(title,'');
      try{
        panel.querySelector('.cx-dbg-msg').textContent='Checking whether '+step.pass+' drew this pixel…';
        const cover=await api.passCovers?.(x,y);
        if(cover&&!cover.covered){message(title,cover.disabled?step.pass+' is switched off, so it drew nothing here. Switch it on and pick again.':step.pass+' did not draw this pixel: the buffer is the same with and without this pass (no geometry of it here, all of it discarded, or hidden behind something closer). Pick a pixel this pass drew.');return;}
      }catch(error){console.warn('Pixel debugger: coverage check failed',error);}
      const b=builds.get(step.pass);
      if(!b||b.error||!b.done){if(!b||b.error)builds.delete(step.pass);buildOf(step.pass);
        panel.querySelector('.cx-dbg-msg').replaceWith(waitCard(step.pass,'Building the traced shader for '+step.pass));tickBuilds();}
      else panel.querySelector('.cx-dbg-msg').textContent='Replaying the paused frame for this pixel…';
      const progress=p=>{
        if(p.phase==='pipelines'&&!panel.querySelector('[data-build]')){
          const old=builds.get(step.pass);if(old?.done)builds.delete(step.pass);buildOf(step.pass).phase='pipelines';
          const m=panel.querySelector('.cx-dbg-msg');if(m)m.replaceWith(waitCard(step.pass,'Building GPU pipelines for '+step.pass));
        }
        progressFor(step.pass)(p);
      };
      let result;
      try{[result]=await Promise.all([api.debugPixel(x,y,progress),loadCM()]);finishBuild(step.pass);}
      catch(error){finishBuild(step.pass,error);message(step.pass+' at pixel '+x+', '+y,String(error?.message||error),true);return;}
      if(!result.trace.invocations.length){message(step.pass+' at pixel '+x+', '+y,'This pass did not run its shader at this pixel (no geometry of this pass covers it, or the pass skipped it).');return;}
      openSession(result,x,y);
    }
    function prepareInvocation(result,index){
      const events=result.trace.invocations[index].events,meta=result.meta;
      const steps=[],depth=new Int32Array(events.length),fnAt=new Int32Array(events.length).fill(-1),byId=new Map();
      let d=0;const stack=[];
      for(let i=0;i<events.length;i++){
        const e=events[i];depth[i]=d;fnAt[i]=stack.length?stack[stack.length-1]:-1;
        if(e.kind===5){const fn=meta.events[e.id]?.fn;stack.push(fn??-1);d++;depth[i]=d;fnAt[i]=fn??-1;steps.push(i);}
        else if(e.kind===1)steps.push(i);
        else if(e.kind===6||e.kind===3){stack.pop();d=Math.max(0,d-1);}
        if(e.kind===7){if(!byId.has(e.id))byId.set(e.id,[]);byId.get(e.id).push(i);}
      }
      return {events,steps,allSteps:steps,depth,fnAt,byId};
    }
    const valueAt=(inv,id,eventIndex)=>{
      const list=inv.byId.get(id);if(!list)return null;
      let lo=0,hi=list.length-1,found=-1;
      while(lo<=hi){const mid=(lo+hi)>>1;if(list[mid]<=eventIndex){found=list[mid];lo=mid+1;}else hi=mid-1;}
      return found<0?null:inv.events[found].value;
    };
    function openSession(result,x,y){
      const invocations=result.trace.invocations;
      session={result,x,y,invIndex:invocations.length-1,inv:null,cur:0,view:result.origin?'original':'compiled',marks:[]};
      session.inv=prepareInvocation(result,session.invIndex);
      session.cur=session.inv.steps.length?0:-1;
      buildPanel();
    }
    function displayModel(){
      const res=session.result,meta=res.meta,o=res.origin;
      if(session.view==='original'&&o){
        const toFinal=new Map();o.finalToRaw.forEach((raw,fin)=>{if(raw>=0){if(!toFinal.has(raw))toFinal.set(raw,[]);toFinal.get(raw).push(fin);}});
        const map=fin=>{for(let f=fin;f>=0;f--){const r=o.finalToRaw[f];if(r>=0)return r;}return 0;};
        return {text:o.raw.join('\n'),lineOf:map,finals:raw=>toFinal.get(raw)||[],off:raw=>o.state[raw]!=='a',has:fin=>o.finalToRaw[fin]>=0};
      }
      return {text:meta.lines.join('\n'),lineOf:fin=>fin,finals:line=>[line],off:()=>false,has:()=>true};
    }
    function buildPanel(){
      const res=session.result,meta=res.meta;
      panel.hidden=false;document.documentElement.classList.add('cx-dbg-open');
      const head=el('header');
      const sel=el('select');
      res.trace.invocations.forEach((inv,i)=>{
        const fc=inv.events.find(e=>e.kind===7&&e.id===meta.fragCoordId)?.value?.raw;
        const o=el('option',null,'Invocation '+(i+1)+' of '+res.trace.invocations.length+(fc?' (z '+num(fc[2])+')':''));o.value=String(i);sel.append(o);
      });
      sel.value=String(session.invIndex);sel.hidden=res.trace.invocations.length<2;
      sel.addEventListener('change',()=>{session.invIndex=Number(sel.value);session.inv=prepareInvocation(res,session.invIndex);session.cur=0;applyStepFilter();renderOutputs();renderStep();});
      const sub=el('span','cx-dbg-sub');
      sub.append(res.pass+' at pixel '+session.x+', '+session.y+(res.trace.truncated?' (trace cut at '+res.trace.count+' events)':''));
      session.outputs=el('span','cx-dbg-outs');sub.append(session.outputs);renderOutputs();
      head.append(el('b',null,'Pixel debugger'),sub,sel,button('✕','Close',closePanel));
      const tools=el('div','cx-dbg-tools');
      const go=fn=>()=>{const n=fn();if(n!=null&&n>=0&&n<session.inv.steps.length&&n!==session.cur){session.cur=n;scheduleRender();}};
      const depthOf=s=>session.inv.depth[session.inv.steps[s]];
      const stepOver=dir=>()=>{const d=depthOf(session.cur);for(let s=session.cur+dir;s>=0&&s<session.inv.steps.length;s+=dir)if(depthOf(s)<=d)return s;return dir>0?session.inv.steps.length-1:0;};
      const stepOut=()=>{const d=depthOf(session.cur);for(let s=session.cur+1;s<session.inv.steps.length;s++)if(depthOf(s)<d)return s;return session.inv.steps.length-1;};
      const mainStep=()=>{const meta=session.result.meta,inv=session.inv,mainId=meta.functions.findIndex(f=>f.name==='main');const s=inv.steps.findIndex(i=>inv.events[i].kind===5&&meta.events[inv.events[i].id].fn===mainId);return s<0?0:s;};
      session.actions={start:go(()=>0),main:go(mainStep),backOver:go(stepOver(-1)),back:go(()=>session.cur-1),into:go(()=>session.cur+1),over:go(stepOver(1)),out:go(stepOut),end:go(()=>session.inv.steps.length-1)};
      const A=session.actions;
      const slider=el('input');slider.type='range';slider.min='0';slider.max=String(Math.max(0,session.inv.steps.length-1));slider.addEventListener('input',()=>{session.cur=Number(slider.value);renderStep();});
      session.slider=slider;session.pos=el('span','cx-dbg-pos');
      const outButton=button('𝑓','Step out of the function (Shift+F12)',A.out);outButton.classList.add('cx-dbg-fout');
      const mainButton=button('main()','Jump to the call of main() (M)',A.main);mainButton.classList.add('cx-dbg-main');
      tools.append(button('⏮','To the first step (Home)',A.start),mainButton,holdButton('◀','Step back (← / ↑, Shift+F11). Hold to run back.',A.back),
        holdButton('▶','Step forward (→ / ↓, F11). Hold to run forward.',A.into),outButton,button('⏭','To the last step (End)',A.end),session.pos,slider);
      const code=el('div','cx-dbg-code');
      const locals=el('div','cx-dbg-locals');session.locals=locals;
      panel.replaceChildren(head,tools,code,locals);
      setKeyFocus('dbg');
      cm=window.CodeMirror(code,{value:'',mode:'x-shader/x-fragment',theme:'material-darker',readOnly:true,lineNumbers:true,gutters:['cx-dbg-gutter','CodeMirror-linenumbers'],viewportMargin:30});
      cm.on('gutterClick',(_,line)=>runToLine(line));
      const wrap=cm.getWrapperElement();
      wrap.addEventListener('mousemove',hover);wrap.addEventListener('mouseleave',()=>{tip.hidden=true;clearFunctionHighlight();});
      wrap.addEventListener('mousedown',e=>{if(e.ctrlKey&&session?.fnLine!=null){const line=session.fnLine;cm.scrollIntoView({line,ch:0},160);e.preventDefault();e.stopPropagation();}},true);
      loadText();renderStep();
      setTimeout(()=>cm.refresh(),0);
    }
    function loadText(){
      const model=displayModel();session.model=model;applyStepFilter();
      cm.setValue(model.text);
      const inc=session.view==='original'?session.result.origin?.includes:null;
      const n=cm.lineCount();
      const chainAt=i=>inc?.[i]?.[3]||[];
      const same=(a,b,k)=>{if(a.length<k||b.length<k)return false;for(let q=0;q<k;q++)if(a[q]!==b[q])return false;return true;};
      session.folds=[];session.boxWidgets=[];session.boxLines=[];
      cm.operation(()=>{
        for(let i=0;i<n;i++)if(model.off(i))cm.addLineClass(i,'wrap','cx-dbg-off');
        for(let i=0;i<n;){
          if(!model.off(i)){i++;continue;}
          const base=chainAt(i),L=base.length;
          let j=i;while(j+1<n&&model.off(j+1)&&same(chainAt(j+1),base,L))j++;
          for(;;){
            const cj=chainAt(j);
            if(j>i&&cj.length>L&&j+1<n&&same(chainAt(j+1),cj,L+1)){let s=j;while(s>i&&same(chainAt(s-1),cj,L+1))s--;j=s-1;continue;}
            break;
          }
          if(j<i)j=i;
          if(j-i+1>=6){
            const w=el('span','cx-dbg-fold','⋯ '+(j-i+1)+' lines removed by the preprocessor ⋯');
            const mark=cm.markText({line:i,ch:0},{line:j,ch:cm.getLine(j).length},{collapsed:true,replacedWith:w,inclusiveLeft:true,inclusiveRight:true});
            const fold={i,j,mark};session.folds.push(fold);
            w.addEventListener('click',()=>{mark.clear();session.folds=session.folds.filter(f=>f!==fold);cm.operation(buildBoxes);});
          }
          i=j+1;
        }
        buildBoxes();
      });
      function buildBoxes(){
        for(const w of session.boxWidgets)w.clear();for(const [line,cls] of session.boxLines)cm.removeLineClass(line,'text',cls);
        session.boxWidgets=[];session.boxLines=[];
        if(!inc)return;
        const D=8,eff=new Array(n);
        for(let i=0;i<n;i++)eff[i]=chainAt(i).slice(0,D);
        for(const f of session.folds)for(let k=f.i+1;k<=f.j;k++)eff[k]=eff[f.i];
        const name=path=>String(path||'').replace(/^\/+/,'/');
        const eq=(a,b,k)=>{for(let q=0;q<k;q++)if(a[q]!==b[q])return false;return true;};
        for(let i=0;i<n;i++){
          const chain=eff[i],prev=i>0?eff[i-1]:[],next=i+1<n?eff[i+1]:[];
          if(chain.length){const cls='cx-incd-'+chain.length;cm.addLineClass(i,'text',cls);session.boxLines.push([i,cls]);}
          for(let k=1;k<=chain.length;k++)if(prev.length<k||!eq(prev,chain,k)){
            const top=el('div','cx-inc-top cx-incd-'+(k-1));const edge=el('div','cx-inc-edge');edge.style.marginLeft=((k-1)*8+2)+'px';top.append(edge);
            session.boxWidgets.push(cm.addLineWidget(i,top,{above:true,noHScroll:true}));
          }
          for(let k=chain.length;k>=1;k--)if(next.length<k||!eq(next,chain,k)){
            const bottom=el('div','cx-inc-bottom cx-incd-'+(k-1));const edge=el('div','cx-inc-edge');edge.style.marginLeft=((k-1)*8+2)+'px';
            edge.append(el('span','cx-inc-name',name(chain[k-1])));bottom.append(edge);
            session.boxWidgets.push(cm.addLineWidget(i,bottom,{noHScroll:true}));
          }
        }
      }
      session.lastLine=null;
    }
    function applyStepFilter(){
      const inv=session.inv,meta=session.result.meta,model=session.model;if(!inv||!model)return;
      const at=inv.steps[session.cur]??0;
      const mainId=meta.functions.findIndex(f=>f.name==='main'),mainLine=mainId>=0&&session.view==='original'?model.lineOf(meta.functions[mainId].line):-1;
      const moved=[],rest=[];
      for(const i of inv.allSteps){
        const e=inv.events[i],line=meta.events[e.id].line;if(!model.has(line))continue;
        if(mainLine>=0&&e.kind===1&&inv.fnAt[i]===mainId&&model.lineOf(line)<mainLine)moved.push(i);else rest.push(i);
      }
      const enter=rest.findIndex(i=>inv.events[i].kind===5&&meta.events[inv.events[i].id].fn===mainId);
      const ordered=moved.length&&enter>=0?[...rest.slice(0,enter),...moved,...rest.slice(enter)]:rest;
      inv.steps=ordered.filter((i,k)=>{
        if(k===0)return true;
        const prev=ordered[k-1],e=inv.events[i],p=inv.events[prev];
        return !(p.kind===5&&e.kind===1&&inv.depth[i]===inv.depth[prev]&&model.lineOf(meta.events[e.id].line)===model.lineOf(meta.events[p.id].line));
      });
      inv.preMain=new Set(moved);
      inv.sortedSteps=inv.steps.map((event,pos)=>[event,pos]).sort((a,b)=>a[0]-b[0]);
      const cur=inv.steps.findIndex(i=>i>=at);session.cur=cur<0?Math.max(0,inv.steps.length-1):cur;
      if(session.slider)session.slider.max=String(Math.max(0,inv.steps.length-1));
    }
    function renderOutputs(){
      const box=session?.outputs;if(!box)return;box.replaceChildren();
      const res=session.result,meta=res.meta,inv=session.inv,targets=res.targets||[];
      const show=v=>{v=Number(v)||0;if(v>1)v=v/(1+v)*2;return Math.round(Math.max(0,Math.min(1,v))*255);};
      targets.forEach((logical,slot)=>{
        const v=meta.vars.find(x=>x.name==='outColor'+slot&&x.fn==null),writes=v&&inv.byId.get(v.id);
        const value=writes?.length?inv.events[writes[writes.length-1]].value:null;
        const item=el('span','cx-dbg-out');item.append('colortex'+logical);
        const sw=el('i','cx-dbg-pxsw');
        if(value){const r=value.raw;sw.style.background='rgb('+show(r[0])+','+show(r[1])+','+show(r[2])+')';
          sw.title='colortex'+logical+(res.formats?.[logical]?' ('+res.formats[logical].replace(/\s*→.*$/,'')+')':'')+' ← outColor'+slot+'\nR '+num(r[0])+'  G '+num(r[1])+'  B '+num(r[2])+'  A '+num(r[3]??1)+'\nwhat the shader wrote for this pixel (before blending)';}
        else{sw.classList.add('cx-dbg-pxnone');sw.title='colortex'+logical+': nothing written by this invocation (discarded or not reached)';}
        item.append(sw);box.append(item);
      });
    }
    function runToLine(line){
      const inv=session.inv,meta=session.result.meta,model=session.model;
      for(let k=1;k<=inv.steps.length;k++){const s=(session.cur+k)%inv.steps.length,e=inv.events[inv.steps[s]];if(model.lineOf(meta.events[e.id].line)===line){session.cur=s;renderStep();return;}}
    }
    function renderStep(){
      const inv=session.inv,meta=session.result.meta,model=session.model;
      for(const m of session.marks)m.clear();session.marks=[];
      if(session.lastLine!=null){cm.removeLineClass(session.lastLine,'background','cx-dbg-cur');cm.removeLineClass(session.lastLine,'background','cx-dbg-pre');cm.setGutterMarker(session.lastLine,'cx-dbg-gutter',null);}
      if(session.cur<0||!inv.steps.length){session.pos.textContent='no steps';return;}
      const ei=inv.steps[session.cur],e=inv.events[ei],final=meta.events[e.id].line,line=model.lineOf(final),pre=!!inv.preMain?.has(ei);
      cm.addLineClass(line,'background',pre?'cx-dbg-pre':'cx-dbg-cur');const arrow=el('div','cx-dbg-arrow'+(pre?' cx-dbg-arrow-pre':''),'▶');cm.setGutterMarker(line,'cx-dbg-gutter',arrow);session.lastLine=line;
      cm.scrollIntoView({line,ch:0},120);
      session.slider.value=String(session.cur);session.pos.textContent='Step '+(session.cur+1)+' / '+inv.steps.length;
      const nextOf=at=>{let n=inv.events.length;for(const [event] of inv.sortedSteps||[])if(event>at){n=event;break;}return n;};
      const notesOf=(at,stop)=>{
        const out=[];
        for(let i=at+1;i<stop;i++){
          const x=inv.events[i];
          if(x.kind===2)out.push({t:x.value.raw[0]?'→ true':'→ false',c:x.value.raw[0]?'cx-dbg-true':'cx-dbg-false'});
          else if(x.kind===7&&x.id!==meta.fragCoordId&&inv.depth[i]===inv.depth[at]){const v=meta.vars[x.id];if(v)out.push({t:v.name+' = '+fmt(x.value,v.type),c:'cx-dbg-val'});}
          else if(x.kind===3){const fn=meta.functions[meta.events[x.id]?.fn];out.push({t:'return '+fmt(x.value,fn?.ret),c:'cx-dbg-val'});}
          else if(x.kind===4)out.push({t:'discard',c:'cx-dbg-false'});
          if(x.kind===1||x.kind===5)break;
        }
        return out;
      };
      const next=nextOf(ei);
      const notes=notesOf(ei,next);
      {
        const past=new Map();
        for(let s=Math.max(0,session.cur-400);s<session.cur;s++){
          const si=inv.steps[s],se=inv.events[si],pl=model.lineOf(meta.events[se.id].line);if(pl===line)continue;
          const pn=notesOf(si,nextOf(si)).filter(n=>n.c==='cx-dbg-val'||n.c==='cx-dbg-true'||n.c==='cx-dbg-false');
          if(pn.length)past.set(pl,pn);
        }
        for(const [pl,pn] of past){
          const w=el('span','cx-dbg-notes cx-dbg-past');for(const n of pn.slice(0,6))w.append(el('span',n.c,n.t));
          session.marks.push(cm.setBookmark({line:pl,ch:cm.getLine(pl).length},{widget:w,insertLeft:true}));
        }
      }
      if(e.kind===5){
        const fnName=meta.functions[meta.events[e.id].fn]?.name||'';
        notes.unshift({t:'call '+fnName,c:'cx-dbg-call',fn:fnName});
      }
      if(pre)notes.unshift({t:'(Ran before main.)',c:'cx-dbg-prenote'});
      if(notes.length){
        const w=el('span','cx-dbg-notes');for(const n of notes.slice(0,8)){const s=el('span',n.c,n.t);if(n.fn)s.dataset.fn=n.fn;w.append(s);}
        session.marks.push(cm.setBookmark({line,ch:cm.getLine(line).length},{widget:w,insertLeft:true}));
      }
      renderLocals(e.kind===5?next-1:ei);
    }
    function renderLocals(ei){
      const inv=session.inv,meta=session.result.meta,fn=inv.fnAt[ei];
      const box=session.locals;box.replaceChildren();
      const title=el('div','cx-dbg-lt','Locals'+(fn>=0?' in '+meta.functions[fn]?.name+'()':''));box.append(title);
      const prevEvent=session.cur>0?inv.steps[session.cur-1]:-1;
      const vars=meta.vars.filter(v=>v.fn===fn&&v.kind!=='builtin');
      const grid=el('div','cx-dbg-lg');
      for(const v of vars){
        const value=valueAt(inv,v.id,ei);if(!value)continue;
        const before=prevEvent>=0?valueAt(inv,v.id,prevEvent):null;
        const changed=!before||JSON.stringify(before)!==JSON.stringify(value);
        const n=el('span','cx-dbg-ln'+(changed?' cx-dbg-changed':''),v.name),t=el('span','cx-dbg-lv');
        const sw=swatchOf(value,v.type);if(sw)t.append(sw);t.append(fmt(value,v.type));grid.append(n,t);
      }
      if(!grid.childNodes.length)grid.append(el('span','cx-dbg-ln','—'));
      box.append(grid);
    }
    async function hover(ev){
      if(!session||!cm)return;
      const pos=cm.coordsChar({left:ev.clientX,top:ev.clientY},'window');const text=cm.getLine(pos.line)||'';
      let name=null,wordAt=-1;for(const m of text.matchAll(/[A-Za-z_]\w*/g)){if(pos.ch>=m.index&&pos.ch<=m.index+m[0].length){name=m[0];wordAt=m.index;break;}}
      const noteFn=ev.target?.closest?.('[data-fn]')?.dataset.fn;
      const hoverFn=noteFn||(name&&/^\s*\(/.test(text.slice(text.indexOf(name,Math.max(0,pos.ch-name.length))+name.length))&&session.result.meta.functions.some(f=>f.name===name)?name:null);
      if(hoverFn){tip.dataset.key='';showFunction(hoverFn,ev);return;}
      clearFunctionHighlight();
      if(!name){tip.hidden=true;tip.dataset.key='';return;}
      const meta=session.result.meta,inv=session.inv,si=inv.steps[session.cur]??0,ei=inv.events[si]?.kind===5?(session.cur+1<inv.steps.length?inv.steps[session.cur+1]-1:inv.events.length-1):si;
      const finals=new Set(session.model.finals(pos.line));
      let id=-1;
      for(const r of meta.refs)if(finals.has(r.line)&&meta.vars[r.id]?.name===name){id=r.id;break;}
      if(id<0){const fn=inv.fnAt[ei];const v=meta.vars.find(v=>v.name===name&&v.fn===fn)||meta.vars.find(v=>v.name===name&&v.fn==null);if(v)id=v.id;}
      const declaredAt=varName=>{const d=meta.vars.find(x=>x.name===varName&&x.fn==null&&x.line!=null);return d?', declared in line '+(session.model.lineOf(d.line)+1):'';};
      if(/^(?:texture(?:2D|3D|Lod|2DLod|Grad|Offset|Proj)?|texelFetch(?:Offset)?|textureCatmullRom)$/.test(name)){
        const at=text.indexOf(name,Math.max(0,pos.ch-name.length)),open=text.indexOf('(',at+name.length);
        if(open>=0&&/^\s*$/.test(text.slice(at+name.length,open))){
          const args=[];let depth=0,start=open+1;
          for(let k=open+1;k<text.length;k++){const ch=text[k];if(ch==='('||ch==='[')depth++;else if(ch===')'||ch===']'){if(!depth){args.push(text.slice(start,k));break;}depth--;}else if(ch===','&&!depth){args.push(text.slice(start,k));start=k+1;}}
          if(args.length>=2){await showSample(name,args[0].trim(),args[1].trim(),pos.line,ev,ei);return;}
        }
      }
      if(meta.samplers.includes(name)&&session.result.samplers.some(s=>s.name===name)){
        const info=session.result.samplers.find(s=>s.name===name),key='s|'+name;
        if(!tip.hidden&&tip.dataset.key===key){showTip(ev);return;}
        tip.replaceChildren();tip.dataset.key=key;
        tip.append(el('b',null,name),el('span','cx-dbg-tt',info.width+'×'+info.height+' '+info.format+', as the pass read it'+declaredAt(name)));
        const c=el('canvas','cx-dbg-full');const fit=Math.min(300/info.width,300/info.height,4);
        c.style.width=Math.max(1,Math.round(info.width*fit))+'px';c.style.height=Math.max(1,Math.round(info.height*fit))+'px';tip.append(c);showTip(ev);
        let p=previews.get(name);if(!p){p=insp().texturePreview(name);previews.set(name,p);}
        const img=await p;if(!img||img.unsupported||tip.lastChild!==c)return;
        c.width=img.width;c.height=img.height;c.getContext('2d').putImageData(new ImageData(img.data,img.width,img.height),0,0);if(tip.lastEvent)showTip(tip.lastEvent);
        return;
      }
      if(id<0){const hit=bufferAt(name,wordAt,text);if(hit){await showBuffer(hit,pos.line,ev,ei,text);return;}}
      if(id<0){tip.hidden=true;tip.dataset.key='';return;}
      tip.replaceChildren();tip.dataset.key='';
      const v=meta.vars[id],value=valueAt(inv,id,ei);
      const fnName=v.fn!=null?meta.functions[v.fn]?.name:null;
      tip.append(el('b',null,v.type+' '+v.name),el('span','cx-dbg-tt',v.kind+(fnName?' in '+fnName+'()':'')+(v.line!=null?', declared in line '+(session.model.lineOf(v.line)+1):'')));
      if(value){const row=el('div','cx-dbg-tv');const sw=swatchOf(value,v.type);if(sw)row.append(sw);row.append(fmt(value,v.type));tip.append(row);}
      showTip(ev);
    }
    async function showSample(fn,samplerName,coordText,line,ev,ei){
      const key='t|'+fn+'|'+samplerName+'|'+coordText+'|'+line+'|'+ei;
      if(!tip.hidden&&tip.dataset.key===key){showTip(ev);return;}
      const meta=session.result.meta,inv=session.inv,info=session.result.samplers.find(s=>s.name===samplerName);
      tip.dataset.key=key;tip.replaceChildren(el('b',null,fn+'('+samplerName+', '+coordText+')'));
      if(!info){tip.append(el('span','cx-dbg-tt','no texture copy for '+samplerName));showTip(ev);return;}
      const m=/^(\w+)(?:\.([xyzwrgbastpq]{1,4}))?$/.exec(coordText);
      let coord=null;
      if(m){
        const finals=new Set(session.model.finals(line));
        let id=-1;for(const r of meta.refs)if(finals.has(r.line)&&meta.vars[r.id]?.name===m[1]){id=r.id;break;}
        if(id<0){const f=inv.fnAt[ei];const v=meta.vars.find(v=>v.name===m[1]&&v.fn===f)||meta.vars.find(v=>v.name===m[1]&&v.fn==null);if(v)id=v.id;}
        const value=id>=0?valueAt(inv,id,ei):null;
        if(value&&!value.columns){
          const raw=value.raw,idx=c=>'xyzwrgbastpq'.indexOf(c)%4;
          coord=m[2]?[...m[2]].map(c=>raw[idx(c)]):raw.slice(0,2);
        }
      }
      const texel=fn.startsWith('texelFetch');
      const N=15,CELL=7,ZOOM=N*CELL,SIDE=340;
      const row=el('div','cx-dbg-samplerow'),full=el('canvas','cx-dbg-full'),zoom=el('canvas','cx-dbg-zoom'),valueRow=el('div','cx-dbg-tv','…');
      zoom.width=zoom.height=ZOOM;zoom.style.width=zoom.style.height=ZOOM+'px';
      const fit=Math.min(SIDE/info.width,SIDE/info.height);
      full.style.width=Math.max(1,Math.round(info.width*fit))+'px';full.style.height=Math.max(1,Math.round(info.height*fit))+'px';
      const fullWrap=el('div','cx-dbg-fullwrap');fullWrap.append(full);row.append(fullWrap);
      let cx=null,cy=null,x0=0,y0=0;const w=Math.min(N,info.width),h=Math.min(N,info.height);
      if(coord&&coord.length>=2){
        const tx=texel?Math.floor(coord[0]):Math.floor(coord[0]*info.width),ty=texel?Math.floor(coord[1]):Math.floor(coord[1]*info.height);
        cx=Math.max(0,Math.min(info.width-1,tx));cy=Math.max(0,Math.min(info.height-1,ty));
        x0=Math.max(0,Math.min(info.width-N,cx-7));y0=Math.max(0,Math.min(info.height-N,cy-7));
        tip.append(el('span','cx-dbg-tt',(texel?'texel':'uv ('+num(coord[0])+', '+num(coord[1])+') → texel')+' ('+tx+', '+ty+') of '+info.width+'×'+info.height+' '+info.format));
        const box=el('div','cx-dbg-blink');
        const left=x0*fit,top=(info.height-(y0+h))*fit,bw=Math.max(10,w*fit),bh=Math.max(10,h*fit);
        box.style.left=Math.round(left+w*fit/2-bw/2)+'px';box.style.top=Math.round(top+h*fit/2-bh/2)+'px';
        box.style.width=Math.round(bw)+'px';box.style.height=Math.round(bh)+'px';fullWrap.append(box);
        row.append(zoom);tip.append(row,valueRow);
      }else{
        tip.append(el('span','cx-dbg-tt',info.width+'×'+info.height+'. The coordinate "'+coordText+'" is an expression, hover its variables.'),row);
      }
      showTip(ev);
      const still=()=>tip.dataset.key===key&&full.isConnected;
      let p=previews.get(samplerName);if(!p){p=insp().texturePreview(samplerName);previews.set(samplerName,p);}
      const img=await p;if(!still())return;
      if(img&&!img.unsupported){
        full.width=img.width;full.height=img.height;const g=full.getContext('2d');g.putImageData(new ImageData(img.data,img.width,img.height),0,0);
      }
      if(tip.lastEvent)showTip(tip.lastEvent);
      if(cx==null)return;
      const r=await insp().debugTexels(samplerName,x0,y0,w,h);if(!r||!still())return;
      const texels=r.texels||[],g=zoom.getContext('2d'),show=v=>{v=Number(v)||0;if(v>1)v=v/(1+v)*2;return Math.round(Math.max(0,Math.min(1,v))*255);};
      g.fillStyle='#111';g.fillRect(0,0,zoom.width,zoom.height);
      const dr=img?.depthRange;
      const color=dr?(tx=>{const d=Number(tx[0]);const v=!(d<1)?0:Math.round((0.15+0.85*(1-(d-dr[0])/Math.max(1e-9,dr[1]-dr[0])))*255);const c=Math.max(0,Math.min(255,v));return 'rgb('+c+','+c+','+c+')';}):(tx=>'rgb('+show(tx[0])+','+show(tx[1])+','+show(tx[2])+')');
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){const t=texels[j*w+i]||[0,0,0,1];g.fillStyle=color(t);g.fillRect(i*CELL,(h-1-j)*CELL,CELL,CELL);}
      {const mx=(cx-x0)*CELL,my=(h-1-(cy-y0))*CELL;g.strokeStyle='#000';g.lineWidth=3;g.strokeRect(mx-1.5,my-1.5,CELL+3,CELL+3);g.strokeStyle='#ffe066';g.lineWidth=2;g.strokeRect(mx+1,my+1,CELL-2,CELL-2);}
      const t=texels[(cy-y0)*w+(cx-x0)];valueRow.textContent=!t?'':dr?'depth '+Number(t[0]).toFixed(6)+(Number(t[0])>=1?' (nothing drawn: sky)':''):'R '+num(Number(t[0]))+'  G '+num(Number(t[1]))+'  B '+num(Number(t[2]))+'  A '+num(Number(t[3]));
      if(tip.lastEvent)showTip(tip.lastEvent);
    }
    function bufferAt(word,start,text){
      const before=text.slice(0,start);
      for(const b of session.result.meta.buffers||[]){
        if(b.instance){
          if(word===b.instance&&!/\.\s*$/.test(before))return {buffer:b,member:null,end:start+word.length};
          const m=b.members.find(x=>x.name===word);
          if(m&&new RegExp('\\b'+b.instance+'\\s*(?:\\[[^\\]]*\\])?\\s*\\.\\s*$').test(before))return {buffer:b,member:m,end:start+word.length};
        }else{
          const m=b.members.find(x=>x.name===word);
          if(m&&!/\.\s*$/.test(before))return {buffer:b,member:m,end:start+word.length};
        }
      }
      return null;
    }
    function indexOf(text,end,line,ei){
      let k=end;while(text[k]===' ')k++;
      if(text[k]!=='[')return {text:null,value:null};
      let depth=0,close=-1;for(let q=k;q<text.length;q++){if(text[q]==='[')depth++;else if(text[q]===']'&&--depth===0){close=q;break;}}
      if(close<0)return {text:null,value:null};
      const inner=text.slice(k+1,close).trim();
      if(/^\d+u?$/.test(inner))return {text:inner,value:parseInt(inner)};
      const m=/^(?:u?int\s*\(\s*)?(\w+)(?:\.([xyzwrgbastpq]))?(?:\s*\))?$/.exec(inner);
      if(!m)return {text:inner,value:null};
      const meta=session.result.meta,inv=session.inv,finals=new Set(session.model.finals(line));
      let id=-1;for(const r of meta.refs)if(finals.has(r.line)&&meta.vars[r.id]?.name===m[1]){id=r.id;break;}
      if(id<0){const f=inv.fnAt[ei];const v=meta.vars.find(v=>v.name===m[1]&&v.fn===f)||meta.vars.find(v=>v.name===m[1]&&v.fn==null);if(v)id=v.id;}
      const value=id>=0?valueAt(inv,id,ei):null;
      if(!value||value.columns)return {text:inner,value:null};
      const c=m[2]?'xyzwrgbastpq'.indexOf(m[2])%4:0;const n=Number(value.raw[c]);
      return {text:inner,value:Number.isFinite(n)?Math.floor(n):null};
    }
    function decodeAt(dv,off,t){
      if(off<0||off+t.size>dv.byteLength)return undefined;
      const one=(o,base)=>base==='f'?dv.getFloat32(o,true):base==='i'?dv.getInt32(o,true):dv.getUint32(o,true);
      if(t.kind==='scalar')return one(off,t.base);
      if(t.kind==='vec'){const v=[];for(let c=0;c<t.comps;c++)v.push(one(off+4*c,t.base));return v;}
      if(t.kind==='mat'){const cols=[];for(let c=0;c<t.cols;c++){const col=[];for(let r=0;r<t.rows;r++)col.push(dv.getFloat32(off+c*t.colStride+4*r,true));cols.push(col);}return cols;}
      if(t.kind==='struct'){const o={};for(const f of t.fields)o[f.name]=f.array?(f.count?Array.from({length:Math.min(f.count,4)},(_,i)=>decodeAt(dv,off+f.offset+i*f.stride,f.layout)):'[…]'):decodeAt(dv,off+f.offset,f.layout);return o;}
      return undefined;
    }
    function fmtValue(v,t,type){
      if(v===undefined)return '(outside the buffer)';
      if(t.kind==='scalar')return type==='bool'?String(!!v):num(v);
      if(t.kind==='vec')return type+'('+v.map(num).join(', ')+')';
      if(t.kind==='mat')return type+'('+v.map(c=>'('+c.map(num).join(', ')+')').join(', ')+')';
      if(t.kind==='struct')return '{'+t.fields.map(f=>f.name+' = '+(Array.isArray(v[f.name])&&f.array?'['+v[f.name].map(x=>fmtValue(x,f.layout,f.type)).join(', ')+(f.count>4?', …':'')+']':fmtValue(v[f.name],f.layout,f.type))).join(', ')+'}';
      return '?';
    }
    const show8=v=>{v=Number(v)||0;if(v>1)v=v/(1+v)*2;return Math.round(Math.max(0,Math.min(1,v))*255);};
    function colourOf(v,t,range){
      if(v===undefined)return '#300';
      if(t.kind==='vec'||t.kind==='mat'){const c=t.kind==='mat'?v[0]:v;return 'rgb('+show8(c[0])+','+show8(c[1]??0)+','+show8(c[2]??0)+')';}
      if(t.kind==='struct'){const vecs=t.fields.filter(f=>!f.array&&f.layout.kind==='vec'&&f.layout.comps>=3);const f=vecs.find(f=>/colou?r|albedo|tint|rgb/i.test(f.name))||vecs.find(f=>f.layout.comps===4)||vecs[0]||t.fields.find(f=>!f.array&&f.layout.kind==='scalar');return f?colourOf(v[f.name],f.layout,range):'#444';}
      const n=Number(v);if(!Number.isFinite(n))return '#a03030';
      const g=range&&range[1]>range[0]?Math.round(30+225*(n-range[0])/(range[1]-range[0])):160;return 'rgb('+g+','+g+','+g+')';
    }
    function swatchFor(v,t){
      if(v===undefined||!(t.kind==='vec'&&t.comps>=3))return null;
      const s=el('i','cx-dbg-sw');s.style.background='rgb('+show8(v[0])+','+show8(v[1])+','+show8(v[2])+')';return s;
    }
    async function showBuffer(hit,line,ev,ei,text){
      const b=hit.buffer,m=hit.member,info=(session.result.storage||[]).find(s=>s.binding===b.binding);
      const idx=m&&m.array?indexOf(text,hit.end,line,ei):{text:null,value:null};
      const key='b|'+b.binding+'|'+(m?m.name:'')+'|'+idx.text+'|'+line+'|'+ei;
      if(!tip.hidden&&tip.dataset.key===key){showTip(ev);return;}
      tip.dataset.key=key;
      const where=', declared in line '+(session.model.lineOf(m?m.line:b.line)+1);
      const title=m?m.type+' '+m.name+(m.array?'['+(m.count??'')+']':''):'buffer '+b.name+(b.instance?' '+b.instance:'');
      tip.replaceChildren(el('b',null,title));
      tip.append(el('span','cx-dbg-tt',(m?'in buffer '+b.name+', ':'')+'SSBO binding '+b.binding+' ('+b.packing+')'+(m?', offset '+m.offset+(m.array?', stride '+m.stride:''):'')+where));
      if(!info){tip.append(el('span','cx-dbg-tt','Nothing bound at binding '+b.binding+': shaders.properties has no bufferObject.'+b.binding+'.'));showTip(ev);return;}
      const still=()=>tip.dataset.key===key;
      if(!m||!m.array){
        const fixed=b.members.filter(x=>!(x.array&&x.count==null));const end=Math.min(info.size,Math.max(16,...fixed.map(x=>x.offset+Math.max(x.bytes,x.layout.size))));
        const table=el('div','cx-dbg-btable');tip.append(table);showTip(ev);
        const r=await insp().debugBuffer(b.binding,0,Math.min(end,65536));if(!r||!still())return;
        const dv=new DataView(r.bytes.buffer,r.bytes.byteOffset,r.bytes.byteLength);
        for(const x of b.members){
          const row=el('div',x===m?'cx-dbg-bcur':null);
          let text;
          if(x.array){const count=x.count??Math.max(0,Math.floor((info.size-x.offset)/x.stride));text=x.type+'['+count+'] at offset '+x.offset+(x.count==null?' (runtime size)':'');}
          else{const v=decodeAt(dv,x.offset,x.layout);const sw=swatchFor(v,x.layout);if(sw)row.append(sw);text=fmtValue(v,x.layout,x.type);}
          row.prepend(el('span','cx-dbg-bname',x.name));row.append(text);table.append(row);
        }
        if(tip.lastEvent)showTip(tip.lastEvent);
        return;
      }
      const count=m.count??Math.max(0,Math.floor((info.size-m.offset)/m.stride));
      const W=Math.min(count,1024),index=idx.value;
      const start=index==null?0:Math.max(0,Math.min(count-W,Math.floor(index/32)*32-Math.floor(W/64)*32));
      const lines=[];
      if(idx.text!=null)lines.push(index!=null?'index '+idx.text+' = '+index+(index<0||index>=count?' (outside the array!)':''):'index "'+idx.text+'" is an expression, hover its variables');
      lines.push(count+' elements'+(m.count==null?' (runtime size, from the buffer size)':'')+(W<count?', showing '+start+' to '+(start+W-1):''));
      for(const l of lines)tip.append(el('span','cx-dbg-tt',l));
      const valueRow=el('div','cx-dbg-tv','…');
      const cols=Math.min(32,Math.max(1,W)),cell=Math.max(4,Math.floor(320/cols)),rows=Math.max(1,Math.ceil(W/cols));
      const grid=el('canvas','cx-dbg-full');grid.width=cols*cell;grid.height=rows*cell;grid.style.width=grid.width+'px';grid.style.height=grid.height+'px';
      const wrap=el('div','cx-dbg-fullwrap');wrap.append(grid);
      const list=el('div','cx-dbg-bzoom');
      const row=el('div','cx-dbg-samplerow');row.append(wrap,list);tip.append(valueRow,row);showTip(ev);
      if(!W){valueRow.textContent='empty array';return;}
      const r=await insp().debugBuffer(b.binding,m.offset+start*m.stride,W*m.stride);if(!r||!still())return;
      const base=m.offset+start*m.stride-r.offset;
      const dv=new DataView(r.bytes.buffer,r.bytes.byteOffset,r.bytes.byteLength);
      const values=Array.from({length:W},(_,i)=>decodeAt(dv,base+i*m.stride,m.layout));
      let range=null;
      if(m.layout.kind==='scalar'||(m.layout.kind==='struct')){
        const nums=values.map(v=>m.layout.kind==='scalar'?Number(v):(()=>{const f=m.layout.fields.find(f=>!f.array&&f.layout.kind==='scalar');return f&&v?Number(v[f.name]):NaN;})()).filter(Number.isFinite);
        if(nums.length)range=[Math.min(...nums),Math.max(...nums)];
      }
      const g=grid.getContext('2d');g.fillStyle='#111';g.fillRect(0,0,grid.width,grid.height);
      values.forEach((v,i)=>{g.fillStyle=colourOf(v,m.layout,range);g.fillRect((i%cols)*cell,Math.floor(i/cols)*cell,cell-(cell>5?1:0),cell-(cell>5?1:0));});
      if(index!=null&&index>=start&&index<start+W){
        const i=index-start,box=el('div','cx-dbg-blink');
        box.style.left=((i%cols)*cell-2)+'px';box.style.top=(Math.floor(i/cols)*cell-2)+'px';box.style.width=(cell+3)+'px';box.style.height=(cell+3)+'px';wrap.append(box);
        const v=values[i];valueRow.textContent='';const sw=swatchFor(v,m.layout);if(sw)valueRow.append(sw);valueRow.append(m.name+'['+index+'] = '+fmtValue(v,m.layout,m.type));
      }else valueRow.textContent=index!=null?m.name+'['+index+'] is outside the array ('+count+' elements)':'';
      const at=index!=null&&index>=start&&index<start+W?index-start:0;
      for(let i=Math.max(0,at-4);i<=Math.min(W-1,at+4);i++){
        const line=el('div',i===at&&index!=null?'cx-dbg-bcur':null);const sw=swatchFor(values[i],m.layout);
        line.append(el('span','cx-dbg-bname',String(start+i)));if(sw)line.append(sw);line.append(fmtValue(values[i],m.layout,m.type));list.append(line);
      }
      if(tip.lastEvent)showTip(tip.lastEvent);
    }
    function clearFunctionHighlight(){if(session?.fnLine!=null&&cm){cm.removeLineClass(session.fnLine,'background','cx-dbg-fnhl');session.fnLine=null;}}
    function showFunction(fnName,ev){
      const meta=session.result.meta,fns=meta.functions.filter(f=>f.name===fnName);if(!fns.length){tip.hidden=true;return;}
      const line=session.model.lineOf(fns[0].line);
      if(session.fnLine!==line){clearFunctionHighlight();cm.addLineClass(line,'background','cx-dbg-fnhl');session.fnLine=line;}
      const preview=el('div','cx-dbg-preview');
      for(let k=line;k<Math.min(cm.lineCount(),line+6);k++){const row=el('div',null,cm.getLine(k)||' ');preview.append(row);}
      tip.replaceChildren(el('b',null,'function '+fnName+'()'),el('span','cx-dbg-tt','defined in line '+(line+1)+(fns.length>1?' ('+fns.length+' overloads)':'')+', Ctrl+click jumps there'),preview);
      showTip(ev);
    }
    function showTip(ev){tip.hidden=false;tip.lastEvent={clientX:ev.clientX,clientY:ev.clientY};const w=tip.offsetWidth,h=tip.offsetHeight;let x=Math.min(ev.clientX+16,innerWidth-w-8),y=ev.clientY+18+h>innerHeight?ev.clientY-h-10:ev.clientY+18;x=Math.max(8,x);y=Math.max(8,Math.min(y,innerHeight-h-8));tip.style.left=x+'px';tip.style.top=y+'px';}
    const inspPanel=$('.cx-insp',root);
    const showKeyFocus=()=>{
      const dbg=keyFocus==='dbg'&&!panel.hidden;
      panel.classList.toggle('cx-kfocus',dbg);inspPanel?.classList.toggle('cx-kfocus',!dbg&&!!insp()?.open);
    };
    setKeyFocus=which=>{keyFocus=which;showKeyFocus();};
    inspPanel?.addEventListener('pointerdown',()=>setKeyFocus('insp'),true);
    panel.addEventListener('pointerdown',()=>setKeyFocus('dbg'),true);
    document.addEventListener('gbufferd-inspector',showKeyFocus);
    document.addEventListener('keydown',e=>{
      if(!session||panel.hidden)return;
      const A=session.actions;if(!A)return;
      const arrows=keyFocus==='dbg'?{ArrowLeft:A.back,ArrowUp:A.back,ArrowRight:A.into,ArrowDown:A.into}:{};
      const map={...arrows,F10:e.shiftKey?A.backOver:A.over,F11:e.shiftKey?A.back:A.into,F12:e.shiftKey?A.out:null,Home:A.start,End:A.end,...(keyFocus==='dbg'?{m:A.main,M:A.main}:{})};
      const run=map[e.key];if(!run)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(/^(?:Arrow(?:Left|Right|Up|Down)|F10|F11)$/.test(e.key)){if(!e.repeat||hold.key!==e.code)startHold(run,e.code);}
      else run();
    },true);
    document.addEventListener('keyup',e=>{if(hold.key===e.code)stopHold();},true);
    addEventListener('blur',stopHold);
    let replayTimer=0;
    const replaySoon=()=>{clearTimeout(replayTimer);replayTimer=setTimeout(()=>{try{if(insp()?.paused)insp().replay();}catch(error){console.warn(error);}},30);};
    document.addEventListener('click',e=>{if(e.target.closest?.('.cx-insp-buf,.cx-insp-modes button')&&insp()?.paused)replaySoon();},true);
    document.addEventListener('keydown',e=>{if(insp()?.open&&insp().paused&&/^(?:Arrow(?:Up|Down|Left|Right)|Page(?:Up|Down))$/.test(e.code))replaySoon();});
    document.addEventListener('gbufferd-inspector',renderBar);
  }
