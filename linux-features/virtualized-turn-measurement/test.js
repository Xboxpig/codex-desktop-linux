"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { patchSource, patchExtractedApp } = require("./patch.js");

const callback = 'em=()=>{let e=t_.current;if(0===e.size){tz.current=0;return}if(null!=tW.current)return;if(tz.current>=8){tW.current=requestAnimationFrame(e=>{tW.current=null,tz.current=0,tQ(e)});return}tz.current=tz.current+1,t_.current=new Map;let t=new Map;if((0,c.S)("virtualizedTurnList.readMountedHeights",()=>{for(let[n,r]of e){if(tj.current.get(n)!==r)continue;let e=(0,u.Ud)(r.getBoundingClientRect().height,tP);e>0&&t.set(n,{element:r,heightPx:e})}},e.size),t.size>0){let n=tT.current;if(nC(t,!1,"controller"))for(let[t,r]of e)(null==n[t]||tz.current>1)&&tj.current.get(t)===r&&t_.current.set(t,r);else tz.current=0}}';
const source = `let em;${callback};(0,a.useLayoutEffect)(em)`;

test("changes only the synchronous pass limit and remains idempotent", () => {
  const patched = patchSource(source);
  assert.equal(patched, source.replace("tz.current>=8", "tz.current>=2"));
  assert.equal(patchSource(patched), patched);
  assert.doesNotThrow(() => new vm.Script(patched));
});

test("matches the current contract when minified identifiers change", () => {
  const renamed = source.replace(/\b(em|tz|tW|t_|tj|tT|tP|tQ|nC)\b/gu, (name) => ({
    em: "callback", tz: "counter", tW: "frame", t_: "pending", tj: "registry",
    tT: "previous", tP: "scale", tQ: "update", nC: "commit",
  })[name]);
  assert.equal(patchSource(renamed), renamed.replace("counter.current>=8", "counter.current>=2"));
});

test("rejects missing, ambiguous and drifted contracts", () => {
  for (const candidate of ["", source + source, source.replace(">=8", ">=7"), source.replace("getBoundingClientRect().height", "offsetHeight")]) {
    assert.throws(() => patchSource(candidate), /Expected one/);
  }
});

test("rejects a neighboring limit when the measurement limit drifts", () => {
  const drifted = source.replace(
    "if(tz.current>=8){",
    "if(foo.current>=8){bar.current=requestAnimationFrame(x=>{bar.current=null,foo.current=0,baz(x)});return}if(tz.current>=7){",
  );
  assert.throws(() => patchSource(drifted), /Expected one/);
});

test("requires the measured callback, counter, queue, and layout effect to match", () => {
  for (const candidate of [
    source.replace("tz.current=tz.current+1", "other.current=other.current+1"),
    source.replace("t_.current=new Map", "other.current=new Map"),
    source.replace("t_.current.set(t,r)", "other.current.set(t,r)"),
    source.replace("tj.current.get(t)===r", "other.current.get(t)===r"),
    source.replace("(0,a.useLayoutEffect)(em)", "(0,a.useLayoutEffect)(other)"),
  ]) {
    assert.throws(() => patchSource(candidate), /Expected one/);
  }
});

test("preserves pending measurements and resumes after the frame", () => {
  const element = { getBoundingClientRect: () => ({ height: 25 }) };
  const pending = new Map([["turn", element]]);
  const frames = [];
  const updates = [];
  const batches = [];
  const context = {
    t_: { current: pending }, tz: { current: 0 }, tW: { current: null },
    tj: { current: new Map(pending) }, tT: { current: {} }, tP: 1,
    c: { S: (name, measure) => measure() }, u: { Ud: (height) => height },
    nC: (batch) => { batches.push(batch); return true; },
    tQ: (timestamp) => updates.push(timestamp),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
  };
  vm.createContext(context);
  vm.runInContext(patchSource(source).replace("(0,a.useLayoutEffect)(em)", "void 0"), context);
  vm.runInContext("em();em();em();em()", context);
  assert.equal(batches.length, 2);
  assert.equal(frames.length, 1);
  assert.equal(context.t_.current.get("turn"), element);
  frames[0](123);
  assert.deepEqual(updates, [123]);
  assert.equal(context.tW.current, null);
  assert.equal(context.tz.current, 0);
  vm.runInContext("em()", context);
  assert.equal(batches.length, 3);
});

test("patches exactly one extracted async asset and rejects duplicate assets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "turn-measurement-test-"));
  try {
    const assets = path.join(root, "webview", "assets", "async");
    fs.mkdirSync(assets, { recursive: true });
    fs.writeFileSync(path.join(assets, "bundle.js"), source);
    assert.equal(patchExtractedApp(root).changed, true);
    assert.equal(patchExtractedApp(root).changed, false);
    fs.writeFileSync(path.join(assets, "other.js"), source);
    assert.throws(() => patchExtractedApp(root), /found 2/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
