"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  BLOCK_GRAVITY_OPTIONS,
  CAVE_IN_OPTIONS,
  CREATURE_HOSTILITY_OPTIONS,
  CREATURE_STRENGTH_OPTIONS,
  DAYS_PER_MONTH_OPTIONS,
  DEATH_PUNISHMENT_OPTIONS,
  DEFAULT_WORLD_GENERATION_CONFIG,
  FOOD_SPOIL_SPEED_OPTIONS,
  GAME_MODE_OPTIONS,
  GEOLOGIC_ACTIVITY_OPTIONS,
  GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS,
  GLOBAL_FORESTATION_OPTIONS,
  GLOBAL_PRECIPITATION_OPTIONS,
  GLOBAL_TEMPERATURE_OPTIONS,
  GRACE_TIMER_OPTIONS,
  LANDCOVER_OPTIONS,
  LANDFORM_SCALE_OPTIONS,
  OCEAN_SCALE_OPTIONS,
  PLAYER_HEALTH_POINTS_OPTIONS,
  PLAYER_HEALTH_REGEN_SPEED_OPTIONS,
  PLAYER_HUNGER_SPEED_OPTIONS,
  PLAYER_LIVES_OPTIONS,
  PLAYER_MOVE_SPEED_OPTIONS,
  POLAR_EQUATOR_DISTANCE_OPTIONS,
  SAPLING_GROWTH_RATE_OPTIONS,
  SEASON_OPTIONS,
  SPAWN_RADIUS_OPTIONS,
  STARTING_CLIMATE_OPTIONS,
  SURFACE_COPPER_DEPOSIT_OPTIONS,
  SURFACE_TIN_DEPOSIT_OPTIONS,
  TEMPORAL_RIFT_OPTIONS,
  TEMPORAL_STORM_OPTIONS,
  TOOL_DURABILITY_OPTIONS,
  TOOL_MINING_SPEED_OPTIONS,
  UPHEAVAL_COMMONNESS_OPTIONS,
  VINTAGE_STORY_PLAY_STYLES,
  WORLD_CLIMATE_OPTIONS,
  WORLD_EDGE_OPTIONS,
  WORLD_SIZE_OPTIONS,
  WORLD_TYPE_OPTIONS,
  type NumberOption,
  playStyleMeta,
  type SelectOption,
  type VintageStoryPlayStyle,
  type VintageStoryWorldGenerationConfig,
} from "@/lib/vintage-story-world";
import {
  DEFAULT_VINTAGE_STORY_VERSION,
  FALLBACK_VINTAGE_STORY_VERSIONS,
} from "@/lib/vintage-story-versions";

const MEMORY = [
  { v: "2048", label: "2 GB" },
  { v: "3072", label: "3 GB" },
  { v: "4096", label: "4 GB" },
  { v: "6144", label: "6 GB" },
  { v: "8192", label: "8 GB" },
  { v: "12288", label: "12 GB" },
  { v: "16384", label: "16 GB" },
];

const CPU = [
  { v: "1", label: "1 core" },
  { v: "2", label: "2 cores" },
  { v: "3", label: "3 cores" },
  { v: "4", label: "4 cores" },
  { v: "6", label: "6 cores" },
  { v: "8", label: "8 cores" },
  { v: "0", label: "Unlimited" },
];

type ConfigPatch = Partial<VintageStoryWorldGenerationConfig>;

export function CreateServerDialog() {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [worldName, setWorldName] = React.useState("New World");
  const [seed, setSeed] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [welcomeMessage, setWelcomeMessage] = React.useState("Welcome to the server!");
  const [serverPassword, setServerPassword] = React.useState("");
  const [development, setDevelopment] = React.useState(false);
  const [advertiseServer, setAdvertiseServer] = React.useState(false);
  const [version, setVersion] = React.useState("");
  const [maxPlayers, setMaxPlayers] = React.useState("16");
  const [memory, setMemory] = React.useState("4096");
  const [cpu, setCpu] = React.useState("2");
  const [worldConfig, setWorldConfig] = React.useState<VintageStoryWorldGenerationConfig>(
    DEFAULT_WORLD_GENERATION_CONFIG,
  );
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: versionData } = useSWR("vintage-story-versions", api.vintageStory.versions);
  const versions = versionData?.versions ?? FALLBACK_VINTAGE_STORY_VERSIONS;
  const defaultVersion =
    versions.find((v) => v.latest)?.version ?? DEFAULT_VINTAGE_STORY_VERSION;
  const selectedVersion = version || defaultVersion;

  function resetForm() {
    setName("");
    setWorldName("New World");
    setSeed("");
    setDescription("");
    setWelcomeMessage("Welcome to the server!");
    setServerPassword("");
    setDevelopment(false);
    setAdvertiseServer(false);
    setVersion("");
    setMaxPlayers("16");
    setMemory("4096");
    setCpu("2");
    setWorldConfig(DEFAULT_WORLD_GENERATION_CONFIG);
    setBusy(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  function updateConfig(patch: ConfigPatch) {
    setWorldConfig((current) => ({ ...current, ...patch }));
  }

  function setPlayStyle(value: VintageStoryPlayStyle) {
    const style = playStyleMeta(value);
    updateConfig({
      playStyle: value,
      gameMode: style.defaultGameMode,
      allowCreativeMode: style.allowCreativeMode,
    });
  }

  function setDevelopmentMode(next: boolean) {
    setDevelopment(next);
    if (next) updateConfig({ whitelistMode: true });
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Please enter a server name");
      return;
    }

    const finalWorldName = worldName.trim() || name.trim();

    try {
      setBusy(true);
      const created = await api.instances.create({
        name: name.trim(),
        group: development ? "Development" : "Servers",
        development,
        version: selectedVersion,
        description: description.trim(),
        motd: welcomeMessage.trim(),
        worldName: finalWorldName,
        seed: seed.trim(),
        maxPlayers: numberInput(maxPlayers, 16),
        passwordProtected: serverPassword.trim().length > 0,
        publicAdvertised: advertiseServer,
        autoRestart: false,
        resources: {
          memoryLimitMB: numberInput(memory, 4096),
          cpuLimit: Number(cpu),
        },
        serverPassword: serverPassword.trim(),
        initialWorldConfig: {
          ...worldConfig,
          whitelistMode: development || worldConfig.whitelistMode,
        },
      });
      await mutate((key) => Array.isArray(key) && key[0] === "instances");
      toast.success(`Server "${created.name}" created`);
      handleOpenChange(false);
      router.push(`/vintage-story/${created.id}`);
    } catch (e) {
      toast.error("Failed to create server", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <PlusIcon /> New Server
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Create Vintage Story server</DialogTitle>
          <DialogDescription>
            Configure the instance and first world before the server starts.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(92vh-10rem)] overflow-y-auto pr-1">
          <div className="grid gap-4">
            <CreateSection title="Instance">
              <div className="grid gap-4 lg:grid-cols-4">
                <Field label="Server name" className="lg:col-span-2">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </Field>
                <Field label="Version">
                  <Select value={selectedVersion} onValueChange={(v) => setVersion(v as string)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((v) => (
                        <SelectItem key={v.version} value={v.version}>
                          v{v.version}
                          {v.latest ? " · latest" : v.channel !== "stable" ? ` · ${v.channel}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Max players">
                  <Input
                    type="number"
                    min={1}
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(e.target.value)}
                  />
                </Field>
                <Field label="Memory">
                  <Select value={memory} onValueChange={(v) => setMemory(v as string)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEMORY.map((m) => (
                        <SelectItem key={m.v} value={m.v}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="CPU">
                  <Select value={cpu} onValueChange={(v) => setCpu(v as string)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CPU.map((option) => (
                        <SelectItem key={option.v} value={option.v}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="World name">
                  <Input value={worldName} onChange={(e) => setWorldName(e.target.value)} />
                </Field>
                <Field label="Seed">
                  <Input value={seed} onChange={(e) => setSeed(e.target.value)} />
                </Field>
              </div>
            </CreateSection>

            <CreateSection title="World Type">
              <div className="grid gap-4 lg:grid-cols-4">
                <SelectField
                  label="Play style"
                  value={worldConfig.playStyle}
                  options={VINTAGE_STORY_PLAY_STYLES}
                  onChange={(value) => setPlayStyle(value as VintageStoryPlayStyle)}
                />
                <SelectField
                  label="Game mode"
                  value={worldConfig.gameMode}
                  options={GAME_MODE_OPTIONS}
                  onChange={(gameMode) => updateConfig({ gameMode })}
                />
                <SelectField
                  label="World type"
                  value={worldConfig.worldType}
                  options={WORLD_TYPE_OPTIONS}
                  onChange={(worldType) => updateConfig({ worldType })}
                />
                <ToggleField
                  label="Creative commands"
                  checked={worldConfig.allowCreativeMode}
                  onChange={(allowCreativeMode) => updateConfig({ allowCreativeMode })}
                />
              </div>
            </CreateSection>

            <CreateSection title="World Generation">
              <div className="grid gap-4 lg:grid-cols-4">
                <NumberSelectField
                  label="World width"
                  value={worldConfig.worldWidth}
                  options={WORLD_SIZE_OPTIONS}
                  onChange={(worldWidth) => updateConfig({ worldWidth })}
                />
                <NumberSelectField
                  label="World length"
                  value={worldConfig.worldLength}
                  options={WORLD_SIZE_OPTIONS}
                  onChange={(worldLength) => updateConfig({ worldLength })}
                />
                <NumberField
                  label="World height"
                  value={worldConfig.worldHeight}
                  min={64}
                  onChange={(worldHeight) => updateConfig({ worldHeight })}
                />
                <NumberField
                  label="Max chunk radius"
                  value={worldConfig.maxChunkRadius}
                  min={1}
                  onChange={(maxChunkRadius) => updateConfig({ maxChunkRadius })}
                />
                <SelectField
                  label="Climate distribution"
                  value={worldConfig.worldClimate}
                  options={WORLD_CLIMATE_OPTIONS}
                  onChange={(worldClimate) => updateConfig({ worldClimate })}
                />
                <SelectField
                  label="Starting climate"
                  value={worldConfig.startingClimate}
                  options={STARTING_CLIMATE_OPTIONS}
                  onChange={(startingClimate) => updateConfig({ startingClimate })}
                />
                <NumberSelectField
                  label="Pole-equator distance"
                  value={worldConfig.polarEquatorDistance}
                  options={POLAR_EQUATOR_DISTANCE_OPTIONS}
                  onChange={(polarEquatorDistance) => updateConfig({ polarEquatorDistance })}
                />
                <SelectField
                  label="World edge"
                  value={worldConfig.worldEdge}
                  options={WORLD_EDGE_OPTIONS}
                  onChange={(worldEdge) => updateConfig({ worldEdge })}
                />
                <NumberSelectField
                  label="Landcover"
                  value={worldConfig.landcover}
                  options={LANDCOVER_OPTIONS}
                  onChange={(landcover) => updateConfig({ landcover })}
                />
                <NumberSelectField
                  label="Landcover scale"
                  value={worldConfig.oceanscale}
                  options={OCEAN_SCALE_OPTIONS}
                  onChange={(oceanscale) => updateConfig({ oceanscale })}
                />
                <NumberSelectField
                  label="Upheaval"
                  value={worldConfig.upheavelCommonness}
                  options={UPHEAVAL_COMMONNESS_OPTIONS}
                  onChange={(upheavelCommonness) => updateConfig({ upheavelCommonness })}
                />
                <NumberSelectField
                  label="Geologic activity"
                  value={worldConfig.geologicActivity}
                  options={GEOLOGIC_ACTIVITY_OPTIONS}
                  onChange={(geologicActivity) => updateConfig({ geologicActivity })}
                />
                <NumberSelectField
                  label="Landform scale"
                  value={worldConfig.landformScale}
                  options={LANDFORM_SCALE_OPTIONS}
                  onChange={(landformScale) => updateConfig({ landformScale })}
                />
                <NumberSelectField
                  label="Temperature"
                  value={worldConfig.globalTemperature}
                  options={GLOBAL_TEMPERATURE_OPTIONS}
                  onChange={(globalTemperature) => updateConfig({ globalTemperature })}
                />
                <NumberSelectField
                  label="Precipitation"
                  value={worldConfig.globalPrecipitation}
                  options={GLOBAL_PRECIPITATION_OPTIONS}
                  onChange={(globalPrecipitation) => updateConfig({ globalPrecipitation })}
                />
                <NumberSelectField
                  label="Forestation"
                  value={worldConfig.globalForestation}
                  options={GLOBAL_FORESTATION_OPTIONS}
                  onChange={(globalForestation) => updateConfig({ globalForestation })}
                />
                <NumberSelectField
                  label="Ore deposit rate"
                  value={worldConfig.globalDepositSpawnRate}
                  options={GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS}
                  onChange={(globalDepositSpawnRate) => updateConfig({ globalDepositSpawnRate })}
                />
                <NumberSelectField
                  label="Surface copper"
                  value={worldConfig.surfaceCopperDeposits}
                  options={SURFACE_COPPER_DEPOSIT_OPTIONS}
                  onChange={(surfaceCopperDeposits) => updateConfig({ surfaceCopperDeposits })}
                />
                <NumberSelectField
                  label="Surface tin"
                  value={worldConfig.surfaceTinDeposits}
                  options={SURFACE_TIN_DEPOSIT_OPTIONS}
                  onChange={(surfaceTinDeposits) => updateConfig({ surfaceTinDeposits })}
                />
              </div>
            </CreateSection>

            <CreateSection title="Survival">
              <div className="grid gap-4 lg:grid-cols-4">
                <NumberSelectField
                  label="Days per month"
                  value={worldConfig.daysPerMonth}
                  options={DAYS_PER_MONTH_OPTIONS}
                  onChange={(daysPerMonth) => updateConfig({ daysPerMonth })}
                />
                <NumberSelectField
                  label="Enemy grace days"
                  value={worldConfig.graceTimer}
                  options={GRACE_TIMER_OPTIONS}
                  onChange={(graceTimer) => updateConfig({ graceTimer })}
                />
                <SelectField
                  label="Creature hostility"
                  value={worldConfig.creatureHostility}
                  options={CREATURE_HOSTILITY_OPTIONS}
                  onChange={(creatureHostility) => updateConfig({ creatureHostility })}
                />
                <NumberSelectField
                  label="Creature strength"
                  value={worldConfig.creatureStrength}
                  options={CREATURE_STRENGTH_OPTIONS}
                  onChange={(creatureStrength) => updateConfig({ creatureStrength })}
                />
                <SelectField
                  label="Seasons"
                  value={worldConfig.seasons}
                  options={SEASON_OPTIONS}
                  onChange={(seasons) => updateConfig({ seasons })}
                />
                <SelectField
                  label="Death punishment"
                  value={worldConfig.deathPunishment}
                  options={DEATH_PUNISHMENT_OPTIONS}
                  onChange={(deathPunishment) => updateConfig({ deathPunishment })}
                />
                <NumberSelectField
                  label="Spawn radius"
                  value={worldConfig.spawnRadius}
                  options={SPAWN_RADIUS_OPTIONS}
                  onChange={(spawnRadius) => updateConfig({ spawnRadius })}
                />
                <NumberSelectField
                  label="Player lives"
                  value={worldConfig.playerLives}
                  options={PLAYER_LIVES_OPTIONS}
                  onChange={(playerLives) => updateConfig({ playerLives })}
                />
                <NumberSelectField
                  label="Health points"
                  value={worldConfig.playerHealthPoints}
                  options={PLAYER_HEALTH_POINTS_OPTIONS}
                  onChange={(playerHealthPoints) => updateConfig({ playerHealthPoints })}
                />
                <NumberSelectField
                  label="Hunger speed"
                  value={worldConfig.playerHungerSpeed}
                  options={PLAYER_HUNGER_SPEED_OPTIONS}
                  onChange={(playerHungerSpeed) => updateConfig({ playerHungerSpeed })}
                />
                <NumberSelectField
                  label="Move speed"
                  value={worldConfig.playerMoveSpeed}
                  options={PLAYER_MOVE_SPEED_OPTIONS}
                  onChange={(playerMoveSpeed) => updateConfig({ playerMoveSpeed })}
                />
                <NumberSelectField
                  label="Health regen"
                  value={worldConfig.playerHealthRegenSpeed}
                  options={PLAYER_HEALTH_REGEN_SPEED_OPTIONS}
                  onChange={(playerHealthRegenSpeed) => updateConfig({ playerHealthRegenSpeed })}
                />
                <NumberSelectField
                  label="Food spoil speed"
                  value={worldConfig.foodSpoilSpeed}
                  options={FOOD_SPOIL_SPEED_OPTIONS}
                  onChange={(foodSpoilSpeed) => updateConfig({ foodSpoilSpeed })}
                />
                <NumberSelectField
                  label="Sapling growth"
                  value={worldConfig.saplingGrowthRate}
                  options={SAPLING_GROWTH_RATE_OPTIONS}
                  onChange={(saplingGrowthRate) => updateConfig({ saplingGrowthRate })}
                />
                <NumberSelectField
                  label="Tool durability"
                  value={worldConfig.toolDurability}
                  options={TOOL_DURABILITY_OPTIONS}
                  onChange={(toolDurability) => updateConfig({ toolDurability })}
                />
                <NumberSelectField
                  label="Tool mining speed"
                  value={worldConfig.toolMiningSpeed}
                  options={TOOL_MINING_SPEED_OPTIONS}
                  onChange={(toolMiningSpeed) => updateConfig({ toolMiningSpeed })}
                />
                <SelectField
                  label="Block gravity"
                  value={worldConfig.blockGravity}
                  options={BLOCK_GRAVITY_OPTIONS}
                  onChange={(blockGravity) => updateConfig({ blockGravity })}
                />
                <SelectField
                  label="Cave-ins"
                  value={worldConfig.caveIns}
                  options={CAVE_IN_OPTIONS}
                  onChange={(caveIns) => updateConfig({ caveIns })}
                />
              </div>
            </CreateSection>

            <CreateSection title="Temporal">
              <div className="grid gap-4 lg:grid-cols-4">
                <SelectField
                  label="Temporal storms"
                  value={worldConfig.temporalStorms}
                  options={TEMPORAL_STORM_OPTIONS}
                  onChange={(temporalStorms) => updateConfig({ temporalStorms })}
                />
                <SelectField
                  label="Temporal rifts"
                  value={worldConfig.temporalRifts}
                  options={TEMPORAL_RIFT_OPTIONS}
                  onChange={(temporalRifts) => updateConfig({ temporalRifts })}
                />
                <ToggleField
                  label="Temporal stability"
                  checked={worldConfig.temporalStability}
                  onChange={(temporalStability) => updateConfig({ temporalStability })}
                />
                <ToggleField
                  label="Sleep during storms"
                  checked={worldConfig.temporalStormSleeping}
                  onChange={(temporalStormSleeping) => updateConfig({ temporalStormSleeping })}
                />
              </div>
            </CreateSection>

            <CreateSection title="Server Access">
              <div className="grid gap-4 lg:grid-cols-4">
                <Field label="Password" className="lg:col-span-2">
                  <Input
                    value={serverPassword}
                    onChange={(e) => setServerPassword(e.target.value)}
                  />
                </Field>
                <ToggleField
                  label="Development"
                  checked={development}
                  onChange={setDevelopmentMode}
                />
                <ToggleField
                  label="Advertise"
                  checked={advertiseServer}
                  onChange={setAdvertiseServer}
                />
                <ToggleField
                  label="Whitelist"
                  checked={development || worldConfig.whitelistMode}
                  onChange={(whitelistMode) => updateConfig({ whitelistMode })}
                />
                <ToggleField
                  label="Pass time empty"
                  checked={worldConfig.passTimeWhenEmpty}
                  onChange={(passTimeWhenEmpty) => updateConfig({ passTimeWhenEmpty })}
                />
                <ToggleField
                  label="Allow PvP"
                  checked={worldConfig.allowPvp}
                  onChange={(allowPvp) => updateConfig({ allowPvp })}
                />
                <ToggleField
                  label="Fire spread"
                  checked={worldConfig.allowFireSpread}
                  onChange={(allowFireSpread) => updateConfig({ allowFireSpread })}
                />
                <ToggleField
                  label="Falling blocks"
                  checked={worldConfig.allowFallingBlocks}
                  onChange={(allowFallingBlocks) => updateConfig({ allowFallingBlocks })}
                />
                <ToggleField
                  label="Underground farming"
                  checked={worldConfig.allowUndergroundFarming}
                  onChange={(allowUndergroundFarming) => updateConfig({ allowUndergroundFarming })}
                />
                <ToggleField
                  label="World map"
                  checked={worldConfig.allowMap}
                  onChange={(allowMap) => updateConfig({ allowMap })}
                />
                <ToggleField
                  label="Coordinate HUD"
                  checked={worldConfig.allowCoordinateHud}
                  onChange={(allowCoordinateHud) => updateConfig({ allowCoordinateHud })}
                />
                <ToggleField
                  label="Colored map"
                  checked={worldConfig.colorAccurateWorldmap}
                  onChange={(colorAccurateWorldmap) => updateConfig({ colorAccurateWorldmap })}
                />
                <ToggleField
                  label="Land claiming"
                  checked={worldConfig.allowLandClaiming}
                  onChange={(allowLandClaiming) => updateConfig({ allowLandClaiming })}
                />
                <ToggleField
                  label="Lore content"
                  checked={worldConfig.loreContent}
                  onChange={(loreContent) => updateConfig({ loreContent })}
                />
                <ToggleField
                  label="Class recipes"
                  checked={worldConfig.classExclusiveRecipes}
                  onChange={(classExclusiveRecipes) => updateConfig({ classExclusiveRecipes })}
                />
                <ToggleField
                  label="Harsh winters"
                  checked={worldConfig.harshWinters}
                  onChange={(harshWinters) => updateConfig({ harshWinters })}
                />
                <ToggleField
                  label="Snow accumulation"
                  checked={worldConfig.snowAccum}
                  onChange={(snowAccum) => updateConfig({ snowAccum })}
                />
                <Field label="Server description" className="lg:col-span-2">
                  <Textarea
                    value={description}
                    rows={3}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Field>
                <Field label="Welcome message" className="lg:col-span-2">
                  <Textarea
                    value={welcomeMessage}
                    rows={3}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                  />
                </Field>
              </div>
            </CreateSection>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            Create server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-muted/20 p-3.5">
      <h3 className="mb-3 font-heading text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(numberInput(e.target.value, value))}
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
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function numberInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
