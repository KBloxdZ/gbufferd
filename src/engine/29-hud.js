    const HOTBAR_ITEMS=[{type:'white_concrete',name:'White Concrete'},{type:'glowstone',name:'Glowstone'},{type:'sea_lantern',name:'Sea Lantern',frames:5},{type:'gold_block',name:'Block of Gold'},null,null,null,null,{type:'spawn_item',name:'Spawn'}];
    const HUD_TEXTURES={"hotbar":"@@datauri:assets/images/hotbar.png@@","selection":"@@datauri:assets/images/selection.png@@","white_concrete":"@@datauri:assets/images/white-concrete.png@@","glowstone":"@@datauri:assets/images/glowstone.png@@","sea_lantern":"@@datauri:assets/images/sea-lantern.png@@","gold_block":"@@datauri:assets/images/gold-block.png@@"};
    let hotbarSlot=0,hotbarNameShown=0,hudImages=null;
    const hudCanvas=document.createElement('canvas');hudCanvas.id='hotbar';hudCanvas.setAttribute('aria-hidden','true');document.body.append(hudCanvas);
    Promise.all(Object.entries({...HUD_TEXTURES,spawn_item:SPAWN_ITEM_PNG}).map(async([name,uri])=>[name,await loadImage(uri)])).then(entries=>{hudImages=Object.fromEntries(entries);drawHud();});
    function guiScale(width,height){let scale=1;while(width/(scale+1)>=320&&height/(scale+1)>=240)scale++;return scale;}
    const hudShaded=new WeakMap();
    function shadedFace(image,frame,shade){
      let cache=hudShaded.get(image);if(!cache)hudShaded.set(image,cache=new Map());
      const key=frame+':'+shade;if(cache.has(key))return cache.get(key);
      const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const context=canvas.getContext('2d');
      context.drawImage(image,0,frame*16,16,16,0,0,16,16);context.globalCompositeOperation='multiply';const v=Math.round(shade*255);context.fillStyle='rgb('+v+','+v+','+v+')';context.fillRect(0,0,16,16);
      context.globalCompositeOperation='destination-in';context.drawImage(image,0,frame*16,16,16,0,0,16,16);
      cache.set(key,canvas);return canvas;
    }
    function drawBlockItem(context,image,frame,cx,cy,scale){
      const rad=Math.PI/180,ry=225*rad,rx=30*rad,s=0.625;
      const project=([x,y,z])=>{x-=8;y-=8;z-=8;const x1=x*Math.cos(ry)+z*Math.sin(ry),z1=-x*Math.sin(ry)+z*Math.cos(ry);const y2=y*Math.cos(rx)-z1*Math.sin(rx),z2=y*Math.sin(rx)+z1*Math.cos(rx);return[x1*s,-y2*s,z2];};
      const faces=[
        {o:[0,16,0],u:[16,16,0],v:[0,16,16],n:[0,1,0]},{o:[0,16,16],u:[16,16,16],v:[0,0,16],n:[0,0,1]},{o:[16,16,16],u:[16,16,0],v:[16,0,16],n:[1,0,0]},
        {o:[16,16,0],u:[0,16,0],v:[16,0,0],n:[0,0,-1]},{o:[0,16,0],u:[0,16,16],v:[0,0,0],n:[-1,0,0]}];
      const visible=faces.map(face=>{const n=project(face.n.map(v=>v+8)),origin=project([8,8,8]);return{...face,depth:n[2]-origin[2],nx:n[0]-origin[0],ny:n[1]-origin[1]};}).filter(face=>face.depth>0.01);
      for(const face of visible){
        const shade=face.n[1]===1?1:face.nx<0?0.8:0.6,tile=shadedFace(image,frame,shade);
        const o=project(face.o),u=project(face.u),v=project(face.v);
        context.setTransform((u[0]-o[0])/16*scale,(u[1]-o[1])/16*scale,(v[0]-o[0])/16*scale,(v[1]-o[1])/16*scale,(cx+o[0])*scale,(cy+o[1])*scale);
        context.drawImage(tile,-0.02,-0.02,16.04,16.04);
      }
      context.setTransform(1,0,0,1,0,0);
    }
    function drawHud(){
      const width=innerWidth,height=innerHeight;if(hudCanvas.width!==width||hudCanvas.height!==height){hudCanvas.width=width;hudCanvas.height=height;}
      const context=hudCanvas.getContext('2d');context.imageSmoothingEnabled=false;context.clearRect(0,0,width,height);
      if(!hudImages)return;
      const scale=guiScale(width,height),gw=Math.ceil(width/scale),gh=Math.ceil(height/scale),x=Math.floor(gw/2)-91,y=gh-22;
      context.drawImage(hudImages.hotbar,x*scale,y*scale,182*scale,22*scale);
      context.drawImage(hudImages.selection,(x-1+hotbarSlot*20)*scale,(y-1)*scale,24*scale,23*scale);
      const frame=Math.floor(performance.now()/250);
      HOTBAR_ITEMS.forEach((item,slot)=>{if(item)drawBlockItem(context,hudImages[item.type],item.frames?frame%item.frames:0,x+slot*20+3+8,gh-16-3+8,scale);});
      const age=performance.now()-hotbarNameShown,item=HOTBAR_ITEMS[hotbarSlot];
      if(item&&age<2000&&typeof guiDrawText==='function'&&guiFontReady){
        const text=document.createElement('canvas');guiDrawText(text,item.name,'f');
        const w=text.width/GUI_SCALE,alpha=Math.min(1,(2000-age)/500);
        context.globalAlpha=alpha;context.drawImage(text,Math.round(gw/2-(w-1)/2)*scale,(gh-45-3)*scale,w*scale,text.height/GUI_SCALE*scale);context.globalAlpha=1;
      }
    }
    setInterval(drawHud,50);addEventListener('resize',drawHud);
    function selectHotbar(slot){hotbarSlot=(slot+9)%9;hotbarNameShown=HOTBAR_ITEMS[hotbarSlot]?performance.now():0;drawHud();}
    document.addEventListener('keydown',event=>{if(canvas.ownerDocument.pointerLockElement===canvas&&/^Digit[1-9]$/.test(event.code))selectHotbar(Number(event.code.slice(5))-1);});
    canvas.addEventListener('wheel',event=>{if(canvas.ownerDocument.pointerLockElement!==canvas)return;event.preventDefault();selectHotbar(hotbarSlot+Math.sign(event.deltaY));},{passive:false});
    canvas.addEventListener('mousedown',event=>{if(event.button===2&&canvas.ownerDocument.pointerLockElement===canvas){placeBlock();event.preventDefault();}});
    canvas.addEventListener('contextmenu',event=>event.preventDefault());

