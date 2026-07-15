export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export type NumberOption = {
  value: number;
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
  storyStructuresDistScaling: number;
  snowAccum: boolean;
  daysPerMonth: number;
  graceTimer: number;
  droppedItemsTimer: number;
  creatureHostility: "aggressive" | "passive" | "off";
  creatureStrength: number;
  creatureSwimSpeed: number;
  temporalStorms: "off" | "veryrare" | "rare" | "sometimes" | "often" | "veryoften";
  tempstormDurationMul: number;
  temporalRifts: "off" | "invisible" | "visible";
  temporalGearRespawnUses: number;
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
  lungCapacity: number;
  bodyTemperatureResistance: number;
  foodSpoilSpeed: number;
  saplingGrowthRate: number;
  toolDurability: number;
  toolMiningSpeed: number;
  propickNodeSearchRadius: number;
  microblockChiseling: "off" | "stonewood" | "all";
  clutterObtainable: "ifrepaired" | "yes" | "no";
  blockGravity: "sandgravel" | "sandgravelsoil";
  caveIns: "on" | "off";
  harshWinters: boolean;
  allowPvp: boolean;
  allowFireSpread: boolean;
  allowFallingBlocks: boolean;
  lightningFires: boolean;
  allowUndergroundFarming: boolean;
  noLiquidSourceTransport: boolean;
  allowMap: boolean;
  allowCoordinateHud: boolean;
  colorAccurateWorldmap: boolean;
  allowLandClaiming: boolean;
  loreContent: boolean;
  classExclusiveRecipes: boolean;
  auctionHouse: boolean;
  allowTimeswitch: boolean;
  passTimeWhenEmpty: boolean;
  whitelistMode: boolean;
}

export const VINTAGE_STORY_WORLD_TABS = [
  { value: "player-spawn", label: "Player spawn and death" },
  { value: "survival", label: "Survival challenges" },
  { value: "temporal", label: "Temporal stability" },
  { value: "world-generation", label: "World generation" },
  { value: "multiplayer", label: "Multiplayer" },
  { value: "admin", label: "Admin" },
] as const;

export const VINTAGE_STORY_PLAY_STYLES: Array<
  SelectOption<VintageStoryPlayStyle> & {
    langCode: string;
    defaultGameMode: VintageStoryGameMode;
    allowCreativeMode: boolean;
  }
> = [
  {
    value: "surviveandbuild",
    label: "Standard",
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
    label: "Wilderness Survival",
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
    label: "Creative Building",
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
  { value: "hot", label: "Hot (28-32 °C)" },
  { value: "warm", label: "Warm (19-23 °C)" },
  { value: "temperate", label: "Temperate (6-14 °C)" },
  { value: "cool", label: "Cool (-5 to 1 °C)" },
  { value: "icy", label: "Icy (-15 to -10 °C)" },
];

export const WORLD_EDGE_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["worldEdge"]>> = [
  { value: "blocked", label: "Blocked" },
  { value: "traversable", label: "Traversable (Can fall down)" },
];

export const CREATURE_HOSTILITY_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["creatureHostility"]>> = [
  { value: "aggressive", label: "Aggressive" },
  { value: "passive", label: "Passive" },
  { value: "off", label: "Never hostile" },
];

export const TEMPORAL_STORM_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["temporalStorms"]>> = [
  { value: "off", label: "Off" },
  {
    value: "veryrare",
    label:
      "Approx. every 30-40 days, increase strength/frequency by +2.5% each time, capped at 25%",
  },
  {
    value: "rare",
    label:
      "Approx. every 20-30 days, increase strength/frequency by +5% each time, capped at 50%",
  },
  {
    value: "sometimes",
    label:
      "Approx. every 10-20 days, increase strength/frequency by +10% each time, capped at 100%",
  },
  {
    value: "often",
    label:
      "Approx. every 5-10 days, increase strength/frequency by +15% each time, capped at 150%",
  },
  {
    value: "veryoften",
    label:
      "Approx. every 3-6 days, increase strength/frequency by +20% each time, capped at 200%",
  },
];

export const TEMPORAL_RIFT_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["temporalRifts"]>> = [
  { value: "visible", label: "Visible" },
  { value: "invisible", label: "Invisible" },
  { value: "off", label: "Off" },
];

export const SEASON_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["seasons"]>> = [
  { value: "enabled", label: "Enabled" },
  { value: "spring", label: "Off, always spring" },
  { value: "summer", label: "Off, always summer" },
  { value: "fall", label: "Off, always fall" },
  { value: "winter", label: "Off, always winter" },
];

export const DEATH_PUNISHMENT_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["deathPunishment"]>> = [
  { value: "drop", label: "Drop inventory contents" },
  { value: "keep", label: "Keep inventory contents" },
];

export const BLOCK_GRAVITY_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["blockGravity"]>> = [
  { value: "sandgravel", label: "Sand and gravel" },
  {
    value: "sandgravelsoil",
    label: "Sand, gravel and soil with sideways instability",
  },
];

export const CAVE_IN_OPTIONS: Array<SelectOption<VintageStoryWorldGenerationConfig["caveIns"]>> = [
  { value: "off", label: "Disabled" },
  { value: "on", label: "Enabled" },
];

export const WORLD_SIZE_OPTIONS: NumberOption[] = [
  { value: 8192000, label: "8 mil blocks" },
  { value: 4096000, label: "4 mil blocks" },
  { value: 2048000, label: "2 mil blocks" },
  { value: 1024000, label: "1 mil blocks" },
  { value: 600000, label: "600k blocks" },
  { value: 512000, label: "512k blocks" },
  { value: 384000, label: "384k blocks" },
  { value: 256000, label: "256k blocks" },
  { value: 102400, label: "102k blocks" },
  { value: 51200, label: "51k blocks" },
  { value: 25600, label: "25k blocks" },
  { value: 10240, label: "10k blocks" },
  { value: 5120, label: "5,120 blocks" },
  { value: 1024, label: "1,024 blocks" },
  { value: 512, label: "512 blocks" },
  { value: 384, label: "384 blocks" },
  { value: 256, label: "256 blocks" },
  { value: 128, label: "128 blocks" },
  { value: 64, label: "64 blocks" },
  { value: 32, label: "32 blocks" },
];

export const POLAR_EQUATOR_DISTANCE_OPTIONS: NumberOption[] = [
  { value: 800000, label: "800k blocks" },
  { value: 400000, label: "400k blocks" },
  { value: 200000, label: "200k blocks" },
  { value: 100000, label: "100k blocks" },
  { value: 50000, label: "50k blocks" },
  { value: 25000, label: "25k blocks" },
  { value: 15000, label: "15k blocks" },
  { value: 10000, label: "10k blocks" },
  { value: 5000, label: "5,000 blocks" },
];

export const LANDCOVER_OPTIONS: NumberOption[] = [
  { value: 0, label: "~0%" },
  { value: 0.1, label: "10%" },
  { value: 0.2, label: "20%" },
  { value: 0.3, label: "30%" },
  { value: 0.4, label: "40%" },
  { value: 0.5, label: "50%" },
  { value: 0.6, label: "60%" },
  { value: 0.7, label: "70%" },
  { value: 0.8, label: "80%" },
  { value: 0.9, label: "90%" },
  { value: 0.95, label: "95%" },
  { value: 0.975, label: "97.5%" },
  { value: 1, label: "100%" },
];

export const OCEAN_SCALE_OPTIONS: NumberOption[] = [
  { value: 0.1, label: "10%" },
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100%" },
  { value: 1.25, label: "125%" },
  { value: 1.5, label: "150%" },
  { value: 1.75, label: "175%" },
  { value: 2, label: "200%" },
  { value: 3, label: "300%" },
  { value: 4, label: "400%" },
  { value: 5, label: "500%" },
];

export const UPHEAVAL_COMMONNESS_OPTIONS: NumberOption[] = [
  { value: 0, label: "0%" },
  { value: 0.1, label: "10%" },
  { value: 0.2, label: "20%" },
  { value: 0.3, label: "30%" },
  { value: 0.4, label: "40%" },
  { value: 0.5, label: "50%" },
  { value: 0.6, label: "60%" },
  { value: 0.7, label: "70%" },
  { value: 0.8, label: "80%" },
  { value: 0.9, label: "90%" },
  { value: 1, label: "100%" },
];

export const GEOLOGIC_ACTIVITY_OPTIONS: NumberOption[] = [
  { value: 0, label: "None" },
  { value: 0.05, label: "Rare" },
  { value: 0.1, label: "Uncommon" },
  { value: 0.2, label: "Common" },
  { value: 0.4, label: "Very Common" },
];

export const LANDFORM_SCALE_OPTIONS: NumberOption[] = [
  { value: 0.2, label: "20%" },
  { value: 0.4, label: "40%" },
  { value: 0.6, label: "60%" },
  { value: 0.8, label: "80%" },
  { value: 1, label: "100%" },
  { value: 1.2, label: "120%" },
  { value: 1.4, label: "140%" },
  { value: 1.6, label: "160%" },
  { value: 1.8, label: "180%" },
  { value: 2, label: "200%" },
  { value: 3, label: "300%" },
];

export const GLOBAL_TEMPERATURE_OPTIONS: NumberOption[] = [
  { value: 4, label: "Scorching hot" },
  { value: 2, label: "Very hot" },
  { value: 1.5, label: "Hot" },
  { value: 1, label: "Normal" },
  { value: 0.75, label: "Cold" },
  { value: 0.5, label: "Very cold" },
  { value: 0.25, label: "Snowball earth" },
];

export const GLOBAL_PRECIPITATION_OPTIONS: NumberOption[] = [
  { value: 4, label: "Super humid" },
  { value: 2, label: "Very humid" },
  { value: 1.5, label: "Humid" },
  { value: 1, label: "Normal" },
  { value: 0.5, label: "Semi-arid" },
  { value: 0.25, label: "Arid" },
  { value: 0.1, label: "Hyperarid" },
];

export const GLOBAL_FORESTATION_OPTIONS: NumberOption[] = [
  { value: 1, label: "Forest world (+100%)" },
  { value: 0.9, label: "Extremely forested (+90%)" },
  { value: 0.75, label: "Very highly forested (+75%)" },
  { value: 0.5, label: "Highly forested (+50%)" },
  { value: 0.25, label: "Somewhat more forest (+25%)" },
  { value: 0, label: "Normal" },
  { value: -0.25, label: "Somewhat less forest (-25%)" },
  { value: -0.5, label: "Significantly less forested (-50%)" },
  { value: -0.75, label: "Much less forested (-75%)" },
  { value: -0.9, label: "Near tree-less (-90%)" },
  { value: -1, label: "Tree-less world (-100%)" },
];

export const GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS: NumberOption[] = [
  { value: 3, label: "300%" },
  { value: 2, label: "200%" },
  { value: 1.8, label: "180%" },
  { value: 1.6, label: "160%" },
  { value: 1.4, label: "140%" },
  { value: 1.2, label: "120%" },
  { value: 1, label: "100%" },
  { value: 0.8, label: "80%" },
  { value: 0.6, label: "60%" },
  { value: 0.4, label: "40%" },
  { value: 0.2, label: "20%" },
];

export const SURFACE_COPPER_DEPOSIT_OPTIONS: NumberOption[] = [
  { value: 1, label: "Very common" },
  { value: 0.5, label: "Common" },
  { value: 0.2, label: "Uncommon" },
  { value: 0.12, label: "Rare" },
  { value: 0.05, label: "Very rare" },
  { value: 0.015, label: "Extremely rare" },
  { value: 0, label: "Never" },
];

export const SURFACE_TIN_DEPOSIT_OPTIONS: NumberOption[] = [
  { value: 0.5, label: "Very common" },
  { value: 0.25, label: "Common" },
  { value: 0.12, label: "Uncommon" },
  { value: 0.03, label: "Rare" },
  { value: 0.014, label: "Very rare" },
  { value: 0.007, label: "Extremely rare" },
  { value: 0, label: "Never" },
];

export const DAYS_PER_MONTH_OPTIONS: NumberOption[] = [
  { value: 30, label: "30 days (24 real life hours)" },
  { value: 20, label: "20 days (16 real life hours)" },
  { value: 12, label: "12 days (9.6 real life hours)" },
  { value: 9, label: "9 days (7.2 real life hours)" },
  { value: 6, label: "6 days (4.8 real life hours)" },
  { value: 3, label: "3 days (2.4 real life hours)" },
];

export const GRACE_TIMER_OPTIONS: NumberOption[] = [
  { value: 10, label: "10 days before monsters appear" },
  { value: 5, label: "5 days before monsters appear" },
  { value: 4, label: "4 days before monsters appear" },
  { value: 3, label: "3 days before monsters appear" },
  { value: 2, label: "2 days before monsters appear" },
  { value: 1, label: "1 day before monsters appear" },
  { value: 0, label: "No timer. Monsters spawn right away." },
];

export const CREATURE_STRENGTH_OPTIONS: NumberOption[] = [
  { value: 4, label: "Deadly (400%)" },
  { value: 2, label: "Very strong (200%)" },
  { value: 1.5, label: "Strong (150%)" },
  { value: 1, label: "Normal (100%)" },
  { value: 0.5, label: "Weak (50%)" },
  { value: 0.25, label: "Very weak (25%)" },
];

export const SPAWN_RADIUS_OPTIONS: NumberOption[] = [
  { value: 10000, label: "10,000 blocks" },
  { value: 5000, label: "5,000 blocks" },
  { value: 2500, label: "2,500 blocks" },
  { value: 1000, label: "1,000 blocks" },
  { value: 500, label: "500 blocks" },
  { value: 250, label: "250 blocks" },
  { value: 100, label: "100 blocks" },
  { value: 50, label: "50 blocks" },
  { value: 25, label: "25 blocks" },
  { value: 0, label: "0 blocks" },
];

export const PLAYER_LIVES_OPTIONS: NumberOption[] = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: -1, label: "Infinite" },
];

export const PLAYER_HEALTH_POINTS_OPTIONS: NumberOption[] = [
  { value: 5, label: "5 hp" },
  { value: 10, label: "10 hp" },
  { value: 15, label: "15 hp" },
  { value: 20, label: "20 hp" },
  { value: 25, label: "25 hp" },
  { value: 30, label: "30 hp" },
  { value: 35, label: "35 hp" },
];

export const PLAYER_HUNGER_SPEED_OPTIONS: NumberOption[] = [
  { value: 2, label: "Very fast (200%)" },
  { value: 1.5, label: "Fast (150%)" },
  { value: 1.25, label: "Slightly faster (125%)" },
  { value: 1, label: "Normal (100%)" },
  { value: 0.75, label: "Slightly slower (75%)" },
  { value: 0.5, label: "Slower (50%)" },
  { value: 0.25, label: "Much slower (25%)" },
];

export const PLAYER_HEALTH_REGEN_SPEED_OPTIONS: NumberOption[] = [
  { value: 2, label: "Very fast (200%)" },
  { value: 1.5, label: "Fast (150%)" },
  { value: 1.25, label: "Slightly faster (125%)" },
  { value: 1, label: "Normal (100%)" },
  { value: 0.75, label: "Slightly slower (75%)" },
  { value: 0.5, label: "Slower (50%)" },
  { value: 0.25, label: "Much slower (25%)" },
];

export const PLAYER_MOVE_SPEED_OPTIONS: NumberOption[] = [
  { value: 2, label: "Fast" },
  { value: 1.75, label: "Slightly faster" },
  { value: 1.5, label: "Normal" },
  { value: 1.25, label: "Slightly slower" },
  { value: 1, label: "Slower" },
  { value: 0.75, label: "Much slower" },
];

export const FOOD_SPOIL_SPEED_OPTIONS: NumberOption[] = [
  { value: 4, label: "400%" },
  { value: 3, label: "300%" },
  { value: 2, label: "200%" },
  { value: 1.5, label: "150%" },
  { value: 1.25, label: "125%" },
  { value: 1, label: "100%" },
  { value: 0.75, label: "75%" },
  { value: 0.5, label: "50%" },
  { value: 0.25, label: "25%" },
];

export const SAPLING_GROWTH_RATE_OPTIONS: NumberOption[] = [
  { value: 16, label: "Extremely slow (16x)" },
  { value: 8, label: "Much slower (8x)" },
  { value: 4, label: "Slower (4x)" },
  { value: 2, label: "Somewhat slower (2x)" },
  { value: 1.5, label: "Slightly slower (1.5x)" },
  { value: 1, label: "Normal (1x)" },
  { value: 0.75, label: "Slightly faster (0.75x)" },
  { value: 0.5, label: "Faster (0.5x)" },
  { value: 0.25, label: "Much faster (0.25x)" },
];

export const TOOL_DURABILITY_OPTIONS: NumberOption[] = [
  { value: 4, label: "400%" },
  { value: 3, label: "300%" },
  { value: 2, label: "200%" },
  { value: 1.5, label: "150%" },
  { value: 1.25, label: "125%" },
  { value: 1, label: "100%" },
  { value: 0.75, label: "75%" },
  { value: 0.5, label: "50%" },
];

export const TOOL_MINING_SPEED_OPTIONS: NumberOption[] = [
  { value: 3, label: "300%" },
  { value: 2, label: "200%" },
  { value: 1.5, label: "150%" },
  { value: 1.25, label: "125%" },
  { value: 1, label: "100%" },
  { value: 0.75, label: "75%" },
  { value: 0.5, label: "50%" },
  { value: 0.25, label: "25%" },
];

export const DROPPED_ITEMS_TIMER_OPTIONS: NumberOption[] = [
  { value: 300, label: "5 minutes" },
  { value: 600, label: "10 minutes" },
  { value: 1200, label: "20 minutes" },
  { value: 1800, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
];

export const LUNG_CAPACITY_OPTIONS: NumberOption[] = [
  { value: 10000, label: "10 seconds" },
  { value: 20000, label: "20 seconds" },
  { value: 30000, label: "30 seconds" },
  { value: 40000, label: "40 seconds" },
  { value: 60000, label: "60 seconds" },
  { value: 120000, label: "2 minutes" },
  { value: 3600000, label: "60 minutes" },
];

export const BODY_TEMPERATURE_RESISTANCE_OPTIONS: NumberOption[] = [
  -40, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20,
].map((value) => ({ value, label: `${value} °C` }));

export const CREATURE_SWIM_SPEED_OPTIONS: NumberOption[] = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3,
].map((value) => ({ value, label: `${value * 100}%` }));

export const PRO_PICK_NODE_SEARCH_RADIUS_OPTIONS: NumberOption[] = [
  { value: 0, label: "Disabled" },
  { value: 2, label: "2 blocks" },
  { value: 4, label: "4 blocks" },
  { value: 6, label: "6 blocks" },
  { value: 8, label: "8 blocks" },
];

export const MICROBLOCK_CHISELING_OPTIONS: Array<
  SelectOption<VintageStoryWorldGenerationConfig["microblockChiseling"]>
> = [
  { value: "off", label: "Off" },
  { value: "stonewood", label: "Stone, Wood and Bricks" },
  { value: "all", label: "Most cubic blocks" },
];

export const CLUTTER_OBTAINABLE_OPTIONS: Array<
  SelectOption<VintageStoryWorldGenerationConfig["clutterObtainable"]>
> = [
  { value: "ifrepaired", label: "Only if first repaired using glue" },
  { value: "yes", label: "Yes, simply by breaking them" },
  { value: "no", label: "No, they always shatter" },
];

export const TEMPORAL_STORM_DURATION_OPTIONS: NumberOption[] = [
  { value: 2, label: "Much longer (200%)" },
  { value: 1.5, label: "Longer (150%)" },
  { value: 1.25, label: "Slightly longer (125%)" },
  { value: 1, label: "Normal (100%)" },
  { value: 0.75, label: "Slightly shorter (75%)" },
  { value: 0.5, label: "Shorter (50%)" },
  { value: 0.25, label: "Much Shorter (25%)" },
];

export const TEMPORAL_GEAR_RESPAWN_USES_OPTIONS: NumberOption[] = [
  { value: -1, label: "Infinite" },
  { value: 20, label: "20 times" },
  { value: 10, label: "10 times" },
  { value: 5, label: "5 times" },
  { value: 4, label: "4 times" },
  { value: 3, label: "3 times" },
  { value: 2, label: "2 times" },
  { value: 1, label: "One time" },
];

export const STORY_STRUCTURE_DISTANCE_OPTIONS: NumberOption[] = [
  { value: 0.15, label: "15%" },
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100%" },
  { value: 1.5, label: "150%" },
  { value: 2, label: "200%" },
  { value: 3, label: "300%" },
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
  storyStructuresDistScaling: 1,
  snowAccum: true,
  daysPerMonth: 9,
  graceTimer: 0,
  droppedItemsTimer: 600,
  creatureHostility: "aggressive",
  creatureStrength: 1,
  creatureSwimSpeed: 2,
  temporalStorms: "sometimes",
  tempstormDurationMul: 1,
  temporalRifts: "visible",
  temporalGearRespawnUses: 20,
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
  lungCapacity: 40000,
  bodyTemperatureResistance: 0,
  foodSpoilSpeed: 1,
  saplingGrowthRate: 1,
  toolDurability: 1,
  toolMiningSpeed: 1,
  propickNodeSearchRadius: 6,
  microblockChiseling: "stonewood",
  clutterObtainable: "ifrepaired",
  blockGravity: "sandgravel",
  caveIns: "off",
  harshWinters: true,
  allowPvp: true,
  allowFireSpread: true,
  allowFallingBlocks: true,
  lightningFires: false,
  allowUndergroundFarming: false,
  noLiquidSourceTransport: false,
  allowMap: true,
  allowCoordinateHud: true,
  colorAccurateWorldmap: false,
  allowLandClaiming: true,
  loreContent: true,
  classExclusiveRecipes: true,
  auctionHouse: true,
  allowTimeswitch: false,
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
    storyStructuresDistScaling: numberValue(
      input?.storyStructuresDistScaling,
      base.storyStructuresDistScaling,
      0.15,
      3,
    ),
    snowAccum: boolValue(input?.snowAccum, base.snowAccum),
    daysPerMonth: intValue(input?.daysPerMonth, base.daysPerMonth, 1, 99),
    graceTimer: intValue(input?.graceTimer, base.graceTimer, 0, 9999),
    droppedItemsTimer: intValue(input?.droppedItemsTimer, base.droppedItemsTimer, 1, 86400),
    creatureHostility: enumValue(input?.creatureHostility, CREATURE_HOSTILITY_OPTIONS, base.creatureHostility),
    creatureStrength: numberValue(input?.creatureStrength, base.creatureStrength, 0, 99),
    creatureSwimSpeed: numberValue(input?.creatureSwimSpeed, base.creatureSwimSpeed, 0.5, 3),
    temporalStorms: enumValue(input?.temporalStorms, TEMPORAL_STORM_OPTIONS, base.temporalStorms),
    tempstormDurationMul: numberValue(
      input?.tempstormDurationMul,
      base.tempstormDurationMul,
      0.25,
      2,
    ),
    temporalRifts: enumValue(input?.temporalRifts, TEMPORAL_RIFT_OPTIONS, base.temporalRifts),
    temporalGearRespawnUses: intValue(
      input?.temporalGearRespawnUses,
      base.temporalGearRespawnUses,
      -1,
      20,
    ),
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
    lungCapacity: intValue(input?.lungCapacity, base.lungCapacity, 10000, 3600000),
    bodyTemperatureResistance: numberValue(
      input?.bodyTemperatureResistance,
      base.bodyTemperatureResistance,
      -40,
      20,
    ),
    foodSpoilSpeed: numberValue(input?.foodSpoilSpeed, base.foodSpoilSpeed, 0, 10),
    saplingGrowthRate: numberValue(input?.saplingGrowthRate, base.saplingGrowthRate, 0, 10),
    toolDurability: numberValue(input?.toolDurability, base.toolDurability, 0, 99),
    toolMiningSpeed: numberValue(input?.toolMiningSpeed, base.toolMiningSpeed, 0, 99),
    propickNodeSearchRadius: intValue(
      input?.propickNodeSearchRadius,
      base.propickNodeSearchRadius,
      0,
      8,
    ),
    microblockChiseling: enumValue(
      input?.microblockChiseling,
      MICROBLOCK_CHISELING_OPTIONS,
      base.microblockChiseling,
    ),
    clutterObtainable: enumValue(
      input?.clutterObtainable,
      CLUTTER_OBTAINABLE_OPTIONS,
      base.clutterObtainable,
    ),
    blockGravity: enumValue(input?.blockGravity, BLOCK_GRAVITY_OPTIONS, base.blockGravity),
    caveIns: enumValue(input?.caveIns, CAVE_IN_OPTIONS, base.caveIns),
    harshWinters: boolValue(input?.harshWinters, base.harshWinters),
    allowPvp: boolValue(input?.allowPvp, base.allowPvp),
    allowFireSpread: boolValue(input?.allowFireSpread, base.allowFireSpread),
    allowFallingBlocks: boolValue(input?.allowFallingBlocks, base.allowFallingBlocks),
    lightningFires: boolValue(input?.lightningFires, base.lightningFires),
    allowUndergroundFarming: boolValue(input?.allowUndergroundFarming, base.allowUndergroundFarming),
    noLiquidSourceTransport: boolValue(
      input?.noLiquidSourceTransport,
      base.noLiquidSourceTransport,
    ),
    allowMap: boolValue(input?.allowMap, base.allowMap),
    allowCoordinateHud: boolValue(input?.allowCoordinateHud, base.allowCoordinateHud),
    colorAccurateWorldmap: boolValue(input?.colorAccurateWorldmap, base.colorAccurateWorldmap),
    allowLandClaiming: boolValue(input?.allowLandClaiming, base.allowLandClaiming),
    loreContent: boolValue(input?.loreContent, base.loreContent),
    classExclusiveRecipes: boolValue(input?.classExclusiveRecipes, base.classExclusiveRecipes),
    auctionHouse: boolValue(input?.auctionHouse, base.auctionHouse),
    allowTimeswitch: boolValue(input?.allowTimeswitch, base.allowTimeswitch),
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
    droppedItemsTimer: String(config.droppedItemsTimer),
    seasons: config.seasons,
    playerlives: String(config.playerLives),
    lungCapacity: String(config.lungCapacity),
    daysPerMonth: String(config.daysPerMonth),
    harshWinters: String(config.harshWinters),
    blockGravity: config.blockGravity,
    caveIns: config.caveIns,
    allowFireSpread: config.allowFireSpread,
    allowFallingBlocks: config.allowFallingBlocks,
    allowUndergroundFarming: config.allowUndergroundFarming,
    noLiquidSourceTransport: config.noLiquidSourceTransport,
    bodyTemperatureResistance: numberString(config.bodyTemperatureResistance),
    creatureHostility: config.creatureHostility,
    creatureStrength: numberString(config.creatureStrength),
    creatureSwimSpeed: numberString(config.creatureSwimSpeed),
    playerHealthPoints: String(config.playerHealthPoints),
    playerHungerSpeed: numberString(config.playerHungerSpeed),
    playerHealthRegenSpeed: numberString(config.playerHealthRegenSpeed),
    playerMoveSpeed: numberString(config.playerMoveSpeed),
    foodSpoilSpeed: numberString(config.foodSpoilSpeed),
    saplingGrowthRate: numberString(config.saplingGrowthRate),
    toolDurability: numberString(config.toolDurability),
    toolMiningSpeed: numberString(config.toolMiningSpeed),
    propickNodeSearchRadius: String(config.propickNodeSearchRadius),
    microblockChiseling: config.microblockChiseling,
    allowCoordinateHud: config.allowCoordinateHud,
    allowMap: config.allowMap,
    colorAccurateWorldmap: config.colorAccurateWorldmap,
    loreContent: config.loreContent,
    clutterObtainable: config.clutterObtainable,
    lightningFires: config.lightningFires,
    allowTimeswitch: config.allowTimeswitch,
    temporalStability: config.temporalStability,
    temporalStorms: config.temporalStorms,
    tempstormDurationMul: numberString(config.tempstormDurationMul),
    temporalRifts: config.temporalRifts,
    temporalGearRespawnUses: String(config.temporalGearRespawnUses),
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
    storyStructuresDistScaling: numberString(config.storyStructuresDistScaling),
    globalTemperature: numberString(config.globalTemperature),
    globalPrecipitation: numberString(config.globalPrecipitation),
    globalForestation: numberString(config.globalForestation),
    globalDepositSpawnRate: numberString(config.globalDepositSpawnRate),
    surfaceCopperDeposits: numberString(config.surfaceCopperDeposits),
    surfaceTinDeposits: numberString(config.surfaceTinDeposits),
    snowAccum: String(config.snowAccum),
    allowLandClaiming: config.allowLandClaiming,
    classExclusiveRecipes: config.classExclusiveRecipes,
    auctionHouse: config.auctionHouse,
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
