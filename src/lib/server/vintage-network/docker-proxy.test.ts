import { beforeEach, describe, expect, it, vi } from "vitest";

const dockerMocks = vi.hoisted(() => ({
  createContainer: vi.fn(),
  followProgress: vi.fn(),
  getContainer: vi.fn(),
  getImage: vi.fn(),
  pull: vi.fn(),
}));

vi.mock("dockerode", () => ({
  default: class Docker {
    modem = { followProgress: dockerMocks.followProgress };
    createContainer = dockerMocks.createContainer;
    getContainer = dockerMocks.getContainer;
    getImage = dockerMocks.getImage;
    pull = dockerMocks.pull;
  },
}));

import { ensureNimbusProxy, nimbusProxyContainerSpec } from "./docker-proxy";

function dockerNotFound(): Error & { statusCode: 404 } {
  return Object.assign(new Error("not found"), { statusCode: 404 as const });
}

describe("nimbusProxyContainerSpec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes only the Nimbus public port", () => {
    const spec = nimbusProxyContainerSpec("/opt/slutvival/tools/nimbus/runtime");
    expect(spec.name).toBe("nimbus-proxy");
    expect(spec.HostConfig?.PortBindings).toEqual({
      "42420/tcp": [{ HostPort: "42420" }],
      "42420/udp": [{ HostPort: "42420" }],
    });
    expect(spec.HostConfig?.Binds).toContain("/opt/slutvival/tools/nimbus/runtime:/nimbus:rw");
  });

  it("runs Nimbus.Proxy.dll from the mounted runtime directory", () => {
    const spec = nimbusProxyContainerSpec("/opt/slutvival/tools/nimbus/runtime");
    expect(spec.Image).toBe("mcr.microsoft.com/dotnet/aspnet:10.0");
    expect(spec.WorkingDir).toBe("/nimbus");
    expect(spec.Cmd).toEqual(["dotnet", "Nimbus.Proxy.dll"]);
  });

  it("pulls the Nimbus proxy image before creating a missing container", async () => {
    const container = {
      inspect: vi.fn().mockRejectedValue(dockerNotFound()),
      start: vi.fn().mockResolvedValue(undefined),
    };
    dockerMocks.getContainer.mockReturnValue(container);
    dockerMocks.getImage.mockReturnValue({
      inspect: vi.fn().mockRejectedValue(dockerNotFound()),
    });
    const stream = {};
    dockerMocks.pull.mockResolvedValue(stream);
    dockerMocks.followProgress.mockImplementation((_stream, done) => done(null));
    dockerMocks.createContainer.mockResolvedValue({});

    await ensureNimbusProxy("/opt/slutvival/tools/nimbus/runtime");

    expect(dockerMocks.pull).toHaveBeenCalledWith("mcr.microsoft.com/dotnet/aspnet:10.0");
    expect(dockerMocks.createContainer).toHaveBeenCalled();
    expect(container.start).toHaveBeenCalled();
  });
});
