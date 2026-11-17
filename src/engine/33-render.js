    function renderShadowPass(eye,now) {
      const shadowBase=pipelinePrograms.get('shadow')||pipelinePrograms.get('clrwl_shadow');
      const shadowSolid=pipelinePrograms.get('shadow_solid')||shadowBase,shadowCutout=pipelinePrograms.get('shadow_cutout')||shadowBase,shadowWater=pipelinePrograms.get('shadow_water')||shadowBase;
      const program=shadowBase||shadowSolid||shadowCutout||shadowWater;
      if(!program){clearShadowBuffers();return;}
      const targets=activePassTargets[programNames.get(program)]||[0],shadowOutputs=targets.map((_,i)=>gl.COLOR_ATTACHMENT0+i);
      clearShadowBuffers();attachShadowTargets(targets,shadowColorTextures,true);gl.viewport(0,0,SHADOW_RESOLUTION,SHADOW_RESOLUTION);
      gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);
      gl.drawBuffers(shadowOutputs);
      gl.useProgram(program);setUniforms(program,shadowGeometryViewMatrix,shadowProjectionMatrix,eye,now);u1i(program,'renderStage',8);
      {
        let current=program;
        drawWorldMeshes(true,(shadowSolid!==program||shadowCutout!==program)?layer=>{
          const next=(layer==='solid'?shadowSolid:shadowCutout)||program;
          if(next!==current){gl.useProgram(next);setUniforms(next,shadowGeometryViewMatrix,shadowProjectionMatrix,eye,now);current=next;}
          u1i(next,'renderStage',layer==='solid'?8:layer==='leaves'?9:10);
          return next;
        }:null);
        if(current!==program){gl.useProgram(program);setUniforms(program,shadowGeometryViewMatrix,shadowProjectionMatrix,eye,now);u1i(program,'renderStage',8);}
      }
      drawPlayerShadow(program,eye,now);renderDragonShadow(program,eye,now);GB.hooks.drawShaderEntities("shadow",eye,now);
      copyDepthSnapshots(shadowFramebuffer,shadowDepthCopyFramebuffer,shadowDepthTextures,SHADOW_RESOLUTION,SHADOW_RESOLUTION);
      gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFramebuffer);
      gl.viewport(0,0,SHADOW_RESOLUTION,SHADOW_RESOLUTION);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
      gl.drawBuffers(shadowOutputs);
      const waterProgram=shadowWater||program;
      gl.useProgram(waterProgram);setUniforms(waterProgram,shadowGeometryViewMatrix,shadowProjectionMatrix,eye,now);u1i(waterProgram,'renderStage',17);
      for(const mesh of visibleChunkMeshes){
        if(!mesh.waterIndexCount||!shadowCasterVisible(mesh))continue;
        gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.waterIndexCount,mesh.indexType,mesh.waterIndexOffset);
      }
      copyDepthSnapshots(shadowFramebuffer,shadowDepthCopyFramebuffer,[shadowDepthTextures[0]],SHADOW_RESOLUTION,SHADOW_RESOLUTION);
      generateShadowColorMipmaps();inspectorCapture('shadow');
    }

    function passMipmapInputs(name){
      const constants=pipelinePrograms.get(name)?.constants||{};
      const wanted=new Set();
      for(let logical=0;logical<colortexCurrent.length;logical++){
        const value=constants['colortex'+logical+'MipmapEnabled']
          ??constants[(renderTargetAliases[logical]||'colortex'+logical)+'MipmapEnabled'];
        if(value===true||value==='true'||value===1||value==='1')wanted.add(logical);
      }
      return [...wanted].sort((a,b)=>a-b);
    }
    const pipelineMipmapped=new Set();
    function resetPipelineMipmaps(){
      if(!pipelineMipmapped.size)return;
      for(const texture of pipelineMipmapped){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);}
      pipelineMipmapped.clear();
    }
    function generatePipelineMipmaps(name) {
      const inputs=passMipmapInputs(name);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      for(const logical of inputs){gl.bindTexture(gl.TEXTURE_2D,colortexCurrent[logical]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);pipelineMipmapped.add(colortexCurrent[logical]);}
      return inputs;
    }

    let activeFlipOverrides=new Map();
    function flipOverridesFor(properties){
      const result=new Map();
      for(const [key,value] of Object.entries(properties||{})){
        const match=/^flip\.(?:world0\/)?([A-Za-z_]\w*)\.(?:(?:colortex|shadowcolor)(\d+)|(\w+))$/.exec(String(key).trim());
        if(!match)continue;
        const logical=match[2]!==undefined?Number(match[2]):RENDER_TARGET_LEGACY[match[3]];
        if(!Number.isInteger(logical)||logical<0)continue;
        const text=String(value).trim().toLowerCase();
        if(text!=='true'&&text!=='false')continue;
        if(!result.has(match[1]))result.set(match[1],new Map());
        result.get(match[1]).set(logical,text==='true');
      }
      return result;
    }
    function flipTargetsFor(name,targets){
      const overrides=activeFlipOverrides.get(name);
      if(!overrides)return targets;
      const count=new Map();
      for(const logical of targets)if(overrides.get(logical)!==false)count.set(logical,(count.get(logical)||0)+1);
      for(const [logical,wanted] of overrides)if(wanted)count.set(logical,(count.get(logical)||0)+1);
      return [...count].filter(([,n])=>n%2).map(([logical])=>logical);
    }
    function applyPreFlips(stage){
      const overrides=activeFlipOverrides.get(stage+'_pre');if(!overrides)return;
      const list=[...overrides].filter(([,wanted])=>wanted).map(([logical])=>logical);
      if(stage==='shadowcomp'){for(const index of list)if(shadowColorTextures[index]&&shadowColorSpare[index])[shadowColorTextures[index],shadowColorSpare[index]]=[shadowColorSpare[index],shadowColorTextures[index]];return;}
      swapColorTargets(list.filter(logical=>logical<colortexCurrent.length));
    }
    let colortexFrameStart=null;
    function copyFlippedTargetsBack(){
      if(!colortexFrameStart)return;
      for(let logical=0;logical<colortexCurrent.length;logical++){
        const current=colortexCurrent[logical],spare=colortexSpare[logical];
        if(!current||!spare||current===colortexFrameStart[logical]||spare!==colortexFrameStart[logical])continue;
        if(current.width!==spare.width||current.height!==spare.height||current.format!==spare.format||!current.gpu||!spare.gpu)continue;
        gl.endPass();gl.commandEncoder().copyTextureToTexture({texture:current.gpu},{texture:spare.gpu},[current.width,current.height,1]);spare.version++;
      }
      colortexFrameStart=null;
    }
    function runIrisStage(name,eye,now){
      runComputeStage(name,eye,now);
      return !pipelinePrograms.has(name)||(name.startsWith('shadowcomp')?runShadowComposite(name,eye,now):runFullscreenPass(name,eye,now));
    }
    function runFullscreenPass(name,eye,now) {
      if(gl.viewerDisabledPrograms?.has(pipelinePrograms.get(name))){inspectorCapture(name);return true;}
      const program=pipelinePrograms.get(name),targets=activePassTargets[name]||PIPELINE_TARGETS[name];
      if(!program||!targets)return false;
      const mipmapped=generatePipelineMipmaps(name);
      const [passWidth,passHeight]=colortexSize(targets[0]);
      attachColorTargets(targets,colortexSpare,false);gl.viewport(...irisViewport(activePackProperties,name,passWidth,passHeight));
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(false);
      applyPackBlend(programNames.get(program)||'',targets);
      gl.useProgram(program);setUniforms(program,identityMatrix,fullscreenProjectionMatrix,eye,now);gl.bindVertexArray(screenVao);
      while(gl.getError()!==gl.NO_ERROR){}
      gl.drawElements(gl.TRIANGLES,screenIndexCount,gl.UNSIGNED_SHORT,0);
      const drawOkay=gl.getError()===gl.NO_ERROR;
      if(!drawOkay)return false;swapColorTargets(wgpuWriteOff.size?flipTargetsFor(name,targets).filter(logical=>!wgpuWriteOff.has(name+'|'+logical)):flipTargetsFor(name,targets));inspectorCapture(name);return true;
    }

    function presentFallback(texture=colortexCurrent[0],displayMode=1) {
      gl.wgpuSlotLogical=null;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.drawBuffers([gl.BACK]);gl.viewport(0,0,width,height);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(.055,.075,.105,1);gl.clear(gl.COLOR_BUFFER_BIT);
      if(/(?:uint|sint)$/.test(texture?.format||''))return;
      gl.useProgram(presentProgram);bindPresentTexture(texture,displayMode);gl.bindVertexArray(null);gl.drawArrays(gl.TRIANGLES,0,3);
    }

    function presentFinal(eye,now) {
      const program=pipelinePrograms.get('final');
      if(gl.viewerDisabledPrograms?.has(program)){presentFallback(colortexCurrent[0],0);return true;}
      if(!program)return false;
      generatePipelineMipmaps('final');
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.drawBuffers([gl.BACK]);gl.viewport(0,0,width,height);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(false);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
      applyPackBlend('final',[0]);
      gl.useProgram(program);setUniforms(program,identityMatrix,fullscreenProjectionMatrix,eye,now);gl.bindVertexArray(screenVao);
      while(gl.getError()!==gl.NO_ERROR){}
      gl.drawElements(gl.TRIANGLES,screenIndexCount,gl.UNSIGNED_SHORT,0);
      return gl.getError()===gl.NO_ERROR;
    }

    let riverReadFramebuffer=null,riverWriteFramebuffer=null,riverScratch=[];
    function riverCopy(from,to){
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,riverReadFramebuffer);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,from,0);gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,riverWriteFramebuffer);
      gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,to,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.blitFramebuffer(0,0,width,height,0,0,width,height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
    }
    function riverScratchFor(logical){
      const current=colortexCurrent[logical];let scratch=riverScratch[logical];
      if(!scratch||scratch.width!==current.width||scratch.height!==current.height||scratch.format!==current.format){if(scratch)gl.deleteTexture(scratch);scratch=riverScratch[logical]=createRenderTexture(logical);}
      return scratch;
    }
    function renderRiverWater(eye,now){
      if(!visibleChunkMeshes.some(mesh=>mesh.waterIndexCount))return;
      const resolved=resolveIrisProgram(gbufferPrograms,'gbuffers_water'),program=resolved?.program||activeProgram;
      const targets=resolved?activePassTargets[resolved.name]:activeTerrainTargets;
      riverReadFramebuffer??=gl.createFramebuffer();riverWriteFramebuffer??=gl.createFramebuffer();
      for(const target of targets)riverCopy(colortexCurrent[target],riverScratchFor(target));
      attachColorTargets(targets,riverScratch,true);gl.viewport(0,0,width,height);
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
      gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
      gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);
      gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      applyPackBlend(resolved?.name||programNames.get(program),targets);
      if(GB.state.active){gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);}
      gl.useProgram(program);setUniforms(program,cameraViewMatrix,cameraProjectionMatrix,eye,now);u1i(program,'renderStage',17);
      u1f(program,'viewerAlphaTestRef',-1);
      for(const mesh of visibleChunkMeshes){
        if(!mesh.waterIndexCount)continue;
        if(sceneFrustum.some(p=>p[0]*((mesh.chunkX*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[0]:0))+(p[0]>=0?CHUNK_SIZE:0))+p[1]*(p[1]>=0?mesh.maxY:mesh.minY)+p[2]*((mesh.chunkZ*CHUNK_SIZE-(GB.state.active?GB.state.renderOrigin[2]:0))+(p[2]>=0?CHUNK_SIZE:0))+p[3]<0))continue;
        gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.waterIndexCount,mesh.indexType,mesh.waterIndexOffset);
      }
      gl.disable(gl.BLEND);
      copyDepthSnapshots(framebuffer,depthCopyFramebuffer,[sceneDepthTextures[0]],width,height);
      for(const target of targets)riverCopy(riverScratch[target],colortexCurrent[target]);inspectorCapture('gbuffers_water');
    }

    function renderTranslucentPhase(eye,now){
      renderRiverWater(eye,now);
      renderLightning(eye,now);
      renderVanillaClouds(eye,now);
      renderWeather(eye,now);
    }

    function render(t){if(wgpuDbgPause&&wgpuDbgPause.phase==='paused'&&!wgpuDbgReplaying){document.dispatchEvent(new CustomEvent('gbufferd-inspector'));return;}if(GB.state.active&&!GB.state.visible&&gl?.irisAsyncPipelines?.presented&&activeProgram?.pipelines?.size){requestAnimationFrame(render);return;}
      if(packLoading||GB.config.rendererOptimizations&&gl?.irisAsyncPipelines?.pending){requestAnimationFrame(render);return;}
      if(gl?.irisAsyncPipelines?.frameMiss)temporalHistoryValid=false;
      if(gl)resetPipelineMipmaps();
      if(gl?.framesInFlight?.()>=2){requestAnimationFrame(render);return;}
      try{renderScene(t);}catch(error){gl?.submit();setStatus(error.message,'bad');console.error(error);}
    }

    function inspectorFinish(eye){
      if(!inspectorPresented)return false;
      previousGbufferViewMatrix=new Float32Array(cameraGbufferViewMatrix);previousProjectionMatrix=new Float32Array(cameraProjectionMatrix);
      previousCameraPosition[0]=eye[0];previousCameraPosition[1]=eye[1];previousCameraPosition[2]=eye[2];renderedFrameCounter++;if(GB.state.active){GB.hooks.drawEntities();}
      gl.depthMask(true);gl.endFrame();requestAnimationFrame(render);
      return true;
    }
    function renderScene(t) {
      resize();if(GB.state.active)GB.hooks.animateAtlas((t-startTime)/1000);gl.beginFrame();resetStageWrittenTargets();colortexFrameStart=colortexCurrent.slice();wgpuDbgFrameStart(t);inspectorPresented=false;inspectorCapturedTexture=null;const now=(t-startTime)/1000;advanceWorldClock(now);updateWeather(now);moveCamera(t);updateLightning(now,cameraPosition);updatePortal(now);if(GB.hosted){processChunkRebuilds();ensureWorldGeometry();if(!GB.state.active)streamWorldChunks();}else{ensureWorldGeometry();streamWorldChunks();processChunkRebuilds();}gl.cpuMark?.('World: '+chunkMeshCount+' chunk meshes, '+chunkMeshMs.toFixed(1)+' ms');chunkMeshMs=0;chunkMeshCount=0;
      const cp=Math.cos(pitch),look=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
      const center=[cameraPosition[0]+look[0],cameraPosition[1]+look[1],cameraPosition[2]+look[2]],eye=cameraPosition;
      cameraViewMatrix=M4.lookAt(eye,center,[0,1,0]);
      cameraGbufferViewMatrix=new Float32Array(cameraViewMatrix);cameraGbufferViewMatrix[12]=0;cameraGbufferViewMatrix[13]=0;cameraGbufferViewMatrix[14]=0;
      const submergedFov=eyeInWater(eye)?6/7:1;
      cameraProjectionMatrix=M4.perspective((GB.state.active&&GB.state.follow&&GB.state.fov)||CAMERA_FOV*submergedFov,width/height,CAMERA_NEAR,CAMERA_FAR);
      handProjectionMatrix=new Float32Array(cameraProjectionMatrix);for(const index of [2,6,10,14])handProjectionMatrix[index]*=MC_HAND_DEPTH;
      const clip=M4.multiply(cameraProjectionMatrix,cameraViewMatrix);
      sceneFrustum=[];
      for(let axis=0;axis<3;axis++)for(const sign of [-1,1])sceneFrustum.push([clip[3]+sign*clip[axis],clip[7]+sign*clip[4+axis],clip[11]+sign*clip[8+axis],clip[15]+sign*clip[12+axis]]);
      if(!temporalHistoryValid){previousGbufferViewMatrix=new Float32Array(cameraGbufferViewMatrix);previousProjectionMatrix=new Float32Array(cameraProjectionMatrix);previousCameraPosition[0]=eye[0];previousCameraPosition[1]=eye[1];previousCameraPosition[2]=eye[2];temporalHistoryValid=true;}
      const shadowAngle=SUN_ANGLE>.5?SUN_ANGLE-.5:SUN_ANGLE;
      const skyAngle=shadowAngle<.25?shadowAngle+.75:shadowAngle-.25;
      const shadowRotation=M4.multiply(M4.rotationX(Math.PI*.5),M4.multiply(M4.rotationZ(-skyAngle*Math.PI*2),M4.rotationX(SUN_PATH_ROTATION)));
      const shadowSnap=GB.hooks.absolute(eye).map(value=>SHADOW_INTERVAL_SIZE?Math.fround(value)%SHADOW_INTERVAL_SIZE-SHADOW_INTERVAL_SIZE*.5:0);
      shadowViewMatrix=M4.multiply(shadowRotation,M4.translation(shadowSnap[0],shadowSnap[1],shadowSnap[2]));
      shadowGeometryViewMatrix=M4.multiply(shadowViewMatrix,M4.translation(-eye[0],-eye[1],-eye[2]));
      shadowProjectionMatrix=activeRenderConstants.shadowMapFov!==undefined?irisShadowPerspective(Number(activeRenderConstants.shadowMapFov)):M4.ortho(-SHADOW_DISTANCE,SHADOW_DISTANCE,-SHADOW_DISTANCE,SHADOW_DISTANCE,Math.abs(SHADOW_NEAR+1)<=1e-5?-RENDER_DISTANCE:SHADOW_NEAR,Math.abs(SHADOW_FAR+1)<=1e-5?RENDER_DISTANCE:SHADOW_FAR);
      irisFrame=-1;
      gl.clearCustomImages();clearSceneBuffers();
      if(irisSetupPending){for(const stage of irisStageOrder([],Array.from(computePrograms.keys()),['setup']))runComputeStage(stage,eye,now);irisSetupPending=false;}
      applyPreFlips('begin');for(const stage of activePreOrder.filter(name=>name.startsWith('begin'))){
        if(!runIrisStage(stage,eye,now))throw new Error(stage+': Zeichenfehler');
        if(inspectorFinish(eye))return;
      }
      GB.hooks.prepareEntities();gl.cpuMark?.('Setup');renderShadowPass(eye,now);if(inspectorFinish(eye))return;gl.cpuMark?.('Shadow encoding');
      applyPreFlips('shadowcomp');for(const stage of irisStageOrder(Array.from(pipelinePrograms.keys()),Array.from(computePrograms.keys()),['shadowcomp'])){
        if(!runIrisStage(stage,eye,now))throw new Error(stage+': Zeichenfehler');
        if(inspectorFinish(eye))return;
      }
      applyPreFlips('prepare');for(const stage of activePreOrder.filter(name=>name.startsWith('prepare'))){
        if(!runIrisStage(stage,eye,now)){setStatus('WebGPU-Fehler in der Shader-Passkette','bad');break;}
        if(inspectorPresented)break;
      }
      if(inspectorFinish(eye))return;

      if(skyProgram&&window.wgpuDimension==='overworld'){
        const skyView=new Float32Array(cameraViewMatrix);skyView[12]=0;skyView[13]=0;skyView[14]=0;
        attachColorTargets(activePassTargets[programNames.get(skyProgram)]||[0],colortexCurrent,true);gl.viewport(0,0,width,height);
        gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(false);gl.useProgram(skyProgram);setUniforms(skyProgram,skyView,cameraProjectionMatrix,eye,now);u1i(skyProgram,'renderStage',1);gl.bindVertexArray(skyVao);
        gl.drawElements(gl.TRIANGLES,skyIndexCount,gl.UNSIGNED_SHORT,0);
        inspectorCapture('gbuffers_skybasic');if(inspectorFinish(eye))return;
      }

      renderVanillaCelestials(eye,now);if(inspectorFinish(eye))return;
      attachColorTargets(activeTerrainTargets,colortexCurrent,true);gl.viewport(0,0,width,height);
      gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.cullFace(gl.BACK);
      applyPackBlend(programNames.get(activeProgram)||'gbuffers_terrain',activeTerrainTargets);
      gl.useProgram(activeProgram);setUniforms(activeProgram,cameraViewMatrix,cameraProjectionMatrix,eye,now);u1i(activeProgram,'renderStage',8);
      {
        let current=activeProgram;
        drawWorldMeshes(false,layer=>{
          const program=layer!=='solid'&&activeCutoutProgram||activeProgram;
          if(program!==current){
            const targets=program===activeProgram?activeTerrainTargets:activeCutoutTargets;
            attachColorTargets(targets,colortexCurrent,true);gl.viewport(0,0,width,height);
            applyPackBlend(programNames.get(program)||'gbuffers_terrain',targets);
            gl.useProgram(program);setUniforms(program,cameraViewMatrix,cameraProjectionMatrix,eye,now);current=program;
          }
          u1i(program,'renderStage',layer==='solid'?8:layer==='leaves'?9:10);
          return program;
        });
        if(current!==activeProgram){
          attachColorTargets(activeTerrainTargets,colortexCurrent,true);gl.viewport(0,0,width,height);
          applyPackBlend(programNames.get(activeProgram)||'gbuffers_terrain',activeTerrainTargets);gl.useProgram(activeProgram);
        }
      }
      GB.hooks.drawShaderEntities('entities',eye,now);renderEndPortals(eye,now);renderSigns(eye,now);renderDragon(eye,now);renderDragonRays(eye,now);gl.cpuMark?.('G-buffer encoding');copyDepthSnapshots(framebuffer,depthCopyFramebuffer,sceneDepthTextures,width,height);
      inspectorCapture('gbuffers_terrain');if(inspectorFinish(eye))return;
      if(gl.centerDepthRequested)gl.updateCenterDepth(sceneDepthTextures[2],frameDelta,Number(activeRenderConstants.centerDepthHalflife??1));

      if(gbufferDebugView!==0){
        const debugView=GBUFFER_DEBUG_VIEWS[gbufferDebugView];
        const debugTexture=debugView.kind==='depth'?sceneDepthTextures[0]:debugView.kind==='shadowDepth'?shadowDepthTextures[0]:debugView.kind==='shadowColor'?shadowColorTextures[0]:colortexCurrent[debugView.logical];
        presentFallback(debugTexture,debugView.displayMode);
        previousGbufferViewMatrix=new Float32Array(cameraGbufferViewMatrix);previousProjectionMatrix=new Float32Array(cameraProjectionMatrix);
        previousCameraPosition[0]=eye[0];previousCameraPosition[1]=eye[1];previousCameraPosition[2]=eye[2];renderedFrameCounter++;if(GB.state.active){GB.hooks.drawEntities();}
        gl.depthMask(true);gl.endFrame();requestAnimationFrame(render);return;
      }

      const postOrder=activePostOrder;
      let pipelineDrawOkay=true;
      let waterRendered=false;
      let handRendered=false;
      if(handWritesGbuffer()){renderHand(eye,now);handRendered=true;if(inspectorFinish(eye))return;}
      applyPreFlips('deferred');let compositePreDone=false;
      for(const stage of postOrder){
        if(!stage.startsWith('deferred')&&!waterRendered){if(!handRendered)renderHand(eye,now);renderTranslucentPhase(eye,now);waterRendered=true;}
        if(!stage.startsWith('deferred')&&!compositePreDone){applyPreFlips('composite');compositePreDone=true;}
        if(!runIrisStage(stage,eye,now)){pipelineDrawOkay=false;break;}
        if(inspectorPresented)break;
      }
      if(!waterRendered&&pipelineDrawOkay){if(!handRendered)renderHand(eye,now);renderTranslucentPhase(eye,now);}if(!compositePreDone)applyPreFlips('composite');
      if(inspectorPresented){}
      else if(!pipelineDrawOkay)setStatus('WebGPU-Fehler in der Shader-Passkette','bad');
      else if(pipelinePrograms.has('final')){runComputeStage('final',eye,now);if(!presentFinal(eye,now))setStatus('WebGPU-Fehler im Final-Pass','bad');}
      else {runComputeStage('final',eye,now);presentFallback(colortexCurrent[0],0);}
      copyFlippedTargetsBack();if(inspectorOpen&&inspectorCapturedTexture){presentFallback(inspectorCapturedTexture,CHANNEL_MODES[inspectorMode][1]);if(gl.wireOverlayOn)gl.wireComposite();}
      else if(inspectorOpen&&inspectorList[inspectorIndex]&&inspectorList[inspectorIndex].kind!=='final'){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.drawBuffers([gl.BACK]);gl.viewport(0,0,width,height);gl.clearColor(.055,.075,.105,1);gl.clear(gl.COLOR_BUFFER_BIT);}
      {const missed=inspectorOpen&&!inspectorCapturedTexture&&inspectorList[inspectorIndex]?.kind!=='final';if(missed!==inspectorMissed){inspectorMissed=missed;inspectorRefresh();}}
      previousGbufferViewMatrix=new Float32Array(cameraGbufferViewMatrix);previousProjectionMatrix=new Float32Array(cameraProjectionMatrix);
      previousCameraPosition[0]=eye[0];previousCameraPosition[1]=eye[1];previousCameraPosition[2]=eye[2];renderedFrameCounter++;if(GB.state.active){GB.hooks.drawEntities();}
      gl.depthMask(true);gl.endFrame();requestAnimationFrame(render);
    }

