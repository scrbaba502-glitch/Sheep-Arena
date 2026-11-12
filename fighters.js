(function (root) {
  "use strict";

  // BEASTRYX founding roster. This is descriptive roster data only:
  // combat stats remain equal until fighter selection and ability systems are implemented.
  const baseline = Object.freeze({ health: 100, power: 100, defense: 100, speed: 100 });
  const sheep = [
    { id: "flock-baa-rbarian", name: "Baa-rbarian", role: "Bruiser", passive: "iron-wool", signature: "ram-charge", ultimate: "volcanic-chokeslam" },
    { id: "flock-wool-vader", name: "Wool Vader", role: "Controller", passive: "calm-presence", signature: "woolen-grip", ultimate: "dark-fleece" },
    { id: "flock-ram-bo", name: "Ram-bo", role: "Striker", passive: "battle-instinct", signature: "rapid-barrage", ultimate: "alpha-stampede" },
    { id: "flock-lord-fleece", name: "Lord Fleece", role: "Guardian", passive: "royal-resolve", signature: "regal-guard", ultimate: "crown-breaker" },
    { id: "flock-baa-tman", name: "Baa-tman", role: "Tactician", passive: "night-watch", signature: "shadow-feint", ultimate: "midnight-impact" },
    { id: "flock-sir-woolot", name: "Sir Wool-ot", role: "Defender", passive: "knightly-oath", signature: "wool-shield", ultimate: "honour-bound-slam" },
    { id: "flock-captain-mutton", name: "Captain Mutton", role: "Ranger", passive: "steady-aim", signature: "precision-shot", ultimate: "meteor-volley" },
    { id: "flock-count-ewe-la", name: "Count Ewe-la", role: "Disruptor", passive: "moonlit-focus", signature: "frost-bite", ultimate: "eclipse-crash" }
  ];

  const humans = [
    { id: "human-commander-aurex", name: "Commander Aurex", role: "Tactician", passive: "battlefield-read", signature: "solar-volley", ultimate: "legion-overdrive", visual: { renderer: "human", archetype: "commander", primary: "#b98a35", secondary: "#27344f", accent: "#f4d27a" } },
    { id: "human-atrox-nefas", name: "Atrox Nefas", role: "Shadow Magister", passive: "umbra-siphon", signature: "shadow-bind", ultimate: "eclipse-cataclysm", visual: { renderer: "human", archetype: "shadow-mage", primary: "#261b49", secondary: "#090b19", accent: "#a88aff" } },
    { id: "human-kaida-voss", name: "Kaida Voss", role: "Duelist", passive: "flow-state", signature: "crimson-crosscut", ultimate: "dragonstep-flurry", visual: { renderer: "human", archetype: "duelist", primary: "#9d273b", secondary: "#241a25", accent: "#ffb1a2" } },
    { id: "human-varek-stone", name: "Varek Stone", role: "Vanguard", passive: "unyielding", signature: "titan-guard", ultimate: "ironfall", visual: { renderer: "human", archetype: "vanguard", primary: "#53616a", secondary: "#20272d", accent: "#e2b66b" } },
    { id: "human-elara-quill", name: "Dr. Elara Quill", role: "Battlefield Inventor", passive: "adaptive-blueprint", signature: "arc-pulse", ultimate: "singularity-engine", visual: { renderer: "human", archetype: "inventor", primary: "#247b83", secondary: "#142c39", accent: "#8ff4e8" } },
    { id: "human-orion-kade", name: "Orion Kade", role: "Sky Ace", passive: "wind-reader", signature: "aerial-break", ultimate: "starfall-dive", visual: { renderer: "human", archetype: "sky-ace", primary: "#426ca8", secondary: "#17243e", accent: "#c6e7ff" } }
  ];

  const roster = sheep.map((fighter, index) => Object.freeze({
    ...fighter,
    faction: "Flock",
    species: "Sheep",
    tier: "Founding Champion",
    rosterOrder: index + 1,
    stats: baseline,
    visual: Object.freeze({ renderer: "sheep", cosmeticSlot: "hat" }),
    abilities: Object.freeze({
      passive: fighter.passive,
      signature: fighter.signature,
      ultimate: fighter.ultimate
    })
  }));

  const humanRoster = humans.map((fighter, index) => Object.freeze({
    ...fighter, faction: "Human Dynasty", species: "Human", tier: "Dynasty Champion",
    rosterOrder: sheep.length + index + 1, stats: baseline,
    visual: Object.freeze(fighter.visual),
    abilities: Object.freeze({ passive: fighter.passive, signature: fighter.signature, ultimate: fighter.ultimate })
  }));
  const completeRoster = Object.freeze([...roster, ...humanRoster]);

  function validateFighterRoster(items) {
    if (!Array.isArray(items) || items.length === 0) return false;
    const ids = new Set();
    return items.every((fighter) => {
      if (!fighter || typeof fighter.id !== "string" || ids.has(fighter.id)) return false;
      ids.add(fighter.id);
      return typeof fighter.name === "string" &&
        ((fighter.faction === "Flock" && fighter.species === "Sheep" && fighter.visual?.renderer === "sheep") ||
         (fighter.faction === "Human Dynasty" && fighter.species === "Human" && fighter.visual?.renderer === "human" && typeof fighter.visual.archetype === "string")) &&
        typeof fighter.role === "string" &&
        fighter.stats && ["health", "power", "defense", "speed"].every((key) =>
          Number.isFinite(fighter.stats[key]) && fighter.stats[key] > 0
        ) &&
        fighter.abilities &&
        ["passive", "signature", "ultimate"].every((key) => typeof fighter.abilities[key] === "string");
    });
  }

  root.BEASTRYX_FIGHTERS = completeRoster;
  root.BEASTRYX_VALIDATE_FIGHTERS = validateFighterRoster;
})(typeof window !== "undefined" ? window : globalThis);
