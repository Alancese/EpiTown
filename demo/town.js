/* Pure replay geometry is shared with the small Node self-check. */
function townClamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function townStationary(data, frame, person, code) {
  const n = data.buildings.length, b = data.buildings[code % n];
  const peers = frame.p.map((p, i) => p === code ? i : -1).filter(i => i >= 0);
  const slot = Math.max(0, peers.indexOf(person)), columns = Math.min(5, Math.max(1, peers.length));
  return {x: b.x + (code >= n ? 66 : 0) + (slot % columns - (columns - 1) / 2) * 18,
          y: b.y + 12 + Math.floor(slot / columns) * 16};
}
function townRoute(data, origin, target, start, end) {
  const n = data.buildings.length, a = data.buildings[origin % n], b = data.buildings[target % n];
  const ax = data.areas.find(z => z.id === a.area).x, bx = data.areas.find(z => z.id === b.area).x;
  const points = [start, {x:a.x,y:a.y+65}, {x:ax,y:a.y+65}];
  if (a.area !== b.area) points.push({x:ax,y:data.road_y}, {x:bx,y:data.road_y});
  points.push({x:bx,y:b.y+65}, {x:b.x,y:b.y+65}, end);
  return points.filter((p,i) => !i || p.x !== points[i-1].x || p.y !== points[i-1].y);
}
function townAlong(points, progress) {
  const lengths = points.slice(1).map((p,i) => Math.hypot(p.x-points[i].x,p.y-points[i].y));
  let remaining = townClamp(progress,0,1)*lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++) {
    if(remaining<=lengths[i]) {const f=lengths[i] ? remaining/lengths[i] : 0;
      return {x:points[i].x+(points[i+1].x-points[i].x)*f,y:points[i].y+(points[i+1].y-points[i].y)*f};}
    remaining-=lengths[i];
  }
  return {...points[points.length-1]};
}
function townPerson(data, time, person) {
  const t=townClamp(time,0,data.ticks), frame=data.frames[Math.floor(t)];
  const trip=data.trips[person].find(m=>m.start<=t && t<m.end);
  if(trip) {
    const endFrame=data.frames[Math.min(data.ticks,trip.end)];
    const destination=endFrame.p[person]<0 ? trip.target : endFrame.p[person];
    const start=townStationary(data,data.frames[trip.start],person,trip.origin);
    const end=townStationary(data,endFrame,person,destination);
    const path=townRoute(data,trip.origin,trip.target,start,end);
    return {...townAlong(path,(t-trip.start)/trip.duration),trip,path,
            activity:t>=trip.start+trip.duration ? 'queue' : 'travel'};
  }
  if(frame.p[person]<0) throw Error('Road position has no recorded journey');
  const p=townStationary(data,frame,person,frame.p[person]);
  const next=data.frames[Math.min(data.ticks,Math.floor(t)+1)], f=t-Math.floor(t);
  if(next.p[person]>=0 && next.p[person]%data.buildings.length===frame.p[person]%data.buildings.length) {
    const q=townStationary(data,next,person,next.p[person]);
    p.x+=(q.x-p.x)*f;p.y+=(q.y-p.y)*f;
  }
  return {...p,activity:frame.p[person]>=data.buildings.length ? 'queue' : frame.a[person]};
}
function townCaseSteps(c,ticks){
  const steps=[];
  if(c.infection>0)steps.push({label:'易感 S',state:0,tick:Math.max(0,c.infection-6)});
  steps.push({label:'潜伏 E',state:1,tick:c.infection?c.infection+1:0});
  if(c.onset!=null)steps.push({label:c.symptomatic?'出现症状':'传染 I',state:2,tick:c.onset+1});
  for(const [key,label] of [['requested_at','申请检测'],['sample_at','已采样'],['detected_at','阳性结果'],['negative_at','阴性结果']]){
    if(c[key]!=null)steps.push({label,state:c.recovery!=null&&c[key]>=c.recovery?3:2,tick:c[key]+1});
  }
  if(c.recovery!=null)steps.push({label:'康复 R',state:3,tick:c.recovery+1});
  return steps.filter(s=>s.tick<=ticks).sort((a,b)=>a.tick-b.tick);
}
function townActivityVisible(data,time){return (data.activity||[]).filter(e=>e.tick<=Math.floor(time));}
function townNextEvent(data,time,kinds){return (data.activity||[]).find(e=>e.tick>time&&kinds.includes(e.kind));}
function townMayor(data, frame) {
  const hall=data.buildings.find(b=>b.type==='B01');
  const anchor=area=>area===hall.area?{x:hall.x-25,y:hall.y+13}:
    {x:data.areas.find(a=>a.id===area).x,y:data.road_y+17};
  const civic=frame.civic;
  if(!civic)return {...anchor(hall.area),activity:'在市政厅办公'};
  const visit=civic.visit;
  if(!visit)return {...anchor(civic.mayor_area),activity:civic.mayor_area===hall.area?'在市政厅办公':'在 '+civic.mayor_area+' 服务区停留'};
  const start=anchor(visit.origin),end=anchor(visit.area);
  // Advance only with recorded travel consumption, including pauses across closed hours.
  const path=[start,{x:data.areas.find(a=>a.id===visit.origin).x,y:data.road_y+17},
    {x:data.areas.find(a=>a.id===visit.area).x,y:data.road_y+17},end];
  const progress=visit.travel_total?1-visit.travel/visit.travel_total:0;
  const p=visit.origin===visit.area?start:townAlong(path,progress);
  return {...p,activity:visit.travel?`走访 ${visit.origin} → ${visit.area} · 剩余 ${visit.travel*10} 分钟行程`:
    `在 ${visit.area} 现场观察 · 剩余 ${visit.observe*10} 分钟`};
}
const townCapabilities={
  B01:'市政补助申请与发放；市长部门协调及付费现场走访。行政工时和政府资金受限。',
  B02:'居民服务投诉受理并登记警务任务；警察按既有班次执行巡查及访问。',
  B03:'医疗评估、转介与合成治疗；保留医院 D01/D02 服务线，消耗工时、资金和治疗包。',
  B04:'居民居住、休息和使用个人食品；家庭接触发生在真实同住位置。',
  B05:'公寓分户居住与休息；进出公共门厅占用时间和有限门厅容量。',
  B06:'按开放时间和工作名额提供就业、工资及产出；受工作容量政策约束。',
  B07:'居民付费购买食品；受库存、资金、开放时间及场所容量约束。',
  B08:'付费堂食或外带，预留并消耗食品；堂食占用服务时间，可产生同场社交。',
  B09:'开放时间内提供休闲和同场社交，活动容量受市政政策约束。',
  B10:'低余额居民申请食品援助；受资格、库存、开放时间及服务位约束。',
  B11:'社区医疗评估与合成治疗；D03 与其他专业站点共享，调拨有旅行和交接时间。',
  B12:'检测采样与延迟结果；必须有到场居民、可用医疗服务线、试剂和经费。',
  B13:'支持照护与休息恢复；占用共享医疗服务线及照护物资，无新增班次。',
  B14:'凭评估后处方领取合成药物；消耗药品和政府资金，服务完成后施加模型效果。',
  B15:'按班次和工作名额就业、发薪并累计生产工时；生产积分不等于新增医疗库存。',
  B16:'付费咖啡休闲或外带；受营业时间、服务位及模式约束。'
};
const townActions={home:'居家',sleep:'休息',eat:'用餐',idle:'停留',survey_contact:'接受家庭访问',survey_booking:'确认访问预约',survey_wait:'等待预约访问',work:'工作',shop:'购物',travel:'出行',leisure:'休闲',care:'医疗评估',test:'检测采样',queue:'等待服务',grant:'办理补助',aid:'领取食品援助',dine:'餐馆堂食',medicine:'凭处方领药',hall:'公寓门厅通行',treatment:'合成治疗',support:'支持照护',complaint:'提交服务投诉',takeaway:'领取外带餐食',coffee:'咖啡休闲',coffee_takeaway:'咖啡外带',visit:'市长现场走访'};
function townCompleted(frame, type) {
  return Object.entries(frame.civic?.services||{}).filter(([key])=>key.startsWith(type+':'));
}
if(typeof module!=='undefined') module.exports={townAlong,townRoute,townPerson,townStationary,townCaseSteps,townActivityVisible,townNextEvent,townMayor,townCapabilities,townActions,townCompleted};
if(typeof module!=='undefined'&&require.main===module){
  const assert=require('node:assert/strict');
  const data={buildings:[{type:'B01',area:'E1',x:1600,y:270}],areas:[{id:'E1',x:1480},{id:'W1',x:840}],road_y:640};
  const frame={civic:{mayor_area:'E1',visit:{origin:'E1',area:'W1',travel:3,travel_total:3,observe:2}}};
  const position=f=>{const {x,y}=townMayor(data,f);return {x,y};};
  assert.deepEqual(position(frame),{x:1575,y:283});
  frame.civic.visit.travel=2;
  assert.notDeepEqual(position(frame),{x:1575,y:283});
  assert.deepEqual(position(frame),position({...frame,tick:999}));
  frame.civic.visit.travel=0;
  assert.deepEqual(position(frame),{x:840,y:657});
  assert.deepEqual(position(frame),position({civic:{mayor_area:'W1',visit:null}}));
  frame.civic.visit.area='E1';
  assert.deepEqual(position(frame),{x:1575,y:283});
  assert.equal(Object.keys(townCapabilities).length,16);
  assert.deepEqual(townCompleted({civic:{services:{'B08:dine':2,'B14:medicine':1}}},'B08'),[['B08:dine',2]]);
  for(const key of ['grant','aid','dine','medicine','hall','treatment','support','complaint'])assert.ok(townActions[key]);
  console.log('Civic replay self-check passed.');
}

if(typeof document!=='undefined') (async function () {
  'use strict';
  const $=id=>document.getElementById(id), data=JSON.parse($('town-data').textContent);
  const canvas=$('map'), stage=$('stage'), ctx=canvas.getContext('2d'), images={};
  const byId=Object.fromEntries(data.buildings.map((b,i)=>[b.id,i]));
  const colors={home:'#478b6b',sleep:'#478b6b',eat:'#73a475',idle:'#478b6b',survey_contact:'#478b6b',survey_booking:'#478b6b',survey_wait:'#478b6b',work:'#d59b39',shop:'#d59b39',travel:'#529ac6',leisure:'#9c78b5',care:'#db7e75',test:'#db7e75',queue:'#db7e75'};
  Object.assign(colors,{grant:'#d59b39',aid:'#d59b39',dine:'#73a475',medicine:'#db7e75',hall:'#529ac6',treatment:'#db7e75',support:'#db7e75',complaint:'#547999',takeaway:'#73a475',coffee_takeaway:'#9c78b5'});
  const actions=townActions, isCivic=!!data.civic;
  const roles=['D01','D02','D03','P01','P02','M01'];
  const queryReasons={rule:'按公共报告规则选择',not_decided:'尚未决策',disabled:'本组不追加调查',no_feasible_option:'当前无人时或可行名额',model_mismatch:'当前模型不匹配',fixed_schedule:'按固定安排执行',random_schedule:'按随机安排执行',positive_net_value:'预计能改善后续决策',no_decision_value:'当前预测中无法改善后续选择',cost_exceeds_value:'预期净收益不为正',validation_rejected:'新预测轨迹未确认收益，取消追加调查'};
  const healthColors={0:'#5f8f6e',1:'#d4a03c',2:'#c9584e',3:'#5d7fa8'};
  const healthNames={0:'易感',1:'潜伏',2:'传染',3:'康复'};
  const healthLetters={0:'S',1:'E',2:'I',3:'R'};
  const hasHealth=!!(data.health&&data.frames.some(f=>f.h));
  const cases=hasHealth?(data.health.cases||[]).filter(c=>c.onset!=null).sort((a,b)=>
    Number(b.sample_at!=null)-Number(a.sample_at!=null)||Number(b.recovery!=null)-Number(a.recovery!=null)||Number(b.infection>0)-Number(a.infection>0)):[];
  Object.assign(queryReasons,{common_fixed_visit:'共同固定家庭访问安排',no_additional_visit:'不追加家庭调查',pending:'尚未决策'});
  let colorBy=isCivic?'activity':'health', tourIndex=0, tourPhase=-1, tourTimer=null;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let time=Math.min(48,data.ticks), speed=1, running=false, zoom=1, fitZoom=1, pan={x:0,y:0}, width=0,height=0;
  let selected={kind:'building',id:data.buildings.findIndex(b=>b.type==='B03')}, following=false, hovered=null;
  let hits=[], pointer=null, ready=false, lastStamp=0, lastPanel=-1;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world=document.createElement('canvas');world.width=data.width;world.height=data.height;
  const background=world.getContext('2d');
  function stroke(g,points,color,size,dash=[]) {g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokeStyle=color;g.lineWidth=size;g.lineCap='round';g.lineJoin='round';g.setLineDash(dash);g.stroke();g.setLineDash([]);}
  function ellipse(g,x,y,rx,ry,color){g.fillStyle=color;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();}
  function ground() {
    const g=background;g.fillStyle='#dce8c8';g.fillRect(0,0,data.width,data.height);
    let seed=27;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<1600;i++){const x=rand()*data.width,y=rand()*data.height;ellipse(g,x,y,1+rand()*3,1,'#ccdcb9');}
    // A decorative stream crosses the long link between the two service districts.
    const river=[{x:1170,y:-30},{x:1150,y:260},{x:1176,y:500},{x:1160,y:800},{x:1190,y:1260}];
    stroke(g,river,'#bfd6b5',102);stroke(g,river,'#9ccac5',72);stroke(g,river,'#b4dad3',56);
    for(let y=50;y<1220;y+=140)stroke(g,[{x:1150,y},{x:1182,y:y+4}],'#d8ede2',2);
    for(const a of data.areas){
      const bs=data.buildings.filter(b=>b.area===a.id),low=Math.min(...bs.map(b=>b.y+65)),high=Math.max(...bs.map(b=>b.y+65));
      stroke(g,[{x:a.x,y:low},{x:a.x,y:high}],'#f6f3de',38);
      stroke(g,[{x:a.x,y:low},{x:a.x,y:high}],'#c3c6b4',24);
      for(const b of bs){stroke(g,[{x:a.x,y:b.y+65},{x:b.x,y:b.y+65}],'#f6f3de',30);stroke(g,[{x:a.x,y:b.y+65},{x:b.x,y:b.y+65}],'#c3c6b4',18);}
    }
    const avenue=[{x:62,y:data.road_y},{x:2258,y:data.road_y}];
    stroke(g,avenue,'#faf6e5',74);stroke(g,avenue,'#b5bbaf',53);stroke(g,avenue,'#f5f1d9',2,[15,18]);
    g.fillStyle='#cbd1c1';g.fillRect(1115,data.road_y-35,100,70);
    stroke(g,[{x:1115,y:data.road_y-35},{x:1215,y:data.road_y-35}],'#eaf0db',6);
    stroke(g,[{x:1115,y:data.road_y+35},{x:1215,y:data.road_y+35}],'#eaf0db',6);
    for(const a of data.areas){for(let k=-3;k<=3;k++){g.fillStyle='#eff0dd';g.fillRect(a.x-15+k*5,data.road_y-24,3,48);}}
    for(const b of data.buildings){
      g.fillStyle=b.area.endsWith('0')?'#d2dfbd':'#d8dfc5';g.fillRect(b.x-113,b.y-82,226,130);
      stroke(g,[{x:b.x,y:b.y+8},{x:b.x,y:b.y+65}],'#f1e8cf',22);
      ellipse(g,b.x+6,b.y+3,88,14,'#6d805625');
    }
    function tree(x,y,r){ellipse(g,x+6,y+8,r*.9,r*.36,'#81966a25');g.fillStyle='#9e9674';g.fillRect(x-2,y,4,12);ellipse(g,x,y-7,r,r*.85,'#7fa76c');ellipse(g,x-4,y-12,r*.7,r*.65,'#97b97e');}
    for(let i=0;i<210;i++){
      const x=40+rand()*2240,y=150+rand()*1030;
      if(Math.abs(y-data.road_y)<65 || Math.abs(x-1165)<65 || data.areas.some(a=>Math.abs(x-a.x)<50))continue;
      if(data.buildings.some(b=>Math.abs(x-b.x)<128 && y>b.y-235 && y<b.y+90))continue;
      tree(x,y,9+rand()*8);
    }
    // Small public gardens occupy the open residential space, without adding facilities.
    for(const x of [170,2155]){ellipse(g,x,792,70,45,'#c6dbad');stroke(g,[{x:x-40,y:792},{x:x+40,y:792}],'#e7e5c9',14);tree(x-40,765,19);tree(x+36,817,16);}
    for(const b of [...data.buildings].sort((a,b)=>a.y-b.y)){
      const asset=data.sprites[b.asset], r=asset.bounds, ratio=Math.min(207/(r[2]-r[0]),216/(r[3]-r[1]));
      b.drawWidth=(r[2]-r[0])*ratio;b.drawHeight=(r[3]-r[1])*ratio;
      g.drawImage(images[b.asset],r[0],r[1],r[2]-r[0],r[3]-r[1],b.x-b.drawWidth/2,b.y-b.drawHeight,b.drawWidth,b.drawHeight);
    }
  }
  function resize(fit=false){const box=stage.getBoundingClientRect(),oldW=width,oldH=height;width=box.width;height=box.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    fitZoom=Math.min((width-40)/data.width,(height-95)/data.height);
    if(fit||!oldW){zoom=fitZoom;pan={x:(width-data.width*zoom)/2,y:(height-data.height*zoom)/2+15};}
    else{pan.x+=(width-oldW)/2;pan.y+=(height-oldH)/2;zoom=townClamp(zoom,fitZoom*.7,2.5);}
    draw();}
  function zoomAt(value,x=width/2,y=height/2){const next=townClamp(value,fitZoom*.7,2.5),k=next/zoom;pan={x:x-(x-pan.x)*k,y:y-(y-pan.y)*k};zoom=next;draw();}
  function frame(){return data.frames[Math.floor(townClamp(time,0,data.ticks))];}
  function clock(t){const minutes=Math.floor(t*10),day=Math.floor(minutes/1440)+1,h=Math.floor(minutes%1440/60),m=minutes%60;return `第 ${day} 天 · ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
  function healthAt(i,f){return f&&f.h?f.h[i]:null;}
  function updateHealthStrip(f){
    if(!hasHealth)return;
    const counts=f.health_counts||{S:0,E:0,I:0,R:0},names=['S','E','I','R'];
    $('health-strip').innerHTML=names.map((key,k)=>`<span class="hchip" title="${healthNames[k]}"><i style="background:${healthColors[k]}"></i>${healthNames[k]} <b>${counts[key]}</b></span>`).join('');
  }
  function caseTime(c,k){return townCaseSteps(c,data.ticks)[k].tick;}
  function currentCase(){return cases[tourIndex];}
  function updateCasePanel(){
    const c=currentCase();if(!c)return;
    const steps=townCaseSteps(c,data.ticks);
    $('case-title').textContent=`病程与检测 · ${data.people[c.resident].id}`;
    const current=frame(),testState=(current&&current.r)?current.r[c.resident]:0;
    const testNames=['未检测','待结果','阴性','阳性'];
    $('case-meta').innerHTML=`感染 ${clock(c.infection?c.infection+1:0)} · ${c.symptomatic?'有症状':'无症状'} · ${testNames[testState]||'未检测'}`;
    $('phase-row').innerHTML=steps.map((s,k)=>`<button data-phase="${k}" aria-pressed="${tourPhase===k}" class="phase"><i style="background:${healthColors[s.state]}"></i><span>${s.label}</span><small>${clock(s.tick)}</small></button>`).join('');
    [...$('phase-row').querySelectorAll('button')].forEach(button=>button.onclick=()=>showPhase(Number(button.dataset.phase)));
    $('case-prev').disabled=tourPhase<=0;$('case-next').disabled=tourPhase>=steps.length-1;
  }
  function showPhase(k){
    const c=currentCase();if(!c)return;
    tourPhase=townClamp(k,0,townCaseSteps(c,data.ticks).length-1);selectAgent(c.resident,true);seek(caseTime(c,tourPhase));
    updateCasePanel();
  }
  function stopTour(){
    if(tourTimer){clearInterval(tourTimer);tourTimer=null;}
    $('case-auto').textContent='自动播放';tourPhase=-1;$('case-panel').hidden=true;
  }
  function toggleTour(){
    if(tourTimer){clearInterval(tourTimer);tourTimer=null;$('case-auto').textContent='自动播放';return;}
    $('case-auto').textContent='暂停演示';
    tourTimer=setInterval(()=>{if(tourPhase>=townCaseSteps(currentCase(),data.ticks).length-1){clearInterval(tourTimer);tourTimer=null;$('case-auto').textContent='自动播放';return;}showPhase(tourPhase+1);},2600);
  }
  function openTour(){
    if(!cases.length)return;
    $('case-panel').hidden=false;
    tourIndex=0;tourPhase=-1;
    const c=currentCase();
    if(colorBy!=='health'){colorBy='health';renderLegend();}
    selectAgent(c.resident,true);following=true;$('follow').setAttribute('aria-pressed','true');
    showPhase(0);
  }
  function staffPoint(id,f){
    if(id==='M01')return {...townMayor(data,f),color:'#be9950',title:'市长',label:'M'};
    if(id.startsWith('D')){
      const s=f.medical.find(t=>t.id===id),b=data.buildings[byId[s.site]],move=s.transfer;
      let p={x:b.x-32+(Number(id.slice(1))-1)*24,y:b.y+8},activity=f.on_duty.includes(id)?'在班':'不在班';
      if(move){const a=data.buildings[byId[move.origin]],dest=data.buildings[byId[move.destination]];
        const path=townRoute(data,byId[a.id],byId[dest.id],{x:a.x,y:a.y+10},{x:dest.x,y:dest.y+10});
        p=townAlong(path,move.travel_ticks/(move.travel_ticks+move.travel_left));activity={pending:'等待调拨',travel:'调拨途中',handover:'交接中'}[move.status];
        if(move.status==='pending')p={x:a.x,y:a.y+10};
      }
      return{...p,activity,color:f.on_duty.includes(id)?'#cd7b73':'#9baba0',title:'医疗服务线 '+id,label:id.replace('0','')};
    }
    const s=f.police.find(p=>p.id===id),a=data.areas.find(z=>z.id===s.area),task=s.task;
    let p={x:a.x+20,y:data.road_y+17},activity=f.on_duty.includes(id)?'待命':'不在班';
    if(task){const target=data.areas.find(z=>z.id===task.area),logical={W0:0,W1:1,E1:3,E0:4},distance=Math.abs(logical[s.area]-logical[task.area]);
      if(task.travel_left && distance)p=townAlong([{x:a.x,y:data.road_y+17},{x:target.x,y:data.road_y+17}],1-task.travel_left/distance);
      activity=task.travel_left?(task.kind==='survey'?'调查途中':'巡查途中'):(task.kind==='survey'?'市长委托调查':'现场观察');
      if(!f.on_duty.includes(id))activity='不在班 · 任务暂停';
    }
    return{...p,activity,color:f.on_duty.includes(id)?'#547999':'#9baba0',title:'警察 '+id,label:id.replace('0','')};
  }
  function screen(p){return{x:p.x*zoom+pan.x,y:p.y*zoom+pan.y};}
  function selectedPosition(){return selected.kind==='building'?data.buildings[selected.id]:selected.id<50?townPerson(data,time,selected.id):staffPoint(roles[selected.id-50],frame());}
  function draw(){
    if(!ready||!width)return;
    if(following&&selected.kind==='agent'){const p=selectedPosition();pan={x:width/2-p.x*zoom,y:height/2-p.y*zoom};}
    const dpr=Math.min(devicePixelRatio||1,2),f=frame();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#dce8c8';ctx.fillRect(0,0,width,height);
    ctx.setTransform(dpr*zoom,0,0,dpr*zoom,dpr*pan.x,dpr*pan.y);ctx.drawImage(world,0,0);hits=[];
    if(selected.kind==='agent'&&selected.id<50){const p=townPerson(data,time,selected.id);if(p.path)stroke(ctx,p.path,'#508765b0',3/zoom,[5/zoom,5/zoom]);}
    for(const a of data.areas){ctx.font=`600 ${12/zoom}px "Microsoft YaHei",sans-serif`;ctx.textAlign='center';ctx.fillStyle='#5f7855';ctx.fillText(a.name,a.x,15);}
    for(const b of data.buildings){const id=byId[b.id],chosen=selected.kind==='building'&&selected.id===id,hover=hovered?.kind==='building'&&hovered.id===id;
      if(chosen||hover){ctx.strokeStyle=chosen?'#3c805b':'#91a777';ctx.lineWidth=2/zoom;ctx.beginPath();ctx.ellipse(b.x,b.y+7,110,24,0,0,Math.PI*2);ctx.stroke();}
      if(zoom>=.28||chosen){const size=Math.max(12,12/zoom),label=b.label;ctx.font=`${chosen?'600':'400'} ${size}px "Microsoft YaHei",sans-serif`;ctx.textAlign='center';const tw=ctx.measureText(label).width;
        ctx.fillStyle=chosen?'#fffef8f5':'#f5f7e9e5';ctx.fillRect(b.x-tw/2-8,b.y+34,tw+16,size+10);ctx.fillStyle=chosen?'#256144':'#4e6649';ctx.fillText(label,b.x,b.y+34+size);}
      const count=f.p.filter(p=>p===id).length;if(count){const p=screen({x:b.x+b.drawWidth*.4,y:b.y-b.drawHeight+20});ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ellipse(ctx,p.x,p.y,9,9,'#fffef5');ctx.fillStyle='#46644a';ctx.font='600 10px sans-serif';ctx.textAlign='center';ctx.fillText(count,p.x,p.y+3.5);ctx.restore();}
      hits.push({kind:'building',id,x:b.x-b.drawWidth/2,y:b.y-b.drawHeight,w:b.drawWidth,h:b.drawHeight+62,title:b.name});
    }
    const dots=data.people.map((r,i)=>({id:i,...townPerson(data,time,i),label:'',title:r.id,health:healthAt(i,f)}));
    roles.forEach((id,i)=>dots.push({id:50+i,...staffPoint(id,f),health:null}));
    // Screen-sized dots stay selectable while the map is zoomed out.
    ctx.setTransform(dpr,0,0,dpr,0,0);
    for(const p of dots){const s=screen(p),picked=selected.kind==='agent'&&selected.id===p.id,r=p.id>=50?7:4.1;
      const color=(colorBy==='health'&&p.health!=null)?healthColors[p.health]:(p.color||colors[p.activity]||colors.home);
      if(picked){ellipse(ctx,s.x,s.y,r+5,r+5,'#ffffffa0');ctx.strokeStyle='#2d6b4b';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(s.x,s.y,r+6,0,Math.PI*2);ctx.stroke();}
      ellipse(ctx,s.x,s.y,r+1.2,r+1.2,'#fffef8');ellipse(ctx,s.x,s.y,r,r,color);
      if(p.label){ctx.fillStyle='#fff';ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillText(p.label,s.x,s.y+3);}
      hits.push({kind:'agent',id:p.id,cx:s.x,cy:s.y,r:9,title:p.id<50?`${p.title} · ${actions[p.activity]||'已到达'}`:`${p.title} · ${p.activity}`});
    }
    $('clock').textContent=clock(time);$('time').value=Math.floor(time);const moving=dots.slice(0,50).filter(p=>p.trip).length;
    updateHealthStrip(f);
    const infectious=hasHealth?f.h.filter(h=>h===2).length:0;
    $('moving').textContent=`${moving} 人在路上`;$('map-status').textContent=`${Math.round(zoom/fitZoom*100)}% · ${moving} 人出行`+(hasHealth?` · 观察层：${infectious} 人传染`:'') ;
    if(lastPanel!==Math.floor(time)){lastPanel=Math.floor(time);renderDetails();}
  }
  function setOptions(){const select=$('selection');select.replaceChildren();const agent=selected.kind==='agent';
    if(agent){data.people.forEach((r,i)=>select.add(new Option(`居民 ${r.id}`,i)));roles.forEach((id,i)=>select.add(new Option(`${id.startsWith('D')?'医疗服务线':id.startsWith('P')?'警察':'市长'} ${id}`,50+i)));}
    else data.buildings.forEach((b,i)=>select.add(new Option(`${b.area} · ${b.label}`,i)));
    select.value=selected.id;$('selection-label').textContent=agent?'选择智能体':'选择建筑';$('tab-building').setAttribute('aria-pressed',!agent);$('tab-agent').setAttribute('aria-pressed',agent);$('follow').hidden=!agent;
  }
  function choose(kind,id){selected={kind,id};following=false;$('follow').setAttribute('aria-pressed','false');setOptions();renderDetails();draw();}
  function selectAgent(id,follow){choose('agent',id);if(follow){following=true;$('follow').setAttribute('aria-pressed','true');}}
  function renderLegend(){
    const health=colorBy==='health'&&hasHealth;
    $('legend-title').textContent=health?'观察者叠层 = 健康真值':'圆点颜色 = 当前活动';
    $('color-mode').hidden=!hasHealth;
    $('color-mode').textContent=health?'改为按活动着色':'改为按健康着色';
    const items=health?[0,1,2,3].map(k=>({c:healthColors[k],t:healthNames[k]+' ('+healthLetters[k]+')'})):
      [['#478b6b','居家 / 休息'],['#d59b39','工作 / 购物'],['#529ac6','出行'],['#9c78b5','休闲'],['#db7e75','就医 / 等待'],['#547999','D / P / M 岗位']].map(x=>({c:x[0],t:x[1]}));
    $('legend-grid').innerHTML=items.map(x=>'<span><i class="legend-dot" style="background:'+x.c+'"></i>'+x.t+'</span>').join('');
  }
  function row(a,b){return `<div class="row"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;}
  function activityText(e){
    if(e.kind==='instruction')return instructionText(e.instruction);
    if(e.kind==='task')return `${e.actor} 在${e.area}开始${e.survey?'委托调查':'例行观察'}`;
    if(e.kind==='observation')return `${e.actor||'警察'} 完成${e.area}观察，现场${e.count}人；报告待送达`;
    if(e.kind==='report'){
      const state={updated:'用于更新信念',received:'已接收',model_mismatch:'模型不匹配，未更新',no_sample:'无样本，未更新',not_recorded:'更新状态未记录'};
      const labels=['public-contact-v1','household-contact-v1'].includes(e.channel)?['非休闲无症状','非休闲有症状','休闲无症状','休闲有症状']:['居家','工作','休闲','照护','其他'];
      const result=e.status==='no_sample'?'没有样本':e.counts?`${e.sample_size}份样本：${labels.map((name,i)=>name+e.counts[i]).join('、')}`:e.source==='police'?`现场${e.count}人`:`${e.sample_size}份样本，${e.count}份休闲活动`;
      return `${e.area}${e.source==='survey'?'调查':'例行'}报告送达：${result}；${state[e.update_status]||e.update_status}`;
    }
    if(e.kind==='policy')return `活动中心开放额度已改为${Math.round(e.capacity*100)}%`;
    const reason=e.reason==='no_feasible_option'&&!e.on_duty.length?'此时没有警察在班':queryReasons[e.reason]||e.reason;
    return `市长${e.survey_only?'复核调查，保持':'选择'}开放${Math.round(e.capacity*100)}%，${e.query?'追加'+e.query.area+'调查':'不追加调查'}；${reason}`;
  }
  function instructionText(order){
    const site=data.buildings[byId[order.site]];
    return `${order.team} 目标：${site?site.label+' · '+site.area:order.site}；警务优先：${order.police_goal||'未指定'}；${clock(order.effective)} 起可执行`;
  }
  function instructionRows(f){
    const order=f.civic?.instruction;
    if(!order)return row('最近部门指令','尚无记录');
    return row('最近部门指令',instructionText(order))+row('指令时序',f.tick>order.effective?'已到执行时点；执行进度见岗位':'等待下一执行步')+
      '<p class="empty">目标不等于已到岗；调拨须满足在班、旅行及交接条件。指令依据已送达的延迟部门报告。</p>';
  }
  function showActivity(e){
    stopTour();seek(e.tick);
    const role=roles.indexOf(e.actor||e.officer||'M01');
    selectAgent(50+(role<0?5:role),true);draw();
  }
  const activityPanel=document.createElement('section');activityPanel.className='activity-panel';
  activityPanel.setAttribute('aria-label','警务与市政行动记录');
  activityPanel.innerHTML='<strong>行动记录</strong><p class="empty">按已发生的任务、报告和决策回放。</p><div class="activity-controls"></div><p id="activity-summary" class="empty"></p><div id="activity-log"></div>';
  document.querySelector('.side-title').after(activityPanel);
  const activityButtons=[['下次警务任务',['task']],['下次报告送达',['report']],['下次市长决策',['decision']],isCivic?['下次部门指令',['instruction']]:['下次政策变化',['policy']]].map(([label,kinds])=>{
    const button=document.createElement('button');button.textContent=label;
    button.onclick=()=>{const e=townNextEvent(data,time,kinds);if(e)showActivity(e);};
    activityPanel.querySelector('.activity-controls').append(button);return {button,kinds};
  });
  function renderActivity(visible){
    activityPanel.hidden=!data.activity?.length;
    $('activity-summary').textContent=`截至此刻：完成观察 ${visible.filter(e=>e.kind==='observation').length} 次 · 报告送达 ${visible.filter(e=>e.kind==='report').length} 次`;
    for(const {button,kinds} of activityButtons){button.disabled=!townNextEvent(data,time,kinds);button.title=button.disabled?'回放后续没有此类事件':'';}
    $('activity-log').replaceChildren();
    for(const e of visible.slice(-3).reverse()){
      const button=document.createElement('button');button.textContent=clock(e.tick)+' · '+activityText(e);button.onclick=()=>showActivity(e);$('activity-log').append(button);
    }
  }
  function renderDetails(){const f=frame(),visible=townActivityVisible(data,time);$('occupants').replaceChildren();renderActivity(visible);
    if(selected.kind==='building'){
      const b=data.buildings[selected.id],occupants=f.p.map((p,i)=>p===selected.id?i:-1).filter(i=>i>=0),queued=f.p.filter(p=>p===selected.id+data.buildings.length).length;
      $('preview').innerHTML=`<img src="${esc(data.sprites[b.asset].file)}" alt="${esc(b.name)}">`;$('selection-name').textContent=b.label;$('selection-sub').textContent=`${data.areas.find(a=>a.id===b.area).name} · ${b.id}`;
      const mix=hasHealth?[0,0,0,0]:null;if(mix)occupants.forEach(i=>mix[f.h[i]]++);
      const mixRow=mix?row('观察者健康构成',mix.map((n,k)=>n?healthNames[k]+' '+n:'').filter(Boolean).join(' · ')||'无人'):'';
      $('details').innerHTML=row('场所类型',b.name)+row('当前在场',`${occupants.length} / ${b.capacity} 人`)+row('门口排队',`${queued} 人`)+mixRow+row('服务状态',b.implemented?'已接入基础模拟':'外观已布置 · 服务待接入');
      if(isCivic){
        const completed=townCompleted(f,b.type);
        $('details').innerHTML+=row('实际功能',townCapabilities[b.type])+row('能力覆盖','16 类建筑服务已接入')+
          '<div class="list-title">截至本帧 · 同类建筑累计完成服务</div>'+
          (completed.length?completed.map(([key,n])=>row(actions[key.split(':')[1]]||key.split(':')[1],n+' 次')).join(''):
            '<p class="empty">暂无该类完成计数；不代表没有居住、工作或其他活动。</p>');
        if(['B03','B11','B12','B13','B14'].includes(b.type))$('details').innerHTML+=row('医疗边界','治疗与药物效果为未校准的合成假设；不是现实医疗证据');
      }
      const title=document.createElement('div');title.className='list-title';title.textContent='在这里的居民';$('occupants').append(title);
      const list=document.createElement('div');list.className='people-list';occupants.forEach(i=>{const button=document.createElement('button');button.textContent=data.people[i].id;button.onclick=()=>choose('agent',i);list.append(button);});
      if(!occupants.length){list.textContent='此刻暂无居民在场';list.className='empty';}$('occupants').append(list);
    } else if(selected.id<50){
      const i=selected.id,r=data.people[i],p=townPerson(data,time,i),place=f.p[i],b=place<0?null:data.buildings[place%data.buildings.length];
      $('preview').innerHTML=`<div class="avatar-dot" style="background:${colors[p.activity]||colors.home}">${esc(r.id.slice(1))}</div>`;
      $('selection-name').textContent=`居民 ${r.id}`;$('selection-sub').textContent=`住所：${data.buildings[r.home].label} · ${data.buildings[r.home].area}`;
      const location=p.trip?`${data.buildings[p.trip.origin%data.buildings.length].label} → ${data.buildings[p.trip.target].label}`:b.label+(place>=data.buildings.length?'门口':'');
      const code=f.h?f.h[i]:null,testState=(f.r?f.r[i]:0);
      const testText=['未检测','待结果','阴性','阳性'][testState]||'未检测';
      const healthRow=code==null?'':row('观察者健康真值',healthNames[code]+' ('+healthLetters[code]+')')+(code===2?row('症状',f.s&&f.s[i]?'有症状':'无症状'):'')+((code>=1&&code<=3)?row('检测',testText):'');
      $('details').innerHTML=healthRow+row('当前活动',actions[p.activity]||'已到达')+row('位置 / 路线',location)+row('可用余额',`${(f.cash_units[i]/6).toFixed(2)} CU`)+row('个人食品',`${f.food_units[i]} 份`)+row('食物满足度',`${Math.round(f.food[i]*100)}%`)+`<div class="meter"><i style="width:${f.food[i]*100}%"></i></div>`+row('休息满足度',`${Math.round(f.rest[i]*100)}%`)+`<div class="meter"><i style="width:${f.rest[i]*100}%"></i></div>`;
      if(f.testing_status){
        const statuses={not_requested:'暂无检测申请',considering:'根据症状与就诊成本考虑检测',requested:'已申请，准备出发',deferred_today:'本次暂缓，24 小时后再考虑',other_care:'先完成已有就医任务',retry_pending:'申请到期，等待重新安排',travelling:'正在前往检测点',finishing_activity:'完成当前活动后前往',closed:'检测点未开放，等待开门',entrance_queue:'在检测点门口排队',waiting_sample:'已到达，等待采样',no_staff:'等待医护或采样位置',no_budget:'等待检测经费',no_kits:'等待检测试剂',no_resource:'等待采样资源',pending_result:'已采样，等待结果',negative:'检测阴性',positive:'检测阳性',recovered:'症状消退，未完成的申请已取消',not_infectious:'本轮检测需求已结束'};
        $('details').innerHTML+=row('检测进度',statuses[f.testing_status[i]]||f.testing_status[i])+row('身体感受评分',`${Math.round(f.felt_health[i]*100)} / 100`)+row('当前工作产出',`${Math.round(f.work_factor[i]*100)}%`)+row('清醒时疲劳速度',f.s[i]?'1.5 倍':'正常')+row('带病工作少计报酬',`${(f.work_shortfall_units[i]/6).toFixed(2)} CU`);
      }
      if(f.positive_advice){
        const settings=data.health.response_settings;
        $('details').innerHTML+=row('检测选择',settings?.test_decision==='utility'?'个人信息价值、就诊成本与学习倾向':'固定概率基线');
        if(f.positive_advice[i])$('details').innerHTML+=row('医护建议','阳性后减少外出，自主选择')+row('本次建议到期',clock(f.advice_until[i]))+row('当前应对',f.p[i]===r.home?'在家':'在外或出行中');
        $('details').innerHTML+=row('累计家庭外接触',`${f.public_contact_person_ticks[i]*10} 人·分钟`);
      }
      if(f.learning_norm)$('details').innerHTML+=row('决策依据','本人近 24 小时经历')+row('本步体验得分',f.resident_reward[i].toFixed(5))+row('学习参数幅度',f.learning_norm[i].toFixed(3));
    } else {
      const id=roles[selected.id-50],p=staffPoint(id,f);$('preview').innerHTML=`<div class="avatar-dot" style="background:${p.color}">${esc(p.label)}</div>`;
      $('selection-name').textContent=p.title;$('selection-sub').textContent=id.startsWith('D')?'轮班服务控制器':id.startsWith('P')?'有限排班 · 公共任务':'公共报告 · 城市决策';
      $('details').innerHTML=row('当前状态',p.activity)+row('角色',id.startsWith('D')?'医疗':id.startsWith('P')?'警务':'市政')+row('表示方式','岗位圆点');
      if(isCivic&&id!=='M01')$('details').innerHTML+=instructionRows(f);
      if(id.startsWith('P')){
        const officer=f.police.find(p=>p.id===id),task=officer.task,done=visible.filter(e=>e.kind==='observation'&&e.actor===id),reports=visible.filter(e=>e.kind==='report'&&e.officer===id);
        $('details').innerHTML+=row('工作范围',officer.area+' 服务区')+row('实际职责','现场观察与报告')+row('当前任务',task?(task.household?'家庭访问':task.kind==='survey'?'市长委托调查':'例行观察'):'无任务')+(task?row(task.household?'现场服务进度':'连续观察进度',`${task.covered*10} / ${(task.observation_ticks||2)*10} 分钟`):'')+row('累计完成观察',done.length+' 次')+row('已送达观察报告',reports.length+' 条');
        if(reports.length)$('details').innerHTML+=row('最近报告',activityText(reports.at(-1)));
      }
      if(id==='M01'){
        const decision=visible.filter(e=>e.kind==='decision').at(-1);
        $('details').innerHTML+=row('办公方式',isCivic?'部门协调与已记录现场走访':'固定办公，政策远程生效');
        if(decision)$('details').innerHTML+=row('最近决策',clock(decision.tick))+row('决策内容',activityText(decision))+row('生效状态',time>=decision.effective?'已生效':clock(decision.effective)+' 生效');
        if(decision?.values.length){
          $('details').innerHTML+='<div class="list-title">调查净收益 · 方案选择预测</div>';
          for(const value of decision.values.filter(v=>v.area)){
            $('details').innerHTML+=row(value.area+' 选择阶段',value.net_value_vs_no_query.toFixed(6));
            if(value.validation_net_value!==undefined)$('details').innerHTML+=row(value.area+' 独立轨迹检验',value.validation_net_value.toFixed(6));
          }
          if(decision.future_decision_tick!==undefined&&decision.future_decision_tick!==null)$('details').innerHTML+=row('信息影响的政策时点',clock(decision.future_decision_tick+1));
          $('details').innerHTML+='<p class="empty">检验值仍是模型预测，不代表实际城市收益。</p>';
        }
      }
      if(isCivic&&id==='M01'){
        $('selection-sub').textContent='延迟部门报告 → 有限排班协调';
        $('details').innerHTML+=row('协调模式',{coordinated:'市长协调',autonomous:'部门自主',fixed:'固定规则'}[data.civic.department_mode]||data.civic.department_mode)+
          row('决策输入','已送达部门摘要、政府预算、班次和岗位')+instructionRows(f)+
          row('移动依据','仅按走访记录中的剩余行程；无自动返回')+
          row('方法范围','有限排班选项评分；无粒子推断或 MARL 训练');
        if(f.civic.visit)$('details').innerHTML+=row('走访发起',clock(f.civic.visit.started))+row('走访可执行',clock(f.civic.visit.effective));
      }else if(id==='M01'&&f.mayor){
        const labels={frozen:'不更新策略',slow_memoryless:'慢速 · 无动量',slow_memory:'慢速 · 有动量',fast_memoryless:'快速 · 无动量',fast_memory:'快速 · 有动量',heterogeneous:'混合人群'},m=f.mayor,q=f.surveys;
        const quality={model_mismatch:'报告超出候选解释范围',too_few_replicates:'独立背景不足',particle_degeneracy:'候选退化，证据不足',replicate_disagreement:'不同背景判断不一致',uncalibrated_estimate:'待验证，尚不能确认类型'};
        const reasons=queryReasons;
        $('selection-sub').textContent='已送达报告 → 推断 → 政策与调查';
        $('details').innerHTML+=row('活动中心开放额度',`${Math.round(f.capacity_fraction*100)}%`)+row('信念更新次数',m.reports_used+' 次')+row('最近调查选择',m.last_query?m.last_query+' 服务区':'不追加调查')+row('调查原因',reasons[m.query_reason]||'旧版未记录')+row(f.tick>0&&f.tick%144===0?'上一日调查用时':'今日调查用时',`${q.used_ticks_today*10} / ${q.daily_limit_ticks*10} 分钟`)+row('已完成调查',q.completed+' 次')+row('候选有效数量',`${m.effective_particles.toFixed(1)} / ${m.particles}`)+row('识别状态',quality[m.inference_quality?.status]||'旧版模型内估计');
        $('details').innerHTML+='<div class="list-title">模型内估计 · 尚未验证识别准确率</div>'+Object.entries(m.families).map(([key,value])=>row(labels[key],`${(100*value).toFixed(1)}%`)).join('')+row('汇报存在误差的可能性',`${(100*m.report_gain['0.5']).toFixed(1)}%`);
        if(m.preferences)for(const [key,label] of Object.entries({balanced:'基准偏好人群',income:'偏重收入人群',health:'偏重健康人群'}))$('details').innerHTML+=row(label,`${(100*m.preferences[key]).toFixed(1)}%`);
        if(m.diary){
          $('details').innerHTML+='<div class="list-title">自愿参与者的个人日志</div>'+row('已送达记录',`${m.diary.received} 条`)+row('已送达部分费用',`${m.diary.delivered_cost_cu.toFixed(2)} CU`)+row('记录连续性',m.diary.status==='history_gap'?'有缺失，不能精确回放':m.diary.received?'已送达部分连续':'尚无送达记录')+row('识别结论','记录收集中，尚未验证城市参数恢复');
        }
      }else if(id.startsWith('P')&&f.surveys){
        $('details').innerHTML+=row(f.tick>0&&f.tick%144===0?'上一日调查用时':'今日调查用时',`${f.surveys.used_ticks_today*10} / 180 分钟`)+row('预算来源','既有警务排班与政府资金');
      }
    }
  }
  function hitAt(x,y){for(const h of [...hits].reverse()){if(h.kind==='agent'){if(Math.hypot(x-h.cx,y-h.cy)<=h.r)return h;}else{const wx=(x-pan.x)/zoom,wy=(y-pan.y)/zoom;if(wx>=h.x&&wx<=h.x+h.w&&wy>=h.y&&wy<=h.y+h.h)return h;}}return null;}
  function pause(){running=false;$('play').textContent='播放';}
  function seek(t){time=townClamp(t,0,data.ticks);pause();lastPanel=-1;draw();}
  function toggle(){if(time>=data.ticks)time=0;running=!running;$('play').textContent=running?'暂停':'播放';}
  $('tab-building').onclick=()=>choose('building',data.buildings.findIndex(b=>b.type==='B03'));
  $('tab-agent').onclick=()=>choose('agent',0);$('selection').onchange=()=>choose(selected.kind,Number($('selection').value));
  $('locate').onclick=()=>{const p=selectedPosition();zoom=Math.max(zoom,.95);pan={x:width/2-p.x*zoom,y:height/2-p.y*zoom};draw();};
  $('follow').onclick=()=>{following=!following;$('follow').setAttribute('aria-pressed',following);if(following)zoom=Math.max(zoom,.95);draw();};
  $('fit').onclick=()=>{following=false;$('follow').setAttribute('aria-pressed','false');resize(true);};
  $('zoom-in').onclick=()=>zoomAt(zoom*1.3);$('zoom-out').onclick=()=>zoomAt(zoom/1.3);
  $('play').onclick=toggle;$('previous').onclick=()=>seek(Math.floor(time)-1);$('next').onclick=()=>seek(Math.floor(time)+1);$('speed').onchange=()=>speed=Number($('speed').value);
  $('tour').onclick=openTour;$('case-close').onclick=stopTour;$('case-prev').onclick=()=>showPhase(tourPhase-1);$('case-next').onclick=()=>showPhase(tourPhase+1);$('case-auto').onclick=toggleTour;
  $('color-mode').onclick=()=>{colorBy=colorBy==='health'?'activity':'health';renderLegend();draw();};
  $('time').max=data.ticks;$('time').value=time;$('time').oninput=()=>seek(Number($('time').value));$('run-label').textContent=`种子 ${data.seed} · ${data.ticks/144} 天实际记录`;
  canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();following=false;$('follow').setAttribute('aria-pressed','false');zoomAt(zoom*Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();pointer={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top,pan:{...pan},moved:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    if(pointer){const dx=x-pointer.x,dy=y-pointer.y;if(Math.hypot(dx,dy)>4)pointer.moved=true;if(pointer.moved){following=false;$('follow').setAttribute('aria-pressed','false');pan={x:pointer.pan.x+dx,y:pointer.pan.y+dy};canvas.classList.add('dragging');$('tooltip').hidden=true;draw();}return;}
    hovered=hitAt(x,y);canvas.style.cursor=hovered?'pointer':'grab';$('tooltip').hidden=!hovered;
    if(hovered){$('tooltip').textContent=hovered.title;$('tooltip').style.left=Math.max(8,Math.min(width-190,x+14))+'px';$('tooltip').style.top=Math.max(8,y-35)+'px';}draw();
  });
  canvas.addEventListener('pointerup',e=>{if(pointer&&!pointer.moved){const r=canvas.getBoundingClientRect(),h=hitAt(e.clientX-r.left,e.clientY-r.top);if(h)choose(h.kind,h.id);}pointer=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('pointercancel',()=>{pointer=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('pointerleave',()=>{hovered=null;$('tooltip').hidden=true;});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===canvas&&ready){e.preventDefault();toggle();}});
  new ResizeObserver(()=>resize()).observe(stage);setOptions();
  try{await Promise.all(Object.entries(data.sprites).map(([key,sprite])=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images[key]=img;resolve();};img.onerror=()=>reject(Error(sprite.file));img.src=sprite.file;})));}
  catch(error){$('loading').textContent='建筑素材载入失败，请保留 town.html、town.js 与 assets 文件夹在同一目录。';console.error(error);return;}
  ground();ready=true;canvas.dataset.ready='true';canvas.dataset.residents=data.people.length;canvas.dataset.buildings=data.buildings.length;
  if(hasHealth){$('health-strip').hidden=false;$('tour').hidden=!cases.length;$('color-mode').hidden=false;$('scene-badge').textContent=data.health.behavior?'呼吸道传播 · 症状与检测':'通用呼吸道传播';renderLegend();}
  if(data.agent_models){
    $('scene-badge').textContent=isCivic?'civic-v1 · 16 类服务 · 部门协作':'居民学习 · 市长决策';
    const button=document.createElement('button');button.textContent='查看市长';button.style.width='auto';button.setAttribute('aria-label',isCivic?'查看市长的走访和部门指令':'查看市长的政策和推断');button.onclick=()=>selectAgent(55,true);document.querySelector('.map-tools').append(button);
  }
  $('loading').hidden=true;$('play').disabled=false;resize(true);renderDetails();if(!reduced)toggle();
  function animate(stamp){const dt=Math.min(.1,(stamp-lastStamp)/1000||0);lastStamp=stamp;if(running){time=Math.min(data.ticks,time+dt*speed);if(time>=data.ticks)pause();draw();}requestAnimationFrame(animate);}requestAnimationFrame(animate);
})();
