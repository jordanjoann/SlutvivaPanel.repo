"use client";

import type * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BLOCK_GRAVITY_OPTIONS,
  BODY_TEMPERATURE_RESISTANCE_OPTIONS,
  CAVE_IN_OPTIONS,
  CLUTTER_OBTAINABLE_OPTIONS,
  CREATURE_HOSTILITY_OPTIONS,
  CREATURE_STRENGTH_OPTIONS,
  CREATURE_SWIM_SPEED_OPTIONS,
  DAYS_PER_MONTH_OPTIONS,
  DEATH_PUNISHMENT_OPTIONS,
  DROPPED_ITEMS_TIMER_OPTIONS,
  FOOD_SPOIL_SPEED_OPTIONS,
  GEOLOGIC_ACTIVITY_OPTIONS,
  GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS,
  GLOBAL_FORESTATION_OPTIONS,
  GLOBAL_PRECIPITATION_OPTIONS,
  GLOBAL_TEMPERATURE_OPTIONS,
  GRACE_TIMER_OPTIONS,
  LANDCOVER_OPTIONS,
  LANDFORM_SCALE_OPTIONS,
  LUNG_CAPACITY_OPTIONS,
  MICROBLOCK_CHISELING_OPTIONS,
  OCEAN_SCALE_OPTIONS,
  PLAYER_HEALTH_POINTS_OPTIONS,
  PLAYER_HEALTH_REGEN_SPEED_OPTIONS,
  PLAYER_HUNGER_SPEED_OPTIONS,
  PLAYER_LIVES_OPTIONS,
  PLAYER_MOVE_SPEED_OPTIONS,
  POLAR_EQUATOR_DISTANCE_OPTIONS,
  PRO_PICK_NODE_SEARCH_RADIUS_OPTIONS,
  SAPLING_GROWTH_RATE_OPTIONS,
  SEASON_OPTIONS,
  SPAWN_RADIUS_OPTIONS,
  STARTING_CLIMATE_OPTIONS,
  STORY_STRUCTURE_DISTANCE_OPTIONS,
  SURFACE_COPPER_DEPOSIT_OPTIONS,
  SURFACE_TIN_DEPOSIT_OPTIONS,
  TEMPORAL_GEAR_RESPAWN_USES_OPTIONS,
  TEMPORAL_RIFT_OPTIONS,
  TEMPORAL_STORM_DURATION_OPTIONS,
  TEMPORAL_STORM_OPTIONS,
  TOOL_DURABILITY_OPTIONS,
  TOOL_MINING_SPEED_OPTIONS,
  UPHEAVAL_COMMONNESS_OPTIONS,
  VINTAGE_STORY_PLAY_STYLES,
  VINTAGE_STORY_WORLD_TABS,
  WORLD_CLIMATE_OPTIONS,
  WORLD_EDGE_OPTIONS,
  WORLD_SIZE_OPTIONS,
  type NumberOption,
  type SelectOption,
  type VintageStoryPlayStyle,
  type VintageStoryWorldGenerationConfig,
} from "@/lib/vintage-story-world";

type Props = {
  config: VintageStoryWorldGenerationConfig;
  development: boolean;
  seed: string;
  onConfigChange: (patch: Partial<VintageStoryWorldGenerationConfig>) => void;
  onPlayStyleChange: (playStyle: VintageStoryPlayStyle) => void;
  onSeedChange: (seed: string) => void;
};

const SETTINGS_GRID = "grid gap-4 md:grid-cols-2 xl:grid-cols-4";

export function WorldCreationSettings({
  config,
  development,
  seed,
  onConfigChange,
  onPlayStyleChange,
  onSeedChange,
}: Props) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <SelectField
          label="Playstyle"
          value={config.playStyle}
          options={VINTAGE_STORY_PLAY_STYLES}
          onChange={onPlayStyleChange}
        />
        <NumberField
          label="World Height"
          value={config.worldHeight}
          min={64}
          max={2048}
          onChange={(worldHeight) => onConfigChange({ worldHeight })}
        />
        <Field label="World Seed (optional)">
          <Input value={seed} onChange={(event) => onSeedChange(event.target.value)} />
        </Field>
      </div>

      <Tabs defaultValue="player-spawn">
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max" variant="line">
            {VINTAGE_STORY_WORLD_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabPanel value="player-spawn">
          <NumberSelectField
            label="Player lives"
            value={config.playerLives}
            options={PLAYER_LIVES_OPTIONS}
            onChange={(playerLives) => onConfigChange({ playerLives })}
          />
          <SelectField
            label="Starting climate"
            value={config.startingClimate}
            options={STARTING_CLIMATE_OPTIONS}
            onChange={(startingClimate) => onConfigChange({ startingClimate })}
          />
          <NumberSelectField
            label="Random respawn radius"
            value={config.spawnRadius}
            options={SPAWN_RADIUS_OPTIONS}
            onChange={(spawnRadius) => onConfigChange({ spawnRadius })}
          />
          <NumberSelectField
            label="Grace timer"
            value={config.graceTimer}
            options={GRACE_TIMER_OPTIONS}
            onChange={(graceTimer) => onConfigChange({ graceTimer })}
          />
          <SelectField
            label="Death punishment"
            value={config.deathPunishment}
            options={DEATH_PUNISHMENT_OPTIONS}
            onChange={(deathPunishment) => onConfigChange({ deathPunishment })}
          />
          <NumberSelectField
            label="Timer for items dropped on death"
            value={config.droppedItemsTimer}
            options={DROPPED_ITEMS_TIMER_OPTIONS}
            onChange={(droppedItemsTimer) => onConfigChange({ droppedItemsTimer })}
          />
        </TabPanel>

        <TabPanel value="survival">
          <SelectField
            label="Seasons"
            value={config.seasons}
            options={SEASON_OPTIONS}
            onChange={(seasons) => onConfigChange({ seasons })}
          />
          <NumberSelectField
            label="Days per month"
            value={config.daysPerMonth}
            options={DAYS_PER_MONTH_OPTIONS}
            onChange={(daysPerMonth) => onConfigChange({ daysPerMonth })}
          />
          <BooleanSelectField
            label="True winters"
            value={config.harshWinters}
            onChange={(harshWinters) => onConfigChange({ harshWinters })}
          />
          <SelectField
            label="Block gravity"
            value={config.blockGravity}
            options={BLOCK_GRAVITY_OPTIONS}
            onChange={(blockGravity) => onConfigChange({ blockGravity })}
          />
          <SelectField
            label="Cave-ins"
            value={config.caveIns}
            options={CAVE_IN_OPTIONS}
            onChange={(caveIns) => onConfigChange({ caveIns })}
          />
          <ToggleField
            label="Allow falling blocks"
            checked={config.allowFallingBlocks}
            onChange={(allowFallingBlocks) => onConfigChange({ allowFallingBlocks })}
          />
          <ToggleField
            label="Allow fire spread"
            checked={config.allowFireSpread}
            onChange={(allowFireSpread) => onConfigChange({ allowFireSpread })}
          />
          <ToggleField
            label="Fire from lightning"
            checked={config.lightningFires}
            onChange={(lightningFires) => onConfigChange({ lightningFires })}
          />
          <ToggleField
            label="Allow underground farming"
            checked={config.allowUndergroundFarming}
            onChange={(allowUndergroundFarming) => onConfigChange({ allowUndergroundFarming })}
          />
          <ToggleField
            label="Prevent liquid source transport by buckets"
            checked={config.noLiquidSourceTransport}
            onChange={(noLiquidSourceTransport) => onConfigChange({ noLiquidSourceTransport })}
          />
          <NumberSelectField
            label="Player health points"
            value={config.playerHealthPoints}
            options={PLAYER_HEALTH_POINTS_OPTIONS}
            onChange={(playerHealthPoints) => onConfigChange({ playerHealthPoints })}
          />
          <NumberSelectField
            label="Health regeneration rate"
            value={config.playerHealthRegenSpeed}
            options={PLAYER_HEALTH_REGEN_SPEED_OPTIONS}
            onChange={(playerHealthRegenSpeed) => onConfigChange({ playerHealthRegenSpeed })}
          />
          <NumberSelectField
            label="Hunger rate"
            value={config.playerHungerSpeed}
            options={PLAYER_HUNGER_SPEED_OPTIONS}
            onChange={(playerHungerSpeed) => onConfigChange({ playerHungerSpeed })}
          />
          <NumberSelectField
            label="Lung capacity"
            value={config.lungCapacity}
            options={LUNG_CAPACITY_OPTIONS}
            onChange={(lungCapacity) => onConfigChange({ lungCapacity })}
          />
          <NumberSelectField
            label="Body temperature hardiness"
            value={config.bodyTemperatureResistance}
            options={BODY_TEMPERATURE_RESISTANCE_OPTIONS}
            onChange={(bodyTemperatureResistance) =>
              onConfigChange({ bodyTemperatureResistance })
            }
          />
          <NumberSelectField
            label="Walk speed"
            value={config.playerMoveSpeed}
            options={PLAYER_MOVE_SPEED_OPTIONS}
            onChange={(playerMoveSpeed) => onConfigChange({ playerMoveSpeed })}
          />
          <SelectField
            label="Creature hostility"
            value={config.creatureHostility}
            options={CREATURE_HOSTILITY_OPTIONS}
            onChange={(creatureHostility) => onConfigChange({ creatureHostility })}
          />
          <NumberSelectField
            label="Creature strength"
            value={config.creatureStrength}
            options={CREATURE_STRENGTH_OPTIONS}
            onChange={(creatureStrength) => onConfigChange({ creatureStrength })}
          />
          <NumberSelectField
            label="Creature swim speed"
            value={config.creatureSwimSpeed}
            options={CREATURE_SWIM_SPEED_OPTIONS}
            onChange={(creatureSwimSpeed) => onConfigChange({ creatureSwimSpeed })}
          />
          <NumberSelectField
            label="Food spoilage rate"
            value={config.foodSpoilSpeed}
            options={FOOD_SPOIL_SPEED_OPTIONS}
            onChange={(foodSpoilSpeed) => onConfigChange({ foodSpoilSpeed })}
          />
          <NumberSelectField
            label="Tree sapling growth time"
            value={config.saplingGrowthRate}
            options={SAPLING_GROWTH_RATE_OPTIONS}
            onChange={(saplingGrowthRate) => onConfigChange({ saplingGrowthRate })}
          />
          <NumberSelectField
            label="Tool durability"
            value={config.toolDurability}
            options={TOOL_DURABILITY_OPTIONS}
            onChange={(toolDurability) => onConfigChange({ toolDurability })}
          />
          <NumberSelectField
            label="Tool mining speed"
            value={config.toolMiningSpeed}
            options={TOOL_MINING_SPEED_OPTIONS}
            onChange={(toolMiningSpeed) => onConfigChange({ toolMiningSpeed })}
          />
          <NumberSelectField
            label="Prospecting Pick node search radius"
            value={config.propickNodeSearchRadius}
            options={PRO_PICK_NODE_SEARCH_RADIUS_OPTIONS}
            onChange={(propickNodeSearchRadius) => onConfigChange({ propickNodeSearchRadius })}
          />
          <SelectField
            label="Microblock chiseling"
            value={config.microblockChiseling}
            options={MICROBLOCK_CHISELING_OPTIONS}
            onChange={(microblockChiseling) => onConfigChange({ microblockChiseling })}
          />
          <ToggleField
            label="Coordinate overlay"
            checked={config.allowCoordinateHud}
            onChange={(allowCoordinateHud) => onConfigChange({ allowCoordinateHud })}
          />
          <ToggleField
            label="World map"
            checked={config.allowMap}
            onChange={(allowMap) => onConfigChange({ allowMap })}
          />
          <ToggleField
            label="Color-accurate World map"
            checked={config.colorAccurateWorldmap}
            onChange={(colorAccurateWorldmap) => onConfigChange({ colorAccurateWorldmap })}
          />
          <ToggleField
            label="Lore content"
            checked={config.loreContent}
            onChange={(loreContent) => onConfigChange({ loreContent })}
          />
          <SelectField
            label="Clutter obtainable"
            value={config.clutterObtainable}
            options={CLUTTER_OBTAINABLE_OPTIONS}
            onChange={(clutterObtainable) => onConfigChange({ clutterObtainable })}
          />
        </TabPanel>

        <TabPanel value="temporal">
          <ToggleField
            label="Temporal stability"
            checked={config.temporalStability}
            onChange={(temporalStability) => onConfigChange({ temporalStability })}
          />
          <SelectField
            label="Temporal storms"
            value={config.temporalStorms}
            options={TEMPORAL_STORM_OPTIONS}
            onChange={(temporalStorms) => onConfigChange({ temporalStorms })}
          />
          <NumberSelectField
            label="Temporal storm length"
            value={config.tempstormDurationMul}
            options={TEMPORAL_STORM_DURATION_OPTIONS}
            onChange={(tempstormDurationMul) => onConfigChange({ tempstormDurationMul })}
          />
          <SelectField
            label="Temporal Rifts"
            value={config.temporalRifts}
            options={TEMPORAL_RIFT_OPTIONS}
            onChange={(temporalRifts) => onConfigChange({ temporalRifts })}
          />
          <NumberSelectField
            label="Temporal gear respawn uses"
            value={config.temporalGearRespawnUses}
            options={TEMPORAL_GEAR_RESPAWN_USES_OPTIONS}
            onChange={(temporalGearRespawnUses) => onConfigChange({ temporalGearRespawnUses })}
          />
          <BooleanSelectField
            label="Sleeping during temporal storms"
            value={config.temporalStormSleeping}
            trueLabel="Allowed"
            falseLabel="Disallowed"
            onChange={(temporalStormSleeping) => onConfigChange({ temporalStormSleeping })}
          />
        </TabPanel>

        <TabPanel value="world-generation">
          <SelectField
            label="Climate distribution"
            value={config.worldClimate}
            options={WORLD_CLIMATE_OPTIONS}
            onChange={(worldClimate) => onConfigChange({ worldClimate })}
          />
          <NumberSelectField
            label="Landcover"
            value={config.landcover}
            options={LANDCOVER_OPTIONS}
            onChange={(landcover) => onConfigChange({ landcover })}
          />
          <NumberSelectField
            label="Landcover scale"
            value={config.oceanscale}
            options={OCEAN_SCALE_OPTIONS}
            onChange={(oceanscale) => onConfigChange({ oceanscale })}
          />
          <NumberSelectField
            label="Upheaval rate"
            value={config.upheavelCommonness}
            options={UPHEAVAL_COMMONNESS_OPTIONS}
            onChange={(upheavelCommonness) => onConfigChange({ upheavelCommonness })}
          />
          <NumberSelectField
            label="Geologic Activity"
            value={config.geologicActivity}
            options={GEOLOGIC_ACTIVITY_OPTIONS}
            onChange={(geologicActivity) => onConfigChange({ geologicActivity })}
          />
          <NumberSelectField
            label="Landform scale"
            value={config.landformScale}
            options={LANDFORM_SCALE_OPTIONS}
            onChange={(landformScale) => onConfigChange({ landformScale })}
          />
          <NumberSelectField
            label="World width"
            value={config.worldWidth}
            options={WORLD_SIZE_OPTIONS}
            onChange={(worldWidth) => onConfigChange({ worldWidth })}
          />
          <NumberSelectField
            label="World length"
            value={config.worldLength}
            options={WORLD_SIZE_OPTIONS}
            onChange={(worldLength) => onConfigChange({ worldLength })}
          />
          <SelectField
            label="World edge"
            value={config.worldEdge}
            options={WORLD_EDGE_OPTIONS}
            onChange={(worldEdge) => onConfigChange({ worldEdge })}
          />
          <NumberSelectField
            label="Polar-Equator distance"
            value={config.polarEquatorDistance}
            options={POLAR_EQUATOR_DISTANCE_OPTIONS}
            onChange={(polarEquatorDistance) => onConfigChange({ polarEquatorDistance })}
          />
          <NumberSelectField
            label="Story structures distance scaling"
            value={config.storyStructuresDistScaling}
            options={STORY_STRUCTURE_DISTANCE_OPTIONS}
            onChange={(storyStructuresDistScaling) =>
              onConfigChange({ storyStructuresDistScaling })
            }
          />
          <NumberSelectField
            label="Global temperature"
            value={config.globalTemperature}
            options={GLOBAL_TEMPERATURE_OPTIONS}
            onChange={(globalTemperature) => onConfigChange({ globalTemperature })}
          />
          <NumberSelectField
            label="Global precipitation"
            value={config.globalPrecipitation}
            options={GLOBAL_PRECIPITATION_OPTIONS}
            onChange={(globalPrecipitation) => onConfigChange({ globalPrecipitation })}
          />
          <NumberSelectField
            label="Forestation & shrubs"
            value={config.globalForestation}
            options={GLOBAL_FORESTATION_OPTIONS}
            onChange={(globalForestation) => onConfigChange({ globalForestation })}
          />
          <NumberSelectField
            label="Global deposit spawn rate"
            value={config.globalDepositSpawnRate}
            options={GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS}
            onChange={(globalDepositSpawnRate) => onConfigChange({ globalDepositSpawnRate })}
          />
          <NumberSelectField
            label="Surface copper deposit frequency"
            value={config.surfaceCopperDeposits}
            options={SURFACE_COPPER_DEPOSIT_OPTIONS}
            onChange={(surfaceCopperDeposits) => onConfigChange({ surfaceCopperDeposits })}
          />
          <NumberSelectField
            label="Surface tin deposit frequency"
            value={config.surfaceTinDeposits}
            options={SURFACE_TIN_DEPOSIT_OPTIONS}
            onChange={(surfaceTinDeposits) => onConfigChange({ surfaceTinDeposits })}
          />
          <BooleanSelectField
            label="Snow and ice"
            value={config.snowAccum}
            onChange={(snowAccum) => onConfigChange({ snowAccum })}
          />
        </TabPanel>

        <TabPanel value="multiplayer">
          <ToggleField
            label="Land claiming"
            checked={config.allowLandClaiming}
            onChange={(allowLandClaiming) => onConfigChange({ allowLandClaiming })}
          />
          <ToggleField
            label="Class exclusive recipes"
            checked={config.classExclusiveRecipes}
            onChange={(classExclusiveRecipes) => onConfigChange({ classExclusiveRecipes })}
          />
          <ToggleField
            label="Auction house"
            checked={config.auctionHouse}
            onChange={(auctionHouse) => onConfigChange({ auctionHouse })}
          />
        </TabPanel>

        <TabPanel value="admin">
          <div className="col-span-full text-xs text-muted-foreground">
            Panel and dedicated-server controls that are not shown in the game&apos;s world
            customization tabs.
          </div>
          <NumberField
            label="Max chunk radius"
            value={config.maxChunkRadius}
            min={1}
            max={64}
            onChange={(maxChunkRadius) => onConfigChange({ maxChunkRadius })}
          />
          <ToggleField
            label="Allow PvP"
            checked={config.allowPvp}
            onChange={(allowPvp) => onConfigChange({ allowPvp })}
          />
          <ToggleField
            label="Pass time when empty"
            checked={config.passTimeWhenEmpty}
            onChange={(passTimeWhenEmpty) => onConfigChange({ passTimeWhenEmpty })}
          />
          <ToggleField
            label="Whitelist mode"
            checked={development || config.whitelistMode}
            onChange={(whitelistMode) => onConfigChange({ whitelistMode })}
          />
          <ToggleField
            label="Allow time switching"
            checked={config.allowTimeswitch}
            onChange={(allowTimeswitch) => onConfigChange({ allowTimeswitch })}
          />
        </TabPanel>
      </Tabs>
    </div>
  );
}

function TabPanel({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsContent value={value} className={`${SETTINGS_GRID} rounded-lg border bg-background p-4`}>
      {children}
    </TabsContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2">
      <Label className="min-h-4 text-xs leading-4">{label}</Label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(numberInput(event.target.value, value))}
      />
    </Field>
  );
}

function NumberSelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: NumberOption[];
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Select
        value={String(value)}
        onValueChange={(next) => {
          if (next !== null) onChange(numberInput(next, value));
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function BooleanSelectField({
  label,
  value,
  trueLabel = "Enabled",
  falseLabel = "Disabled",
  onChange,
}: {
  label: string;
  value: boolean;
  trueLabel?: string;
  falseLabel?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <SelectField
      label={label}
      value={value ? "true" : "false"}
      options={[
        { value: "true", label: trueLabel },
        { value: "false", label: falseLabel },
      ]}
      onChange={(next) => onChange(next === "true")}
    />
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <Label className="text-sm leading-5">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function numberInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
