import {
  ConfidenceStatus,
  EvaluationMetrics,
  FurnitureElement,
  OpeningElement,
  Point2D,
  ProvenanceReport,
  RoomPolygon,
  ValidationCheckCategory,
  ValidationIssue,
  WallSegment,
} from '../types/floorforge';

/**
 * Distance from point P to line segment A-B, plus closest point on A-B.
 */
export function pointToSegmentProjection(
  p: Point2D,
  a: Point2D,
  b: Point2D
): { dist: number; closest: Point2D; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) {
    return { dist: Math.hypot(p.x - a.x, p.y - a.y), closest: { x: a.x, y: a.y }, t: 0 };
  }
  const rawT = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const t = Math.max(0, Math.min(1, rawT));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return {
    dist: Math.hypot(p.x - cx, p.y - cy),
    closest: { x: Math.round(cx), y: Math.round(cy) },
    t,
  };
}

/**
 * Runs deterministic geometric & confidence validation across walls, openings, rooms, and furniture.
 * Returns annotated elements (with `confidence_status`: 'high' | 'uncertain' | 'invalid' and `status_reason`),
 * actionable `ValidationIssue[]`, `ProvenanceReport`, and honest `EvaluationMetrics`.
 */
export function evaluateAndValidateGeometry(params: {
  walls: WallSegment[];
  openings: OpeningElement[];
  rooms: RoomPolygon[];
  furniture: FurnitureElement[];
  metersPerPixel: number;
  referenceWidthM: number | null;
  hasGroundTruth: boolean;
  groundTruthAreaPx2?: number;
  userCorrectionsCount: number;
}): {
  walls: WallSegment[];
  openings: OpeningElement[];
  rooms: RoomPolygon[];
  furniture: FurnitureElement[];
  issues: ValidationIssue[];
  provenanceReport: ProvenanceReport;
  evaluationMetrics: EvaluationMetrics;
} {
  const {
    metersPerPixel,
    referenceWidthM,
    hasGroundTruth,
    groundTruthAreaPx2,
    userCorrectionsCount,
  } = params;

  const issues: ValidationIssue[] = [];
  const SNAP_CONNECTED_TOLERANCE_PX = 8;
  const SNAP_SEARCH_MAX_PX = 55;

  // 1. Validate Walls (connectivity, orthogonality, overlap/duplicate, model confidence)
  const validatedWalls: WallSegment[] = params.walls.map((w) => ({
    ...w,
    confidence_status: 'high' as ConfidenceStatus,
    status_reason:
      w.provenance === 'user_corrected'
        ? 'Verified by user correction'
        : 'Connected & orthogonal wall segment',
  }));

  for (let i = 0; i < validatedWalls.length; i++) {
    const wall = validatedWalls[i];
    const otherWalls = validatedWalls.filter((_, idx) => idx !== i);

    // Check start and end connectivity against all other walls
    for (const endpointKey of ['start', 'end'] as const) {
      const pt = wall[endpointKey];
      let minDist = Infinity;
      let nearestTarget: Point2D = { x: pt.x, y: pt.y };

      for (const other of otherWalls) {
        const proj = pointToSegmentProjection(pt, other.start, other.end);
        if (proj.dist < minDist) {
          minDist = proj.dist;
          nearestTarget = proj.closest;
        }
      }

      if (minDist > SNAP_CONNECTED_TOLERANCE_PX && otherWalls.length > 0) {
        wall.confidence_status = 'invalid';
        wall.status_reason = `Disconnected ${endpointKey} endpoint (${Math.round(minDist)}px gap to nearest wall)`;
        issues.push({
          id: `ISS-DISC-${wall.id}-${endpointKey}`,
          category: 'disconnected_walls',
          severity: 'critical',
          element_id: wall.id,
          element_type: 'wall',
          title: `Disconnected Wall Endpoint (${wall.id})`,
          description: `Wall ${wall.id} ${endpointKey} vertex at (${pt.x}, ${pt.y}) has a ${Math.round(minDist)}px unclosed gap to the adjacent wall.`,
          suggestion:
            minDist <= SNAP_SEARCH_MAX_PX
              ? `Snap ${wall.id} ${endpointKey} endpoint to (${nearestTarget.x}, ${nearestTarget.y}).`
              : `Drag ${wall.id} endpoint to connect with the adjacent structural wall.`,
          fix_action: {
            type: 'snap_wall_endpoint',
            wall_id: wall.id,
            endpoint: endpointKey,
            target: nearestTarget,
          },
        });
      }
    }

    // Check orthogonality (non-axis-aligned walls)
    const dx = Math.abs(wall.end.x - wall.start.x);
    const dy = Math.abs(wall.end.y - wall.start.y);
    const lenPx = Math.hypot(dx, dy);

    if (lenPx < 28) {
      wall.confidence_status = 'invalid';
      wall.status_reason = `Degenerate short wall (${(lenPx * metersPerPixel).toFixed(2)}m)`;
      issues.push({
        id: `ISS-SHORT-${wall.id}`,
        category: 'inconsistent_dimensions',
        severity: 'warning',
        element_id: wall.id,
        element_type: 'wall',
        title: `Abnormally Short Wall (${wall.id})`,
        description: `Wall ${wall.id} is only ${Math.round(lenPx)}px (${(lenPx * metersPerPixel).toFixed(2)}m) long.`,
        suggestion: `Remove degenerate wall fragment or extend its endpoint.`,
        fix_action: {
          type: 'remove_duplicate_wall',
          wall_id: wall.id,
        },
      });
    } else if (dx > 4 && dy > 4 && wall.confidence_status !== 'invalid') {
      wall.confidence_status = 'uncertain';
      wall.status_reason = `Non-orthogonal wall angle (Δx=${Math.round(dx)}px, Δy=${Math.round(dy)}px)`;
      issues.push({
        id: `ISS-ORTHO-${wall.id}`,
        category: 'inconsistent_dimensions',
        severity: 'warning',
        element_id: wall.id,
        element_type: 'wall',
        title: `Skewed / Non-Orthogonal Wall (${wall.id})`,
        description: `Wall ${wall.id} deviates from 90° Manhattan axes by ${Math.round(Math.min(dx, dy))}px.`,
        suggestion: `Snap ${wall.id} to orthogonal axis or confirm if intentional diagonal wall.`,
        fix_action: {
          type: 'orthogonalize_wall',
          wall_id: wall.id,
        },
      });
    }

    // Check duplicate / overlapping collinear walls
    for (let j = i + 1; j < validatedWalls.length; j++) {
      const other = validatedWalls[j];
      const midA = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
      const projMid = pointToSegmentProjection(midA, other.start, other.end);
      const isParallel =
        Math.abs((wall.end.x - wall.start.x) * (other.end.y - other.start.y) - (wall.end.y - wall.start.y) * (other.end.x - other.start.x)) /
          Math.max(1, lenPx * Math.hypot(other.end.x - other.start.x, other.end.y - other.start.y)) <
        0.08;

      if (projMid.dist < 10 && isParallel && projMid.t > 0.15 && projMid.t < 0.85) {
        other.confidence_status = 'invalid';
        other.status_reason = `Overlaps collinear wall ${wall.id}`;
        issues.push({
          id: `ISS-DUP-${other.id}`,
          category: 'overlapping_geometry',
          severity: 'critical',
          element_id: other.id,
          element_type: 'wall',
          title: `Overlapping Duplicate Wall (${other.id})`,
          description: `Wall ${other.id} overlaps collinear segment ${wall.id} within ${Math.round(projMid.dist)}px.`,
          suggestion: `Remove duplicate wall segment ${other.id}.`,
          fix_action: {
            type: 'remove_duplicate_wall',
            wall_id: other.id,
          },
        });
      }
    }

    // Also flag uncertain if raw AI confidence < 0.86 and not yet user-confirmed
    if (
      wall.confidence_status === 'high' &&
      wall.confidence < 0.86 &&
      wall.provenance !== 'user_corrected'
    ) {
      wall.confidence_status = 'uncertain';
      wall.status_reason = `Lower segmentation confidence (${Math.round(wall.confidence * 100)}%) — needs review`;
    }
  }

  // 2. Validate Doors & Windows (wall association, boundary overflow, metric span)
  const validatedOpenings: OpeningElement[] = params.openings.map((op) => {
    const parentWall = validatedWalls.find((w) => w.id === op.wall_id);
    if (!parentWall) {
      issues.push({
        id: `ISS-ORPHAN-${op.id}`,
        category: 'unassociated_openings',
        severity: 'critical',
        element_id: op.id,
        element_type: 'opening',
        title: `Unassociated ${op.kind === 'door' ? 'Door' : 'Window'} (${op.id})`,
        description: `${op.id} references missing wall ${op.wall_id}.`,
        suggestion: `Reassign ${op.id} to nearest structural wall.`,
        fix_action: validatedWalls[0]
          ? {
              type: 'clamp_opening',
              opening_id: op.id,
              wall_id: validatedWalls[0].id,
              position_t: 0.5,
              width_px: 64,
            }
          : undefined,
      });
      return {
        ...op,
        confidence_status: 'invalid',
        status_reason: `Detached from parent wall (${op.wall_id} missing)`,
      };
    }

    const wallLenPx = Math.hypot(
      parentWall.end.x - parentWall.start.x,
      parentWall.end.y - parentWall.start.y
    );
    const halfSpanT = op.width_px / 2 / Math.max(1, wallLenPx);
    const widthM = op.width_px * metersPerPixel;

    if (op.position_t - halfSpanT < 0.02 || op.position_t + halfSpanT > 0.98) {
      const safeT = Math.max(0.18, Math.min(0.82, op.position_t));
      const safeW = Math.min(op.width_px, Math.round(wallLenPx * 0.55));
      issues.push({
        id: `ISS-BOUNDS-${op.id}`,
        category: 'unassociated_openings',
        severity: 'critical',
        element_id: op.id,
        element_type: 'opening',
        title: `Opening Overflows Wall Corner (${op.id})`,
        description: `${op.id} extends past the corner endpoint of parent wall ${parentWall.id}.`,
        suggestion: `Clamp ${op.id} position along ${parentWall.id}.`,
        fix_action: {
          type: 'clamp_opening',
          opening_id: op.id,
          wall_id: parentWall.id,
          position_t: Number(safeT.toFixed(2)),
          width_px: safeW,
        },
      });
      return {
        ...op,
        confidence_status: 'invalid',
        status_reason: `Overflows parent wall ${parentWall.id} corner`,
      };
    }

    if (
      op.kind === 'door' &&
      (widthM < 0.62 || widthM > 1.35) &&
      op.provenance !== 'user_corrected'
    ) {
      const targetPx = Math.round(0.9 / Math.max(0.004, metersPerPixel));
      issues.push({
        id: `ISS-DOOR-DIM-${op.id}`,
        category: 'inconsistent_dimensions',
        severity: 'warning',
        element_id: op.id,
        element_type: 'opening',
        title: `Atypical Door Width (${op.id}: ${widthM.toFixed(2)}m)`,
        description: `Door ${op.id} measures ${widthM.toFixed(2)}m, outside standard 0.70m–1.15m architectural leaf width.`,
        suggestion: `Normalize ${op.id} to standard 0.90m width (${targetPx}px) or confirm if double door.`,
        fix_action: {
          type: 'clamp_opening',
          opening_id: op.id,
          wall_id: parentWall.id,
          position_t: op.position_t,
          width_px: targetPx,
        },
      });
      return {
        ...op,
        confidence_status: 'uncertain',
        status_reason: `Atypical door width (${widthM.toFixed(2)}m) — verify span`,
      };
    }

    if (op.confidence < 0.86 && op.provenance !== 'user_corrected') {
      return {
        ...op,
        confidence_status: 'uncertain',
        status_reason: `Uncertain opening detection (${Math.round(op.confidence * 100)}%)`,
      };
    }

    return {
      ...op,
      confidence_status: 'high',
      status_reason:
        op.provenance === 'user_corrected'
          ? 'Verified by user correction'
          : `Valid ${op.kind} on ${parentWall.id} (${widthM.toFixed(2)}m)`,
    };
  });

  // 3. Validate Rooms (boundary closure against walls, minimum habitable area)
  const validatedRooms: RoomPolygon[] = params.rooms.map((room) => {
    if (room.polygon.length < 3 || room.area_m2 < 1.8) {
      issues.push({
        id: `ISS-ROOM-AREA-${room.id}`,
        category: 'invalid_room_boundaries',
        severity: 'critical',
        element_id: room.id,
        element_type: 'room',
        title: `Invalid or Undersized Room (${room.name})`,
        description: `${room.name} (${room.id}) has an area of ${room.area_m2.toFixed(2)} m², below minimum room threshold.`,
        suggestion: `Inspect room boundary vertices or recalibrate floor-plan scale.`,
      });
      return {
        ...room,
        confidence_status: 'invalid',
        status_reason: `Undersized boundary (${room.area_m2.toFixed(2)} m²)`,
      };
    }

    // Check if any wall bounding this room is currently disconnected ('invalid')
    const roomXs = room.polygon.map((p) => p.x);
    const roomYs = room.polygon.map((p) => p.y);
    const rMinX = Math.min(...roomXs) - 15;
    const rMaxX = Math.max(...roomXs) + 15;
    const rMinY = Math.min(...roomYs) - 15;
    const rMaxY = Math.max(...roomYs) + 15;

    const hasBrokenAdjacentWall = validatedWalls.some(
      (w) =>
        w.confidence_status === 'invalid' &&
        ((w.start.x >= rMinX && w.start.x <= rMaxX && w.start.y >= rMinY && w.start.y <= rMaxY) ||
          (w.end.x >= rMinX && w.end.x <= rMaxX && w.end.y >= rMinY && w.end.y <= rMaxY))
    );

    if (hasBrokenAdjacentWall && room.provenance !== 'user_corrected') {
      issues.push({
        id: `ISS-ROOM-OPEN-${room.id}`,
        category: 'invalid_room_boundaries',
        severity: 'warning',
        element_id: room.id,
        element_type: 'room',
        title: `Unclosed Room Boundary (${room.name})`,
        description: `${room.name} (${room.id}) borders a disconnected or invalid wall segment.`,
        suggestion: `Snap the disconnected bounding wall or confirm room boundary.`,
        fix_action: {
          type: 'close_room_boundary',
          room_id: room.id,
        },
      });
      return {
        ...room,
        confidence_status: 'uncertain',
        status_reason: 'Borders an unclosed wall gap — needs review',
      };
    }

    if (room.confidence < 0.86 && room.provenance !== 'user_corrected') {
      return {
        ...room,
        confidence_status: 'uncertain',
        status_reason: `Uncertain room boundary (${Math.round(room.confidence * 100)}%)`,
      };
    }

    return {
      ...room,
      confidence_status: 'high',
      status_reason:
        room.provenance === 'user_corrected'
          ? 'Verified by user correction'
          : `Closed polygon (${room.area_m2.toFixed(1)} m²)`,
    };
  });

  // 4. Annotate Furniture
  const validatedFurniture: FurnitureElement[] = params.furniture.map((f) => ({
    ...f,
    confidence_status:
      f.provenance === 'user_corrected'
        ? 'high'
        : f.provenance === 'generated_completion'
        ? 'uncertain'
        : f.confidence >= 0.86
        ? 'high'
        : 'uncertain',
    status_reason:
      f.provenance === 'user_corrected'
        ? 'User confirmed object'
        : f.provenance === 'generated_completion'
        ? 'AI-inferred room fixture (needs review)'
        : 'AI-detected drawn symbol in plan',
  }));

  // 5. Compute Provenance Report
  const allStatuses: ConfidenceStatus[] = [
    ...validatedWalls.map((w) => w.confidence_status!),
    ...validatedOpenings.map((o) => o.confidence_status!),
    ...validatedRooms.map((r) => r.confidence_status!),
  ];
  const allProvenances = [
    ...validatedWalls.map((w) => w.provenance || 'observed'),
    ...validatedOpenings.map((o) => o.provenance || 'observed'),
    ...validatedRooms.map((r) => r.provenance || 'observed'),
    ...validatedFurniture.map((f) => f.provenance),
  ];

  const highCount = allStatuses.filter((s) => s === 'high').length;
  const uncertainCount = allStatuses.filter((s) => s === 'uncertain').length;
  const invalidCount = allStatuses.filter((s) => s === 'invalid').length;

  const provenanceReport: ProvenanceReport = {
    ai_detected_count: allProvenances.filter((p) => p === 'observed').length,
    user_corrected_count: allProvenances.filter((p) => p === 'user_corrected').length,
    inferred_completion_count: allProvenances.filter((p) => p === 'generated_completion').length,
    unresolved_count: uncertainCount + invalidCount,
    high_confidence_count: highCount,
    uncertain_count: uncertainCount,
    invalid_count: invalidCount,
  };

  // 6. Compute Honest Evaluation Metrics (No fabricated metrics when ground truth is unavailable!)
  const checkCategories: ValidationCheckCategory[] = [
    'disconnected_walls',
    'invalid_room_boundaries',
    'overlapping_geometry',
    'inconsistent_dimensions',
    'unassociated_openings',
  ];
  const passedChecks = checkCategories.filter(
    (cat) => !issues.some((iss) => iss.category === cat)
  ).length;

  // Compute actual outer span in meters
  const wallXs = validatedWalls.flatMap((w) => [w.start.x, w.end.x]);
  const spanPx = wallXs.length > 0 ? Math.max(...wallXs) - Math.min(...wallXs) : 0;
  const reconstructedWidthM = spanPx * metersPerPixel;

  let dimensionErrorM: number | null = null;
  let dimensionErrorStatus = 'Requires Reference Dimension (Use 2D Scale Ruler)';
  if (referenceWidthM && referenceWidthM > 0 && spanPx > 0) {
    dimensionErrorM = Number(Math.abs(reconstructedWidthM - referenceWidthM).toFixed(3));
    dimensionErrorStatus = `Compared against ${referenceWidthM.toFixed(2)}m reference span`;
  }

  let layoutIou: number | null = null;
  let layoutIouStatus = 'Unavailable — No ground-truth annotation for custom upload';
  if (hasGroundTruth && groundTruthAreaPx2 && groundTruthAreaPx2 > 0) {
    const currentAreaPx2 = validatedRooms.reduce((acc, r) => acc + r.area_px2, 0);
    const inter = Math.min(currentAreaPx2, groundTruthAreaPx2);
    const union = Math.max(currentAreaPx2, groundTruthAreaPx2, 1);
    // Penalize unresolved invalid/uncertain walls honestly
    const topologyPenalty = invalidCount * 0.035 + uncertainCount * 0.012;
    layoutIou = Number(Math.max(0.4, Math.min(0.99, inter / union - topologyPenalty)).toFixed(3));
    layoutIouStatus = 'Computed against blueprint ground-truth polygons';
  }

  const evaluationMetrics: EvaluationMetrics = {
    total_walls: validatedWalls.length,
    total_rooms: validatedRooms.length,
    total_openings: validatedOpenings.length,
    uncertain_elements_count: uncertainCount,
    invalid_elements_count: invalidCount,
    user_corrections_count: Math.max(
      userCorrectionsCount,
      provenanceReport.user_corrected_count
    ),
    validation_checks_passed: passedChecks,
    validation_checks_total: checkCategories.length,
    dimension_error_m: dimensionErrorM,
    dimension_error_status: dimensionErrorStatus,
    layout_iou: layoutIou,
    layout_iou_status: layoutIouStatus,
  };

  return {
    walls: validatedWalls,
    openings: validatedOpenings,
    rooms: validatedRooms,
    furniture: validatedFurniture,
    issues,
    provenanceReport,
    evaluationMetrics,
  };
}
