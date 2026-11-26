import { useEffect } from 'react';
// Separate overlay rails leave the scrollport's full width available, even when
// macOS is configured to always show scrollbars. Native scrolling stays intact.
export function useOverlayScrollbars() {
  useEffect(() => {
    const rails = new Map<HTMLElement,HTMLDivElement>();
    let frame=0;
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    const resize=new ResizeObserver(schedule);
    const update=()=>{
      frame=0;
      for(const [port,rail] of rails) if(!port.isConnected){resize.unobserve(port);rail.remove();rails.delete(port);}
      for(const port of document.querySelectorAll<HTMLElement>('.history-list,.conversation,.model-list,.code-block pre,.markdown table,.katex-display')) {
        if(!rails.has(port)) {
          const rail=document.createElement('div');rail.className='overlay-scroll-rail';
          const thumb=document.createElement('div');thumb.className='overlay-scroll-thumb';rail.append(thumb);document.body.append(rail);rails.set(port,rail);resize.observe(port);
          thumb.onpointerdown=event=>{
            event.preventDefault();event.stopPropagation();thumb.setPointerCapture(event.pointerId);
            const horizontal=rail.dataset.axis==='x', start=horizontal?event.clientX:event.clientY, initial=horizontal?port.scrollLeft:port.scrollTop;
            const viewport=horizontal?port.clientWidth:port.clientHeight, total=horizontal?port.scrollWidth:port.scrollHeight;
            const travel=viewport-Math.max(24,viewport*viewport/total);
            thumb.onpointermove=e=>{const delta=(horizontal?e.clientX:e.clientY)-start;port.scrollTo(horizontal?{left:initial+delta*(total-viewport)/travel}:{top:initial+delta*(total-viewport)/travel});};
            const end=()=>{thumb.onpointermove=null;thumb.onpointerup=null;thumb.onpointercancel=null;};thumb.onpointerup=end;thumb.onpointercancel=end;
          };
        }
        const rail=rails.get(port)!, rect=port.getBoundingClientRect();
        const horizontal=port.scrollHeight<=port.clientHeight && port.scrollWidth>port.clientWidth;
        const viewport=horizontal?port.clientWidth:port.clientHeight, total=horizontal?port.scrollWidth:port.scrollHeight;
        rail.hidden=total<=viewport || viewport<=0 || !!port.closest('.compact,.history-reveal[inert]');
        if(rail.hidden)continue;
        rail.dataset.axis=horizontal?'x':'y';
        Object.assign(rail.style,{left:`${horizontal?rect.left:rect.right-10}px`,top:`${horizontal?rect.bottom-10:rect.top}px`,width:`${horizontal?viewport:10}px`,height:`${horizontal?10:viewport}px`});
        const size=Math.max(24,viewport*viewport/total), position=(horizontal?port.scrollLeft:port.scrollTop)/(total-viewport)*(viewport-size);
        Object.assign((rail.firstElementChild as HTMLElement).style,{width:horizontal?`${size}px`:'',height:horizontal?'':`${size}px`,transform:`translate${horizontal?'X':'Y'}(${position}px)`});
      }
    };
    const mutations=new MutationObserver(schedule);mutations.observe(document.getElementById('root')!,{subtree:true,childList:true});
    document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);document.addEventListener('transitionend',schedule);schedule();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();mutations.disconnect();document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);document.removeEventListener('transitionend',schedule);for(const rail of rails.values())rail.remove();};
  },[]);
}
