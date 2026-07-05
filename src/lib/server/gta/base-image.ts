import path from "node:path";
import type Docker from "dockerode";

export async function ensureFxServerBaseImage(
  docker: Pick<Docker, "getImage" | "buildImage" | "modem">,
  image: string,
  onLog?: (message: string) => void,
): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch (error) {
    if (!isDockerNotFound(error)) throw error;
  }

  onLog?.(`[Install] Building Docker image ${image}.`);
  const context = path.join(process.cwd(), "docker", "fxserver-base");
  const stream = await docker.buildImage({ context, src: ["Dockerfile"] }, { t: image });
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function isDockerNotFound(error: unknown): error is { statusCode: 404 } {
  return typeof error === "object" && error !== null && (error as { statusCode?: number }).statusCode === 404;
}
