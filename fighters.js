(function (root) {
  "use strict";

  // BEASTRYX founding roster. This is descriptive roster data only:
  // combat stats remain equal until fighter selection and ability systems are implemented.
  const baseline = Object.freeze({ health: 100, power: 100, defense: 100, speed: 100 });
  const sheep = [
    { id: "flock-baa-rbarian", name: "Baa-rbarian", role: "Bruiser", passive: "iron-wool", signature: "ram-charge", ultimate: "volcanic-chokeslam",
      abilityDetails: { passive: "Reduces damage from heavy hits.", signature: "Charges through the opponent and knocks them back.", ultimate: "Leaps into a ground smash that releases a fiery shockwave." } },
    { id: "flock-wool-vader", name: "Wool Vader", role: "Controller", passive: "calm-presence", signature: "woolen-grip", ultimate: "dark-fleece",
      abilityDetails: { passive: "Builds control energy when attacks are avoided.", signature: "Suspends and briefly immobilises the opponent.", ultimate: "Creates a void field that pulls enemies inward and disrupts them." } },
    { id: "flock-ram-bo", name: "Ram-bo", role: "Striker", passive: "battle-instinct", signature: "rapid-barrage", ultimate: "alpha-stampede",
      abilityDetails: { passive: "Builds momentum through consecutive attacks.", signature: "Unleashes a rapid multi-hit combo.", ultimate: "Charges forward with a squad of spectral ram afterimages." } },
    { id: "flock-lord-fleece", name: "Lord Fleece", role: "Guardian", passive: "royal-resolve", signature: "regal-guard", ultimate: "crown-breaker",
      abilityDetails: { passive: "Gains resilience when health is low.", signature: "Raises a royal barrier to absorb damage.", ultimate: "Summons a giant spectral crown that crashes down on the arena." } },
    { id: "flock-baa-tman", name: "Baa-tman", role: "Tactician", passive: "night-watch", signature: "shadow-feint", ultimate: "midnight-impact",
      abilityDetails: { passive: "Improves evasion after a successful dodge.", signature: "Vanishes briefly and strikes from another position.", ultimate: "Launches a chain of gadget-assisted strikes from the darkness." } },
    { id: "flock-sir-woolot", name: "Sir Wool-ot", role: "Defender", passive: "knightly-oath", signature: "wool-shield", ultimate: "honour-bound-slam",
      abilityDetails: { passive: "Builds guard energy while defending.", signature: "Blocks an attack and counters with a shield bash.", ultimate: "Creates a protective ward before a powerful counterattack." } },
    { id: "flock-captain-mutton", name: "Captain Mutton", role: "Ranger", passive: "steady-aim", signature: "precision-shot", ultimate: "meteor-volley",
      abilityDetails: { passive: "Improves ranged accuracy when maintaining distance.", signature: "Fires a focused energy projectile.", ultimate: "Calls down a barrage of explosive star-like projectiles." } },
    { id: "flock-count-ewe-la", name: "Count Ewe-la", role: "Disruptor", passive: "moonlit-focus", signature: "frost-bite", ultimate: "eclipse-crash",
      abilityDetails: { passive: "Builds lunar energy as the battle progresses.", signature: "Launches an icy curse that slows the opponent.", ultimate: "Darkens the arena and drops a devastating lunar energy blast." } }
  ];

  const humans = [
    { id: "human-commander-aurex", name: "Commander Aurex", role: "Tactician", element: "Fire", elementTitle: "The Ember Sovereign", passive: "ember-command", signature: "inferno-lance", ultimate: "phoenix-legion", visual: { renderer: "human", archetype: "commander", primary: "#9d321f", secondary: "#32151b", accent: "#ff9b42" } },
    { id: "human-atrox-nefas", name: "Atrox Nefas", role: "Shadow Magister", element: "Shadow Magic", elementTitle: "The Umbral Sovereign", passive: "umbra-siphon", signature: "shadow-bind", ultimate: "eclipse-cataclysm", visual: { renderer: "human", archetype: "shadow-mage", primary: "#261b49", secondary: "#090b19", accent: "#a88aff" } },
    { id: "human-kaida-voss", name: "Kaida Voss", role: "Duelist", element: "Water", elementTitle: "The Tidal Sovereign", passive: "tidal-flow", signature: "riptide-crosscut", ultimate: "leviathan-tempest", visual: { renderer: "human", archetype: "duelist", primary: "#126b83", secondary: "#102b40", accent: "#76e7f2" } },
    { id: "human-varek-stone", name: "Varek Stone", role: "Vanguard", element: "Earth", elementTitle: "The Terra Sovereign", passive: "bedrock-heart", signature: "seismic-guard", ultimate: "worldbreaker", visual: { renderer: "human", archetype: "vanguard", primary: "#665037", secondary: "#29251d", accent: "#c9a66b" } },
    { id: "human-elara-quill", name: "Dr. Elara Quill", role: "Battlefield Inventor", element: "Light", elementTitle: "The Radiant Sovereign", passive: "prism-core", signature: "radiant-pulse", ultimate: "nova-singularity", visual: { renderer: "human", archetype: "inventor", primary: "#b68b35", secondary: "#3c3020", accent: "#fff1a6" } },
    { id: "human-orion-kade", name: "Orion Kade", role: "Sky Ace", element: "Storm", elementTitle: "The Tempest Sovereign", passive: "storm-sense", signature: "thunderclap-dash", ultimate: "tempest-skyfall", visual: { renderer: "human", archetype: "sky-ace", primary: "#285b9b", secondary: "#101d39", accent: "#8deaff" } }
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
         (fighter.faction === "Human Dynasty" && fighter.species === "Human" && fighter.visual?.renderer === "human" && typeof fighter.visual.archetype === "string" && typeof fighter.element === "string" && typeof fighter.elementTitle === "string")) &&
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
