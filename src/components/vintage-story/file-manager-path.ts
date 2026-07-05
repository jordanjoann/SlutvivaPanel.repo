export function displayFilePath(rootLabel: string, path: string): string {
  const root = `/${rootLabel.replace(/^\/+|\/+$/g, "")}`;
  const rel = path.replace(/^\/+/, "");
  return rel ? `${root}/${rel}` : root;
}
