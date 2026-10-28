import assert from "node:assert/strict";
import test from "node:test";
import { playerGeometry } from "../src/interface/player-geometry";

test("shell width is independent of constrained canvas height", () => {
  for(const width of [320,360,375,390,393,414,430]){
    const short=playerGeometry(width,640,0,"draw");
    const tall=playerGeometry(width,844,0,"draw");
    assert.equal(short.deviceWidth,width-24);
    assert.equal(tall.deviceWidth,short.deviceWidth);
    assert.ok(short.canvasSide<=short.deviceWidth-24);
    assert.ok(tall.canvasSide>=short.canvasSide);
    assert.ok(width-24>=5*44+4*4,"five 44px part selectors fit with gaps");
  }
  const short=playerGeometry(390,640,0,"draw");
  assert.equal(short.deviceWidth,366);
  assert.equal(short.canvasSide,220);
});
test("development dock only subtracts its own width",()=>{
  const before=playerGeometry(1400,900,0,"live");
  const withDock=playerGeometry(1400,900,400,"live");
  assert.equal(before.deviceWidth,560);
  assert.equal(withDock.deviceWidth,560);
  assert.ok(withDock.canvasSide<=withDock.deviceWidth-24);
});
test("monotonic height, bounded coordinates, and no NaN for finite nonnegative viewports",()=>{
 for(let width=244;width<=1000;width+=13){
   let previous=0;
   for(let height=280;height<=1000;height+=37){
     const {deviceWidth,canvasSide}=playerGeometry(width,height,0,"draw");
     assert.equal(deviceWidth,Math.min(480,width-24));
     assert.ok(canvasSide>=previous && canvasSide<=deviceWidth-24);
     previous=canvasSide;
   }
 }
});
