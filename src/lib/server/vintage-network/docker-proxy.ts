import type Docker from "dockerode";
import { config } from "@/lib/server/config";
import { NIMBUS_PROXY_CONTAINER } from "./constants";

const NIMBUS_PROXY_IMAGE = "mcr.microsoft.com/dotnet/aspnet:10.0";

let dockerClient: Docker | null = null;
async function docker(): Promise<Docker> {
  if (!dockerClient) {
    const { default: DockerClient } = await import("dockerode");
    dockerClient = new DockerClient({ socketPath: config.docker.socket });
  }
  return dockerClient;
}

export function nimbusProxyContainerSpec(runtimeDir: string): Docker.ContainerCreateOptions {
  const publicPort = String(config.vintageNetwork.publicPort);
  return {
    name: NIMBUS_PROXY_CONTAINER,
    Image: NIMBUS_PROXY_IMAGE,
    WorkingDir: "/nimbus",
    Cmd: ["dotnet", "Nimbus.Proxy.dll"],
    ExposedPorts: {
      [`${publicPort}/tcp`]: {},
      [`${publicPort}/udp`]: {},
      [`${config.vintageNetwork.registryPort}/tcp`]: {},
    },
    Labels: {
      "slutvival.panel.managed": "true",
      "slutvival.panel.component": "nimbus-proxy",
    },
    HostConfig: {
      Binds: [`${runtimeDir}:/nimbus:rw`],
      NetworkMode: config.docker.network,
      PortBindings: {
        [`${publicPort}/tcp`]: [{ HostPort: publicPort }],
        [`${publicPort}/udp`]: [{ HostPort: publicPort }],
      },
      RestartPolicy: { Name: "unless-stopped" },
    },
  };
}

export async function isNimbusProxyRunning(): Promise<boolean> {
  try {
    const info = await (await docker()).getContainer(NIMBUS_PROXY_CONTAINER).inspect();
    return Boolean(info.State.Running);
  } catch (error) {
    if (isDockerNotFound(error)) return false;
    throw error;
  }
}

export async function ensureNimbusProxy(runtimeDir: string): Promise<void> {
  const container = (await docker()).getContainer(NIMBUS_PROXY_CONTAINER);
  const desired = nimbusProxyContainerSpec(runtimeDir);
  try {
    const info = await container.inspect();
    const currentBinds = info.HostConfig.Binds ?? [];
    const desiredBinds = desired.HostConfig?.Binds ?? [];
    const currentPorts = info.HostConfig.PortBindings ?? {};
    const desiredPorts = desired.HostConfig?.PortBindings ?? {};
    const recreate =
      info.Config.Image !== desired.Image ||
      info.HostConfig.NetworkMode !== config.docker.network ||
      JSON.stringify(currentBinds) !== JSON.stringify(desiredBinds) ||
      JSON.stringify(currentPorts) !== JSON.stringify(desiredPorts);
    if (recreate) {
      if (info.State.Running) await container.stop({ t: 15 });
      await container.remove({ force: true });
    } else {
      if (!info.State.Running) await container.start();
      return;
    }
  } catch (error) {
    if (!isDockerNotFound(error)) throw error;
  }

  await ensureImage(NIMBUS_PROXY_IMAGE);
  await (await docker()).createContainer(desired);
  await container.start();
}

async function ensureImage(image: string): Promise<void> {
  try {
    await (await docker()).getImage(image).inspect();
    return;
  } catch (error) {
    if (!isDockerNotFound(error)) throw error;
  }

  const client = await docker();
  const stream = await client.pull(image);
  await new Promise<void>((resolve, reject) => {
    client.modem.followProgress(stream, (error: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function isDockerNotFound(error: unknown): error is { statusCode: 404 } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404
  );
}
