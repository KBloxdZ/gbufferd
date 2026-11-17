
  'use strict';
  const GB=window.GBufferd;GB.hooks.uniformInverse=GB.defaults.uniformInverse=matrix=>M4.invert(matrix);

    const ZIP_NAME = 'ComplementaryUnbound_r5.7.1.zip';
    const EMBEDDED_SHADER_ZIP_BASE64='@@base64:assets/packs/builtin-pack.zip@@';
    const GBUFFER_STAGES = [
      'clrwl_gbuffers','clrwl_gbuffers_translucent','gbuffers_armor_glint','gbuffers_basic',
      'gbuffers_beaconbeam','gbuffers_block','gbuffers_clouds','gbuffers_damagedblock',
      'gbuffers_entities','gbuffers_entities_glowing','gbuffers_hand','gbuffers_lightning',
      'gbuffers_line','gbuffers_skybasic','gbuffers_skytextured','gbuffers_spidereyes',
      'gbuffers_terrain','gbuffers_textured','gbuffers_water','gbuffers_weather'
    ];
    const GBUFFER_TARGETS = {
      clrwl_gbuffers:[0,6,4], clrwl_gbuffers_translucent:[0,3],
      gbuffers_armor_glint:[0], gbuffers_basic:[0,6], gbuffers_beaconbeam:[0,6],
      gbuffers_block:[0,3,6,4], gbuffers_clouds:[0], gbuffers_damagedblock:[0],
      gbuffers_entities:[0,3,6,4], gbuffers_entities_glowing:[0,3,6,4],
      gbuffers_hand:[0,6], gbuffers_lightning:[0,6,4], gbuffers_line:[0,6],
      gbuffers_skybasic:[0], gbuffers_skytextured:[0], gbuffers_spidereyes:[0],
      gbuffers_terrain:[0,6,4], gbuffers_textured:[0,6,3],
      gbuffers_water:[0,3], gbuffers_weather:[0,4]
    };
    const PIPELINE_STAGES = [
      'clrwl_shadow','shadow','deferred1','composite','composite1',
      'composite3','composite4','composite5','composite6','composite7','final'
    ];
    const PIPELINE_TARGETS = {
      deferred1:[0,5,4], composite:[7,1], composite1:[0,5], composite3:[0],
      composite4:[3], composite5:[3], composite6:[3,2], composite7:[3]
    };
    let displayedProgramNames=[...GBUFFER_STAGES,...PIPELINE_STAGES];
    let activePassTargets={},activeTerrainTargets=GBUFFER_TARGETS.gbuffers_terrain,activePostOrder=[],activePreOrder=[],irisSetupPending=true;
    let activeCutoutProgram=null,activeCutoutTargets=null;
    const PIPELINE_MIPMAP_INPUTS={deferred1:[0],composite3:[0],composite4:[0],composite6:[3]};
    const CAMERA_NEAR=.05,CAMERA_FOV=70*Math.PI/180,PLAYER_EYE_HEIGHT=1.62,WORLD_Y_OFFSET=64;let RENDER_DISTANCE=GB.config.renderDistance??224,CAMERA_FAR=GB.config.cameraFar??RENDER_DISTANCE*4;
    let SHADOW_DISTANCE=192,SHADOW_NEAR=-256,SHADOW_FAR=256,SHADOW_INTERVAL_SIZE=2,SHADOW_RESOLUTION=2048;
    let WORLD_TIME=10500,SUN_PATH_ROTATION=-40*Math.PI/180;
    function irisShadowPerspective(fov){
      const near=-100.05,far=156,y=1/Math.tan(fov*Math.PI/180*.5);
      return new Float32Array([y,0,0,0, 0,y,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),1]);
    }
    const vanillaCelestialAngle=time=>{const dayFraction=((time/24000-.25)%1+1)%1,curve=.5-Math.cos(dayFraction*Math.PI)*.5;return(dayFraction*2+curve)/3;};
    const sunAngleFromTime=time=>{const celestial=vanillaCelestialAngle(time);return celestial<.75?celestial+.25:celestial-.75;};
    const WORLD_TIME_START=WORLD_TIME,WORLD_TICKS_PER_SECOND=20,WORLD_TICKS_PER_DAY=24000;
    let WORLD_DAY=0,SUN_ANGLE=sunAngleFromTime(WORLD_TIME);
    let clockBaseTicks=WORLD_TIME_START,clockBaseSeconds=0,clockSeconds=0;
