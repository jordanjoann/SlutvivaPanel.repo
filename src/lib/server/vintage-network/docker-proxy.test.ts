import { describe, expect, it } from "vitest";
import { nimbusProxyContainerSpec } from "./docker-proxy";

describe("nimbusProxyContainerSpec", () => {
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
    expect(spec.WorkingDir).toBe("/nimbus");
    expect(spec.Cmd).toEqual(["dotnet", "Nimbus.Proxy.dll"]);
  });
});
