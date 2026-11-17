    const END_TOP=127;
    const END_VANILLA_TEXTURES={"end_stone": {"src": "@@datauri:assets/images/end-stone.png@@"}, "end_portal_frame_top": {"src": "@@datauri:assets/images/end-portal-frame-top.png@@"}, "end_portal_frame_side": {"src": "@@datauri:assets/images/end-portal-frame-side.png@@"}, "end_portal_frame_eye": {"src": "@@datauri:assets/images/end-portal-frame-eye.png@@"}, "spawn_item": {"src": "@@datauri:assets/images/spawn-item.png@@"}, "end_button": {"src": "@@datauri:assets/images/end-button.png@@"}, "end_button_base": {"src": "@@datauri:assets/images/end-button-base.png@@"}};
    const END_SKY_PNG="@@datauri:assets/images/end-sky.png@@",END_PORTAL_PNG="@@datauri:assets/images/end-portal.png@@";
    let endAssetsReady=false,endSkyTexture=null,endPortalTexture=null,endPortalVanillaTexture=null,overworldEndSpot=null,endOverrides=null;
    window.wgpuPortals.end=new Set();window.wgpuPortals.overworldEnd=new Set();window.wgpuEndFrames=new Map();
    function initEndAssets(){
      if(endAssetsReady)return;endAssetsReady=true;
      Object.assign(ATLAS_SLOTS,{end_stone:[0,5],end_portal_frame_top:[1,5],end_portal_frame_side:[2,5],end_portal_frame_eye:[3,5],spawn_item:[4,5],end_button:[5,5],end_button_base:[6,5]});
      Object.assign(PACK_BLOCK_CANDIDATES,{end_stone:[['end_stone','']],end_portal_frame:[['end_portal_frame','eye=true'],['end_portal_frame','']],end_portal:[['end_portal','']],
        end_button:[['stone_button','face=floor'],['stone_button',''],['polished_blackstone_button','']],end_button_base:[['stone_button','face=floor'],['stone_button',''],['polished_blackstone_button','']]});
      Object.assign(NETHER_FALLBACK_IDS,{end_stone:121,end_portal_frame:120,end_portal:119});
    }
    const SPAWN_ITEM_PNG="@@datauri:assets/images/spawn-item.png@@";
    function useSpawnItem(){
      if(GB.state.active)return;
      if(window.wgpuDimension==='nether'&&netherPortalSpot){
        const {x,y,z0}=netherPortalSpot;cameraPosition[0]=x+2.5;cameraPosition[1]=y+PLAYER_EYE_HEIGHT+.01;cameraPosition[2]=z0+1;yaw=-Math.PI/2;
      }else if(window.wgpuDimension==='end'){
        cameraPosition[0]=END_SPAWN.x+.5;cameraPosition[1]=END_SPAWN.y+PLAYER_EYE_HEIGHT+.01;cameraPosition[2]=END_SPAWN.z+.5;yaw=-Math.PI/2;
      }else{
        let y=terrainHeight(SPAWN_X,SPAWN_Z)+1;while(solidBlockAt(SPAWN_X,y,SPAWN_Z)||solidBlockAt(SPAWN_X,y+1,SPAWN_Z))y++;
        cameraPosition[0]=SPAWN_X+.5;cameraPosition[1]=y+PLAYER_EYE_HEIGHT+.01;cameraPosition[2]=SPAWN_Z+.5;
      }
      verticalVelocity=0;
    }
    function dimensionTime(){return window.wgpuDimension==='nether'?18000:window.wgpuDimension==='end'?6000:WORLD_TIME;}
    async function createEndTextures(){
      if(endSkyTexture)return;
      const [sky,specks]=await Promise.all([loadImage(END_SKY_PNG),loadImage(END_PORTAL_PNG)]);
      const repeat=texture=>{gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.bindTexture(gl.TEXTURE_2D,null);return texture;};
      endSkyTexture=repeat(textureFromImage(sky,gl.RGBA8,gl.RGBA,gl.NEAREST,gl.NEAREST));
      endPortalTexture=repeat(textureFromImage(specks,gl.RGBA8,gl.RGBA,gl.NEAREST,gl.NEAREST));
      const both=document.createElement('canvas');both.width=512;both.height=256;const c=both.getContext('2d');c.imageSmoothingEnabled=false;
      c.drawImage(sky,0,0,256,256);c.drawImage(specks,256,0);
      endPortalVanillaTexture=textureFromImage(both,gl.RGBA8,gl.RGBA,gl.NEAREST,gl.NEAREST);
    }
    const endColumns=new Map();
    function endColumn(x,z){
      const k=x+','+z;let column=endColumns.get(k);if(column!==undefined)return column;
      const r=Math.hypot(x,z),edge=94+netherNoise(x,0,z,24,1,0xe1)*10;
      if(r>edge)column=null;
      else{
        const t=r/edge,top=Math.floor(64-t*t*16+netherNoise(x,0,z,18,1,0xe2)*2.5);
        column={top,bottom:Math.floor(top-2-(1-t)*(1-t)*44-Math.abs(netherNoise(x,0,z,7,1,0xe3))*5)};
      }
      if(endColumns.size>200000)endColumns.clear();endColumns.set(k,column);return column;
    }
    const END_SPIKES=[3,7,1,9,4,0,6,2,8,5].map((l,i)=>{const a=2*(-Math.PI+Math.PI/10*i);return{x:Math.floor(42*Math.cos(a)),z:Math.floor(42*Math.sin(a)),r:2+Math.floor(l/3),h:76+l*3};});
    function endTerrain(x,y,z){
      if(y<0||y>END_TOP)return null;
      const d=Math.hypot(x,z);
      if(d>33&&d<51)for(const spike of END_SPIKES){
        const dx=x-spike.x,dz=z-spike.z;if(dx*dx+dz*dz>spike.r*spike.r+1)continue;
        if(y<spike.h)return 'obsidian';if(y===spike.h&&dx===0&&dz===0)return 'bedrock';return null;
      }
      const column=endColumn(x,z);return column&&y<=column.top&&y>=column.bottom?'end_stone':null;
    }
    const END_SPAWN={x:100,y:50,z:0};
    function setupEnd(){
      endOverrides=new Map();const portal=window.wgpuPortals.end;portal.clear();
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=2;dy++)endOverrides.set((END_SPAWN.x+dx)+','+(END_SPAWN.y+dy)+','+(END_SPAWN.z+dz),dy===-1?'obsidian':'');
      const origin=(endColumn(0,0)?.top??60)+1;
      for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++)for(let dy=-1;dy<=32;dy++){
        const d2=dx*dx+dy*dy+dz*dz,inner=d2<6.25;if(!inner&&d2>=12.25)continue;
        const k=dx+','+(origin+dy)+','+dz;
        if(dy<0)endOverrides.set(k,inner?'bedrock':'end_stone');
        else if(dy>0)endOverrides.set(k,'');
        else if(!inner)endOverrides.set(k,'bedrock');
        else if(!brokenBlocks.end.has(k)){endOverrides.set(k,'end_portal');portal.add(k);}
      }
      for(let i=0;i<4;i++){const k='0,'+(origin+i)+',0';endOverrides.set(k,'bedrock');portal.delete(k);}
      const by=(endColumn(6,0)?.top??60)+1;endButton=brokenBlocks.end.has('6,'+by+',0')?null:{x:6,y:by,z:0,pressedUntil:0};
      for(let dy=0;dy<=2;dy++)endOverrides.set('6,'+(by+dy)+',0','');
      netherOverrides=endOverrides;
    }
    let endButton=null;
    const brokenBlocks={overworld:new Set(),nether:new Set(),end:new Set()};
    function mineSpecialBlock(x,y,z){
      const k=x+','+y+','+z,dim=window.wgpuDimension,chunk=Math.floor(x/CHUNK_SIZE)+','+Math.floor(z/CHUNK_SIZE);
      const remove=()=>{removedBlocks.add(k);if(!removedByChunk.has(chunk))removedByChunk.set(chunk,new Set());removedByChunk.get(chunk).add(k);};
      let hit=false;
      if(dim==='overworld'){
        if(window.wgpuEndFrames.delete(k))hit=true;
        else if(window.wgpuPortals.overworldEnd.delete(k)){hit=true;rebuildBlockLighting();}
        else if(window.wgpuPortals.overworld.delete(k))hit=true;
        else if(spawnSign&&!spawnSign.broken&&spawnSign.x===x&&spawnSign.y===y&&spawnSign.z===z){spawnSign.broken=true;hit=true;}
      }else if(dim==='nether'){
        if(window.wgpuPortals.nether.has(k)||netherBlockAt(x,y,z)==='nether_portal'){window.wgpuPortals.nether.delete(k);remove();hit=true;}
      }else if(dim==='end'){
        if(window.wgpuPortals.end.delete(k)){remove();hit=true;}
        else if(endButton&&endButton.x===x&&endButton.y===y&&endButton.z===z){endButton=null;hit=true;}
      }
      if(!hit)return false;
      brokenBlocks[dim].add(k);rebuildChunksAround(x,z);return true;
    }
    function endButtonBoxes(){
      if(!endButton)return[];
      const pressed=endButtonDown(),p=1/16;
      return[{x0:3*p,y0:0,z0:3*p,x1:12*p,y1:p,z1:12*p,type:'end_button_base'},
             {x0:5*p,y0:p,z0:5*p,x1:10*p,y1:(pressed?2:6)*p,z1:10*p,type:'end_button'}];
    }
    function endButtonFaces(minX,maxX,minZ,maxZ){
      if(window.wgpuDimension!=='end'||!endButton)return[];
      const {x,y,z}=endButton;if(x<minX||x>maxX||z<minZ||z>maxZ)return[];
      const faces=[],block=[x,y,z];
      const uv={top:p=>[p[2]-z,p[0]-x],bottom:p=>[p[0]-x,p[2]-z],north:p=>[1-(p[0]-x),p[1]-y],south:p=>[p[0]-x,p[1]-y],west:p=>[p[2]-z,p[1]-y],east:p=>[1-(p[2]-z),p[1]-y]};
      const add=(face,a,b,c,d,n,type)=>faces.push({a,b,c,d,n,type,block,uvs:[a,b,c,d].map(uv[face])});
      for(const b of endButtonBoxes()){
        const X0=x+b.x0,Y0=y+b.y0,Z0=z+b.z0,X1=x+b.x1,Y1=y+b.y1,Z1=z+b.z1;
        add('top',[X0,Y1,Z0],[X0,Y1,Z1],[X1,Y1,Z1],[X1,Y1,Z0],[0,1,0],b.type);
        if(b.type!=='end_button_base')add('bottom',[X0,Y0,Z0],[X1,Y0,Z0],[X1,Y0,Z1],[X0,Y0,Z1],[0,-1,0],b.type);
        add('north',[X1,Y0,Z0],[X0,Y0,Z0],[X0,Y1,Z0],[X1,Y1,Z0],[0,0,-1],b.type);
        add('south',[X0,Y0,Z1],[X1,Y0,Z1],[X1,Y1,Z1],[X0,Y1,Z1],[0,0,1],b.type);
        add('west',[X0,Y0,Z0],[X0,Y0,Z1],[X0,Y1,Z1],[X0,Y1,Z0],[-1,0,0],b.type);
        add('east',[X1,Y0,Z1],[X1,Y0,Z0],[X1,Y1,Z0],[X1,Y1,Z1],[1,0,0],b.type);
      }
      return faces;
    }
    function pressEndButton(){
      if(GB.state.active||window.wgpuDimension!=='end'||!endButton)return false;
      const cp=Math.cos(pitch),dir=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp],o=cameraPosition,{x,y,z}=endButton;
      const box=endButtonBoxes(),lo=[x+box[0].x0,y,z+box[0].z0],hi=[x+box[0].x1,y+box[1].y1,z+box[0].z1];
      let near=0,far=5;
      for(let i=0;i<3;i++){
        if(Math.abs(dir[i])<1e-9){if(o[i]<lo[i]||o[i]>hi[i])return false;continue;}
        let t0=(lo[i]-o[i])/dir[i],t1=(hi[i]-o[i])/dir[i];if(t0>t1)[t0,t1]=[t1,t0];
        near=Math.max(near,t0);far=Math.min(far,t1);if(near>far)return false;
      }
      for(let t=0;t<near;t+=.05)if(solidBlockAt(Math.floor(o[0]+dir[0]*t),Math.floor(o[1]+dir[1]*t),Math.floor(o[2]+dir[2]*t)))return false;
      if(endButtonDown())return true;
      endButton.pressedUntil=performance.now()+1000;rebuildChunksAround(x,z);
      window.dispatchEvent(new CustomEvent('wgpuEndButton',{detail:{x,y,z}}));
      return true;
    }
    function endButtonDown(){return!!endButton&&(endButton.pressedUntil>performance.now()||dragonActive());}
    function updateEndButton(){
      if(!endButton)return;const down=endButtonDown();
      if(!!endButton.wasDown!==down)rebuildChunksAround(endButton.x,endButton.z);
      endButton.wasDown=down;
    }

    function setupOverworldEndPortal(){
      if(overworldEndSpot)return;
      const heights=new Map(),heightAt=(x,z)=>{const k=x+','+z;if(!heights.has(k))heights.set(k,terrainHeight(x,z));return heights.get(k);};
      const columnAt=(x,z)=>{const h=heightAt(x,z),slope=Math.max(...[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>Math.abs(h-heightAt(x+dx,z+dz))));return terrainColumn(x,z,h,slope);};
      const trees=new Map();
      const treesAt=(x,z)=>{const k=Math.floor(x/CHUNK_SIZE)+','+Math.floor(z/CHUNK_SIZE);if(!trees.has(k))trees.set(k,buildTreeBlocks(Math.floor(x/CHUNK_SIZE),Math.floor(z/CHUNK_SIZE),1,columnAt));return trees.get(k);};
      const fits=(cx,cz)=>{
        if(Math.abs(cx-SPAWN_X)<=3&&Math.abs(cz-SPAWN_Z)<=3)return null;
        if(cx+3>=SPAWN_X-7&&cx-3<=SPAWN_X-5&&cz+3>=SPAWN_Z-6&&cz-3<=SPAWN_Z-1)return null;
        let low=Infinity,high=-Infinity;
        for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const h=heightAt(cx+dx,cz+dz);low=Math.min(low,h);high=Math.max(high,h);if(columnAt(cx+dx,cz+dz).water)return null;}
        if(high-low>2)return null;
        const blocks=treesAt(cx,cz);
        for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++)for(let y=low;y<=high+10;y++)if(blocks.has((cx+dx)+','+y+','+(cz+dz)))return null;
        return high+1;
      };
      const startX=SPAWN_X-6,startZ=SPAWN_Z+4;
      for(let r=0;r<=14&&!overworldEndSpot;r++)for(let dx=-r;dx<=r&&!overworldEndSpot;dx++)for(let dz=-r;dz<=r&&!overworldEndSpot;dz++){
        if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
        const y=fits(startX+dx,startZ+dz);if(y!==null)overworldEndSpot={cx:startX+dx,cz:startZ+dz,y};
      }
      if(!overworldEndSpot){let top=-Infinity;for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)top=Math.max(top,heightAt(startX+dx,startZ+dz));overworldEndSpot={cx:startX,cz:startZ,y:top+1};}
    }
    function applyOverworldEndPortal(touch){
      setupOverworldEndPortal();const {cx,cz,y}=overworldEndSpot,frames=window.wgpuEndFrames,portal=window.wgpuPortals.overworldEnd;frames.clear();portal.clear();
      const chunkOf=(px,pz)=>Math.floor(px/CHUNK_SIZE)+','+Math.floor(pz/CHUNK_SIZE);
      const put=(px,py,pz,type)=>{const k=px+','+py+','+pz,chunk=chunkOf(px,pz);touch.add(chunk);placedBlocks.set(k,type);if(!placedByChunk.has(chunk))placedByChunk.set(chunk,new Set());placedByChunk.get(chunk).add(k);};
      const clear=(px,py,pz)=>{const k=px+','+py+','+pz,chunk=chunkOf(px,pz);touch.add(chunk);placedBlocks.delete(k);placedByChunk.get(chunk)?.delete(k);
        if(solidBlockAt(px,py,pz)){removedBlocks.add(k);if(!removedByChunk.has(chunk))removedByChunk.set(chunk,new Set());removedByChunk.get(chunk).add(k);}};
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
        const x=cx+dx,z=cz+dz;for(let yy=terrainHeight(x,z)+1;yy<y;yy++)put(x,yy,z,'stone');
        for(const yy of [y,y+1]){const k=x+','+yy+','+z,chunk=chunkOf(x,z);touch.add(chunk);removedBlocks.add(k);if(!removedByChunk.has(chunk))removedByChunk.set(chunk,new Set());removedByChunk.get(chunk).add(k);}
        if(Math.abs(dx)===2&&Math.abs(dz)===2)continue;
        const k=x+','+y+','+z;clear(x,y,z);
        if(brokenBlocks.overworld.has(k))continue;
        if(Math.abs(dx)===2||Math.abs(dz)===2)frames.set(k,dz===-2?'south':dz===2?'north':dx===-2?'east':'west');
        else portal.add(k);
      }
      return touch;
    }
    function endFrameFaces(x,y,z,facing){
      const turns={south:0,west:1,north:2,east:3}[facing]||0,faces=[];
      const local=(fx,fz)=>{let dx=fx-.5,dz=fz-.5;for(let i=0;i<turns;i++){const t=dx;dx=dz;dz=-t;}return[dx+.5,dz+.5];};
      const topUv=p=>{const [lx,lz]=local(p[0]-x,p[2]-z);return[lx,1-lz];};
      const covered=(dx,dz)=>window.wgpuEndFrames.has((x+dx)+','+y+','+(z+dz))||solidBlockAt(x+dx,y,z+dz);
      const box=(x0,y0,z0,x1,y1,z1,textures,cull)=>{
        const X0=x+x0,Y0=y+y0,Z0=z+z0,X1=x+x1,Y1=y+y1,Z1=z+z1;
        const add=(face,a,b,c,d,n,texture,uvs)=>{if(cull(face))return;faces.push({a,b,c,d,n,texture,uvs});};
        add('top',[X0,Y1,Z0],[X0,Y1,Z1],[X1,Y1,Z1],[X1,Y1,Z0],[0,1,0],textures.top,[[X0,Y1,Z0],[X0,Y1,Z1],[X1,Y1,Z1],[X1,Y1,Z0]].map(topUv));
        add('bottom',[X0,Y0,Z0],[X1,Y0,Z0],[X1,Y0,Z1],[X0,Y0,Z1],[0,-1,0],textures.bottom,[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]);
        add('north',[X1,Y0,Z0],[X0,Y0,Z0],[X0,Y1,Z0],[X1,Y1,Z0],[0,0,-1],textures.side,[[1-x1,y0],[1-x0,y0],[1-x0,y1],[1-x1,y1]]);
        add('south',[X0,Y0,Z1],[X1,Y0,Z1],[X1,Y1,Z1],[X0,Y1,Z1],[0,0,1],textures.side,[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);
        add('west',[X0,Y0,Z0],[X0,Y0,Z1],[X0,Y1,Z1],[X0,Y1,Z0],[-1,0,0],textures.side,[[z0,y0],[z1,y0],[z1,y1],[z0,y1]]);
        add('east',[X1,Y0,Z1],[X1,Y0,Z0],[X1,Y1,Z0],[X1,Y1,Z1],[1,0,0],textures.side,[[1-z1,y0],[1-z0,y0],[1-z0,y1],[1-z1,y1]]);
      };
      box(0,0,0,1,13/16,1,{top:'end_portal_frame_top',bottom:'end_stone',side:'end_portal_frame_side'},
        face=>face==='bottom'?solidBlockAt(x,y-1,z):face==='north'?covered(0,-1):face==='south'?covered(0,1):face==='west'?covered(-1,0):face==='east'?covered(1,0):false);
      box(4/16,13/16,4/16,12/16,1,12/16,{top:'end_portal_frame_eye',bottom:'end_portal_frame_eye',side:'end_portal_frame_eye'},face=>face==='bottom'||face==='top'&&solidBlockAt(x,y+1,z));
      return faces;
    }
    let endPortalMesh=null,endSkyMesh=null;
    const END_PORTAL_FACES=[[[0,1,0],[[0,'u',1],[1,'u',1],[1,'u',0],[0,'u',0]]],[[0,-1,0],[[0,'d',0],[1,'d',0],[1,'d',1],[0,'d',1]]],
      [[0,0,-1],[[0,'u',0],[1,'u',0],[1,'d',0],[0,'d',0]]],[[-1,0,0],[[0,'u',1],[0,'u',0],[0,'d',0],[0,'d',1]]],
      [[0,0,1],[[0,'u',1],[0,'d',1],[1,'d',1],[1,'u',1]]],[[1,0,0],[[1,'u',1],[1,'d',1],[1,'d',0],[1,'u',0]]]];
    function renderEndPortals(eye,now){
      if(GB.state.active||!endPortalTexture)return;
      const set=window.wgpuDimension==='overworld'?window.wgpuPortals.overworldEnd:window.wgpuDimension==='end'?window.wgpuPortals.end:null;if(!set?.size)return;
      const resolved=resolveIrisProgram(gbufferPrograms,'gbuffers_block'),program=resolved?.program;if(!program)return;
      const vanilla=window.wgpuPackBlockProgram===false,shift=((now%3600)*.01)%1,gameTime=((now*WORLD_TICKS_PER_SECOND)%24000)/24000;
      const vertices=[],indices=[],uvs=[[0,0],[0,.2],[.2,.2],[.2,0]];
      const full=(x,y,z)=>solidBlockAt(x,y,z)&&!window.wgpuEndFrames.has(x+','+y+','+z);
      for(const k of set){
        const [x,y,z]=k.split(',').map(Number),level={u:.75,d:.375};
        for(const [n,corners] of END_PORTAL_FACES){
          if(full(x+n[0],y+n[1],z+n[2]))continue;
          const base=vertices.length/31;
          corners.forEach(([cx,cy,cz],i)=>{
            const uv=vanilla?[gameTime,0]:[uvs[i][0]+shift,uvs[i][1]+shift],color=vanilla?[1,1,1,1]:[.075,.15,.2,1];
            vertices.push(x+cx,y+level[cy],z+cz,1,n[0],n[1],n[2],uv[0],uv[1],0,1,248,248,0,1,...color,0,0,0,0,.5,.5,0,1,1,0,0,1);
          });
          indices.push(base,base+1,base+2,base+2,base+3,base);
        }
      }
      if(!indices.length)return;
      endPortalMesh=uploadVanillaSkyMesh(vertices,indices,endPortalMesh);
      const targets=activePassTargets[resolved.name]||[0];
      attachColorTargets(targets,colortexCurrent,true);gl.viewport(0,0,width,height);
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.disable(gl.BLEND);
      applyPackBlend(resolved.name,targets);
      skyTextureOverride=vanilla?endPortalVanillaTexture:endPortalTexture;
      gl.useProgram(program);setUniforms(program,cameraViewMatrix,cameraProjectionMatrix,eye,now);
      u1i(program,'renderStage',12);u1i(program,'blockEntityId',packBlockId('end_portal',119));u1i(program,'wgpuEndPortal',1);
      gl.bindVertexArray(endPortalMesh.vao);gl.drawElements(gl.TRIANGLES,endPortalMesh.count,gl.UNSIGNED_INT,0);
      u1i(program,'blockEntityId',0);u1i(program,'wgpuEndPortal',0);skyTextureOverride=null;gl.disable(gl.CULL_FACE);
      inspectorCapture('gbuffers_block');
    }
    function renderEndSky(eye,now){
      const resolved=resolveIrisProgram(gbufferPrograms,'gbuffers_skytextured'),program=resolved?.program;if(!program||!endSkyTexture)return;
      if(!endSkyMesh){
        const vertices=[],indices=[],c=0x28/255;
        const turns=[p=>p,p=>[p[0],-p[2],p[1]],p=>[p[0],p[2],-p[1]],p=>[p[0],-p[1],-p[2]],p=>[-p[1],p[0],p[2]],p=>[p[1],-p[0],p[2]]];
        for(const turn of turns){
          const base=vertices.length/31,corners=[[-100,-100,-100],[-100,-100,100],[100,-100,100],[100,-100,-100]],uv=[[0,0],[0,16],[16,16],[16,0]];
          corners.forEach((p,i)=>vanillaSkyVertex(vertices,turn(p),turn([0,1,0]),uv[i],[c,c,c,1]));
          indices.push(base,base+1,base+2,base+2,base+3,base);
        }
        endSkyMesh=uploadVanillaSkyMesh(vertices,indices,null);
      }
      const view=new Float32Array(cameraViewMatrix);view[12]=view[13]=view[14]=0;
      const targets=activePassTargets[resolved.name]||[0];
      attachColorTargets(targets,colortexCurrent,true);gl.viewport(0,0,width,height);
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);applyPackBlend(resolved.name,targets);
      skyTextureOverride=endSkyTexture;gl.useProgram(program);setUniforms(program,view,cameraProjectionMatrix,eye,now);u1i(program,'renderStage',3);
      gl.bindVertexArray(endSkyMesh.vao);gl.drawElements(gl.TRIANGLES,endSkyMesh.count,gl.UNSIGNED_INT,0);
      skyTextureOverride=null;gl.disable(gl.BLEND);gl.depthMask(true);
      inspectorCapture('gbuffers_skytextured');
    }
