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


def _hex_to_factor(value: str | None, fallback):
    if not value or not isinstance(value, str):
        return fallback

    color = value.strip().lstrip("#")
    if len(color) != 6:
        return fallback

    try:
        return [int(color[index : index + 2], 16) / 255.0 for index in (0, 2, 4)] + [1.0]
    except ValueError:
        return fallback


def _profile_metrics(profile: dict):
    profile = profile or {}
    gender = profile.get("gender")
    height_cm = float(profile.get("heightCm") or 168.0)
    weight_kg = float(profile.get("weightKg") or 58.0)
    height_scale = max(0.9, min(1.14, height_cm / 168.0))
    weight_scale = max(0.86, min(1.24, math.sqrt(weight_kg / 58.0)))
    shoulder_scale = 1.08 if gender == "male" else 0.96 if gender == "female" else 1.0
    hip_scale = 1.08 if gender == "female" else 0.98 if gender == "male" else 1.02
    return {
        "heightCm": height_cm,
        "weightKg": weight_kg,
        "heightScale": height_scale,
        "widthScale": weight_scale,
        "shoulderScale": shoulder_scale,
        "hipScale": hip_scale,
        "gender": gender,
    }


def estimate_body_measurements(profile: dict):
    metrics = _profile_metrics(profile)
    height = metrics["heightCm"]
    weight_factor = metrics["widthScale"]
    shoulder = height * 0.245 * metrics["shoulderScale"] * weight_factor
    chest = height * 0.52 * weight_factor
    waist = height * 0.40 * weight_factor
    hip = height * 0.50 * metrics["hipScale"] * weight_factor
    inseam = height * 0.455
    return {
        "shoulderCm": round(shoulder, 1),
        "chestCm": round(chest, 1),
        "waistCm": round(waist, 1),
        "hipCm": round(hip, 1),
        "inseamCm": round(inseam, 1),
    }


def _add_ellipsoid(primitives, center, radii, rings, segments, material, phi_start=0.0, phi_end=math.pi):
    positions = []
    normals = []
    indices = []

    for ring in range(rings + 1):
        phi = phi_start + (phi_end - phi_start) * ring / rings
        sin_phi = math.sin(phi)
        cos_phi = math.cos(phi)

        for segment in range(segments + 1):
            theta = 2.0 * math.pi * segment / segments
            unit = (sin_phi * math.cos(theta), cos_phi, sin_phi * math.sin(theta))
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


def _add_cylinder_between(primitives, start, end, start_radius, end_radius, segments, material):
    axis = _normalize((end[0] - start[0], end[1] - start[1], end[2] - start[2]))
    reference = (0.0, 1.0, 0.0) if abs(axis[1]) < 0.92 else (1.0, 0.0, 0.0)
    tangent = _normalize(_cross(axis, reference))
    bitangent = _normalize(_cross(axis, tangent))
    positions = []
    normals = []
    indices = []

    for endpoint, radius in ((start, start_radius), (end, end_radius)):
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

    start_center = len(positions)
    positions.append(start)
    normals.append((-axis[0], -axis[1], -axis[2]))
    end_center = len(positions)
    positions.append(end)
    normals.append(axis)

    for segment in range(segments):
        indices.extend((start_center, segment + 1, segment))
        indices.extend((end_center, row + segment, row + segment + 1))

    primitives.append({"positions": positions, "normals": normals, "indices": indices, "material": material})


def _add_box(primitives, center, size, material):
    hx, hy, hz = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    cx, cy, cz = center
    faces = [
        (((cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz), (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz)), (0.0, 0.0, 1.0)),
        (((cx + hx, cy - hy, cz - hz), (cx - hx, cy - hy, cz - hz), (cx - hx, cy + hy, cz - hz), (cx + hx, cy + hy, cz - hz)), (0.0, 0.0, -1.0)),
        (((cx - hx, cy + hy, cz + hz), (cx + hx, cy + hy, cz + hz), (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz)), (0.0, 1.0, 0.0)),
        (((cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz + hz), (cx - hx, cy - hy, cz + hz)), (0.0, -1.0, 0.0)),
        (((cx + hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz - hz), (cx + hx, cy + hy, cz - hz), (cx + hx, cy + hy, cz + hz)), (1.0, 0.0, 0.0)),
        (((cx - hx, cy - hy, cz - hz), (cx - hx, cy - hy, cz + hz), (cx - hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz - hz)), (-1.0, 0.0, 0.0)),
    ]
    positions = []
    normals = []
    indices = []

    for face_vertices, normal in faces:
        offset = len(positions)
        positions.extend(face_vertices)
        normals.extend([normal] * 4)
        indices.extend((offset, offset + 1, offset + 2, offset, offset + 2, offset + 3))

    primitives.append({"positions": positions, "normals": normals, "indices": indices, "material": material})


def _add_quad(primitives, corners, material):
    normal = _normalize(
        _cross(
            (
                corners[1][0] - corners[0][0],
                corners[1][1] - corners[0][1],
                corners[1][2] - corners[0][2],
            ),
            (
                corners[2][0] - corners[0][0],
                corners[2][1] - corners[0][1],
                corners[2][2] - corners[0][2],
            ),
        )
    )
    primitives.append({"positions": list(corners), "normals": [normal] * 4, "indices": [0, 1, 2, 0, 2, 3], "material": material})


def _add_elliptic_tube(primitives, profiles, segments, material, cap_start=False, cap_end=False):
    positions = []
    normals = []
    indices = []

    for center, radii in profiles:
        for segment in range(segments + 1):
            theta = 2.0 * math.pi * segment / segments
            cos_theta = math.cos(theta)
            sin_theta = math.sin(theta)
            positions.append((center[0] + radii[0] * cos_theta, center[1], center[2] + radii[1] * sin_theta))
            normals.append(_normalize((cos_theta / max(radii[0], 0.001), 0.0, sin_theta / max(radii[1], 0.001))))

    row = segments + 1
    for ring in range(len(profiles) - 1):
        for segment in range(segments):
            a = ring * row + segment
            b = a + row
            indices.extend((a, b, a + 1, a + 1, b, b + 1))

    if cap_start:
        center_index = len(positions)
        positions.append(profiles[0][0])
        normals.append((0.0, -1.0, 0.0))
        for segment in range(segments):
            indices.extend((center_index, segment + 1, segment))

    if cap_end:
        center_index = len(positions)
        start = (len(profiles) - 1) * row
        positions.append(profiles[-1][0])
        normals.append((0.0, 1.0, 0.0))
        for segment in range(segments):
            indices.extend((center_index, start + segment, start + segment + 1))

    primitives.append({"positions": positions, "normals": normals, "indices": indices, "material": material})


def _materials(profile: dict):
    palette = profile.get("preferredColors") if isinstance(profile.get("preferredColors"), list) else []
    primary = _hex_to_factor(palette[0] if palette else None, [0.12, 0.34, 0.52, 1.0])
    secondary = _hex_to_factor(palette[1] if len(palette) > 1 else None, [0.74, 0.60, 0.42, 1.0])
    return [
        {"name": "warm-skin", "pbrMetallicRoughness": {"baseColorFactor": [0.79, 0.68, 0.58, 1.0], "roughnessFactor": 0.78}},
        {"name": "tailored-top", "doubleSided": True, "pbrMetallicRoughness": {"baseColorFactor": primary, "roughnessFactor": 0.82}},
        {"name": "structured-bottom", "doubleSided": True, "pbrMetallicRoughness": {"baseColorFactor": secondary, "roughnessFactor": 0.86}},
        {"name": "soft-hair", "pbrMetallicRoughness": {"baseColorFactor": [0.18, 0.15, 0.12, 1.0], "roughnessFactor": 0.9}},
        {"name": "shoe-leather", "pbrMetallicRoughness": {"baseColorFactor": [0.075, 0.08, 0.085, 1.0], "roughnessFactor": 0.62}},
        {"name": "eye", "pbrMetallicRoughness": {"baseColorFactor": [0.24, 0.21, 0.18, 1.0], "roughnessFactor": 0.62}},
        {"name": "lip", "pbrMetallicRoughness": {"baseColorFactor": [0.48, 0.32, 0.28, 1.0], "roughnessFactor": 0.78}},
        {"name": "garment-edge", "doubleSided": True, "pbrMetallicRoughness": {"baseColorFactor": [0.92, 0.90, 0.84, 1.0], "roughnessFactor": 0.78}},
        {"name": "shoe-sole", "pbrMetallicRoughness": {"baseColorFactor": [0.055, 0.058, 0.06, 1.0], "roughnessFactor": 0.72}},
        {"name": "soft-metal", "pbrMetallicRoughness": {"baseColorFactor": [0.88, 0.74, 0.44, 1.0], "metallicFactor": 0.55, "roughnessFactor": 0.36}},
        {"name": "skin-blush", "pbrMetallicRoughness": {"baseColorFactor": [0.72, 0.55, 0.49, 1.0], "roughnessFactor": 0.82}},
        {"name": "eye-white", "pbrMetallicRoughness": {"baseColorFactor": [0.72, 0.66, 0.58, 1.0], "roughnessFactor": 0.58}},
    ]


def create_parametric_digital_human_glb(output_path: Path, profile: dict):
    profile = profile or {}
    metrics = _profile_metrics(profile)
    height = metrics["heightScale"]
    width = metrics["widthScale"]
    shoulder = metrics["shoulderScale"]
    hip = metrics["hipScale"]
    fit_preference = profile.get("fitPreference")
    tailored = 0.94 if fit_preference == "tailored" else 1.08 if fit_preference == "relaxed" else 1.0
    primitives = []

    skin, top, bottom, hair, shoe, eye, lip, seam, sole, metal, blush, eye_white = range(12)
    head_y = 1.54 * height
    shoulder_y = 1.15 * height
    hip_y = 0.55 * height

    _add_ellipsoid(primitives, (0.0, head_y, 0.0), (0.148, 0.202, 0.13), 30, 48, skin)
    _add_ellipsoid(primitives, (-0.148, head_y - 0.005, 0.01), (0.024, 0.045, 0.016), 12, 18, skin)
    _add_ellipsoid(primitives, (0.148, head_y - 0.005, 0.01), (0.024, 0.045, 0.016), 12, 18, skin)
    _add_ellipsoid(primitives, (0.0, head_y + 0.055, -0.067), (0.156, 0.198, 0.092), 22, 52, hair, 0.0, math.pi * 0.54)
    _add_ellipsoid(primitives, (0.0, head_y - 0.012, -0.123), (0.142, 0.158, 0.048), 16, 38, hair)
    side_hair_drop = 0.17 if metrics["gender"] == "female" else 0.105 if metrics["gender"] == "male" else 0.14
    _add_ellipsoid(primitives, (-0.135, head_y - 0.032, -0.062), (0.032, side_hair_drop, 0.035), 14, 20, hair)
    _add_ellipsoid(primitives, (0.135, head_y - 0.032, -0.062), (0.032, side_hair_drop, 0.035), 14, 20, hair)
    _add_ellipsoid(primitives, (-0.083, head_y + 0.118, 0.075), (0.02, 0.008, 0.011), 8, 14, hair)
    _add_ellipsoid(primitives, (0.077, head_y + 0.116, 0.078), (0.021, 0.008, 0.011), 8, 14, hair)
    _add_cylinder_between(primitives, (-0.089, head_y + 0.058, 0.142), (-0.026, head_y + 0.064, 0.147), 0.0028, 0.0025, 8, hair)
    _add_cylinder_between(primitives, (0.026, head_y + 0.064, 0.147), (0.089, head_y + 0.058, 0.142), 0.0025, 0.0028, 8, hair)
    _add_ellipsoid(primitives, (-0.053, head_y + 0.028, 0.141), (0.017, 0.006, 0.004), 8, 12, eye_white)
    _add_ellipsoid(primitives, (0.053, head_y + 0.028, 0.141), (0.017, 0.006, 0.004), 8, 12, eye_white)
    _add_ellipsoid(primitives, (-0.053, head_y + 0.028, 0.146), (0.006, 0.004, 0.003), 6, 10, eye)
    _add_ellipsoid(primitives, (0.053, head_y + 0.028, 0.146), (0.006, 0.004, 0.003), 6, 10, eye)
    _add_ellipsoid(primitives, (0.0, head_y - 0.028, 0.143), (0.014, 0.023, 0.008), 8, 14, skin)
    _add_ellipsoid(primitives, (0.0, head_y - 0.096, 0.139), (0.028, 0.005, 0.003), 6, 12, lip)
    _add_ellipsoid(primitives, (-0.073, head_y - 0.043, 0.139), (0.018, 0.007, 0.003), 6, 10, blush)
    _add_ellipsoid(primitives, (0.073, head_y - 0.043, 0.139), (0.018, 0.007, 0.003), 6, 10, blush)
    _add_ellipsoid(primitives, (-0.162, head_y - 0.055, 0.022), (0.012, 0.018, 0.008), 8, 12, metal)
    _add_ellipsoid(primitives, (0.162, head_y - 0.055, 0.022), (0.012, 0.018, 0.008), 8, 12, metal)
    _add_cylinder_between(primitives, (0.0, 1.31 * height, 0.0), (0.0, 1.41 * height, 0.0), 0.058, 0.067, 24, skin)
    _add_elliptic_tube(
        primitives,
        [
            ((0.0, 1.303 * height, 0.018), (0.09, 0.07)),
            ((0.0, 1.286 * height, 0.02), (0.118, 0.082)),
        ],
        42,
        seam,
        False,
        False,
    )

    _add_ellipsoid(primitives, (0.0, 1.18 * height, 0.005), (0.265 * width * shoulder, 0.034, 0.082), 12, 32, top)
    _add_elliptic_tube(
        primitives,
        [
            ((0.0, 1.255 * height, 0.012), (0.092 * width * shoulder, 0.069)),
            ((0.0, 1.185 * height, 0.01), (0.314 * width * shoulder, 0.114)),
            ((0.0, 1.02 * height, 0.012), (0.286 * width * shoulder * tailored, 0.148)),
            ((0.0, 0.81 * height, 0.014), (0.276 * width * tailored, 0.148)),
            ((0.0, 0.635 * height, 0.016), (0.242 * width * hip, 0.139)),
        ],
        64,
        top,
        True,
        True,
    )
    _add_elliptic_tube(
        primitives,
        [
            ((0.0, 0.662 * height, 0.014), (0.25 * width * hip, 0.145)),
            ((0.0, 0.56 * height, 0.018), (0.266 * width * hip, 0.15)),
            ((0.0, 0.465 * height, 0.018), (0.22 * width * hip, 0.128)),
        ],
        54,
        bottom,
        True,
        False,
    )
    _add_quad(
        primitives,
        [
            (-0.18 * width * shoulder, 1.21 * height, 0.162),
            (-0.045 * width * shoulder, 1.255 * height, 0.166),
            (-0.075 * width * shoulder, 1.07 * height, 0.17),
            (-0.21 * width * shoulder, 1.13 * height, 0.164),
        ],
        seam,
    )
    _add_quad(
        primitives,
        [
            (0.045 * width * shoulder, 1.255 * height, 0.166),
            (0.18 * width * shoulder, 1.21 * height, 0.162),
            (0.21 * width * shoulder, 1.13 * height, 0.164),
            (0.075 * width * shoulder, 1.07 * height, 0.17),
        ],
        seam,
    )
    _add_cylinder_between(primitives, (-0.08, 1.31 * height, 0.112), (-0.005, 1.23 * height, 0.146), 0.012, 0.009, 12, seam)
    _add_cylinder_between(primitives, (0.08, 1.31 * height, 0.112), (0.005, 1.23 * height, 0.146), 0.012, 0.009, 12, seam)
    _add_box(primitives, (0.0, 0.645 * height, 0.143), (0.43 * width * hip, 0.03, 0.024), seam)
    _add_box(primitives, (0.0, 0.645 * height, 0.159), (0.045, 0.036, 0.014), metal)
    _add_cylinder_between(primitives, (0.0, 1.16 * height, 0.143), (0.0, 0.77 * height, 0.153), 0.006, 0.005, 10, seam)
    _add_cylinder_between(primitives, (-0.18 * width * shoulder, 1.155 * height, 0.151), (-0.085 * width * shoulder, 1.155 * height, 0.163), 0.0045, 0.0045, 8, seam)
    _add_cylinder_between(primitives, (0.085 * width * shoulder, 1.155 * height, 0.163), (0.18 * width * shoulder, 1.155 * height, 0.151), 0.0045, 0.0045, 8, seam)
    _add_box(primitives, (-0.15 * width * shoulder, 0.94 * height, 0.161), (0.108, 0.068, 0.012), seam)
    _add_box(primitives, (0.15 * width * shoulder, 0.94 * height, 0.161), (0.108, 0.068, 0.012), seam)
    _add_cylinder_between(primitives, (-0.22 * width * shoulder, 1.18 * height, 0.104), (-0.19 * width * shoulder, 0.72 * height, 0.124), 0.004, 0.004, 8, seam)
    _add_cylinder_between(primitives, (0.22 * width * shoulder, 1.18 * height, 0.104), (0.19 * width * shoulder, 0.72 * height, 0.124), 0.004, 0.004, 8, seam)
    for button_y in (1.08 * height, 0.98 * height, 0.88 * height):
        _add_ellipsoid(primitives, (0.0, button_y, 0.16), (0.012, 0.012, 0.006), 8, 12, metal)

    left_shoulder = (-0.285 * width * shoulder, shoulder_y, 0.0)
    right_shoulder = (0.285 * width * shoulder, shoulder_y, 0.0)
    left_elbow = (-0.43 * width * shoulder, 0.78 * height, 0.04)
    right_elbow = (0.43 * width * shoulder, 0.78 * height, 0.04)
    left_wrist = (-0.36 * width * shoulder, 0.43 * height, 0.08)
    right_wrist = (0.36 * width * shoulder, 0.43 * height, 0.08)
    _add_cylinder_between(primitives, left_shoulder, left_elbow, 0.061, 0.052, 28, top)
    _add_cylinder_between(primitives, right_shoulder, right_elbow, 0.061, 0.052, 28, top)
    _add_cylinder_between(primitives, left_elbow, left_wrist, 0.047, 0.039, 28, skin)
    _add_cylinder_between(primitives, right_elbow, right_wrist, 0.047, 0.039, 28, skin)
    _add_ellipsoid(primitives, left_elbow, (0.056, 0.032, 0.04), 10, 16, seam)
    _add_ellipsoid(primitives, right_elbow, (0.056, 0.032, 0.04), 10, 16, seam)
    _add_ellipsoid(primitives, (left_wrist[0] - 0.012, left_wrist[1] + 0.035, left_wrist[2] - 0.005), (0.052, 0.016, 0.036), 8, 18, seam)
    _add_ellipsoid(primitives, (right_wrist[0] + 0.012, right_wrist[1] + 0.035, right_wrist[2] - 0.005), (0.052, 0.016, 0.036), 8, 18, seam)
    _add_ellipsoid(primitives, left_wrist, (0.041, 0.052, 0.027), 10, 18, skin)
    _add_ellipsoid(primitives, right_wrist, (0.041, 0.052, 0.027), 10, 18, skin)
    for wrist, side in ((left_wrist, -1.0), (right_wrist, 1.0)):
        _add_cylinder_between(primitives, (wrist[0], wrist[1] - 0.018, wrist[2] + 0.012), (wrist[0] + side * 0.03, wrist[1] - 0.078, wrist[2] + 0.036), 0.008, 0.005, 8, skin)
        _add_cylinder_between(primitives, (wrist[0], wrist[1] - 0.012, wrist[2] + 0.002), (wrist[0] + side * 0.006, wrist[1] - 0.09, wrist[2] + 0.026), 0.008, 0.005, 8, skin)
        _add_cylinder_between(primitives, (wrist[0], wrist[1] - 0.016, wrist[2] - 0.006), (wrist[0] - side * 0.02, wrist[1] - 0.076, wrist[2] + 0.02), 0.007, 0.005, 8, skin)

    left_hip = (-0.13 * hip * width, hip_y, 0.0)
    right_hip = (0.13 * hip * width, hip_y, 0.0)
    left_knee = (-0.15 * hip * width, 0.13 * height, 0.02)
    right_knee = (0.15 * hip * width, 0.13 * height, 0.02)
    left_ankle = (-0.13 * hip * width, -0.26 * height, 0.03)
    right_ankle = (0.13 * hip * width, -0.26 * height, 0.03)
    for leg_x in (left_hip[0], right_hip[0]):
        _add_elliptic_tube(
            primitives,
            [
                ((leg_x, 0.455 * height, 0.018), (0.078, 0.07)),
                ((leg_x, 0.17 * height, 0.02), (0.066, 0.06)),
                ((leg_x, -0.285 * height, 0.034), (0.051, 0.048)),
            ],
            46,
            bottom,
            True,
            True,
        )
        _add_cylinder_between(primitives, (leg_x, 0.42 * height, 0.095), (leg_x, -0.23 * height, 0.113), 0.0045, 0.0035, 8, seam)
        _add_box(primitives, (leg_x - 0.018 if leg_x > 0 else leg_x + 0.018, 0.49 * height, 0.115), (0.075, 0.038, 0.011), seam)
    _add_ellipsoid(primitives, (-0.13 * hip * width, -0.31 * height, 0.095), (0.078, 0.035, 0.14), 10, 20, shoe)
    _add_ellipsoid(primitives, (0.13 * hip * width, -0.31 * height, 0.095), (0.078, 0.035, 0.14), 10, 20, shoe)
    _add_box(primitives, (-0.13 * hip * width, -0.34 * height, 0.096), (0.158, 0.022, 0.236), sole)
    _add_box(primitives, (0.13 * hip * width, -0.34 * height, 0.096), (0.158, 0.022, 0.236), sole)
    _add_cylinder_between(primitives, (-0.13 * hip * width - 0.042, -0.29 * height, 0.214), (-0.13 * hip * width + 0.042, -0.29 * height, 0.214), 0.0038, 0.0038, 8, seam)
    _add_cylinder_between(primitives, (0.13 * hip * width - 0.042, -0.29 * height, 0.214), (0.13 * hip * width + 0.042, -0.29 * height, 0.214), 0.0038, 0.0038, 8, seam)
    for shoe_x in (-0.13 * hip * width, 0.13 * hip * width):
        _add_ellipsoid(primitives, (shoe_x - 0.024, -0.295 * height, 0.203), (0.006, 0.004, 0.004), 6, 8, metal)
        _add_ellipsoid(primitives, (shoe_x + 0.024, -0.295 * height, 0.203), (0.006, 0.004, 0.004), 6, 8, metal)

    _write_glb(output_path, primitives, _materials(profile))


def _write_glb(output_path: Path, primitives, materials):
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
        position_view = append_buffer(b"".join(struct.pack("<3f", *position) for position in positions), 34962)
        normal_view = append_buffer(b"".join(struct.pack("<3f", *normal) for normal in normals), 34962)
        index_view = append_buffer(b"".join(struct.pack("<I", index) for index in indices), 34963)
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
        "asset": {"version": "2.0", "generator": "StyleFit parametric digital human MVP"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "StyleFit Parametric Digital Human"}],
        "meshes": [{"name": "Avatar", "primitives": gltf_primitives}],
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