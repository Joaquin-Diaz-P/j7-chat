import { expect, it } from 'vitest';
import { capturesPoint } from '../../src/shared/hit-test.js';
it('captures the final card and popovers while passing transparent canvas through', () => {
 const regions=[{left:284,top:598,right:804,bottom:704},{left:300,top:500,right:460,bottom:590}];
 expect(capturesPoint(400,650,regions)).toBe(true);
 expect(capturesPoint(320,520,regions)).toBe(true);
 for(const [x,y] of [[10,10],[200,650],[805,650],[400,704]]) expect(capturesPoint(x!,y!,regions)).toBe(false);
 expect(capturesPoint(284,598,regions)).toBe(true);
});

import { capturesScreenPoint } from '../../src/shared/hit-test.js';
it('recomputes capture for a stationary screen cursor after showing or moving the card', () => {
 const cursor={x:450,y:300}, origin={x:200,y:100};
 expect(capturesScreenPoint(cursor,origin,[{left:200,top:150,right:400,bottom:300}])).toBe(true);
 expect(capturesScreenPoint(cursor,origin,[{left:260,top:150,right:400,bottom:300}])).toBe(false);
 expect(capturesScreenPoint(cursor,origin,[{left:240,top:190,right:260,bottom:210}])).toBe(true);
});
