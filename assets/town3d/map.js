(() => {
  'use strict';
  const root=document.getElementById('town3d');if(!root)return;
  const $=id=>document.getElementById('town-'+id),canvas=$('canvas'),fallback=$('fallback');
  const C=window.EpiTownCore,manifest=window.EPITOWN_TOWN;
  const base=new URL('.',document.baseURI);
  const buildings=manifest.buildings.map((b,index)=>({...b,pick:index+1,state:'idle'}));
  const byId=new Map(buildings.map(b=>[b.id,b]));
  const environment=new Float32Array(C.bytes(window.EPITOWN_ENVIRONMENT).buffer);
  delete window.EPITOWN_ENVIRONMENT;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let camera=homeCamera(),selected=null,isolated=false,savedCamera=null,category='全部',query='',mode='city';
  let gl,program,uniform={},attribute={},ground,whiteTexture,pickTarget,overlay,contextLost=false,graphicsReady=false;
  let frame=0,lastTime=0,auto=false,visible=true,loading=false,initError=false,flight=null;
  const pointers=new Map();let gesture=null,clickOrigin=null;
  function homeCamera(){return {yaw:.34,pitch:.76,zoom:1,target:[0,3,0],pan:[0,0]};}
  function status(message){$('status').textContent=message;}
  function report(){
    if(initError||contextLost)return;
    const loaded=buildings.filter(b=>b.state==='ready').length,failed=buildings.filter(b=>b.state==='error').length;
    status(loading?`正在载入建筑 ${loaded} / 38…`:failed?`已载入 ${loaded} / 38 栋 · ${failed} 栋未载入，可重试`:`38 栋立体建筑已就绪 · ${isolated?'正在单独查看':'点击建筑开始探索'}`);
    $('retry').hidden=!failed;root.setAttribute('aria-busy',String(loading));
  }
  function canAnimate(){return !reduced.matches&&!document.hidden&&visible&&!document.body.classList.contains('motion-paused');}
  function schedule(){if(!frame&&graphicsReady&&!contextLost&&!document.hidden&&visible)frame=requestAnimationFrame(tick);}
  function tick(time){
    frame=0;const dt=Math.min((time-lastTime)/1000||0,.05);lastTime=time;
    if(flight){
      if(flight.start===null)flight.start=time;
      const fraction=canAnimate()?C.clamp((time-flight.start)/700,0,1):1,ease=1-Math.pow(1-fraction,3);
      for(const key of ['yaw','pitch','zoom'])camera[key]=flight.from[key]+(flight.to[key]-flight.from[key])*ease;
      for(const key of ['target','pan'])camera[key]=flight.from[key].map((v,i)=>v+(flight.to[key][i]-v)*ease);
      $('zoom-label').textContent=Math.round(camera.zoom*100)+'%';
      if(fraction===1)flight=null;
    }
    if(auto&&canAnimate())camera.yaw+=dt*.16;
    draw(false,time);if(flight||(canAnimate()&&(auto||mode==='intervention')))schedule();
  }
  function compile(type,source){
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(error);}return s;
  }
  function makeBuffer(data){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return b;}
  function makeTexture(){
    const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;
  }
  function upload(b){
    b.gpu={solid:makeBuffer(b.data.solid),detail:makeBuffer(b.data.detail),texture:makeTexture()};
    gl.bindTexture(gl.TEXTURE_2D,b.gpu.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,b.artwork);
  }
  function initialize(){
    gl=canvas.getContext('webgl',{alpha:true,antialias:true});if(!gl)throw Error('WebGL unavailable');
    const vertex=compile(gl.VERTEX_SHADER,`
      attribute vec3 position,normal,paint;attribute vec2 uv;
      uniform vec3 center,offset,target,scale;uniform float modelScale;uniform vec4 angle;uniform vec2 pan;
      varying mediump vec3 color;varying highp vec2 texel;
      void main(){
        vec3 p=(position-center)*modelScale+offset-target;
        float x=p.x*angle.y-p.z*angle.x,z=p.x*angle.x+p.z*angle.y;
        float y=p.y*angle.w-z*angle.z,depth=p.y*angle.z+z*angle.w;
        gl_Position=vec4(x*scale.x+pan.x,y*scale.y+pan.y,-depth*scale.z,1.0);
        color=paint*(.94+.06*max(dot(normal,vec3(.44,.83,.34)),0.0));texel=uv;
      }`);
    const fragment=compile(gl.FRAGMENT_SHADER,`
      precision mediump float;varying mediump vec3 color;varying highp vec2 texel;
      uniform sampler2D artwork;uniform bool useTexture,picking;uniform vec3 pickColor;uniform float emphasis;
      void main(){vec4 pixel=useTexture?texture2D(artwork,texel):vec4(color,1.0);
        if(pixel.a<.5)discard;
        gl_FragColor=picking?vec4(pickColor,1.0):vec4(mix(vec3(.90,.94,.84),pixel.rgb,emphasis),1.0);
      }`);
    program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    for(const n of ['position','normal','paint','uv'])attribute[n]=gl.getAttribLocation(program,n);
    for(const n of ['center','offset','target','scale','modelScale','angle','pan','artwork','useTexture','picking','pickColor','emphasis'])uniform[n]=gl.getUniformLocation(program,n);
    gl.uniform1i(uniform.artwork,0);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.DITHER);
    whiteTexture=makeTexture();ground=makeBuffer(environment);overlay=makeBuffer(new Float32Array());pickTarget=null;
    for(const b of buildings)if(b.state==='ready')upload(b);
    graphicsReady=true;initError=false;contextLost=false;canvas.hidden=false;fallback.hidden=true;
    enableControls(true);schedule();
  }
  function enableControls(enabled){
    for(const id of ['zoom-out','zoom-in','reset','top','orbit'])$(id).disabled=!enabled;
    for(const button of root.querySelectorAll('[data-town-mode]'))button.disabled=!enabled;
    $('focus').disabled=!enabled||!selected||selected.state!=='ready';$('isolate').disabled=$('focus').disabled;
    $('orbit').disabled=!enabled||reduced.matches;
    $('orbit').title=reduced.matches?'系统已开启减少动态效果':'';
  }
  function showFallback(message){
    graphicsReady=false;initError=true;auto=false;canvas.hidden=true;fallback.hidden=false;
    $('orbit').setAttribute('aria-pressed','false');enableControls(false);status(message);$('retry').hidden=false;
    if(frame)cancelAnimationFrame(frame);frame=0;
  }
  function resize(){
    const ratio=Math.min(window.devicePixelRatio||1,2),w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio);
    if(!w||!h)return false;
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;if(pickTarget){gl.deleteFramebuffer(pickTarget.frame);gl.deleteTexture(pickTarget.color);gl.deleteRenderbuffer(pickTarget.depth);pickTarget=null;}}return true;
  }
  function bind(buffer,textured){
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const stride=textured?32:36;
    for(const [name,size,offset] of [['position',3,0],['normal',3,12],[textured?'uv':'paint',textured?2:3,24]]){
      gl.enableVertexAttribArray(attribute[name]);gl.vertexAttribPointer(attribute[name],size,gl.FLOAT,false,stride,offset);
    }
    const unused=textured?'paint':'uv';gl.disableVertexAttribArray(attribute[unused]);
    if(textured)gl.vertexAttrib3f(attribute.paint,1,1,1);else gl.vertexAttrib2f(attribute.uv,0,0);
    gl.uniform1i(uniform.useTexture,textured?1:0);
  }
  function transform(b){
    gl.uniform3fv(uniform.center,b?b.localCenter:[0,0,0]);gl.uniform3fv(uniform.offset,b?b.position:[0,0,0]);gl.uniform1f(uniform.modelScale,b?b.scale:1);
  }
  function fitPixels(){
    // Fit against the home target so focusing a building does not unexpectedly zoom out.
    if(isolated&&selected){const d=selected.size;return .8*Math.min(canvas.width,canvas.height)/Math.hypot(...d);}
    return C.fit(manifest.bounds,canvas.width,canvas.height,{...camera,target:[0,3,0]});
  }
  function draw(picking=false,time=0){
    if(!graphicsReady||contextLost||!resize())return;
    if(picking&&!makePickTarget())return;
    gl.bindFramebuffer(gl.FRAMEBUFFER,picking?pickTarget.frame:null);
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
    const pixels=fitPixels()*camera.zoom;
    gl.uniform3fv(uniform.target,camera.target);gl.uniform4f(uniform.angle,Math.sin(camera.yaw),Math.cos(camera.yaw),Math.sin(camera.pitch),Math.cos(camera.pitch));
    gl.uniform3f(uniform.scale,2*pixels/canvas.width,2*pixels/canvas.height,1/200);gl.uniform2fv(uniform.pan,camera.pan);gl.uniform1i(uniform.picking,picking?1:0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,whiteTexture);gl.uniform1f(uniform.emphasis,1);
    if(!isolated){transform(null);bind(ground,false);gl.uniform3f(uniform.pickColor,0,0,0);gl.drawArrays(gl.TRIANGLES,0,environment.length/9);}
    for(const b of buildings){
      if(b.state!=='ready'||!b.gpu||(isolated&&b!==selected))continue;
      const matches=C.matches(b,category,query);transform(b);gl.uniform1f(uniform.emphasis,matches?1:.23);
      gl.uniform3f(uniform.pickColor,matches?b.pick/255:0,0,0);
      gl.bindTexture(gl.TEXTURE_2D,whiteTexture);bind(b.gpu.solid,false);gl.drawArrays(gl.TRIANGLES,0,b.data.solid.length/9);
      gl.bindTexture(gl.TEXTURE_2D,b.gpu.texture);bind(b.gpu.detail,true);gl.drawArrays(gl.TRIANGLES,0,b.data.detail.length/8);
    }
    if(!picking&&!isolated)drawOverlay(time);
  }
  function makePickTarget(){
    if(pickTarget)return true;
    const frame=gl.createFramebuffer(),color=makeTexture(),depth=gl.createRenderbuffer();
    gl.bindTexture(gl.TEXTURE_2D,color);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,canvas.width,canvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,canvas.width,canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER,frame);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteFramebuffer(frame);gl.deleteTexture(color);gl.deleteRenderbuffer(depth);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return false;}
    pickTarget={frame,color,depth};return true;
  }
  function pick(event){
    if(!graphicsReady)return;
    draw(true);if(!pickTarget)return;
    const rect=canvas.getBoundingClientRect(),x=C.clamp(Math.floor((event.clientX-rect.left)/rect.width*canvas.width),0,canvas.width-1),y=C.clamp(Math.floor((rect.bottom-event.clientY)/rect.height*canvas.height),0,canvas.height-1),pixel=new Uint8Array(4);
    gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const b=buildings[pixel[0]-1];if(b)select(b,false);schedule();
  }
  function drawOverlay(time){
    const vertices=[],add=(p,color)=>vertices.push(...p,0,1,0,...color),line=(a,b,color)=>{add(a,color);add(b,color);};
    const ring=(b,r,color,y=.31)=>{for(let i=0;i<80;i++){const a=i*Math.PI/40,c=(i+1)*Math.PI/40;line([b.position[0]+Math.cos(a)*r,y,b.position[2]+Math.sin(a)*r],[b.position[0]+Math.cos(c)*r,y,b.position[2]+Math.sin(c)*r],color);}};
    if(selected)ring(selected,5.5,[.25,.48,.3]);
    if(mode==='intervention'){
      const b=selected||byId.get('B01'),phase=canAnimate()?(time%2600)/2600:.4;
      ring(b,5+phase*5,[.74-.22*phase,.64+.12*phase,.34+.2*phase],.34);
      ring(b,5+((phase+.5)%1)*5,[.69,.71,.4],.35);
    }
    if(mode==='network'){
      const pairs=[['B01','B03'],['B01','B02'],['B03','H01'],['B03','A01'],['B02','H02'],['B02','A02']];
      for(const [from,to] of pairs){const a=byId.get(from),b=byId.get(to);if(!a||!b)continue;
        const point=t=>[a.position[0]*(1-t)+b.position[0]*t,10+Math.sin(t*Math.PI)*5,a.position[2]*(1-t)+b.position[2]*t];
        for(let i=0;i<40;i++)line(point(i/40),point((i+1)/40),[.29,.54,.46]);
      }
    }
    if(!vertices.length)return;
    gl.bindBuffer(gl.ARRAY_BUFFER,overlay);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);transform(null);bind(overlay,false);gl.bindTexture(gl.TEXTURE_2D,whiteTexture);gl.uniform1f(uniform.emphasis,1);gl.drawArrays(gl.LINES,0,vertices.length/9);
  }
  function imageFromBytes(png){return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(new Blob([png],{type:'image/png'})),img=new Image();
    const clean=()=>{clearTimeout(timer);URL.revokeObjectURL(url);img.onload=null;img.onerror=null;};
    const timer=setTimeout(()=>{clean();reject(Error('Artwork timeout'));},30000);
    img.onload=()=>{clean();resolve(img);};img.onerror=()=>{clean();reject(Error('Artwork failed'));};img.src=url;
  });}
  function offlineBytes(b){return new Promise((resolve,reject)=>{
    const script=document.createElement('script');let timer;
    const cleanup=()=>{clearTimeout(timer);script.remove();};
    script.onload=()=>{cleanup();try{const encoded=window.EPITOWN_MODEL_BYTES[b.id];delete window.EPITOWN_MODEL_BYTES[b.id];resolve(C.bytes(encoded).buffer);}catch(error){reject(error);}};
    script.onerror=()=>{cleanup();reject(Error('Model file unavailable'));};
    timer=setTimeout(()=>{cleanup();reject(Error('Model timeout'));},30000);script.src=new URL(b.offline,base).href;document.head.append(script);
  });}
  async function loadOne(b){
    b.state='loading';
    try{
      let data;
      if(location.protocol==='file:')data=await offlineBytes(b);
      else{
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
        try{const response=await fetch(new URL(b.model,base),{signal:controller.signal});if(!response.ok)throw Error('Model HTTP '+response.status);data=await response.arrayBuffer();}finally{clearTimeout(timer);}
      }
      b.data=C.parseGLB(data);b.artwork=await imageFromBytes(b.data.png);b.state='ready';
      if(graphicsReady&&!contextLost)upload(b);
    }catch(error){b.state='error';b.error=String(error);}
    if(selected===b)updateDetail();report();schedule();
  }
  async function loadAll(){
    if(loading)return;loading=true;report();
    const queue=buildings.filter(b=>b.state!=='ready');
    await Promise.all(Array.from({length:4},async()=>{while(queue.length)await loadOne(queue.shift());}));
    loading=false;report();
  }
  function updateDetail(){
    root.dataset.selected=String(Boolean(selected));
    $('selected-code').textContent=selected?selected.id+' / '+selected.category:'EXPLORE THE TOWN';
    $('selected-name').textContent=selected?selected.name:'从一栋建筑开始。';
    $('selected-description').textContent=selected?selected.description:'点选地图中的建筑，或从下方目录定位。所有建筑均可旋转到侧面与背面观察。';
    $('clear').hidden=!selected;$('reference-wrap').hidden=!selected;$('download').hidden=!selected;
    if(selected){$('reference').src=new URL(selected.reference,base).href;$('reference').alt=selected.name+'原素材';$('download').href=new URL(selected.model,base).href;$('download').download=selected.id+'.glb';}
    $('isolate').textContent=isolated?'返回全城':'单独查看';$('isolate').setAttribute('aria-pressed',String(isolated));enableControls(graphicsReady&&!contextLost);
    for(const card of $('catalog').children)card.setAttribute('aria-pressed',String(selected&&card.dataset.id===selected.id));
  }
  function select(b,locate,origin='map'){
    selected=b;if(isolated){camera.target=[b.position[0],b.position[1]+b.size[1]/2,b.position[2]];camera.zoom=1;camera.pan=[0,0];}
    updateDetail();if(locate&&!isolated)focus();schedule();
    if(typeof CustomEvent==='function')root.dispatchEvent(new CustomEvent('epitown:selection',{detail:{id:b.id,origin}}));
  }
  function focus(){if(!selected||!graphicsReady)return;camera.target=[selected.position[0],selected.position[1]+selected.size[1]/2,selected.position[2]];camera.pan=[0,0];camera.zoom=isolated?1:2.8;cameraChanged();}
  function clearSelection(){if(isolated)toggleIsolate();selected=null;updateDetail();schedule();}
  function toggleIsolate(){
    if(!selected||selected.state!=='ready')return;
    if(!isolated){savedCamera=JSON.parse(JSON.stringify(camera));isolated=true;camera={...homeCamera(),target:[selected.position[0],selected.position[1]+selected.size[1]/2,selected.position[2]]};}
    else{isolated=false;camera=savedCamera||homeCamera();savedCamera=null;}
    updateDetail();cameraChanged();report();
  }
  function cameraChanged(){camera.zoom=C.clamp(camera.zoom,.6,5);camera.pitch=C.clamp(camera.pitch,.20,1.52);camera.pan=camera.pan.map(n=>C.clamp(n,-2,2));$('zoom-label').textContent=Math.round(camera.zoom*100)+'%';schedule();}
  function stopAuto(){auto=false;flight=null;$('orbit').setAttribute('aria-pressed','false');}
  function reset(){flight=null;isolated=false;savedCamera=null;camera=homeCamera();updateDetail();cameraChanged();report();}
  function catalog(){
    let count=0;
    for(const card of $('catalog').children){const show=C.matches(byId.get(card.dataset.id),category,query);card.hidden=!show;if(show)count++;}
    for(const button of $('filters').children)button.setAttribute('aria-pressed',String(button.dataset.category===category));
    $('result-count').textContent=count+' 栋';$('empty').hidden=count!==0;
    if(selected&&!C.matches(selected,category,query)){if(isolated)toggleIsolate();selected=null;updateDetail();}schedule();
  }
  for(const name of ['全部',...manifest.categories]){
    const button=document.createElement('button');button.type='button';button.textContent=name;button.dataset.category=name;
    button.setAttribute('aria-pressed',String(name==='全部'));button.addEventListener('click',()=>{category=name;catalog();});$('filters').append(button);
  }
  for(const b of buildings){
    const button=document.createElement('button');button.type='button';button.className='town3d-card';button.dataset.id=b.id;button.setAttribute('aria-label','定位'+b.name);button.setAttribute('aria-pressed','false');
    const img=document.createElement('img');img.src=new URL(b.preview,base).href;img.alt='';img.loading='lazy';img.width=112;img.height=87;
    const text=document.createElement('span'),code=document.createElement('b');code.textContent=b.id;text.append(code,document.createTextNode(b.name));button.append(img,text);button.addEventListener('click',()=>select(b,true));$('catalog').append(button);
  }
  $('search').addEventListener('input',event=>{query=event.target.value;catalog();});
  root.addEventListener('epitown:focus',event=>{
    const detail=event.detail||{},b=byId.get(detail.id);if(!b)return;
    stopAuto();if(isolated)toggleIsolate();category='全部';query='';$('search').value='';catalog();select(b,false,detail.origin||'ui');
    const goal={yaw:Number.isFinite(detail.yaw)?detail.yaw:.34,pitch:.76,zoom:2.4,target:[b.position[0],b.position[1]+b.size[1]/2,b.position[2]],pan:[0,0]};
    goal.yaw=camera.yaw+Math.atan2(Math.sin(goal.yaw-camera.yaw),Math.cos(goal.yaw-camera.yaw));
    if(canAnimate()&&graphicsReady)flight={from:JSON.parse(JSON.stringify(camera)),to:goal,start:null};else camera=goal;
    cameraChanged();
  });
  $('focus').addEventListener('click',focus);$('isolate').addEventListener('click',toggleIsolate);$('clear').addEventListener('click',clearSelection);
  $('reset').addEventListener('click',reset);$('top').addEventListener('click',()=>{camera.pitch=1.52;camera.yaw=0;cameraChanged();});
  $('zoom-in').addEventListener('click',()=>{camera.zoom*=1.2;cameraChanged();});$('zoom-out').addEventListener('click',()=>{camera.zoom/=1.2;cameraChanged();});
  $('orbit').addEventListener('click',()=>{auto=!auto;$('orbit').setAttribute('aria-pressed',String(auto));schedule();});
  for(const button of root.querySelectorAll('[data-town-mode]'))button.addEventListener('click',()=>{
    mode=button.dataset.townMode;for(const item of root.querySelectorAll('[data-town-mode]'))item.setAttribute('aria-pressed',String(item===button));
    $('boundary').textContent=mode==='network'?'连线为层级信息结构示意，不代表实时运行数据。':mode==='intervention'?'脉冲用于标记选定位置，不代表实际干预效果。':'建筑素材展示地图；真实智能体运行回放位于下方 Demo。';schedule();
  });
  if(!root.requestFullscreen)$('fullscreen').hidden=true;
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement===root)await document.exitFullscreen();else await root.requestFullscreen();}catch{status('浏览器未进入全屏，可继续在此探索。');}});
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement===root?'退出全屏 ↙':'沉浸探索 ↗';schedule();});
  $('retry').addEventListener('click',()=>{if(contextLost){status('图形上下文正在恢复；若仍无响应，请刷新页面。');return;}if(!graphicsReady){try{initialize();}catch{showFallback('当前浏览器未能启用 3D，仍可查看目录与下载模型。');return;}}loadAll();});
  function distance(){const p=[...pointers.values()];return Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
  function midpoint(){const p=[...pointers.values()];return [(p[0].x+p[1].x)/2,(p[0].y+p[1].y)/2];}
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('pointerdown',event=>{
    if(!graphicsReady)return;stopAuto();event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===1){clickOrigin={x:event.clientX,y:event.clientY,moved:false};gesture={pan:event.shiftKey||event.button===2};}
    else if(pointers.size===2){clickOrigin=null;gesture={distance:distance(),mid:midpoint()};}
  });
  canvas.addEventListener('pointermove',event=>{
    const previous=pointers.get(event.pointerId);if(!previous)return;
    const dx=event.clientX-previous.x,dy=event.clientY-previous.y;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(clickOrigin&&Math.hypot(event.clientX-clickOrigin.x,event.clientY-clickOrigin.y)>5)clickOrigin.moved=true;
    if(pointers.size>=2){const next=distance(),mid=midpoint();if(gesture.distance>0)camera.zoom*=next/gesture.distance;camera.pan[0]+=(mid[0]-gesture.mid[0])*2/canvas.clientWidth;camera.pan[1]-=(mid[1]-gesture.mid[1])*2/canvas.clientHeight;gesture={distance:next,mid};}
    else if(gesture.pan){camera.pan[0]+=dx*2/canvas.clientWidth;camera.pan[1]-=dy*2/canvas.clientHeight;}
    else{camera.yaw-=dx*.007;camera.pitch+=dy*.006;}
    cameraChanged();
  });
  function release(event,cancelled=false){
    if(!pointers.has(event.pointerId))return;
    const clicked=!cancelled&&pointers.size===1&&clickOrigin&&!clickOrigin.moved&&event.button!==2;
    pointers.delete(event.pointerId);if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    clickOrigin=null;gesture=pointers.size>=2?{distance:distance(),mid:midpoint()}:{pan:false};if(clicked)pick(event);
  }
  canvas.addEventListener('pointerup',event=>release(event));canvas.addEventListener('pointercancel',event=>release(event,true));canvas.addEventListener('lostpointercapture',event=>release(event,true));
  canvas.addEventListener('wheel',event=>{if(!graphicsReady)return;stopAuto();event.preventDefault();camera.zoom*=Math.exp(-C.clamp(event.deltaY,-120,120)*.0015);cameraChanged();},{passive:false});
  canvas.addEventListener('dblclick',reset);
  canvas.addEventListener('keydown',event=>{
    if(!graphicsReady)return;
    const actions={ArrowLeft:()=>camera.yaw-=.12,ArrowRight:()=>camera.yaw+=.12,ArrowUp:()=>camera.pitch+=.08,ArrowDown:()=>camera.pitch-=.08,'+':()=>camera.zoom*=1.15,'=':()=>camera.zoom*=1.15,'-':()=>camera.zoom/=1.15,Home:reset,Escape:clearSelection};
    if(actions[event.key]){stopAuto();event.preventDefault();actions[event.key]();cameraChanged();}
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;showFallback('3D 图形连接暂时中断，恢复后会自动重建地图。');});
  canvas.addEventListener('webglcontextrestored',()=>{try{initialize();report();}catch{showFallback('3D 恢复失败，可点击重试。');}});
  new ResizeObserver(schedule).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();},{rootMargin:'150px'}).observe(root);
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',()=>{enableControls(graphicsReady&&!contextLost);schedule();});
  try{initialize();loadAll();}catch{showFallback('当前浏览器未能启用 3D，仍可查看建筑目录与下载模型。');}
})();
