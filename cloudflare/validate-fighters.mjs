import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../fighters.js", import.meta.url), "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(source, context, { filename: "fighters.js" });

const roster = context.BEASTRYX_FIGHTERS;
assert.equal(roster.length, 14, "roster should contain eight sheep and six Human Dynasty champions");
assert.equal(context.BEASTRYX_VALIDATE_FIGHTERS(roster), true, "roster schema should validate");
assert.equal(new Set(roster.map(f => f.id)).size, roster.length, "fighter IDs must be unique");
const sheep = roster.filter(f => f.species === "Sheep" && f.faction === "Flock");
const humans = roster.filter(f => f.species === "Human" && f.faction === "Human Dynasty");
assert.equal(sheep.length, 8, "all eight founding sheep champions must remain");
assert.equal(humans.length, 6, "Human Dynasty should contain six champions");
assert.ok(humans.some(f => f.id === "human-atrox-nefas" && f.name === "Atrox Nefas" && f.role === "Shadow Magister"),
  "Atrox Nefas must be registered as the Shadow Magister");
assert.ok(humans.some(f => f.id === "human-elara-quill" && f.role === "Battlefield Inventor"),
  "Dr. Elara Quill must be registered as the Battlefield Inventor");
assert.ok(humans.some(f => f.id === "human-orion-kade" && f.role === "Sky Ace"),
  "Orion Kade must be registered as the Sky Ace");
assert.ok(humans.every(f => f.visual.renderer === "human" && f.visual.archetype),
  "human champions need a human presentation archetype");
assert.ok(roster.every(f => JSON.stringify(f.stats) === JSON.stringify(roster[0].stats)),
  "founding fighters must start with equal baseline stats");
console.log("BEASTRYX fighter registry checks passed (8 sheep + 6 Human Dynasty champions, equal baseline stats).");
