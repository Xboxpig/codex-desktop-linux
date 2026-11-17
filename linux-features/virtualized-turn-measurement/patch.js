"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { extractedAppPatch } = require("../../scripts/patches/descriptor.js");
const { escapeRegExp, findMatchingBrace } = require("../../scripts/patches/lib/minified-js.js");

const MARKER = "virtualizedTurnList.readMountedHeights";
const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const CONTRACT = new RegExp([
  String.raw`(?<callback>${IDENTIFIER})=\(\)=>\{let (?<queue>${IDENTIFIER})=(?<queueRef>${IDENTIFIER})\.current;`,
  String.raw`if\(0===\k<queue>\.size\)\{(?<counter>${IDENTIFIER})\.current=0;return\}`,
  String.raw`if\(null!=(?<frame>${IDENTIFIER})\.current\)return;`,
  String.raw`if\(\k<counter>\.current>=(?<limit>8|2)\)\{\k<frame>\.current=requestAnimationFrame\(`,
  String.raw`(?<timestamp>${IDENTIFIER})=>\{\k<frame>\.current=null,\k<counter>\.current=0,`,
  String.raw`(?<update>${IDENTIFIER})\(\k<timestamp>\)\}\);return\}`,
  String.raw`\k<counter>\.current=\k<counter>\.current\+1,\k<queueRef>\.current=new Map;`,
  String.raw`let (?<heights>${IDENTIFIER})=new Map;if\(\(0,${IDENTIFIER}\.S\)\(`,
  String.raw`"virtualizedTurnList\.readMountedHeights",\(\)=>\{for\(let\[`,
  String.raw`(?<key>${IDENTIFIER}),(?<element>${IDENTIFIER})\]of \k<queue>\)\{`,
  String.raw`if\((?<registry>${IDENTIFIER})\.current\.get\(\k<key>\)!==\k<element>\)continue;`,
  String.raw`let (?<height>${IDENTIFIER})=\(0,${IDENTIFIER}\.Ud\)\(`,
  String.raw`\k<element>\.getBoundingClientRect\(\)\.height,${IDENTIFIER}\);`,
  String.raw`\k<height>>0&&\k<heights>\.set\(\k<key>,\{element:\k<element>,heightPx:\k<height>\}\)`,
  String.raw`\}\},\k<queue>\.size\),\k<heights>\.size>0\)\{let (?<old>${IDENTIFIER})=${IDENTIFIER}\.current;`,
  String.raw`if\(${IDENTIFIER}\(\k<heights>,!1,"controller"\)\)for\(let\[`,
  String.raw`(?<pendingKey>${IDENTIFIER}),(?<pendingElement>${IDENTIFIER})\]of \k<queue>\)`,
  String.raw`\(null==\k<old>\[\k<pendingKey>\]\|\|\k<counter>\.current>1\)&&`,
  String.raw`\k<registry>\.current\.get\(\k<pendingKey>\)===\k<pendingElement>&&`,
  String.raw`\k<queueRef>\.current\.set\(\k<pendingKey>,\k<pendingElement>\);else \k<counter>\.current=0\}`,
].join(""), "gu");

function findContracts(source) {
  const matches = [];
  for (const match of source.matchAll(CONTRACT)) {
    const open = match.index + match[0].indexOf("=>{") + 2;
    const close = findMatchingBrace(source, open);
    if (close < match.index + match[0].length) continue;
    const effect = new RegExp(`\\.useLayoutEffect\\)\\(${escapeRegExp(match.groups.callback)}\\)`, "u");
    if (!effect.test(source.slice(close + 1, close + 400))) continue;
    const threshold = `${match.groups.counter}.current>=${match.groups.limit}`;
    const limitStart = match.index + match[0].indexOf(threshold) + threshold.length - 1;
    matches.push({ limit: match.groups.limit, limitStart });
  }
  return matches;
}

function patchSource(source) {
  const matches = findContracts(source);
  if (matches.length !== 1) throw new Error(`Expected one ${MARKER} contract, found ${matches.length}`);
  const match = matches[0];
  if (match.limit === "2") return source;
  return source.slice(0, match.limitStart) + "2" + source.slice(match.limitStart + 1);
}

function patchExtractedApp(extractedDir) {
  const assetsDir = path.join(extractedDir, "webview", "assets", "async");
  const matches = [];
  for (const name of fs.readdirSync(assetsDir).filter((entry) => entry.endsWith(".js")).sort()) {
    const filePath = path.join(assetsDir, name);
    const source = fs.readFileSync(filePath, "utf8");
    if (source.includes(MARKER)) matches.push({ filePath, source });
  }
  if (matches.length !== 1) throw new Error(`Expected one ${MARKER} asset, found ${matches.length}`);
  const { filePath, source } = matches[0];
  const result = patchSource(source);
  if (result !== source) fs.writeFileSync(filePath, result, "utf8");
  return { changed: result !== source };
}

module.exports = [extractedAppPatch({
  id: "virtualized-turn-measurement-limit",
  phase: "extracted-app:pre-webview",
  order: 20_000,
  ciPolicy: "opt-in",
  apply: patchExtractedApp,
})];
module.exports.findContracts = findContracts;
module.exports.patchSource = patchSource;
module.exports.patchExtractedApp = patchExtractedApp;
