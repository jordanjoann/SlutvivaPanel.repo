#!/usr/bin/env python3
"""Render GTA clothing stream assets to transparent catalog PNGs.

This renderer intentionally targets CodeWalker/Sollumz XML exports instead of
raw .ydd/.ytd binaries. Raw binary import still belongs to Blender + Sollumz +
PyMateria on Windows; XML exports are plain geometry and can be rendered with
only the Python standard library.
"""

from __future__ import annotations

import argparse
import math
import re
import struct
import sys
import time
import xml.etree.ElementTree as ET
import zlib
from dataclasses import dataclass
from pathlib import Path


DEFAULT_INPUT_ROOT = Path("games/gta/los-santos/server-data/resources/[mods]/slutvival-clothing/stream")
DEFAULT_OUTPUT_ROOT = Path(
    "games/gta/los-santos/server-data/resources/[mods]/slutvival-clothing-audit/data/asset-renders"
)

COMPONENT_SUFFIX_RE = re.compile(r"_\d{3}(?:_[a-z])?(?:_[a-z]+)?$", re.IGNORECASE)
DIFF_SUFFIX_RE = re.compile(r"_diff_\d{3}(?:_[a-z])?(?:_[a-z]+)?$", re.IGNORECASE)


@dataclass
class Mesh:
    name: str
    vertices: list[tuple[float, float, float]]
    triangles: list[tuple[int, int, int]]


@dataclass
class RenderJob:
    key: str
    source: Path
    output: Path


def main() -> int:
    args = parse_args()
    input_root = args.input_root.resolve()
    output_root = args.output_root.resolve()

    if args.sollumz_path:
        print(
            "Note: --sollumz-path is accepted for workflow compatibility, "
            "but XML rendering does not load Sollumz."
        )

    if not input_root.exists():
        print(f"Input root does not exist: {input_root}", file=sys.stderr)
        return 2

    jobs = discover_jobs(input_root, output_root, force=args.force)
    if args.limit and args.limit > 0:
        jobs = jobs[: args.limit]

    if not jobs:
        raw_count = count_raw_assets(input_root)
        if raw_count:
            print(
                f"No .ydd.xml files were found under {input_root}. "
                f"Found {raw_count} raw .ydd files; export them through CodeWalker first."
            )
        else:
            print(f"No renderable clothing XML assets found under {input_root}.")
        return 0

    output_root.mkdir(parents=True, exist_ok=True)
    print(f"Rendering {len(jobs)} clothing asset preview(s)")
    print(f"Input:  {input_root}")
    print(f"Output: {output_root}")

    rendered = 0
    failed = 0
    started = time.time()

    for index, job in enumerate(jobs, start=1):
        try:
            meshes = read_drawable_xml(job.source)
            if not meshes:
                raise ValueError("no renderable geometry found")
            pixels, width, height = render_meshes(
                meshes,
                size=args.size,
                supersample=args.supersample,
                yaw_degrees=args.yaw,
                pitch_degrees=args.pitch,
            )
            write_png(job.output, width, height, pixels)
            rendered += 1
            print(f"[{index}/{len(jobs)}] {job.key} -> {job.output.name}")
        except Exception as exc:  # noqa: BLE001 - command-line batch should continue.
            failed += 1
            print(f"[{index}/{len(jobs)}] FAILED {job.source}: {exc}", file=sys.stderr)

    elapsed = time.time() - started
    print(f"Done: {rendered} rendered, {failed} failed in {elapsed:.1f}s")
    return 1 if failed else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render CodeWalker GTA clothing XML assets to PNG previews.")
    parser.add_argument("--input-root", type=Path, default=DEFAULT_INPUT_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--sollumz-path", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=0, help="Render only the first N pending assets.")
    parser.add_argument("--force", action="store_true", help="Re-render previews that already exist.")
    parser.add_argument("--size", type=int, default=768, help="Final square PNG size in pixels.")
    parser.add_argument("--supersample", type=int, default=2, help="Internal render scale for smoother edges.")
    parser.add_argument("--yaw", type=float, default=-18.0, help="Preview yaw in degrees.")
    parser.add_argument("--pitch", type=float, default=4.0, help="Preview pitch in degrees.")
    return parser.parse_args(blender_safe_argv())


def blender_safe_argv() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return sys.argv[1:]


def discover_jobs(input_root: Path, output_root: Path, force: bool) -> list[RenderJob]:
    jobs: list[RenderJob] = []
    seen: set[str] = set()
    for source in sorted(input_root.rglob("*.ydd.xml"), key=lambda item: str(item).lower()):
        key = stream_asset_key(source.name)
        if key in seen:
            continue
        seen.add(key)
        output = output_root / f"{render_file_name(key)}.png"
        if output.exists() and not force:
            continue
        jobs.append(RenderJob(key=key, source=source, output=output))
    return jobs


def count_raw_assets(input_root: Path) -> int:
    return sum(1 for path in input_root.rglob("*.ydd") if path.is_file())


def stream_asset_key(file_name: str) -> str:
    stem = strip_clothing_extension(Path(file_name).name)
    left_side = stem.split("^", 1)[0]
    without_model = re.sub(r"^mp_[fm]_freemode_01_", "", left_side)
    without_model = re.sub(r"^mp_[fm]_freemode_01$", "freemode", without_model)
    base = without_model or left_side or stem
    base = DIFF_SUFFIX_RE.sub("", base)
    base = COMPONENT_SUFFIX_RE.sub("", base)
    return base


def strip_clothing_extension(name: str) -> str:
    lower = name.lower()
    for suffix in (".ydd.xml", ".ytd.xml", ".ydd", ".ytd"):
        if lower.endswith(suffix):
            return name[: -len(suffix)]
    return Path(name).stem


def render_file_name(key: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", key)


def read_drawable_xml(source: Path) -> list[Mesh]:
    root = ET.parse(source).getroot()
    geometry_nodes = root.findall(".//DrawableModelsHigh//Geometries/Item")
    if not geometry_nodes:
        geometry_nodes = root.findall(".//Geometries/Item")

    meshes: list[Mesh] = []
    for idx, node in enumerate(geometry_nodes):
        vertex_data = node.find("./VertexBuffer/Data")
        if vertex_data is None or not vertex_data.text:
            continue

        vertices = parse_vertices(vertex_data.text)
        if not vertices:
            continue

        index_data = node.find("./IndexBuffer/Data")
        indices = parse_indices(index_data.text if index_data is not None else "")
        triangles = indices_to_triangles(indices, len(vertices))
        if not triangles:
            triangles = sequential_triangles(len(vertices))

        if triangles:
            meshes.append(Mesh(name=f"{source.stem}:{idx}", vertices=vertices, triangles=triangles))

    return meshes


def parse_vertices(text: str) -> list[tuple[float, float, float]]:
    vertices: list[tuple[float, float, float]] = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 3:
            continue
        try:
            vertices.append((float(parts[0]), float(parts[1]), float(parts[2])))
        except ValueError:
            continue
    return vertices


def parse_indices(text: str) -> list[int]:
    if not text:
        return []
    return [int(value) for value in re.findall(r"-?\d+", text)]


def indices_to_triangles(indices: list[int], vertex_count: int) -> list[tuple[int, int, int]]:
    triangles: list[tuple[int, int, int]] = []
    for index in range(0, len(indices) - 2, 3):
        tri = (indices[index], indices[index + 1], indices[index + 2])
        if all(0 <= value < vertex_count for value in tri) and len(set(tri)) == 3:
            triangles.append(tri)
    return triangles


def sequential_triangles(vertex_count: int) -> list[tuple[int, int, int]]:
    return [(index, index + 1, index + 2) for index in range(0, vertex_count - 2, 3)]


def render_meshes(
    meshes: list[Mesh],
    *,
    size: int,
    supersample: int,
    yaw_degrees: float,
    pitch_degrees: float,
) -> tuple[bytes, int, int]:
    supersample = max(1, min(4, supersample))
    render_size = max(128, min(4096, size)) * supersample
    width = height = render_size
    pixels = bytearray(width * height * 4)
    depth = [math.inf] * (width * height)

    transformed = transform_meshes(meshes, yaw_degrees, pitch_degrees)
    if not transformed:
        raise ValueError("no vertices after transform")

    min_x = min(vertex[0] for mesh in transformed for vertex in mesh.vertices)
    max_x = max(vertex[0] for mesh in transformed for vertex in mesh.vertices)
    min_z = min(vertex[2] for mesh in transformed for vertex in mesh.vertices)
    max_z = max(vertex[2] for mesh in transformed for vertex in mesh.vertices)
    span_x = max(max_x - min_x, 0.001)
    span_z = max(max_z - min_z, 0.001)
    pad = render_size * 0.1
    scale = min((render_size - pad * 2) / span_x, (render_size - pad * 2) / span_z)
    center_x = (min_x + max_x) * 0.5
    center_z = (min_z + max_z) * 0.5

    def project(vertex: tuple[float, float, float]) -> tuple[float, float, float]:
        x, y, z = vertex
        px = (x - center_x) * scale + width * 0.5
        py = height * 0.5 - (z - center_z) * scale
        return px, py, y

    for mesh in transformed:
        projected = [project(vertex) for vertex in mesh.vertices]
        for tri in mesh.triangles:
            v0 = mesh.vertices[tri[0]]
            v1 = mesh.vertices[tri[1]]
            v2 = mesh.vertices[tri[2]]
            shade = face_shade(v0, v1, v2)
            color = (
                int(178 * shade),
                int(185 * shade),
                int(196 * shade),
                255,
            )
            draw_triangle(pixels, depth, width, height, projected[tri[0]], projected[tri[1]], projected[tri[2]], color)

    if supersample > 1:
        pixels = downsample_rgba(pixels, width, height, supersample)
        width //= supersample
        height //= supersample

    return bytes(pixels), width, height


def transform_meshes(meshes: list[Mesh], yaw_degrees: float, pitch_degrees: float) -> list[Mesh]:
    yaw = math.radians(yaw_degrees)
    pitch = math.radians(pitch_degrees)
    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)

    out: list[Mesh] = []
    for mesh in meshes:
        vertices: list[tuple[float, float, float]] = []
        for x, y, z in mesh.vertices:
            rx = x * cy - y * sy
            ry = x * sy + y * cy
            rz = z
            py = ry * cp - rz * sp
            pz = ry * sp + rz * cp
            vertices.append((rx, py, pz))
        out.append(Mesh(mesh.name, vertices, mesh.triangles))
    return out


def face_shade(
    v0: tuple[float, float, float],
    v1: tuple[float, float, float],
    v2: tuple[float, float, float],
) -> float:
    ax, ay, az = v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]
    bx, by, bz = v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]
    nx = ay * bz - az * by
    ny = az * bx - ax * bz
    nz = ax * by - ay * bx
    length = math.sqrt(nx * nx + ny * ny + nz * nz)
    if length < 1e-8:
        return 0.72
    nx, ny, nz = nx / length, ny / length, nz / length
    lx, ly, lz = -0.35, -0.55, 0.76
    light = max(0.0, nx * lx + ny * ly + nz * lz)
    rim = abs(ny) * 0.15
    return max(0.38, min(1.0, 0.55 + light * 0.38 + rim))


def draw_triangle(
    pixels: bytearray,
    depth: list[float],
    width: int,
    height: int,
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    p2: tuple[float, float, float],
    color: tuple[int, int, int, int],
) -> None:
    area = edge(p0, p1, p2[0], p2[1])
    if abs(area) < 1e-6:
        return

    min_x = max(0, int(math.floor(min(p0[0], p1[0], p2[0]))))
    max_x = min(width - 1, int(math.ceil(max(p0[0], p1[0], p2[0]))))
    min_y = max(0, int(math.floor(min(p0[1], p1[1], p2[1]))))
    max_y = min(height - 1, int(math.ceil(max(p0[1], p1[1], p2[1]))))

    for y in range(min_y, max_y + 1):
        sample_y = y + 0.5
        for x in range(min_x, max_x + 1):
            sample_x = x + 0.5
            w0 = edge(p1, p2, sample_x, sample_y) / area
            w1 = edge(p2, p0, sample_x, sample_y) / area
            w2 = edge(p0, p1, sample_x, sample_y) / area
            if w0 < -0.0001 or w1 < -0.0001 or w2 < -0.0001:
                continue
            z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]
            idx = y * width + x
            if z >= depth[idx]:
                continue
            depth[idx] = z
            off = idx * 4
            pixels[off : off + 4] = bytes(color)


def edge(a: tuple[float, float, float], b: tuple[float, float, float], x: float, y: float) -> float:
    return (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0])


def downsample_rgba(pixels: bytearray, width: int, height: int, factor: int) -> bytearray:
    out_width = width // factor
    out_height = height // factor
    out = bytearray(out_width * out_height * 4)
    area = factor * factor

    for oy in range(out_height):
        for ox in range(out_width):
            total = [0, 0, 0, 0]
            for sy in range(factor):
                for sx in range(factor):
                    idx = ((oy * factor + sy) * width + (ox * factor + sx)) * 4
                    total[0] += pixels[idx]
                    total[1] += pixels[idx + 1]
                    total[2] += pixels[idx + 2]
                    total[3] += pixels[idx + 3]
            off = (oy * out_width + ox) * 4
            out[off : off + 4] = bytes(channel // area for channel in total)
    return out


def write_png(path: Path, width: int, height: int, rgba: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])

    with path.open("wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        write_chunk(handle, b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        write_chunk(handle, b"IDAT", zlib.compress(bytes(raw), level=6))
        write_chunk(handle, b"IEND", b"")


def write_chunk(handle, chunk_type: bytes, data: bytes) -> None:
    handle.write(struct.pack(">I", len(data)))
    handle.write(chunk_type)
    handle.write(data)
    checksum = zlib.crc32(chunk_type)
    checksum = zlib.crc32(data, checksum)
    handle.write(struct.pack(">I", checksum & 0xFFFFFFFF))


if __name__ == "__main__":
    raise SystemExit(main())
