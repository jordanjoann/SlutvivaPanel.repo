import { describe, expect, it, vi } from "vitest";
import { ensureFxServerBaseImage } from "./base-image";

describe("FXServer base image", () => {
  it("does not build when the image already exists", async () => {
    const docker = {
      getImage: vi.fn(() => ({ inspect: vi.fn().mockResolvedValue({}) })),
      buildImage: vi.fn(),
      modem: { followProgress: vi.fn() },
    };

    await ensureFxServerBaseImage(docker as never, "slutvival/fxserver-base:bookworm");

    expect(docker.buildImage).not.toHaveBeenCalled();
  });

  it("builds the local image when it is missing", async () => {
    const followProgress = vi.fn((_stream, cb: (err: Error | null) => void) => cb(null));
    const docker = {
      getImage: vi.fn(() => ({ inspect: vi.fn().mockRejectedValue({ statusCode: 404 }) })),
      buildImage: vi.fn().mockResolvedValue({}),
      modem: { followProgress },
    };

    await ensureFxServerBaseImage(docker as never, "slutvival/fxserver-base:bookworm");

    expect(docker.buildImage).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.stringContaining("docker/fxserver-base") }),
      { t: "slutvival/fxserver-base:bookworm" },
    );
    expect(followProgress).toHaveBeenCalled();
  });
});
