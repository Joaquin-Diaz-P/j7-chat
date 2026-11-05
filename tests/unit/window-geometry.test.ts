import { expect, it } from 'vitest';
import { defaultAnchor, panelBounds } from '../../src/main/window-geometry.js';
const area = {x:0,y:0,width:1440,height:1000};
it('keeps bottom and center when expanding and returning to compact', () => {
 const anchor=defaultAnchor(area);
 const small=panelBounds(area,anchor,124), large=panelBounds(area,anchor,680);
 expect(small).toEqual({x:460,y:596,width:520,height:124});
 expect(large).toEqual({x:460,y:40,width:520,height:680});
 expect(small.y+small.height).toBe(large.y+large.height);
 expect(panelBounds(area,anchor,124)).toEqual(small);
});
it('clamps at top and on small work areas',()=>{
 expect(panelBounds(area,{x:720,y:400},680).y).toBe(0);
 expect(panelBounds({x:0,y:0,width:400,height:500},{x:20,y:100},680)).toEqual({x:0,y:0,width:400,height:500});
});
it('restores remembered bottom/center and supports another display',()=>{
 expect(panelBounds(area,{x:900,y:900},680)).toEqual({x:640,y:220,width:520,height:680});
 const other={x:-1920,y:200,width:1920,height:1080};
 expect(defaultAnchor(other)).toEqual({x:-960,y:978});
 expect(panelBounds(other,defaultAnchor(other),680)).toEqual({x:-1220,y:298,width:520,height:680});
});
