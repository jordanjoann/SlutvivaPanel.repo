import { describe, expect, it } from "vitest";
import {
  clothingAssetId,
  clothingGender,
  componentHintsFromEntries,
  inferClothingTarget,
  isSupportedClothingUpload,
  matchingTextureEntries,
  previewEntryFromEntries,
  sanitizeClothingUploadFileName,
} from "./clothing-assets";
import { isSortableClothingTarget } from "@/lib/gta-clothing";

describe("GTA clothing asset inference", () => {
  it("detects component hints from FiveM and SP filenames", () => {
    expect(
      componentHintsFromEntries([
        "FiveM/female/mp_f_freemode_01_mp_f_bikerdlc_01^hand_007_u.ydd",
        "SP/lowr_diff_000_a_uni.ytd",
        "Ruffle_Corset_Top/jbib_000_u.ydd",
        "Exported/mp_f_freemode_01_sv_mesh^uppr_000_u.ydd.xml",
        "Props/mp_f_freemode_01_p_head_000_u.ydd",
      ]),
    ).toEqual(["hand", "jbib", "lowr", "p_head", "uppr"]);
  });

  it("uses folder and component names to suggest organizer targets", () => {
    expect(
      inferClothingTarget("Femme/Tops_dresses/Gucci_Dress.zip", ["Gucci_Dress/jbib_000_u.ydd"]),
    ).toBe("dress");
    expect(
      inferClothingTarget("Femme/Pants_Skirts/Denim_Skirt.zip", ["Denim_Skirt/accs_000_u.ydd"]),
    ).toBe("skirt");
    expect(
      inferClothingTarget("Femme/Accessories/Heart_Choker.zip", ["Heart_Choker/teef_000_u.ydd"]),
    ).toBe("accessory");
    expect(
      inferClothingTarget("Installed/slutvival-clothing/stream/sv_killsy_backpack", [
        "mp_f_freemode_01_sv_killsy_backpack^hand_000_u.ydd",
      ]),
    ).toBe("backpack");
    expect(
      inferClothingTarget("Femme/Undershirts/Basic_TShirt.zip", ["Basic_TShirt/accs_000_u.ydd"]),
    ).toBe("undershirt");
    expect(
      inferClothingTarget("Femme/Hats/Kitty_Beanie.zip", [
        "mp_f_freemode_01_p_head_000_u.ydd",
      ]),
    ).toBe("hat");
    expect(
      inferClothingTarget("Femme/Watches/Gold_Watch.zip", [
        "mp_f_freemode_01_p_lwrist_000_u.ydd",
      ]),
    ).toBe("watches");
    expect(
      inferClothingTarget("Inbox/Gloves/mp_f_freemode_01_gloves^uppr_000_u.ydd", [
        "mp_f_freemode_01_gloves^uppr_000_u.ydd",
      ]),
    ).toBe("arms");
  });

  it("prefers a named preview image near the archive root", () => {
    expect(
      previewEntryFromEntries(
        [
          "Nested/preview.png",
          "Gucci_Dress/Gucci_Dress.gif",
          "Gucci_Dress/jbib_000_u.ydd",
        ],
        "Gucci Dress",
      ),
    ).toBe("Gucci_Dress/Gucci_Dress.gif");
  });

  it("matches texture variants to the nearest drawable folder", () => {
    const entries = [
      { path: "V1/Female/mp_f_freemode_01_pack^uppr_000_u.ydd", extension: ".ydd" },
      { path: "V1/Female/mp_f_freemode_01_pack^uppr_diff_000_a_uni.ytd", extension: ".ytd" },
      { path: "V1/Female/mp_f_freemode_01_pack^uppr_diff_000_b_uni.ytd", extension: ".ytd" },
      { path: "V2/Female/mp_f_freemode_01_pack^uppr_diff_000_a_uni.ytd", extension: ".ytd" },
      { path: "V1/Female/mp_f_freemode_01_other^uppr_diff_000_c_uni.ytd", extension: ".ytd" },
    ];

    expect(matchingTextureEntries(entries[0].path, entries).map((entry) => entry.path)).toEqual([
      entries[1].path,
      entries[2].path,
    ]);
  });

  it("uses renderer-compatible stable ids and gender detection", () => {
    expect(
      clothingAssetId("Femme/Test.zip#FiveM/Female/mp_f_freemode_01_test^uppr_000_u.ydd"),
    ).toBe("9209e6a949adb6f9");
    expect(clothingGender("FiveM/Female/mp_f_freemode_01_test^uppr_000_u.ydd")).toBe(
      "female",
    );
    expect(clothingGender("FiveM/Male/mp_m_freemode_01_test^jbib_000_u.ydd")).toBe("male");
  });

  it("accepts renderable GTA resource uploads without treating YML as YMT", () => {
    expect(isSupportedClothingUpload("collection.ymt")).toBe(true);
    expect(isSupportedClothingUpload("female_top.ydd")).toBe(true);
    expect(isSupportedClothingUpload("female_top.ytd")).toBe(true);
    expect(isSupportedClothingUpload("clothing.yml")).toBe(false);
    expect(isSupportedClothingUpload("drawable.ydd.xml")).toBe(false);
    expect(sanitizeClothingUploadFileName("../female top^jbib_000_u.ydd")).toBe(
      "female top^jbib_000_u.ydd",
    );
  });

  it("keeps body meshes out of the clothing sorter", () => {
    expect(
      inferClothingTarget("Native/base/female/head_000_u.ydd", ["head_000_u.ydd"]),
    ).toBe("body");
    expect(isSortableClothingTarget("body")).toBe(false);
    expect(isSortableClothingTarget("shirt")).toBe(true);
  });
});
