import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../fighters.js", import.meta.url), "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(source, context, { filename: "fighters.js" });

const roster = context.BEASTRYX_FIGHTERS;
assert.equal(roster.length, 8, "founding sheep roster should contain eight champions");
assert.equal(context.BEASTRYX_VALIDATE_FIGHTERS(roster), true, "roster schema should validate");
assert.equal(new Set(roster.map(f => f.id)).size, roster.length, "fighter IDs must be unique");
assert.ok(roster.every(f => f.species === "Sheep" && f.faction === "Flock"));
assert.ok(roster.every(f => JSON.stringify(f.stats) === JSON.stringify(roster[0].stats)),
  "founding fighters must start with equal baseline stats");
console.log("BEASTRYX fighter registry checks passed (" + roster.length + " equal-baseline sheep champions).");
