export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export type VintageStoryPlayStyle =
  | "surviveandbuild"
  | "exploration"
  | "wildernesssurvival"
  | "homosapiens"
  | "creativebuilding";

export type VintageStoryGameMode = "survival" | "creative";
export type VintageStoryWorldType = "standard" | "superflat";

export interface VintageStoryWorldGenerationConfig {
  playStyle: VintageStoryPlayStyle;
  gameMode: VintageStoryGameMode;
  worldType: VintageStoryWorldType;
  allowCreativeMode: boolean;
  worldHeight: number;
  worldWidth: number;
  worldLength: number;
  maxChunkRadius: number;
  worldClimate: "realistic" | "patchy";
  startingClimate: "hot" | "warm" | "temperate" | "cool" | "icy";
  polarEquatorDistance: number;
  landcover: number;
  oceanscale: number;
  upheavelCommonness: number;
  geologicActivity: number;
  landformScale: number;
  worldEdge: "blocked" | "traversable";
  globalTemperature: number;
  globalPrecipitation: number;
  globalForestation: number;
  globalDepositSpawnRate: number;
  surfaceCopperDeposits: number;
  surfaceTinDeposits: number;
  snowAccum: boolean;
  daysPerMonth: number;
  graceTimer: number;
  creatureHostility: "aggressive" | "passive" | "off";
  creatureStrength: number;
  temporalStorms: "off" | "veryrare" | "rare" | "sometimes" | "often" | "veryoften";
  temporalRifts: "off" | "invisible" | "visible";
  temporalStability: boolean;
  temporalStormSleeping: boolean;
  seasons: "enabled" | "spring" | "summer" | "fall" | "winter";
  deathPunishment: "drop" | "keep";
  spawnRadius: number;
  playerLives: number;
  playerHealthPoints: number;
  playerHungerSpeed: number;
  playerMoveSpeed: number;
  playerHealthRegenSpeed: number;
  foodSpoilSpeed: number;
  saplingGrowthRate: number;
  toolDurability: number;
  toolMiningSpeed: number;
  blockGravity: "sandgravel" | "sandgravelsoil";
  caveIns: "on" | "off";
  harshWinters: boolean;
  allowPvp: boolean;
  allowFireSpread: boolean;
  allowFallingBlocks: boolean;
  allowUndergroundFarming: boolean;
  allowMap: boolean;
  allowCoordinateHud: boolean;
  colorAccurateWorldmap: boolean;
  allowLandClaiming: boolean;
  loreContent: boolean;
  classExclusiveRecipes: boolean;
  passTimeWhenEmpty: boolean;
  whitelistMode: boolean;
}

export const VINTAGE_STORY_PLAY_STYLES: Array<
  SelectOption<VintageStoryPlayStyle> & {
    langCode: string;
    defaultGameMode: VintageStoryGameMode;
    allowCreativeMode: boolean;
  }
> = [
  {
    value: "surviveandbuild",
    label: "Survive and build",
    langCode: "preset-surviveandbuild",
    defaultGameMode: "survival",
    allowCreativeMode: false,
  },
  {
    value: "exploration",
    label: "Exploration",
    langCode: "preset-exploration",
    defaultGameMode: "survival",
    allowCreativeMode: false,
  },
  {
    value: "wildernesssurvival",
    label: "Wilderness survival",
    langCode: "preset-wildernesssurvival",
    defaultGameMode: "survival",
    allowCreativeMode: false,
  },
  {
    value: "homosapiens",
    label: "Homo sapiens",
    langCode: "preset-homosapiens",
    defaultGameMode: "survival",
    allowCreativeMode: false,
  },
  {
    value: "creativebuilding",
    label: "Creative building",
    langCode: "preset-creativebuilding",
    defaultGameMode: "creative",
    allowCreativeMode: true,
  },
];

export const WORLD_TYPE_OPTIONS: Array<SelectOption<VintageStoryWorldType>> = [
  { value: "standard", label: "Standard" },
  { value: "superflat", label: "Superflat" },
];

export const GAME_MODE_OPTIONS: Array<SelectOption<VintageStoryGameMode>> = [
  { value: "survival", label: "Survival" },
  { value: "creative", label: "Creative" },
];

export const WORLD_CLIMATE_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["worldClimate"]>> = [
  { value: "realistic", label: "Realistic" },
  { value: "patchy", label: "Patchy" },
];

export const STARTING_CLIMATE_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["startingClimate"]>> = [
  { value: "temperate", label: "Temperate" },
  { value: "warm", label: "Warm" },
  { value: "hot", label: "Hot" },
  { value: "cool", label: "Cool" },
  { value: "icy", label: "Icy" },
];

export const WORLD_EDGE_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["worldEdge"]>> = [
  { value: "traversable", label: "Traversable" },
  { value: "blocked", label: "Blocked" },
];

export const CREATURE_HOSTILITY_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["creatureHostility"]>> = [
  { value: "aggressive", label: "Aggressive" },
  { value: "passive", label: "Passive" },
  { value: "off", label: "Never hostile" },
];

export const TEMPORAL_STORM_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["temporalStorms"]>> = [
  { value: "sometimes", label: "Sometimes" },
  { value: "off", label: "Off" },
  { value: "veryrare", label: "Very rare" },
  { value: "rare", label: "Rare" },
  { value: "often", label: "Often" },
  { value: "veryoften", label: "Very often" },
];

export const TEMPORAL_RIFT_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["temporalRifts"]>> = [
  { value: "visible", label: "Visible" },
  { value: "invisible", label: "Invisible" },
  { value: "off", label: "Off" },
];

export const SEASON_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["seasons"]>> = [
  { value: "enabled", label: "Enabled" },
  { value: "spring", label: "Spring" },
  { value: "summer", label: "Summer" },
  { value: "fall", label: "Fall" },
  { value: "winter", label: "Winter" },
];

export const DEATH_PUNISHMENT_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["deathPunishment"]>> = [
  { value: "drop", label: "Drop inventory" },
  { value: "keep", label: "Keep inventory" },
];

export const BLOCK_GRAVITY_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["blockGravity"]>> = [
  { value: "sandgravel", label: "Sand and gravel" },
  { value: "sandgravelsoil", label: "Sand, gravel, and soil" },
];

export const CAVE_IN_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["caveIns"]>> = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
];

export const DEFAULT_WORLD_GENERATION_CONFIG: VintageStoryWorldGenerationConfig = {
  playStyle: "surviveandbuild",
  gameMode: "survival",
  worldType: "standard",
  allowCreativeMode: false,
  worldHeight: 256,
  worldWidth: 1024000,
  worldLength: 1024000,
  maxChunkRadius: 12,
  worldClimate: "realistic",
  startingClimate: "temperate",
  polarEquatorDistance: 100000,
  landcover: 0.975,
  oceanscale: 5,
  upheavelCommonness: 0.3,
  geologicActivity: 0.05,
  landformScale: 1,
  worldEdge: "traversable",
  globalTemperature: 1,
  globalPrecipitation: 1,
  globalForestation: 0,
  globalDepositSpawnRate: 1,
  surfaceCopperDeposits: 0.12,
  surfaceTinDeposits: 0.007,
  snowAccum: true,
  daysPerMonth: 9,
  graceTimer: 0,
  creatureHostility: "aggressive",
  creatureStrength: 1,
  temporalStorms: "sometimes",
  temporalRifts: "visible",
  temporalStability: true,
  temporalStormSleeping: false,
  seasons: "enabled",
  deathPunishment: "drop",
  spawnRadius: 50,
  playerLives: -1,
  playerHealthPoints: 15,
  playerHungerSpeed: 1,
  playerMoveSpeed: 1.5,
  playerHealthRegenSpeed: 1,
  foodSpoilSpeed: 1,
  saplingGrowthRate: 1,
  toolDurability: 1,
  toolMiningSpeed: 1,
  blockGravity: "sandgravel",
  caveIns: "off",
  harshWinters: true,
  allowPvp: true,
  allowFireSpread: true,
  allowFallingBlocks: true,
  allowUndergroundFarming: false,
  allowMap: true,
  allowCoordinateHud: true,
  colorAccurateWorldmap: false,
  allowLandClaiming: true,
  loreContent: true,
  classExclusiveRecipes: true,
  passTimeWhenEmpty: false,
  whitelistMode: false,
};

export function playStyleMeta(playStyle: unknown) {
  return (
    VINTAGE_STORY_PLAY_STYLES.find((option) => option.value === playStyle) ??
    VINTAGE_STORY_PLAY_STYLES[0]
  );
}

export function normalizeWorldGenerationConfig(
  input?: Partial<VintageStoryWorldGenerationConfig>,
): VintageStoryWorldGenerationConfig {
  const base = DEFAULT_WORLD_GENERATION_CONFIG;
  const playStyle = enumValue(input?.playStyle, VINTAGE_STORY_PLAY_STYLES, base.playStyle);
  const style = playStyleMeta(playStyle);

  return {
    playStyle,
    gameMode: enumValue(input?.gameMode, GAME_MODE_OPTIONS, style.defaultGameMode),
    worldType: enumValue(input?.worldType, WORLD_TYPE_OPTIONS, base.worldType),
    allowCreativeMode: boolValue(input?.allowCreativeMode, style.allowCreativeMode),
    worldHeight: intValue(input?.worldHeight, base.worldHeight, 64, 2048),
    worldWidth: intValue(input?.worldWidth, base.worldWidth, 32, 8192000),
    worldLength: intValue(input?.worldLength, base.worldLength, 32, 8192000),
    maxChunkRadius: intValue(input?.maxChunkRadius, base.maxChunkRadius, 1, 64),
    worldClimate: enumValue(input?.worldClimate, WORLD_CLIMATE_OPTIONS, base.worldClimate),
    startingClimate: enumValue(input?.startingClimate, STARTING_CLIMATE_OPTIONS, base.startingClimate),
    polarEquatorDistance: intValue(input?.polarEquatorDistance, base.polarEquatorDistance, 1000, 8192000),
    landcover: numberValue(input?.landcover, base.landcover, 0, 1),
    oceanscale: numberValue(input?.oceanscale, base.oceanscale, 0.1, 5),
    upheavelCommonness: numberValue(input?.upheavelCommonness, base.upheavelCommonness, 0, 1),
    geologicActivity: numberValue(input?.geologicActivity, base.geologicActivity, 0, 0.4),
    landformScale: numberValue(input?.landformScale, base.landformScale, 0.2, 3),
    worldEdge: enumValue(input?.worldEdge, WORLD_EDGE_OPTIONS, base.worldEdge),
    globalTemperature: numberValue(input?.globalTemperature, base.globalTemperature, 0, 5),
    globalPrecipitation: numberValue(input?.globalPrecipitation, base.globalPrecipitation, 0, 5),
    globalForestation: numberValue(input?.globalForestation, base.globalForestation, -1, 1),
    globalDepositSpawnRate: numberValue(input?.globalDepositSpawnRate, base.globalDepositSpawnRate, 0, 10),
    surfaceCopperDeposits: numberValue(input?.surfaceCopperDeposits, base.surfaceCopperDeposits, 0, 5),
    surfaceTinDeposits: numberValue(input?.surfaceTinDeposits, base.surfaceTinDeposits, 0, 5),
    snowAccum: boolValue(input?.snowAccum, base.snowAccum),
    daysPerMonth: intValue(input?.daysPerMonth, base.daysPerMonth, 1, 99),
    graceTimer: intValue(input?.graceTimer, base.graceTimer, 0, 9999),
    creatureHostility: enumValue(input?.creatureHostility, CREATURE_HOSTILITY_OPTIONS, base.creatureHostility),
    creatureStrength: numberValue(input?.creatureStrength, base.creatureStrength, 0, 99),
    temporalStorms: enumValue(input?.temporalStorms, TEMPORAL_STORM_OPTIONS, base.temporalStorms),
    temporalRifts: enumValue(input?.temporalRifts, TEMPORAL_RIFT_OPTIONS, base.temporalRifts),
    temporalStability: boolValue(input?.temporalStability, base.temporalStability),
    temporalStormSleeping: boolValue(input?.temporalStormSleeping, base.temporalStormSleeping),
    seasons: enumValue(input?.seasons, SEASON_OPTIONS, base.seasons),
    deathPunishment: enumValue(input?.deathPunishment, DEATH_PUNISHMENT_OPTIONS, base.deathPunishment),
    spawnRadius: intValue(input?.spawnRadius, base.spawnRadius, 0, 10000),
    playerLives: intValue(input?.playerLives, base.playerLives, -1, 9999),
    playerHealthPoints: intValue(input?.playerHealthPoints, base.playerHealthPoints, 1, 999),
    playerHungerSpeed: numberValue(input?.playerHungerSpeed, base.playerHungerSpeed, 0, 10),
    playerMoveSpeed: numberValue(input?.playerMoveSpeed, base.playerMoveSpeed, 0, 10),
    playerHealthRegenSpeed: numberValue(input?.playerHealthRegenSpeed, base.playerHealthRegenSpeed, 0.25, 2),
    foodSpoilSpeed: numberValue(input?.foodSpoilSpeed, base.foodSpoilSpeed, 0, 10),
    saplingGrowthRate: numberValue(input?.saplingGrowthRate, base.saplingGrowthRate, 0, 10),
    toolDurability: numberValue(input?.toolDurability, base.toolDurability, 0, 99),
    toolMiningSpeed: numberValue(input?.toolMiningSpeed, base.toolMiningSpeed, 0, 99),
    blockGravity: enumValue(input?.blockGravity, BLOCK_GRAVITY_OPTIONS, base.blockGravity),
    caveIns: enumValue(input?.caveIns, CAVE_IN_OPTIONS, base.caveIns),
    harshWinters: boolValue(input?.harshWinters, base.harshWinters),
    allowPvp: boolValue(input?.allowPvp, base.allowPvp),
    allowFireSpread: boolValue(input?.allowFireSpread, base.allowFireSpread),
    allowFallingBlocks: boolValue(input?.allowFallingBlocks, base.allowFallingBlocks),
    allowUndergroundFarming: boolValue(input?.allowUndergroundFarming, base.allowUndergroundFarming),
    allowMap: boolValue(input?.allowMap, base.allowMap),
    allowCoordinateHud: boolValue(input?.allowCoordinateHud, base.allowCoordinateHud),
    colorAccurateWorldmap: boolValue(input?.colorAccurateWorldmap, base.colorAccurateWorldmap),
    allowLandClaiming: boolValue(input?.allowLandClaiming, base.allowLandClaiming),
    loreContent: boolValue(input?.loreContent, base.loreContent),
    classExclusiveRecipes: boolValue(input?.classExclusiveRecipes, base.classExclusiveRecipes),
    passTimeWhenEmpty: boolValue(input?.passTimeWhenEmpty, base.passTimeWhenEmpty),
    whitelistMode: boolValue(input?.whitelistMode, base.whitelistMode),
  };
}

export function toWorldConfigurationPayload(
  config: VintageStoryWorldGenerationConfig,
): Record<string, string | boolean> {
  return {
    gameMode: config.gameMode,
    startingClimate: config.startingClimate,
    spawnRadius: String(config.spawnRadius),
    graceTimer: String(config.graceTimer),
    deathPunishment: config.deathPunishment,
    droppedItemsTimer: "600",
    seasons: config.seasons,
    playerlives: String(config.playerLives),
    lungCapacity: "40000",
    daysPerMonth: String(config.daysPerMonth),
    harshWinters: String(config.harshWinters),
    blockGravity: config.blockGravity,
    caveIns: config.caveIns,
    allowFireSpread: config.allowFireSpread,
    allowFallingBlocks: config.allowFallingBlocks,
    allowUndergroundFarming: config.allowUndergroundFarming,
    noLiquidSourceTransport: false,
    bodyTemperatureResistance: "0",
    creatureHostility: config.creatureHostility,
    creatureStrength: numberString(config.creatureStrength),
    creatureSwimSpeed: "2",
    playerHealthPoints: String(config.playerHealthPoints),
    playerHungerSpeed: numberString(config.playerHungerSpeed),
    playerHealthRegenSpeed: numberString(config.playerHealthRegenSpeed),
    playerMoveSpeed: numberString(config.playerMoveSpeed),
    foodSpoilSpeed: numberString(config.foodSpoilSpeed),
    saplingGrowthRate: numberString(config.saplingGrowthRate),
    toolDurability: numberString(config.toolDurability),
    toolMiningSpeed: numberString(config.toolMiningSpeed),
    propickNodeSearchRadius: "6",
    microblockChiseling: "stonewood",
    allowCoordinateHud: config.allowCoordinateHud,
    allowMap: config.allowMap,
    colorAccurateWorldmap: config.colorAccurateWorldmap,
    loreContent: config.loreContent,
    clutterObtainable: "ifrepaired",
    lightningFires: false,
    allowTimeswitch: false,
    temporalStability: config.temporalStability,
    temporalStorms: config.temporalStorms,
    tempstormDurationMul: "1",
    temporalRifts: config.temporalRifts,
    temporalGearRespawnUses: "20",
    temporalStormSleeping: config.temporalStormSleeping ? "1" : "0",
    worldClimate: config.worldClimate,
    landcover: numberString(config.landcover),
    oceanscale: numberString(config.oceanscale),
    upheavelCommonness: numberString(config.upheavelCommonness),
    geologicActivity: numberString(config.geologicActivity),
    landformScale: numberString(config.landformScale),
    worldWidth: String(config.worldWidth),
    worldLength: String(config.worldLength),
    worldEdge: config.worldEdge,
    polarEquatorDistance: String(config.polarEquatorDistance),
    globalTemperature: numberString(config.globalTemperature),
    globalPrecipitation: numberString(config.globalPrecipitation),
    globalForestation: numberString(config.globalForestation),
    globalDepositSpawnRate: numberString(config.globalDepositSpawnRate),
    surfaceCopperDeposits: numberString(config.surfaceCopperDeposits),
    surfaceTinDeposits: numberString(config.surfaceTinDeposits),
    snowAccum: String(config.snowAccum),
    allowLandClaiming: config.allowLandClaiming,
    classExclusiveRecipes: config.classExclusiveRecipes,
    auctionHouse: true,
  };
}

function enumValue<T extends string>(
  value: unknown,
  options: Array<SelectOption<T>>,
  fallback: T,
): T {
  return options.some((option) => option.value === value) ? (value as T) : fallback;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function intValue(value: unknown, fallback: number, min: number, max: number): number {
  return Math.trunc(numberValue(value, fallback, min, max));
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function numberString(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}
