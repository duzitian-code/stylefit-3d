import json
import math
import struct
from pathlib import Path


def _align_bytes(data: bytes, fill: bytes = b"\x00") -> bytes:
    padding = (-len(data)) % 4
    return data + fill * padding


def _normalize(vector):
    length = math.sqrt(sum(component * component for component in vector)) or 1.0
    return tuple(component / length for component in vector)


def _cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _add_ellipsoid(primitives, center, radii, rings, segments, material):
    positions = []
    normals = []
    indices = []

    for ring in range(rings + 1):
        phi = math.pi * ring / rings
        sin_phi = math.sin(phi)
        cos_phi = math.cos(phi)

        for segment in range(segments + 1):
            theta = 2.0 * math.pi * segment / segments
            sin_theta = math.sin(theta)
            cos_theta = math.cos(theta)
            unit = (sin_phi * cos_theta, cos_phi, sin_phi * sin_theta)
            positions.append(
                (
                    center[0] + unit[0] * radii[0],
                    center[1] + unit[1] * radii[1],
                    center[2] + unit[2] * radii[2],
                )
            )
            normals.append(_normalize((unit[0] / radii[0], unit[1] / radii[1], unit[2] / radii[2])))

    row = segments + 1
    for ring in range(rings):
        for segment in range(segments):
            a = ring * row + segment
            b = a + row
            indices.extend((a, b, a + 1, a + 1, b, b + 1))

    primitives.append({"positions": positions, "normals": normals, "indices": indices, "material": material})


def _add_cylinder_between(primitives, start, end, radius, segments, material):
    axis = _normalize((end[0] - start[0], end[1] - start[1], end[2] - start[2]))
    reference = (0.0, 1.0, 0.0) if abs(axis[1]) < 0.92 else (1.0, 0.0, 0.0)
    tangent = _normalize(_cross(axis, reference))
    bitangent = _normalize(_cross(axis, tangent))
    positions = []
    normals = []
    indices = []

    for endpoint in (start, end):
      for segment in range(segments + 1):
        theta = 2.0 * math.pi * segment / segments
        normal = (
            tangent[0] * math.cos(theta) + bitangent[0] * math.sin(theta),
            tangent[1] * math.cos(theta) + bitangent[1] * math.sin(theta),
            tangent[2] * math.cos(theta) + bitangent[2] * math.sin(theta),
        )
        positions.append((endpoint[0] + normal[0] * radius, endpoint[1] + normal[1] * radius, endpoint[2] + normal[2] * radius))
        normals.append(normal)

    row = segments + 1
    for segment in range(segments):
      a = segment
      b = row + segment
      indices.extend((a, b, a + 1, a + 1, b, b + 1))

    primitives.append({"positions": positions, "normals": normals, "indices": indices, "material": material})


def _body_scale(profile: dict):
    profile = profile or {}
    height = float(profile.get("heightCm") or 168.0) / 168.0
    weight = float(profile.get("weightKg") or 58.0) / 58.0
    width = max(0.88, min(1.22, math.sqrt(weight) / max(math.sqrt(height), 0.8)))
    return height, width


def create_development_avatar_glb(output_path: Path, profile: dict):
    profile = profile or {}
    height_scale, width_scale = _body_scale(profile)
    gender = profile.get("gender")
    shoulder_scale = 1.08 if gender == "male" else 0.96 if gender == "female" else 1.0
    hip_scale = 1.08 if gender == "female" else 0.98
    primitives = []

    skin = 0
    fabric = 1
    dark = 2

    _add_ellipsoid(primitives, (0.0, 1.52 * height_scale, 0.0), (0.16, 0.21, 0.16), 16, 24, skin)
    _add_cylinder_between(primitives, (0.0, 1.26 * height_scale, 0.0), (0.0, 1.39 * height_scale, 0.0), 0.065, 18, skin)
    _add_ellipsoid(primitives, (0.0, 0.93 * height_scale, 0.0), (0.27 * width_scale * shoulder_scale, 0.38 * height_scale, 0.15), 18, 28, fabric)
    _add_ellipsoid(primitives, (0.0, 0.55 * height_scale, 0.0), (0.24 * width_scale * hip_scale, 0.16 * height_scale, 0.14), 12, 24, dark)
    _add_cylinder_between(primitives, (-0.26 * shoulder_scale * width_scale, 1.08 * height_scale, 0.0), (-0.46 * shoulder_scale * width_scale, 0.55 * height_scale, 0.02), 0.055, 16, skin)
    _add_cylinder_between(primitives, (0.26 * shoulder_scale * width_scale, 1.08 * height_scale, 0.0), (0.46 * shoulder_scale * width_scale, 0.55 * height_scale, 0.02), 0.055, 16, skin)
    _add_cylinder_between(primitives, (-0.12 * hip_scale, 0.43 * height_scale, 0.0), (-0.13 * hip_scale, -0.18 * height_scale, 0.02), 0.07, 16, dark)
    _add_cylinder_between(primitives, (0.12 * hip_scale, 0.43 * height_scale, 0.0), (0.13 * hip_scale, -0.18 * height_scale, 0.02), 0.07, 16, dark)

    _write_glb(output_path, primitives)


def _write_glb(output_path: Path, primitives):
    materials = [
        {"pbrMetallicRoughness": {"baseColorFactor": [0.78, 0.56, 0.42, 1.0], "roughnessFactor": 0.72}},
        {"pbrMetallicRoughness": {"baseColorFactor": [0.20, 0.38, 0.52, 1.0], "roughnessFactor": 0.84}},
        {"pbrMetallicRoughness": {"baseColorFactor": [0.08, 0.09, 0.10, 1.0], "roughnessFactor": 0.82}},
    ]
    bin_blob = bytearray()
    buffer_views = []
    accessors = []
    gltf_primitives = []

    def append_buffer(data: bytes, target: int):
        nonlocal bin_blob
        bin_blob.extend(b"\x00" * ((-len(bin_blob)) % 4))
        offset = len(bin_blob)
        bin_blob.extend(data)
        view_index = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return view_index

    for primitive in primitives:
        positions = primitive["positions"]
        normals = primitive["normals"]
        indices = primitive["indices"]
        position_blob = b"".join(struct.pack("<3f", *position) for position in positions)
        normal_blob = b"".join(struct.pack("<3f", *normal) for normal in normals)
        index_blob = b"".join(struct.pack("<I", index) for index in indices)
        position_view = append_buffer(position_blob, 34962)
        normal_view = append_buffer(normal_blob, 34962)
        index_view = append_buffer(index_blob, 34963)
        mins = [min(position[axis] for position in positions) for axis in range(3)]
        maxs = [max(position[axis] for position in positions) for axis in range(3)]
        position_accessor = len(accessors)
        accessors.append({"bufferView": position_view, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": mins, "max": maxs})
        normal_accessor = len(accessors)
        accessors.append({"bufferView": normal_view, "componentType": 5126, "count": len(normals), "type": "VEC3"})
        index_accessor = len(accessors)
        accessors.append({"bufferView": index_view, "componentType": 5125, "count": len(indices), "type": "SCALAR"})
        gltf_primitives.append({"attributes": {"POSITION": position_accessor, "NORMAL": normal_accessor}, "indices": index_accessor, "material": primitive["material"]})

    json_doc = {
        "asset": {"version": "2.0", "generator": "StyleFit Avatar development baseline"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": gltf_primitives}],
        "materials": materials,
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_blob = _align_bytes(json.dumps(json_doc, separators=(",", ":")).encode("utf-8"), b" ")
    bin_chunk = _align_bytes(bytes(bin_blob), b"\x00")
    total_length = 12 + 8 + len(json_blob) + 8 + len(bin_chunk)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as glb_file:
        glb_file.write(struct.pack("<III", 0x46546C67, 2, total_length))
        glb_file.write(struct.pack("<I4s", len(json_blob), b"JSON"))
        glb_file.write(json_blob)
        glb_file.write(struct.pack("<I4s", len(bin_chunk), b"BIN\x00"))
        glb_file.write(bin_chunk)