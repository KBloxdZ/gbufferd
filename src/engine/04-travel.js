    function stashEdits(){return{placed:[...placedBlocks],removed:[...removedBlocks],placedBy:[...placedByChunk].map(([k,v])=>[k,[...v]]),removedBy:[...removedByChunk].map(([k,v])=>[k,[...v]])};}
    function restoreEdits(saved){
      placedBlocks.clear();removedBlocks.clear();placedByChunk.clear();removedByChunk.clear();if(!saved)return;
      for(const [k,v] of saved.placed)placedBlocks.set(k,v);for(const k of saved.removed)removedBlocks.add(k);
      for(const [k,v] of saved.placedBy)placedByChunk.set(k,new Set(v));for(const [k,v] of saved.removedBy)removedByChunk.set(k,new Set(v));
    }
    function travelTo(dimension){
      if(GB.state.active||!['overworld','nether','end'].includes(dimension)||dimension===window.wgpuDimension)return window.wgpuDimension;
      initNetherAssets();initEndAssets();setupOverworldPortal();setupOverworldEndPortal();const from=window.wgpuDimension;
      dimensionEdits[window.wgpuDimension]=stashEdits();
      window.wgpuDimension=dimension;restoreEdits(dimensionEdits[dimension]);
      worldHeightCache.clear();worldColumnCache.clear();collisionTrees.clear();endColumns.clear();
      blockLightLevels=new Map();skyRegion=new Set();skyLightLevels=new Map();skyOpenFrom=new Map();
      yaw=Math.PI/2;
      if(dimension==='nether'){
        setupNetherPortal();overworldChunkRadius??=RENDER_CHUNK_RADIUS;RENDER_CHUNK_RADIUS=Math.min(RENDER_CHUNK_RADIUS,8);
        const {x,y,z0}=netherPortalSpot;cameraPosition[0]=x+.5;cameraPosition[1]=y+PLAYER_EYE_HEIGHT+.01;cameraPosition[2]=z0+1;
      }else if(dimension==='end'){
        setupEnd();overworldChunkRadius??=RENDER_CHUNK_RADIUS;RENDER_CHUNK_RADIUS=Math.min(RENDER_CHUNK_RADIUS,8);
        cameraPosition[0]=END_SPAWN.x+.5;cameraPosition[1]=END_SPAWN.y+PLAYER_EYE_HEIGHT+.01;cameraPosition[2]=END_SPAWN.z+.5;yaw=-Math.PI/2;
      }else{
        if(overworldChunkRadius!==null){RENDER_CHUNK_RADIUS=overworldChunkRadius;overworldChunkRadius=null;}
        netherOverrides=new Map();applyOverworldPortal();rebuildBlockLighting();rebuildSkyLighting();
        if(from==='end'){
          const {cx,cz}=overworldEndSpot,x=cx,z=cz+4;cameraPosition[0]=x+.5;cameraPosition[1]=terrainHeight(x,z)+1+PLAYER_EYE_HEIGHT+.01;cameraPosition[2]=z+.5;yaw=0;
        }else{const {x,y,z0}=overworldPortalSpot;cameraPosition[0]=x+.5;cameraPosition[1]=y+1+PLAYER_EYE_HEIGHT+.01;cameraPosition[2]=z0+1;}
      }
      verticalVelocity=0;portalNeedExit=true;portalTime=0;
      if(document.pointerLockElement)document.exitPointerLock?.();
      SUN_ANGLE=sunAngleFromTime(dimensionTime());if(lightmapTexture)buildLightmapTexture();
      meshJob=null;pendingChunkKeys=[];if(typeof pendingChunkRebuilds!=='undefined')pendingChunkRebuilds.clear();
      for(const mesh of worldChunks.values())destroyChunkMesh(mesh);worldChunks.clear();visibleChunkMeshes=[];
      ensureWorldGeometry(true);
      const last=window.wgpuLastPack;
      if(last&&!shaderLoadBusy)loadTestPack(last.data.slice(),last.label).then(state=>{
        if(state?.ok!==false||window.wgpuDimension!==dimension)return;
        const failures=shaderFailures.slice(),empty=new JSZip();empty.file('shaders/shaders.properties','');
        return loadTestPack(empty,last.label+' · Pipeline fehlgeschlagen, Vanilla').then(()=>{shaderFailures=failures;setStatus(last.label+': Pipeline für '+dimension+' fehlgeschlagen ('+(failures[0]?.message||'Fehler')+') · Vanilla · F9 zeigt die Details','bad');});
      }).catch(()=>{});
      return dimension;
    }
    let portalTime=0,portalNeedExit=false,portalLast=null,portalOverlay=null;
    function updatePortal(now){
      if(GB.state.active)return;
      const dt=portalLast===null?0:Math.min(.25,Math.max(0,now-portalLast));portalLast=now;
      if(!portalsReady){portalsReady=true;initNetherAssets();initEndAssets();if(window.wgpuDimension==='overworld'){const touched=applyOverworldPortal();rebuildBlockLighting();rebuildSkyLighting();for(const chunk of touched){const [cx,cz]=chunk.split(',').map(Number);rebuildChunksAround(cx*CHUNK_SIZE+8,cz*CHUNK_SIZE+8);}}}
      const feet=cameraPosition[1]-PLAYER_EYE_HEIGHT,x=Math.floor(cameraPosition[0]),z=Math.floor(cameraPosition[2]);
      if(window.wgpuDimension==='end'&&feet<-64){setupEnd();cameraPosition[0]=END_SPAWN.x+.5;cameraPosition[1]=END_SPAWN.y+PLAYER_EYE_HEIGHT+.01;cameraPosition[2]=END_SPAWN.z+.5;verticalVelocity=0;}
      const endSet=window.wgpuDimension==='overworld'?window.wgpuPortals.overworldEnd:window.wgpuDimension==='end'?window.wgpuPortals.end:null;
      if(endSet?.size){
        const hit=yy=>endSet.has(x+','+yy+','+z);
        const cell=Math.floor(feet),inEnd=(hit(cell)&&feet-cell<.75)||hit(cell+1);
        if(inEnd){travelTo(window.wgpuDimension==='end'?'overworld':'end');return;}
      }
      const set=window.wgpuDimension==='end'?new Set():window.wgpuPortals[window.wgpuDimension];
      const inside=set.has(x+','+Math.floor(feet+.1)+','+z)||set.has(x+','+Math.floor(feet+1)+','+z);
      if(!inside){portalNeedExit=false;portalTime=Math.max(0,portalTime-dt*2);}
      else if(!portalNeedExit)portalTime+=dt;
      if(portalTime>=1)travelTo(window.wgpuDimension==='nether'?'overworld':'nether');
      animateNetherTextures(now);updateEndButton();updateDragon();
      let strength=Math.min(1,portalTime);
      if(strength>0&&!portalOverlay){
        portalOverlay=portalOverlayCanvas=document.createElement('canvas');portalOverlay.width=portalOverlay.height=16;
        portalOverlay.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;image-rendering:pixelated;opacity:0;transition:none';
        document.body.appendChild(portalOverlay);if(portalCurrentPixels){const c=portalOverlay.getContext('2d'),img=c.createImageData(16,16);img.data.set(portalCurrentPixels);c.putImageData(img,0,0);}
      }
      if(strength>0&&strength<1){strength*=strength;strength*=strength;strength=strength*.8+.2;}
      if(portalOverlay)portalOverlay.style.opacity=String(portalTime>0?strength:0);
    }
    async function applyNetherFolder(zip){
      if(window.wgpuDimension==='overworld')return zip;
      const wanted=window.wgpuDimension==='end'?'minecraft:the_end':'minecraft:the_nether',fallbackFolder=window.wgpuDimension==='end'?'world1':'world-1';
      const root='shaders/',paths=Object.keys(zip.files);
      let folder=null;const dimensionFile=zip.file(root+'dimension.properties');
      if(dimensionFile){
        let wildcard=null;
        for(const [key,value] of Object.entries(propertyMap(await dimensionFile.async('string')))){
          const match=/^dimension\.([\w-]+)$/.exec(key);if(!match)continue;const ids=String(value).split(/\s+/);
          if(ids.includes(wanted))folder=match[1];else if(ids.includes('*'))wildcard=match[1];
        }
        folder??=wildcard;
      }else if(paths.some(path=>path.startsWith(root+fallbackFolder+'/')))folder=fallbackFolder;
      for(const path of paths)if(path.startsWith(root+'world0/'))zip.remove(path);
      if(folder&&folder!=='world0')for(const path of paths){
        if(zip.files[path]?.dir||!path.startsWith(root+folder+'/'))continue;
        zip.file(root+'world0/'+path.slice((root+folder+'/').length),await zip.file(path).async('uint8array'));
      }
      const properties=zip.file(root+'shaders.properties');
      if(properties){let text=await properties.async('string');text=text.split('.world0/').join('.wgpuoverworld/');if(folder)text=text.split('.'+folder+'/').join('.world0/');zip.file(root+'shaders.properties',text);}
      return zip;
    }
