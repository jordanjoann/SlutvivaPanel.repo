import { describe, expect, it } from "vitest";
import {
  DAYS_PER_MONTH_OPTIONS,
  GEOLOGIC_ACTIVITY_OPTIONS,
  GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS,
  GLOBAL_FORESTATION_OPTIONS,
  GLOBAL_PRECIPITATION_OPTIONS,
  GLOBAL_TEMPERATURE_OPTIONS,
  LANDCOVER_OPTIONS,
  LANDFORM_SCALE_OPTIONS,
  OCEAN_SCALE_OPTIONS,
  PLAYER_HUNGER_SPEED_OPTIONS,
  PLAYER_LIVES_OPTIONS,
  POLAR_EQUATOR_DISTANCE_OPTIONS,
  SPAWN_RADIUS_OPTIONS,
  SURFACE_COPPER_DEPOSIT_OPTIONS,
  SURFACE_TIN_DEPOSIT_OPTIONS,
  TOOL_DURABILITY_OPTIONS,
  TOOL_MINING_SPEED_OPTIONS,
  WORLD_SIZE_OPTIONS,
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
      label: "Very rare (20%)",
    });
    expect(GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS).toContainEqual({
      value: 1,
      label: "Normal (100%)",
    });
    expect(GLOBAL_DEPOSIT_SPAWN_RATE_OPTIONS).toContainEqual({
      value: 3,
      label: "Very common (300%)",
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
      { value: 0.4, label: "Very common" },
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
});
