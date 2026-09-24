import {describe,expect,it} from "vitest";
import {DIMENSION_WORKFLOWS,FRAMEWORK_DIMENSIONS} from "../types";

describe("Vision Activ framework",()=>{
 it("contains exactly the 12 authoritative dimensions",()=>{
  expect(DIMENSION_WORKFLOWS).toHaveLength(12);
  expect(FRAMEWORK_DIMENSIONS).toHaveLength(12);
  expect(new Set(DIMENSION_WORKFLOWS.map(d=>d.id)).size).toBe(12);
 });
 it("assigns equal total weighting",()=>{
  expect(FRAMEWORK_DIMENSIONS.reduce((sum,d)=>sum+d.weight,0)).toBeCloseTo(1,10);
 });
 it("defines complete workflow prompts and metrics",()=>{
  for(const d of DIMENSION_WORKFLOWS){
   expect(d.weeklyPrompt.trim().length).toBeGreaterThan(0);
   expect(d.piccPrompt.trim().length).toBeGreaterThan(0);
   expect(d.scorecardMetrics.length).toBeGreaterThan(0);
   expect(d.reviewFocus.trim().length).toBeGreaterThan(0);
   expect(d.consolidationFocus.trim().length).toBeGreaterThan(0);
   expect(d.trendFocus.trim().length).toBeGreaterThan(0);
  }
 });
});
