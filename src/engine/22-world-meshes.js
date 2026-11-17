    function destroyChunkMesh(mesh) {if(mesh.irisCpuOnly)return;if(mesh.sections){for(const child of mesh.sections.values())destroyChunkMesh(child);return;}
      gl.deleteVertexArray(mesh.vao);gl.deleteBuffer(mesh.vertexBuffer);gl.deleteBuffer(mesh.indexBuffer);
    }

    function refreshVisibleChunkMeshes() {
      visibleChunkMeshes=(GB.hosted?GB.hooks.meshList().filter(mesh=>mesh.indexCount||mesh.waterIndexCount):[...worldChunks.values()]).sort((a,b)=>{
        const ad=(a.chunkX-meshedChunkX)**2+(a.chunkZ-meshedChunkZ)**2,bd=(b.chunkX-meshedChunkX)**2+(b.chunkZ-meshedChunkZ)**2;return ad-bd;
      });
    }

    function ensureWorldGeometry(force=false) {
      const chunkX=Math.floor((cameraPosition[0]+(GB.state.active?GB.state.renderOrigin[0]:0))/CHUNK_SIZE),chunkZ=Math.floor((cameraPosition[2]+(GB.state.active?GB.state.renderOrigin[2]:0))/CHUNK_SIZE);
      if(!force&&chunkX===meshedChunkX&&chunkZ===meshedChunkZ)return;
      meshedChunkX=chunkX;meshedChunkZ=chunkZ;
      const desired=new Set();
      for(let dz=-RENDER_CHUNK_RADIUS;dz<=RENDER_CHUNK_RADIUS;dz++)for(let dx=-RENDER_CHUNK_RADIUS;dx<=RENDER_CHUNK_RADIUS;dx++){
        if(dx*dx+dz*dz>(RENDER_CHUNK_RADIUS+.5)**2)continue;if(!GB.state.active||GB.hooks.hasColumn(chunkX+dx,chunkZ+dz))desired.add(`${chunkX+dx},${chunkZ+dz}`);
      }
      for(const [chunkKey,mesh] of worldChunks)if(!desired.has(chunkKey)){destroyChunkMesh(mesh);worldChunks.delete(chunkKey);}
      pendingChunkKeys=(GB.hosted?[...new Set([...pendingChunkKeys.filter(key=>desired.has(key)&&key!==meshJob?.key),...[...desired].filter(key=>!worldChunks.has(key)&&key!==meshJob?.key)])]:[...desired].filter(chunkKey=>!worldChunks.has(chunkKey))).sort((a,b)=>{
        const [ax,az]=a.split(',').map(Number),[bx,bz]=b.split(',').map(Number);
        return (ax-chunkX)**2+(az-chunkZ)**2-(bx-chunkX)**2-(bz-chunkZ)**2;
      });
      refreshVisibleChunkMeshes();
    }

    let chunkMeshMs=0,chunkMeshCount=0,meshJob=null;
    function streamWorldChunks(timeBudgetMs=3) {
      const deadline=performance.now()+timeBudgetMs;let changed=false;
      while(performance.now()<deadline){
        if(!meshJob){
          const chunkKey=pendingChunkKeys.shift();if(!chunkKey)break;
          const [chunkX,chunkZ]=chunkKey.split(',').map(Number);
          if(Math.abs(chunkX-meshedChunkX)>RENDER_CHUNK_RADIUS||Math.abs(chunkZ-meshedChunkZ)>RENDER_CHUNK_RADIUS)continue;
          meshJob={key:chunkKey,steps:createChunkMeshSteps(chunkX,chunkZ)};
        }
        const meshStart=performance.now();
        let step;
        do{step=meshJob.steps.next();}while(!step.done&&performance.now()<deadline);
        chunkMeshMs+=performance.now()-meshStart;
        if(!step.done)break;
        const old=worldChunks.get(meshJob.key);
        worldChunks.set(meshJob.key,step.value);if(old)destroyChunkMesh(old);
        meshJob=null;chunkMeshCount++;changed=true;
      }
      if(changed)refreshVisibleChunkMeshes();
    }

    function insideShadowDistance(mesh){
      const x=(mesh.chunkX*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[0]:0)),z=(mesh.chunkZ*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[2]:0));
      return Math.max(x-cameraPosition[0],cameraPosition[0]-(x+CHUNK_SIZE),0)<=SHADOW_DISTANCE
        &&Math.max(z-cameraPosition[2],cameraPosition[2]-(z+CHUNK_SIZE),0)<=SHADOW_DISTANCE;
    }
    let shadowCullEnabled=true;
    document.addEventListener('keydown',event=>{
      if(event.code!=='KeyK')return;event.preventDefault();
      shadowCullEnabled=!shadowCullEnabled;temporalHistoryValid=false;
      setStatus('Schatten-Culling '+(shadowCullEnabled?'an (wie Iris)':'aus (alles im shadowDistance)')+' · K','good');
    });
    let shadowCullFrame=-1,shadowCullDirection=[0,-1,0],shadowCullMode='true',shadowVoxelDistance=0,shadowFloorY=-Infinity;
    function shadowCasterVisible(mesh){
      if(!insideShadowDistance(mesh))return false;
      if(!shadowCullEnabled)return true;
      if(shadowCullFrame!==renderedFrameCounter){
        shadowCullFrame=renderedFrameCounter;
        const m=shadowViewMatrix;shadowCullDirection=[-m[2],-m[6],-m[10]];
        shadowCullMode=String(packSettings?.properties?.['shadow.culling']??'true').trim().toLowerCase();
        shadowVoxelDistance=shadowCullMode==='reversed'?Number(gbufferPrograms.get('gbuffers_terrain')?.constants?.voxelDistance)||0:0;
        shadowFloorY=Infinity;for(const visible of visibleChunkMeshes)shadowFloorY=Math.min(shadowFloorY,visible.minY);
      }
      if(shadowCullMode==='false'||!sceneFrustum?.length)return true;
      const x0=(mesh.chunkX*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[0]:0)),z0=(mesh.chunkZ*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[2]:0)),x1=x0+CHUNK_SIZE,z1=z0+CHUNK_SIZE;
      if(shadowVoxelDistance>0
        &&Math.max(x0-cameraPosition[0],cameraPosition[0]-x1,0)<=shadowVoxelDistance
        &&Math.max(z0-cameraPosition[2],cameraPosition[2]-z1,0)<=shadowVoxelDistance)return true;
      const d=shadowCullDirection;
      const reach=Math.min(SHADOW_DISTANCE*2,Number.isFinite(shadowFloorY)?Math.max(0,mesh.maxY-shadowFloorY)/Math.max(Math.abs(d[1]),.05):SHADOW_DISTANCE*2);
      for(const p of sceneFrustum){
        const nearest=p[0]*(p[0]>=0?x1:x0)+p[1]*(p[1]>=0?mesh.maxY:mesh.minY)+p[2]*(p[2]>=0?z1:z0)+p[3];
        if(nearest+Math.max(0,reach*(p[0]*d[0]+p[1]*d[1]+p[2]*d[2]))<0)return false;
      }
      return true;
    }
    function drawWorldMeshes(shadow=false,layerProgram=null) {if(GB.hooks.warmGeometry())return;
      const minFilter=dirtTexture.params.get(gl.TEXTURE_MIN_FILTER);
      try {
        if(layerProgram){
          for(const layer of ['solid','leaves','plants']){
            dirtTexture.params.set(gl.TEXTURE_MIN_FILTER,layer==='plants'?gl.NEAREST:minFilter);
            gl.textureStamp=(gl.textureStamp||0)+1;
            const program=layerProgram(layer);
            for(const mesh of visibleChunkMeshes){
              if(shadow&&!shadowCasterVisible(mesh))continue;
              if(!shadow&&sceneFrustum.some(p=>p[0]*((mesh.chunkX*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[0]:0))+(p[0]>=0?CHUNK_SIZE:0))+p[1]*(p[1]>=0?mesh.maxY:mesh.minY)+p[2]*((mesh.chunkZ*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[2]:0))+(p[2]>=0?CHUNK_SIZE:0))+p[3]<0))continue;
              const bytes=mesh.indexType===gl.UNSIGNED_INT?4:2;
              if(layer==='leaves'&&!mesh.cutoutIndexCount||layer==='plants'&&!mesh.plantIndexCount)continue;
              gl.bindVertexArray(mesh.vao);
              u1f(program,'viewerAlphaTestRef',layer==='solid'?0:.1);
              if(layer==='solid')gl.drawElements(gl.TRIANGLES,mesh.solidIndexCount??mesh.indexCount,mesh.indexType,0);
              else if(layer==='leaves')gl.drawElements(gl.TRIANGLES,mesh.cutoutIndexCount,mesh.indexType,mesh.solidIndexCount*bytes);
              else gl.drawElements(gl.TRIANGLES,mesh.plantIndexCount,mesh.indexType,mesh.plantIndexOffset*bytes);
            }
          }
          return;
        }
        for(const plants of [false,true]){
          dirtTexture.params.set(gl.TEXTURE_MIN_FILTER,plants?gl.NEAREST:minFilter);
          gl.textureStamp=(gl.textureStamp||0)+1;
          for(const mesh of visibleChunkMeshes){
            if(shadow&&!shadowCasterVisible(mesh))continue;
            if(!shadow&&sceneFrustum.some(p=>p[0]*((mesh.chunkX*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[0]:0))+(p[0]>=0?CHUNK_SIZE:0))+p[1]*(p[1]>=0?mesh.maxY:mesh.minY)+p[2]*((mesh.chunkZ*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[2]:0))+(p[2]>=0?CHUNK_SIZE:0))+p[3]<0))continue;
            const bytes=mesh.indexType===gl.UNSIGNED_INT?4:2;
            gl.bindVertexArray(mesh.vao);
            if(plants){
              if(!mesh.plantIndexCount)continue;
              if(!shadow)u1f(activeProgram,'viewerAlphaTestRef',.1);
              gl.drawElements(gl.TRIANGLES,mesh.plantIndexCount,mesh.indexType,mesh.plantIndexOffset*bytes);
            }else if(shadow){gl.drawElements(gl.TRIANGLES,mesh.plantIndexOffset??mesh.indexCount,mesh.indexType,0);}
            else {
              u1f(activeProgram,'viewerAlphaTestRef',0);
              gl.drawElements(gl.TRIANGLES,mesh.solidIndexCount??mesh.indexCount,mesh.indexType,0);
              if(mesh.cutoutIndexCount){u1f(activeProgram,'viewerAlphaTestRef',.1);gl.drawElements(gl.TRIANGLES,mesh.cutoutIndexCount,mesh.indexType,mesh.solidIndexCount*bytes);}
            }
          }
        }
      }finally{dirtTexture.params.set(gl.TEXTURE_MIN_FILTER,minFilter);gl.textureStamp=(gl.textureStamp||0)+1;}
    }

