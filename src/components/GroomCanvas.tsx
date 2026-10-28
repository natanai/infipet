import React, { useRef, useState } from "react";
import { PanResponder, View, type GestureResponderEvent } from "react-native";
import Svg, { Line } from "react-native-svg";
import { PetPixels } from "./PetPixels";
import type { Pixel, Point } from "../simulation";

/** Source-space stroke coordinates remain fixed even when Safari bars resize
 * the presentation during a gesture. Grooming has no instantaneous growth.
 */
export function GroomCanvas({
  pixels, size, onStart, onStroke,
}: {
  pixels: Pixel[];
  size: number;
  onStart: () => void;
  onStroke: (from: Point, to: Point) => void;
}) {
  const latest = useRef({ size, onStart, onStroke });
  latest.current = { size, onStart, onStroke };
  const basis = useRef<{size:number; originX:number; originY:number}|null>(null);
  const start = useRef<Point | null>(null);
  const [trail, setTrail] = useState<{from:Point;to:Point}|null>(null);
  const point = (e: GestureResponderEvent): Point => {
    const b = basis.current!;
    return {
      x: Math.max(0,Math.min(64,((e.nativeEvent.pageX-b.originX)/b.size)*64)),
      y: Math.max(0,Math.min(64,((e.nativeEvent.pageY-b.originY)/b.size)*64)),
    };
  };
  const stop = () => { basis.current=null; start.current=null; setTrail(null); };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>true,
    onMoveShouldSetPanResponder:()=>true,
    onPanResponderGrant:(e)=>{
      latest.current.onStart();
      basis.current={
        size:latest.current.size,
        originX:e.nativeEvent.pageX-e.nativeEvent.locationX,
        originY:e.nativeEvent.pageY-e.nativeEvent.locationY,
      };
      const p=point(e);start.current=p;setTrail({from:p,to:p});
    },
    onPanResponderMove:(e)=>{
      if(start.current&&basis.current)setTrail({from:start.current,to:point(e)});
    },
    onPanResponderRelease:(e)=>{
      if(start.current&&basis.current)latest.current.onStroke(start.current,point(e));
      stop();
    },
    onPanResponderTerminate:stop,
    onPanResponderTerminationRequest:()=>false,
  })).current;
  return <View {...responder.panHandlers}
    accessibilityLabel="Groom your pet by stroking a body part"
    style={{ width:size,height:size,alignSelf:"center",backgroundColor:"#050505",...({touchAction:"none"} as any) }}>
    <PetPixels pixels={pixels} size={size} gridSize={64}/>
    {trail && <View pointerEvents="none" style={{position:"absolute",top:0,right:0,bottom:0,left:0}}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Line x1={trail.from.x} y1={trail.from.y} x2={trail.to.x} y2={trail.to.y}
          stroke="#AAAAAA" strokeWidth={0.5}/>
      </Svg>
    </View>}
  </View>;
}
