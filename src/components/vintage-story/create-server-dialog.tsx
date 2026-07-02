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
  DEATH_PUNISHMENT_OPTIONS,
  DEFAULT_WORLD_GENERATION_CONFIG,
  GAME_MODE_OPTIONS,
  SEASON_OPTIONS,
  STARTING_CLIMATE_OPTIONS,
  TEMPORAL_RIFT_OPTIONS,
  TEMPORAL_STORM_OPTIONS,
  VINTAGE_STORY_PLAY_STYLES,
  WORLD_CLIMATE_OPTIONS,
  WORLD_EDGE_OPTIONS,
  WORLD_TYPE_OPTIONS,
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
                <NumberField
                  label="World width"
                  value={worldConfig.worldWidth}
                  min={32}
                  onChange={(worldWidth) => updateConfig({ worldWidth })}
                />
                <NumberField
                  label="World length"
                  value={worldConfig.worldLength}
                  min={32}
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
                <NumberField
                  label="Pole-equator distance"
                  value={worldConfig.polarEquatorDistance}
                  min={1000}
                  onChange={(polarEquatorDistance) => updateConfig({ polarEquatorDistance })}
                />
                <SelectField
                  label="World edge"
                  value={worldConfig.worldEdge}
                  options={WORLD_EDGE_OPTIONS}
                  onChange={(worldEdge) => updateConfig({ worldEdge })}
                />
                <NumberField
                  label="Landcover"
                  value={worldConfig.landcover}
                  min={0}
                  max={1}
                  step={0.025}
                  onChange={(landcover) => updateConfig({ landcover })}
                />
                <NumberField
                  label="Landcover scale"
                  value={worldConfig.oceanscale}
                  min={0.1}
                  max={5}
                  step={0.1}
                  onChange={(oceanscale) => updateConfig({ oceanscale })}
                />
                <NumberField
                  label="Upheaval"
                  value={worldConfig.upheavelCommonness}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(upheavelCommonness) => updateConfig({ upheavelCommonness })}
                />
                <NumberField
                  label="Geologic activity"
                  value={worldConfig.geologicActivity}
                  min={0}
                  max={0.4}
                  step={0.01}
                  onChange={(geologicActivity) => updateConfig({ geologicActivity })}
                />
                <NumberField
                  label="Landform scale"
                  value={worldConfig.landformScale}
                  min={0.2}
                  max={3}
                  step={0.1}
                  onChange={(landformScale) => updateConfig({ landformScale })}
                />
                <NumberField
                  label="Temperature"
                  value={worldConfig.globalTemperature}
                  min={0}
                  max={5}
                  step={0.1}
                  onChange={(globalTemperature) => updateConfig({ globalTemperature })}
                />
                <NumberField
                  label="Precipitation"
                  value={worldConfig.globalPrecipitation}
                  min={0}
                  max={5}
                  step={0.1}
                  onChange={(globalPrecipitation) => updateConfig({ globalPrecipitation })}
                />
                <NumberField
                  label="Forestation"
                  value={worldConfig.globalForestation}
                  min={-1}
                  max={1}
                  step={0.1}
                  onChange={(globalForestation) => updateConfig({ globalForestation })}
                />
                <NumberField
                  label="Ore deposit rate"
                  value={worldConfig.globalDepositSpawnRate}
                  min={0}
                  step={0.1}
                  onChange={(globalDepositSpawnRate) => updateConfig({ globalDepositSpawnRate })}
                />
                <NumberField
                  label="Surface copper"
                  value={worldConfig.surfaceCopperDeposits}
                  min={0}
                  max={5}
                  step={0.01}
                  onChange={(surfaceCopperDeposits) => updateConfig({ surfaceCopperDeposits })}
                />
                <NumberField
                  label="Surface tin"
                  value={worldConfig.surfaceTinDeposits}
                  min={0}
                  max={5}
                  step={0.001}
                  onChange={(surfaceTinDeposits) => updateConfig({ surfaceTinDeposits })}
                />
              </div>
            </CreateSection>

            <CreateSection title="Survival">
              <div className="grid gap-4 lg:grid-cols-4">
                <NumberField
                  label="Days per month"
                  value={worldConfig.daysPerMonth}
                  min={1}
                  onChange={(daysPerMonth) => updateConfig({ daysPerMonth })}
                />
                <NumberField
                  label="Enemy grace days"
                  value={worldConfig.graceTimer}
                  min={0}
                  onChange={(graceTimer) => updateConfig({ graceTimer })}
                />
                <SelectField
                  label="Creature hostility"
                  value={worldConfig.creatureHostility}
                  options={CREATURE_HOSTILITY_OPTIONS}
                  onChange={(creatureHostility) => updateConfig({ creatureHostility })}
                />
                <NumberField
                  label="Creature strength"
                  value={worldConfig.creatureStrength}
                  min={0}
                  max={99}
                  step={0.1}
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
                <NumberField
                  label="Spawn radius"
                  value={worldConfig.spawnRadius}
                  min={0}
                  onChange={(spawnRadius) => updateConfig({ spawnRadius })}
                />
                <NumberField
                  label="Player lives"
                  value={worldConfig.playerLives}
                  min={-1}
                  onChange={(playerLives) => updateConfig({ playerLives })}
                />
                <NumberField
                  label="Health points"
                  value={worldConfig.playerHealthPoints}
                  min={1}
                  onChange={(playerHealthPoints) => updateConfig({ playerHealthPoints })}
                />
                <NumberField
                  label="Hunger speed"
                  value={worldConfig.playerHungerSpeed}
                  min={0}
                  max={10}
                  step={0.1}
                  onChange={(playerHungerSpeed) => updateConfig({ playerHungerSpeed })}
                />
                <NumberField
                  label="Move speed"
                  value={worldConfig.playerMoveSpeed}
                  min={0}
                  max={10}
                  step={0.1}
                  onChange={(playerMoveSpeed) => updateConfig({ playerMoveSpeed })}
                />
                <NumberField
                  label="Health regen"
                  value={worldConfig.playerHealthRegenSpeed}
                  min={0.25}
                  max={2}
                  step={0.05}
                  onChange={(playerHealthRegenSpeed) => updateConfig({ playerHealthRegenSpeed })}
                />
                <NumberField
                  label="Food spoil speed"
                  value={worldConfig.foodSpoilSpeed}
                  min={0}
                  max={10}
                  step={0.1}
                  onChange={(foodSpoilSpeed) => updateConfig({ foodSpoilSpeed })}
                />
                <NumberField
                  label="Sapling growth"
                  value={worldConfig.saplingGrowthRate}
                  min={0}
                  step={0.1}
                  onChange={(saplingGrowthRate) => updateConfig({ saplingGrowthRate })}
                />
                <NumberField
                  label="Tool durability"
                  value={worldConfig.toolDurability}
                  min={0}
                  max={99}
                  step={0.1}
                  onChange={(toolDurability) => updateConfig({ toolDurability })}
                />
                <NumberField
                  label="Tool mining speed"
                  value={worldConfig.toolMiningSpeed}
                  min={0}
                  max={99}
                  step={0.1}
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
