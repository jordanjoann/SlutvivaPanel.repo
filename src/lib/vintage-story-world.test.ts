import { describe, expect, it } from "vitest";
import {
  BODY_TEMPERATURE_RESISTANCE_OPTIONS,
  CLUTTER_OBTAINABLE_OPTIONS,
  CREATURE_SWIM_SPEED_OPTIONS,
  DAYS_PER_MONTH_OPTIONS,
  DEFAULT_WORLD_GENERATION_CONFIG,
  DROPPED_ITEMS_TIMER_OPTIONS,
  GEOLOGIC_ACTIVITY_OPTIONS,
  GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS,
  GLOBAL_FORESTATION_OPTIONS,
  GLOBAL_PRECIPITATION_OPTIONS,
  GLOBAL_TEMPERATURE_OPTIONS,
  LANDCOVER_OPTIONS,
  LANDFORM_SCALE_OPTIONS,
  LUNG_CAPACITY_OPTIONS,
  MICROBLOCK_CHISELING_OPTIONS,
  OCEAN_SCALE_OPTIONS,
  PLAYER_HUNGER_SPEED_OPTIONS,
  PLAYER_LIVES_OPTIONS,
  POLAR_EQUATOR_DISTANCE_OPTIONS,
  PRO_PICK_NODE_SEARCH_RADIUS_OPTIONS,
  SPAWN_RADIUS_OPTIONS,
  STORY_STRUCTURE_DISTANCE_OPTIONS,
  SURFACE_COPPER_DEPOSIT_OPTIONS,
  SURFACE_TIN_DEPOSIT_OPTIONS,
  TEMPORAL_GEAR_RESPAWN_USES_OPTIONS,
  TEMPORAL_STORM_DURATION_OPTIONS,
  TOOL_DURABILITY_OPTIONS,
  TOOL_MINING_SPEED_OPTIONS,
  VINTAGE_STORY_WORLD_TABS,
  WORLD_SIZE_OPTIONS,
  normalizeWorldGenerationConfig,
  toWorldConfigurationPayload,
} from "./vintage-story-world";

describe("Vintage Story world configuration options", () => {
  it("uses official customize-screen values for world size and climate generation", () => {
    expect(WORLD_SIZE_OPTIONS.map((option) => option.value)).toEqual([
      8192000, 4096000, 2048000, 1024000, 600000, 512000, 384000, 256000,
      102400, 51200, 25600, 10240, 5120, 1024, 512, 384, 256, 128, 64, 32,
    ]);
    expect(POLAR_EQUATOR_DISTANCE_OPTIONS.map((option) => option.value)).toEqual([
      800000, 400000, 200000, 100000, 50000, 25000, 15000, 10000, 5000,
    ]);
    expect(LANDCOVER_OPTIONS.map((option) => option.value)).toEqual([
      0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.975, 1,
    ]);
    expect(OCEAN_SCALE_OPTIONS.map((option) => option.value)).toEqual([
      0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, 5,
    ]);
  });

  it("labels generation multipliers with readable game terms", () => {
    expect(GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS).toContainEqual({
      value: 0.2,
      label: "20%",
    });
    expect(GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS).toContainEqual({
      value: 1,
      label: "100%",
    });
    expect(GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS).toContainEqual({
      value: 3,
      label: "300%",
    });
    expect(SURFACE_COPPER_DEPOSIT_OPTIONS).toContainEqual({
      value: 0.12,
      label: "Rare",
    });
    expect(SURFACE_TIN_DEPOSIT_OPTIONS).toContainEqual({
      value: 0.007,
      label: "Extremely rare",
    });
  });

  it("uses dropdown option lists for current numeric survival controls", () => {
    expect(DAYS_PER_MONTH_OPTIONS.map((option) => option.value)).toEqual([30, 20, 12, 9, 6, 3]);
    expect(SPAWN_RADIUS_OPTIONS.map((option) => option.value)).toEqual([
      10000, 5000, 2500, 1000, 500, 250, 100, 50, 25, 0,
    ]);
    expect(PLAYER_LIVES_OPTIONS.at(-1)).toEqual({ value: -1, label: "Infinite" });
    expect(PLAYER_HUNGER_SPEED_OPTIONS).toContainEqual({
      value: 0.25,
      label: "Much slower (25%)",
    });
    expect(TOOL_DURABILITY_OPTIONS.at(0)).toEqual({ value: 4, label: "400%" });
    expect(TOOL_MINING_SPEED_OPTIONS.at(-1)).toEqual({ value: 0.25, label: "25%" });
  });

  it("keeps ambiguous world generation scales aligned with the installed game labels", () => {
    expect(GEOLOGIC_ACTIVITY_OPTIONS).toEqual([
      { value: 0, label: "None" },
      { value: 0.05, label: "Rare" },
      { value: 0.1, label: "Uncommon" },
      { value: 0.2, label: "Common" },
      { value: 0.4, label: "Very Common" },
    ]);
    expect(LANDFORM_SCALE_OPTIONS.at(-1)).toEqual({ value: 3, label: "300%" });
    expect(GLOBAL_TEMPERATURE_OPTIONS.map((option) => option.label)).toEqual([
      "Scorching hot",
      "Very hot",
      "Hot",
      "Normal",
      "Cold",
      "Very cold",
      "Snowball earth",
    ]);
    expect(GLOBAL_PRECIPITATION_OPTIONS.map((option) => option.label)).toEqual([
      "Super humid",
      "Very humid",
      "Humid",
      "Normal",
      "Semi-arid",
      "Arid",
      "Hyperarid",
    ]);
    expect(GLOBAL_FORESTATION_OPTIONS).toContainEqual({
      value: -1,
      label: "Tree-less world (-100%)",
    });
  });

  it("provides every new dropdown shown in the 1.22.3 customization screens", () => {
    expect(DROPPED_ITEMS_TIMER_OPTIONS.map((option) => option.value)).toEqual([
      300, 600, 1200, 1800, 3600,
    ]);
    expect(LUNG_CAPACITY_OPTIONS.map((option) => option.value)).toEqual([
      10000, 20000, 30000, 40000, 60000, 120000, 3600000,
    ]);
    expect(BODY_TEMPERATURE_RESISTANCE_OPTIONS.map((option) => option.value)).toEqual([
      -40, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20,
    ]);
    expect(CREATURE_SWIM_SPEED_OPTIONS.map((option) => option.value)).toEqual([
      0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3,
    ]);
    expect(PRO_PICK_NODE_SEARCH_RADIUS_OPTIONS.map((option) => option.value)).toEqual([
      0, 2, 4, 6, 8,
    ]);
    expect(MICROBLOCK_CHISELING_OPTIONS.map((option) => option.value)).toEqual([
      "off",
      "stonewood",
      "all",
    ]);
    expect(CLUTTER_OBTAINABLE_OPTIONS.map((option) => option.value)).toEqual([
      "ifrepaired",
      "yes",
      "no",
    ]);
    expect(TEMPORAL_STORM_DURATION_OPTIONS.map((option) => option.value)).toEqual([
      2, 1.5, 1.25, 1, 0.75, 0.5, 0.25,
    ]);
    expect(TEMPORAL_GEAR_RESPAWN_USES_OPTIONS.map((option) => option.value)).toEqual([
      -1, 20, 10, 5, 4, 3, 2, 1,
    ]);
    expect(STORY_STRUCTURE_DISTANCE_OPTIONS.map((option) => option.value)).toEqual([
      0.15, 0.25, 0.5, 0.75, 1, 1.5, 2, 3,
    ]);
  });

  it("uses the same five tabs as the game plus the panel-only Admin tab", () => {
    expect(VINTAGE_STORY_WORLD_TABS.map((tab) => tab.label)).toEqual([
      "Player spawn and death",
      "Survival challenges",
      "Temporal stability",
      "World generation",
      "Multiplayer",
      "Admin",
    ]);
  });
});

describe("Vintage Story Standard world defaults", () => {
  it("matches the defaults visible in the customization screens", () => {
    expect(DEFAULT_WORLD_GENERATION_CONFIG).toMatchObject({
      playStyle: "surviveandbuild",
      gameMode: "survival",
      worldHeight: 256,
      startingClimate: "temperate",
      spawnRadius: 50,
      playerLives: -1,
      graceTimer: 0,
      deathPunishment: "drop",
      droppedItemsTimer: 600,
      seasons: "enabled",
      daysPerMonth: 9,
      harshWinters: true,
      blockGravity: "sandgravel",
      caveIns: "off",
      allowFallingBlocks: true,
      allowFireSpread: true,
      lightningFires: false,
      allowUndergroundFarming: false,
      noLiquidSourceTransport: false,
      playerHealthPoints: 15,
      playerHealthRegenSpeed: 1,
      playerHungerSpeed: 1,
      lungCapacity: 40000,
      bodyTemperatureResistance: 0,
      playerMoveSpeed: 1.5,
      creatureHostility: "aggressive",
      creatureStrength: 1,
      creatureSwimSpeed: 2,
      propickNodeSearchRadius: 6,
      microblockChiseling: "stonewood",
      clutterObtainable: "ifrepaired",
      temporalStability: true,
      temporalStorms: "sometimes",
      tempstormDurationMul: 1,
      temporalRifts: "visible",
      temporalGearRespawnUses: 20,
      temporalStormSleeping: false,
      worldClimate: "realistic",
      landcover: 0.975,
      oceanscale: 5,
      upheavelCommonness: 0.3,
      geologicActivity: 0.05,
      landformScale: 1,
      worldWidth: 1024000,
      worldLength: 1024000,
      worldEdge: "traversable",
      polarEquatorDistance: 100000,
      storyStructuresDistScaling: 1,
      globalTemperature: 1,
      globalPrecipitation: 1,
      globalForestation: 0,
      globalDepositSpawnRate: 1,
      surfaceCopperDeposits: 0.12,
      surfaceTinDeposits: 0.007,
      snowAccum: true,
      allowLandClaiming: true,
      classExclusiveRecipes: true,
      auctionHouse: true,
    });
  });

  it("writes all selectable settings into WorldConfiguration instead of hardcoding them", () => {
    const config = normalizeWorldGenerationConfig({
      droppedItemsTimer: 3600,
      lungCapacity: 120000,
      noLiquidSourceTransport: true,
      bodyTemperatureResistance: 10,
      creatureSwimSpeed: 1.25,
      propickNodeSearchRadius: 8,
      microblockChiseling: "all",
      clutterObtainable: "yes",
      lightningFires: true,
      tempstormDurationMul: 1.5,
      temporalGearRespawnUses: -1,
      storyStructuresDistScaling: 2,
      auctionHouse: false,
      allowTimeswitch: true,
    });

    expect(toWorldConfigurationPayload(config)).toMatchObject({
      droppedItemsTimer: "3600",
      lungCapacity: "120000",
      noLiquidSourceTransport: true,
      bodyTemperatureResistance: "10",
      creatureSwimSpeed: "1.25",
      propickNodeSearchRadius: "8",
      microblockChiseling: "all",
      clutterObtainable: "yes",
      lightningFires: true,
      tempstormDurationMul: "1.5",
      temporalGearRespawnUses: "-1",
      storyStructuresDistScaling: "2",
      auctionHouse: false,
      allowTimeswitch: true,
    });
  });
});
