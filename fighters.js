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

  function validateFighterRoster(items) {
    if (!Array.isArray(items) || items.length === 0) return false;
    const ids = new Set();
    return items.every((fighter) => {
      if (!fighter || typeof fighter.id !== "string" || ids.has(fighter.id)) return false;
      ids.add(fighter.id);
      return typeof fighter.name === "string" &&
        fighter.faction === "Flock" &&
        fighter.species === "Sheep" &&
        typeof fighter.role === "string" &&
        fighter.stats && ["health", "power", "defense", "speed"].every((key) =>
          Number.isFinite(fighter.stats[key]) && fighter.stats[key] > 0
        ) &&
        fighter.abilities &&
        ["passive", "signature", "ultimate"].every((key) => typeof fighter.abilities[key] === "string");
    });
  }

  root.BEASTRYX_FIGHTERS = Object.freeze(roster);
  root.BEASTRYX_VALIDATE_FIGHTERS = validateFighterRoster;
})(typeof window !== "undefined" ? window : globalThis);
