import { Spring } from './motion.js';
import { clamp, expansionThreshold, dragAxis, deckExtent, visualPosition, neighborId } from './interaction-core.js?v=20261003-fluid-1';

// Presentation only. Original option buttons still own role IDs and selection.
export function initCharacterModes({ root, document, isClassic, text, reduced,
  storage, Observer = globalThis.MutationObserver, Resize = globalThis.ResizeObserver,
  raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame,
  now = () => performance.now() }) {
  let mode = 'default';
  try { storage ??= globalThis.localStorage; if (storage.getItem('postprep-character-view') === 'stack') mode = 'stack'; } catch {}
  const galleries = ['rvc-model-gallery','rvc-trained-model-gallery'].map(id=>document.getElementById(id)).filter(Boolean);
  if (!galleries.length) return () => {};
  const switcher=document.createElement('div'); switcher.className='classic-only classic-character-toolbar';
  const label=document.createElement('span'), toggle=document.createElement('div');
  toggle.className='classic-character-switch'; toggle.setAttribute('role','group');
  const pill=document.createElement('span'); pill.className='classic-character-pill'; pill.setAttribute('aria-hidden','true'); toggle.append(pill);
  const modes=['default','stack'].map(value=>{
    const button=document.createElement('button'); button.type='button'; button.dataset.view=value;
    button.addEventListener('click',()=>{mode=value;try{storage.setItem('postprep-character-view',mode);}catch{} refresh();});
    toggle.append(button);return button;
  });
  switcher.append(label,toggle);galleries[0].before(switcher);
  const controllers=galleries.map(gallery=>{
    const nav=document.createElement('div');nav.className='classic-character-nav';
    const prev=document.createElement('button'),status=document.createElement('span'),next=document.createElement('button');
    prev.type=next.type='button';prev.textContent='←';next.textContent='→';
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');nav.append(prev,status,next);
    const layouts=document.createElement('div');layouts.className='classic-character-layouts';layouts.setAttribute('role','group');
    const layoutButtons=['stack','horizontal','vertical'].map(value=>{
      const button=document.createElement('button');button.type='button';button.dataset.layout=value;
      button.addEventListener('click',()=>setLayout(value));layouts.append(button);return button;
    });
    const hint=document.createElement('small');hint.className='classic-character-hint';nav.append(layouts,hint);gallery.after(nav);
    let cards=[],order=[],snapshots=new Map(),motion=new Map(),frontId='';
    let layout='stack',frame=0,previous=0,grab=null,suppressClick=false,width=300,height=184,galleryWidth=332;
    const expansion=new Spring(0),vertical=new Spring(0);
    const active=()=>isClassic()&&mode==='stack';
    const frontCard=()=>cards.find(card=>card.dataset.modelId===frontId);
    const rect=()=>gallery.getBoundingClientRect?.()||{width:332,height:246};
    function measure(){
      galleryWidth=rect().width;width=Math.min(380,Math.max(120,galleryWidth-32));
      if(!active())return;
      gallery.classList.add('is-character-stack');
      cards.forEach(card=>{card.style.width=`${width}px`;card.style.removeProperty('height');});
      // Read natural content heights together after width is set; long role names remain whole.
      height=Math.max(184,...cards.map(card=>card.offsetHeight||184));
      cards.forEach(card=>card.style.height=`${height}px`);
    }
    function cancelCapture(){
      const held=grab;grab=null;delete gallery.dataset.dragging;
      if(held){delete held.card.dataset.stackHeld;try{gallery.releasePointerCapture?.(held.id);}catch{}}
    }
    function restore(){
      cancelCapture();caf(frame);frame=0;
      cards.forEach(card=>{
        const saved=snapshots.get(card);if(!saved)return;
        ['transform','filter','opacity','z-index','width','height','--character-content'].forEach(name=>card.style.removeProperty(name));
        card.inert=saved.inert;
        for(const [key,value]of[['aria-hidden',saved.hidden],['tabindex',saved.tab]]){if(value===null)card.removeAttribute(key);else card.setAttribute(key,value);}
        for(const key of['stackRear','stackOff','stackHeld'])delete card.dataset[key];
      });
      gallery.classList.remove('is-character-stack');gallery.style.removeProperty('height');gallery.style.removeProperty('--stack-width');
      delete gallery.dataset.stackLayout;gallery.scrollLeft=0;
      expansion.value=expansion.target=expansion.velocity=0;vertical.value=vertical.target=vertical.velocity=0;
      layout='stack';suppressClick=false;
    }
    function announce(){
      const position=visualPosition(order,frontId);
      status.textContent=cards.length?`${position.position} / ${position.total} · ${frontCard()?.getAttribute('aria-selected')==='true'?text('已选用','Selected'):text('点击选用','Click to select')}`:text('没有匹配角色','No matching voices');
      prev.disabled=next.disabled=cards.length<2;
      layoutButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layout===layout)));
    }
    function access(){
      const spread=expansion.target>.8;
      cards.forEach(card=>{
        const rear=card.dataset.modelId!==frontId;card.dataset.stackRear=String(rear&&!spread);
        card.inert=rear&&!spread;card.setAttribute('aria-hidden',String(rear&&!spread));card.tabIndex=rear&&!spread?-1:0;
      });announce();
    }
    function targets(){
      const front=order.indexOf(frontId),q=clamp(expansion.value,0,1),v=clamp(vertical.value,0,1);
      const center=Math.max(0,(rect().width-width)/2);
      order.forEach((id,position)=>{
        const card=cards.find(c=>c.dataset.modelId===id),state=motion.get(card);
        const depth=Math.min(3,(position-front+order.length)%order.length);
        state.x.target=center*(1-q)+position*(width+18)*q*(1-v)+center*q*v;
        state.y.target=10+depth*22*(1-q)+position*(height+16)*q*v;
        state.depth.target=depth*(1-q);state.rotation.target=(grab?.dx<0?-1:1)*depth*1.5*(1-q);
        card.style.width=`${width}px`;
      });
    }
    function paintCard(card){
      const state=motion.get(card),held=grab?.dragged&&grab.card===card,depth=clamp(state.depth.value,0,3);
      const x=held?grab.visualX+grab.dx:state.x.value,y=held?grab.visualY+grab.dy:state.y.value;
      const angle=held?clamp(grab.dx/35,-7,7):state.rotation.value;
      const hidden=!held&&expansion.value<.02&&state.depth.target>2&&depth>=2.98;
      card.style.transform=`translate3d(${x}px,${y}px,0) rotate(${angle}deg)`;
      card.style.filter=held||depth<.001?'none':`blur(${depth*.8}px)`;card.style.opacity=String(held?1:Math.max(.62,1-depth*.12));
      card.style.zIndex=held?'100':String(Math.round((4-depth)*10));
      card.style.setProperty('--character-content',String(held?1:Math.max(0,1-depth*1.6)));card.dataset.stackOff=String(hidden);
      return{id:card.dataset.modelId,x,y,w:width,h:height,r:angle,opacity:hidden?0:1};
    }
    function paint(time){
      frame=0;if(!active()||document.hidden)return;
      const dt=(time-previous)/1000||1/60;previous=time;
      let moving=expansion.step(dt,reduced.matches)|vertical.step(dt,reduced.matches);targets();
      const bounds=cards.map(card=>{for(const spring of Object.values(motion.get(card)))moving=spring.step(dt,reduced.matches)||moving;return paintCard(card);});
      const targetHeight=10+height+(layout==='vertical'?Math.max(0,cards.length-1)*(height+16):52);
      // Current rendered bounds keep controls outside the entire in-flight deck.
      gallery.style.height=`${Math.ceil(deckExtent(bounds,{targetHeight,gap:20,heldId:grab?.dragged?grab.card.dataset.modelId:null}))}px`;
      if(moving)frame=raf(paint);
    }
    function wake(){if(active()&&!document.hidden&&!frame){previous=now();frame=raf(paint);}if(!active()||document.hidden){caf(frame);frame=0;}}
    function setLayout(value){
      if(!active())return;if(grab)cancelCapture();
      const previousLayout=layout;
      if(layout==='horizontal'&&value!=='horizontal'){
        const offset=gallery.scrollLeft||0;
        for(const state of motion.values())state.x.value-=offset;
      }
      if(layout==='stack'&&value!=='stack'){const i=order.indexOf(frontId);order=[...order.slice(i),...order.slice(0,i)];}
      layout=value;gallery.dataset.stackLayout=value;expansion.target=value==='stack'?0:1;vertical.target=value==='vertical'?1:0;
      if(previousLayout!=='horizontal'||value!=='horizontal')gallery.scrollLeft=0;
      access();wake();
    }
    function browse(delta){
      if(!active()||!cards.length)return;frontId=neighborId(order,frontId,delta);
      if(layout==='horizontal')gallery.scrollLeft=order.indexOf(frontId)*(width+18);
      if(layout==='vertical')frontCard()?.scrollIntoView?.({block:'nearest',behavior:reduced.matches?'auto':'smooth'});
      access();wake();
    }
    prev.addEventListener('click',()=>browse(-1));next.addEventListener('click',()=>browse(1));
    gallery.addEventListener('keydown',event=>{
      if(!active()||event.target.closest('input,select,textarea')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Escape'].includes(event.key))return;
      event.preventDefault();if(event.key==='Escape'){
        const focused=event.target.closest?.('[data-model-id]');if(focused)frontId=focused.dataset.modelId;
        setLayout('stack');frontCard()?.focus({preventScroll:true});return;
      }
      if(event.key==='Home'||event.key==='End'){frontId=order[event.key==='Home'?0:order.length-1]||'';access();wake();}
      else browse(['ArrowRight','ArrowDown'].includes(event.key)?1:-1);frontCard()?.focus({preventScroll:true});
    });
    gallery.addEventListener('pointerdown',event=>{
      if(!active()||event.button!==0||cards.length<2||grab)return;
      const card=event.target.closest?.('[data-model-id]')||frontCard();if(!card||card.inert)return;
      frontId=card.dataset.modelId;suppressClick=false;access();const state=motion.get(card);
      grab={id:event.pointerId,card,x:event.clientX,y:event.clientY,dx:0,dy:0,visualX:state.x.value,visualY:state.y.value,
        threshold:expansionThreshold(width,height,{ratio:.72,min:96,max:160}),startLayout:layout,
        axis:layout==='vertical'?'vertical':'horizontal',dragged:false,expanded:false};
    });
    gallery.addEventListener('pointermove',event=>{
      if(!grab||grab.id!==event.pointerId)return;grab.dx=event.clientX-grab.x;grab.dy=event.clientY-grab.y;
      if(!grab.dragged&&grab.startLayout==='stack'&&grab.dy>10&&grab.dy>Math.abs(grab.dx)){grab=null;return;}
      if(!grab.dragged&&Math.hypot(grab.dx,grab.dy)>8){grab.dragged=true;gallery.setPointerCapture(event.pointerId);gallery.dataset.dragging='true';grab.card.dataset.stackHeld='true';}
      if(!grab.dragged)return;event.preventDefault?.();
      const candidate=dragAxis(grab.dx,grab.dy,grab.axis);
      if(candidate!=='vertical'||grab.dy<0||grab.startLayout!=='stack')grab.axis=candidate;
      const pull=grab.axis==='vertical'?Math.max(0,-grab.dy):Math.abs(grab.dx);
      if(pull>=grab.threshold){
        if(layout==='stack'){const i=order.indexOf(frontId);order=[...order.slice(i),...order.slice(0,i)];}
        layout=grab.axis;grab.expanded=true;
      }else if(grab.expanded&&pull<grab.threshold*.44){layout='stack';grab.expanded=false;}
      expansion.target=grab.expanded?1:grab.startLayout!=='stack'&&pull>grab.threshold*.44?1:clamp((pull-16)/(grab.threshold-16),0,.95);
      vertical.target=grab.axis==='vertical'?1:0;gallery.dataset.stackLayout=layout;access();
      // Held position follows this event immediately; neighbouring cards follow springs.
      paintCard(grab.card);wake();
    });
    function release(event,cancelled=false){
      if(!grab||grab.id!==event.pointerId)return;const held=grab,state=motion.get(held.card);
      // Dropping on another spread card stacks around that identity. The gesture
      // that first opens a deck cannot accidentally hit its original neighbours.
      const destination=!cancelled&&held.dragged&&held.startLayout!=='stack'?cards.find(card=>{
        if(card===held.card)return false;const box=card.getBoundingClientRect?.();
        return box&&event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom;
      }):null;
      if(held.dragged){state.x.value=held.visualX+held.dx;state.y.value=held.visualY+held.dy;state.x.velocity=state.y.velocity=0;}
      cancelCapture();suppressClick=held.dragged&&!cancelled;
      if(!held.dragged)return;
      if(cancelled){setLayout(held.startLayout);return;}
      if(destination){frontId=destination.dataset.modelId;setLayout('stack');return;}
      if(held.expanded)setLayout(layout);
      else if(held.startLayout!=='stack')setLayout('stack');
      else{setLayout('stack');if(held.dragged&&Math.abs(held.dx)>42&&Math.abs(held.dx)>Math.abs(held.dy))browse(held.dx<0?1:-1);}
    }
    gallery.addEventListener('pointerup',event=>release(event));gallery.addEventListener('pointercancel',event=>release(event,true));
    gallery.addEventListener('lostpointercapture',event=>release(event,true));
    gallery.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
    gallery.addEventListener('scroll',()=>{
      if(layout!=='horizontal'||grab||Math.abs(expansion.value-1)>.001)return;
      frontId=order[clamp(Math.round(gallery.scrollLeft/(width+18)),0,order.length-1)]||frontId;announce();
    },{passive:true});
    document.addEventListener('scroll',()=>{
      if(layout!=='vertical'||grab||Math.abs(expansion.value-1)>.001)return;
      const viewport=document.documentElement?.clientHeight||globalThis.innerHeight||600,reference=Math.max(132,viewport*.35);
      let closest=null,distance=Infinity;
      for(const card of cards){const box=card.getBoundingClientRect?.();if(!box||box.bottom<=112||box.top>=viewport)continue;
        const delta=Math.abs(box.top+box.height/2-reference);if(delta<distance){distance=delta;closest=card;}}
      if(closest){frontId=closest.dataset.modelId;announce();}
    },{passive:true});
    if(Resize)new Resize(()=>{
      // Height is driven by the spring: reacting to our own height would cancel every drag.
      if(Math.abs(rect().width-galleryWidth)<.5)return;
      if(grab)release({pointerId:grab.id},true);measure();wake();
    }).observe(gallery);
    return{
      refresh(){
        const nextCards=[...gallery.querySelectorAll('[data-model-id]')];
        if(nextCards.length!==cards.length||nextCards.some((card,i)=>card!==cards[i])){
          const sameIds=nextCards.length===cards.length&&nextCards.every((card,i)=>card.dataset.modelId===cards[i].dataset.modelId);
          const savedLayout=layout,savedOrder=[...order],savedExpansion=expansion.value,savedVertical=vertical.value;
          const savedMotion=new Map(cards.map(card=>[card.dataset.modelId,motion.get(card)]));
          restore();cards=nextCards;order=cards.map(card=>card.dataset.modelId);snapshots=new Map();motion=new Map();
          if(sameIds){order=savedOrder;layout=savedLayout;expansion.value=expansion.target=layout==='stack'?0:savedExpansion;vertical.value=savedVertical;vertical.target=layout==='vertical'?1:0;}
          if(!order.includes(frontId))frontId=(cards.find(card=>card.getAttribute('aria-selected')==='true')||cards[0])?.dataset.modelId||'';
          measure();cards.forEach((card,i)=>{
            snapshots.set(card,{inert:card.inert,hidden:card.getAttribute('aria-hidden'),tab:card.getAttribute('tabindex')});
            const depth=Math.min(3,(i-order.indexOf(frontId)+cards.length)%cards.length);
            motion.set(card,sameIds?savedMotion.get(card.dataset.modelId):{x:new Spring((rect().width-width)/2),y:new Spring(10+depth*22),depth:new Spring(depth),rotation:new Spring(0)});
          });
        }
        nav.hidden=!active()||!cards.length;
        prev.setAttribute('aria-label',text('上一个角色','Previous voice'));next.setAttribute('aria-label',text('下一个角色','Next voice'));
        layouts.setAttribute('aria-label',text('卡片展开方向','Card arrangement'));
        layoutButtons.forEach((button,i)=>button.textContent=[text('收拢','Stack'),text('横向摊开','Horizontal'),text('纵向摊开','Vertical')][i]);
        hint.textContent=text('轻滑翻阅 · 上拉或横拉摊开 · 回拉收拢','Swipe to browse · Pull up or sideways to spread · Pull back to stack');
        if(active()){if(!gallery.classList.contains?.('is-character-stack'))measure();gallery.dataset.stackLayout=layout;access();wake();}else restore();
      },wake,visibility(){if(document.hidden&&grab)release({pointerId:grab.id},true);wake();}
    };
  });
  function refresh(){
    switcher.hidden=!isClassic();label.textContent=text('角色呈现','Voice view');toggle.setAttribute('aria-label',text('角色选择模式','Voice selection view'));toggle.dataset.active=mode;
    modes.forEach((button,i)=>{button.textContent=i===0?text('默认','Default'):text('组件堆叠','Stack');button.setAttribute('aria-pressed',String(button.dataset.view===mode));});
    controllers.forEach(controller=>controller.refresh());
  }
  galleries.forEach(gallery=>new Observer(refresh).observe(gallery,{childList:true,subtree:true}));
  document.addEventListener('visibilitychange',()=>controllers.forEach(controller=>controller.visibility()));
  reduced.addEventListener?.('change',refresh);refresh();return refresh;
}
