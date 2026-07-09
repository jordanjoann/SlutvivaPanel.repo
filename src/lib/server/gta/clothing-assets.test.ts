import { describe, expect, it } from "vitest";
import {
  componentHintsFromEntries,
  inferClothingTarget,
  previewEntryFromEntries,
} from "./clothing-assets";

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
});
