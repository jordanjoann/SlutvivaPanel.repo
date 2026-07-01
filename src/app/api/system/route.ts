import { config } from "@/lib/server/config";
import { dockerAvailable } from "@/lib/server/runtimes/docker";
import { metrics } from "@/lib/server/metrics";
import { json, serverError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const host = await metrics.collectHost();
    const docker = await dockerAvailable();
    return json({
      paths: {
        root: config.root,
        games: config.gamesRoot,
        vintageStory: config.vintageStoryRoot,
      },
      docker: {
        network: config.docker.network,
        socket: config.docker.socket,
        image: config.docker.image,
        available: docker,
      },
      domains: config.domains,
      runtime: config.preferredRuntime,
      platform: process.platform,
      hostname: config.hostname,
      storage: {
        diskUsedMB: host.diskUsedMB,
        diskTotalMB: host.diskTotalMB,
        memUsedMB: host.memUsedMB,
        memTotalMB: host.memTotalMB,
      },
      live: host.live,
    });
  } catch (e) {
    return serverError(e);
  }
}
