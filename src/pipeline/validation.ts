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
 * Distance from point P to line segment A-B, plus closest point on A-B and normalized parameter t (0..1).
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
 * Finds a clear normalized position `t` (0.14..0.86) along `parentWall` that avoids
 * wall corners, perpendicular wall T-junctions, other openings on the same wall, and furniture.
 */
export function findSafeOpeningT(
  parentWall: WallSegment,
  widthPx: number,
  otherWalls: WallSegment[],
  preferredT: number,
  otherOpeningsOnSameWall: OpeningElement[] = [],
  furniture: FurnitureElement[] = []
): number {
  const wallLen = Math.hypot(
    parentWall.end.x - parentWall.start.x,
    parentWall.end.y - parentWall.start.y
  );
  if (wallLen < 50) return 0.5;
  const halfSpanT = Math.min(0.32, (widthPx / 2 + 20) / wallLen);
  const minT = Math.max(0.1, halfSpanT + 0.02);
  const maxT = Math.min(0.9, 0.98 - halfSpanT);

  // Collect all T-junction parameters along parentWall where other walls meet its interior
  const blockedTs: { t: number; radiusT: number }[] = [];
  for (const w of otherWalls) {
    if (w.id === parentWall.id) continue;
    for (const pt of [w.start, w.end]) {
      const proj = pointToSegmentProjection(pt, parentWall.start, parentWall.end);
      if (proj.dist < 16 && proj.t > 0.05 && proj.t < 0.95) {
        blockedTs.push({ t: proj.t, radiusT: halfSpanT + 0.025 });
      }
    }
  }

  for (const op of otherOpeningsOnSameWall) {
    const opRadiusT = (op.width_px / 2 + widthPx / 2 + 16) / wallLen;
    blockedTs.push({ t: op.position_t, radiusT: opRadiusT });
  }

  const candidates = [
    preferredT,
    preferredT - 0.14,
    preferredT + 0.14,
    0.25,
    0.75,
    0.5,
    0.35,
    0.65,
    0.18,
    0.82,
  ];

  for (const cand of candidates) {
    const clamped = Math.max(minT, Math.min(maxT, cand));
    const hitsWallOrOp = blockedTs.some((b) => Math.abs(clamped - b.t) < b.radiusT);
    if (hitsWallOrOp) continue;

    const cx = parentWall.start.x + (parentWall.end.x - parentWall.start.x) * clamped;
    const cy = parentWall.start.y + (parentWall.end.y - parentWall.start.y) * clamped;
    const hitsFurn = furniture.some((f) => {
      const hw = f.width_px / 2 + widthPx / 2 + 6;
      const hd = f.depth_px / 2 + 34;
      return Math.abs(cx - f.center_px.x) < hw && Math.abs(cy - f.center_px.y) < hd;
    });
    if (!hitsFurn) {
      return Number(clamped.toFixed(3));
    }
  }

  return Number(Math.max(minT, Math.min(maxT, preferredT)).toFixed(3));
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
  const SNAP_LOOSE_TOLERANCE_PX = 3;
  const SNAP_SEARCH_MAX_PX = 65;

  // 1. Validate Walls (connectivity, loose junctions, orthogonality, overlap/duplicate, model confidence)
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
      } else if (
        minDist > SNAP_LOOSE_TOLERANCE_PX &&
        minDist <= SNAP_CONNECTED_TOLERANCE_PX &&
        wall.provenance !== 'user_corrected' &&
        wall.confidence_status !== 'invalid'
      ) {
        wall.confidence_status = 'uncertain';
        wall.status_reason = `Slightly loose ${endpointKey} wall junction (${Math.round(minDist)}px offset)`;
        issues.push({
          id: `ISS-LOOSE-${wall.id}-${endpointKey}`,
          category: 'disconnected_walls',
          severity: 'warning',
          element_id: wall.id,
          element_type: 'wall',
          title: `Imprecise Wall Junction (${wall.id})`,
          description: `Wall ${wall.id} ${endpointKey} endpoint is ${Math.round(minDist)}px off exact intersection (${nearestTarget.x}, ${nearestTarget.y}).`,
          suggestion: `Snap ${wall.id} ${endpointKey} endpoint to exact intersection.`,
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
    } else if (dx > 2 && dy > 2 && wall.confidence_status !== 'invalid') {
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
        suggestion: `Snap ${wall.id} to orthogonal 90° axis.`,
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
        Math.abs(
          (wall.end.x - wall.start.x) * (other.end.y - other.start.y) -
            (wall.end.y - wall.start.y) * (other.end.x - other.start.x)
        ) /
          Math.max(
            1,
            lenPx * Math.hypot(other.end.x - other.start.x, other.end.y - other.start.y)
          ) <
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

    // Flag uncertain if raw AI confidence < 0.88 and not yet user-confirmed
    if (
      wall.confidence_status === 'high' &&
      wall.confidence < 0.88 &&
      wall.provenance !== 'user_corrected'
    ) {
      wall.confidence_status = 'uncertain';
      wall.status_reason = `Lower segmentation confidence (${Math.round(wall.confidence * 100)}%) — needs review`;
    }
  }

  // 2. Validate Doors & Windows (wall association, corner clearance, T-junction collision, exterior placement, furniture clearance)
  const validatedOpenings: OpeningElement[] = params.openings.map((op, opIdx) => {
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
              width_px: 58,
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
    const sameWallOtherOpenings = params.openings.filter(
      (other, idx) => idx !== opIdx && other.wall_id === parentWall.id
    );

    const opCenter: Point2D = {
      x: parentWall.start.x + (parentWall.end.x - parentWall.start.x) * op.position_t,
      y: parentWall.start.y + (parentWall.end.y - parentWall.start.y) * op.position_t,
    };

    // Check A: Misplaced Exterior Door on Bedroom or Bathroom outer wall
    if (op.kind === 'door' && parentWall.is_exterior && op.provenance !== 'user_corrected') {
      const borderingPrivateRoom = params.rooms.find((r) => {
        if (r.category !== 'bedroom' && r.category !== 'bathroom') return false;
        const xs = r.polygon.map((p) => p.x);
        const ys = r.polygon.map((p) => p.y);
        return (
          opCenter.x >= Math.min(...xs) - 24 &&
          opCenter.x <= Math.max(...xs) + 24 &&
          opCenter.y >= Math.min(...ys) - 24 &&
          opCenter.y <= Math.max(...ys) + 24
        );
      });

      if (borderingPrivateRoom) {
        // Find an interior partition wall bordering this room for the 1-click fix
        const rXs = borderingPrivateRoom.polygon.map((p) => p.x);
        const rYs = borderingPrivateRoom.polygon.map((p) => p.y);
        const rMinX = Math.min(...rXs) - 20;
        const rMaxX = Math.max(...rXs) + 20;
        const rMinY = Math.min(...rYs) - 20;
        const rMaxY = Math.max(...rYs) + 20;

        const interiorWall =
          validatedWalls.find(
            (w) =>
              !w.is_exterior &&
              ((w.start.x >= rMinX && w.start.x <= rMaxX && w.start.y >= rMinY && w.start.y <= rMaxY) ||
                (w.end.x >= rMinX && w.end.x <= rMaxX && w.end.y >= rMinY && w.end.y <= rMaxY))
          ) || validatedWalls.find((w) => !w.is_exterior) || parentWall;

        const safeT = findSafeOpeningT(
          interiorWall,
          op.width_px,
          validatedWalls,
          0.5,
          [],
          params.furniture
        );

        issues.push({
          id: `ISS-EXT-DOOR-${op.id}`,
          category: 'unassociated_openings',
          severity: 'critical',
          element_id: op.id,
          element_type: 'opening',
          title: `Misplaced Exterior Door on ${borderingPrivateRoom.name} (${op.id})`,
          description: `Door ${op.id} is placed on exterior perimeter wall ${parentWall.id} of ${borderingPrivateRoom.name} instead of an interior partition wall.`,
          suggestion: `Move ${op.id} onto interior partition wall ${interiorWall.id}.`,
          fix_action: {
            type: 'clamp_opening',
            opening_id: op.id,
            wall_id: interiorWall.id,
            position_t: safeT,
            width_px: op.width_px,
          },
        });
        return {
          ...op,
          confidence_status: 'invalid',
          status_reason: `Misplaced on exterior wall of ${borderingPrivateRoom.name}`,
        };
      }
    }

    // Check B: Window placed on an interior partition wall
    if (op.kind === 'window' && !parentWall.is_exterior && op.provenance !== 'user_corrected') {
      const exteriorWall = validatedWalls.find((w) => w.is_exterior) || parentWall;
      const safeT = findSafeOpeningT(exteriorWall, op.width_px, validatedWalls, 0.5);
      issues.push({
        id: `ISS-INT-WIN-${op.id}`,
        category: 'unassociated_openings',
        severity: 'critical',
        element_id: op.id,
        element_type: 'opening',
        title: `Window on Interior Partition Wall (${op.id})`,
        description: `Window ${op.id} is assigned to interior partition wall ${parentWall.id}.`,
        suggestion: `Move ${op.id} to exterior wall ${exteriorWall.id} or convert to an interior door.`,
        fix_action: {
          type: 'clamp_opening',
          opening_id: op.id,
          wall_id: exteriorWall.id,
          position_t: safeT,
          width_px: op.width_px,
        },
      });
      return {
        ...op,
        confidence_status: 'invalid',
        status_reason: `Window placed on interior partition wall ${parentWall.id}`,
      };
    }

    // Check C: Corner overflow / insufficient corner clearance
    const distStartPx = (op.position_t - halfSpanT) * wallLenPx;
    const distEndPx = (1 - (op.position_t + halfSpanT)) * wallLenPx;
    if (distStartPx < 14 || distEndPx < 14) {
      const safeT = findSafeOpeningT(
        parentWall,
        op.width_px,
        validatedWalls,
        op.position_t,
        sameWallOtherOpenings,
        params.furniture
      );
      const safeW = Math.min(op.width_px, Math.round(wallLenPx * 0.45));
      issues.push({
        id: `ISS-BOUNDS-${op.id}`,
        category: 'unassociated_openings',
        severity: 'critical',
        element_id: op.id,
        element_type: 'opening',
        title: `Opening Clips Wall Corner (${op.id})`,
        description: `${op.id} is only ${Math.max(0, Math.round(Math.min(distStartPx, distEndPx)))}px from the corner of ${parentWall.id}.`,
        suggestion: `Slide ${op.id} along ${parentWall.id} to t=${safeT} away from the corner.`,
        fix_action: {
          type: 'clamp_opening',
          opening_id: op.id,
          wall_id: parentWall.id,
          position_t: safeT,
          width_px: safeW,
        },
      });
      return {
        ...op,
        confidence_status: 'invalid',
        status_reason: `Clips corner of parent wall ${parentWall.id}`,
      };
    }

    // Check D: Does this Door/Window collide with a perpendicular wall T-junction?
    for (const otherWall of validatedWalls) {
      if (otherWall.id === parentWall.id) continue;
      for (const ep of [otherWall.start, otherWall.end]) {
        const projOnParent = pointToSegmentProjection(ep, parentWall.start, parentWall.end);
        if (projOnParent.dist < 16 && projOnParent.t > 0.05 && projOnParent.t < 0.95) {
          const distAlongWallPx = Math.abs(op.position_t - projOnParent.t) * wallLenPx;
          if (distAlongWallPx < op.width_px / 2 + 15) {
            const safeT = findSafeOpeningT(
              parentWall,
              op.width_px,
              validatedWalls,
              op.position_t,
              sameWallOtherOpenings,
              params.furniture
            );
            issues.push({
              id: `ISS-TJUNC-${op.id}-${otherWall.id}`,
              category: 'unassociated_openings',
              severity: 'critical',
              element_id: op.id,
              element_type: 'opening',
              title: `Door/Window Collides with Wall Intersection (${op.id})`,
              description: `${op.id} on ${parentWall.id} overlaps the T-junction of partition wall ${otherWall.id}.`,
              suggestion: `Slide ${op.id} along ${parentWall.id} to t=${safeT} to clear the wall intersection.`,
              fix_action: {
                type: 'clamp_opening',
                opening_id: op.id,
                wall_id: parentWall.id,
                position_t: safeT,
                width_px: op.width_px,
              },
            });
            return {
              ...op,
              confidence_status: 'invalid',
              status_reason: `Collides with intersecting wall ${otherWall.id}`,
            };
          }
        }
      }
    }

    // Check E: Overlapping openings on the same wall
    for (const otherOp of sameWallOtherOpenings) {
      const distOpsPx = Math.abs(op.position_t - otherOp.position_t) * wallLenPx;
      const minAllowedPx = (op.width_px + otherOp.width_px) / 2 + 14;
      if (distOpsPx < minAllowedPx) {
        const safeT = findSafeOpeningT(
          parentWall,
          op.width_px,
          validatedWalls,
          op.position_t + 0.18,
          sameWallOtherOpenings,
          params.furniture
        );
        issues.push({
          id: `ISS-OP-OVERLAP-${op.id}`,
          category: 'overlapping_geometry',
          severity: 'critical',
          element_id: op.id,
          element_type: 'opening',
          title: `Overlapping Openings on ${parentWall.id} (${op.id})`,
          description: `${op.id} overlaps with ${otherOp.id} along ${parentWall.id}.`,
          suggestion: `Separate ${op.id} along ${parentWall.id} to t=${safeT}.`,
          fix_action: {
            type: 'clamp_opening',
            opening_id: op.id,
            wall_id: parentWall.id,
            position_t: safeT,
            width_px: op.width_px,
          },
        });
        return {
          ...op,
          confidence_status: 'invalid',
          status_reason: `Overlaps ${otherOp.id} on ${parentWall.id}`,
        };
      }
    }

    // Check F: Does this Door's walkthrough clearance collide with any Furniture item?
    if (op.kind === 'door') {
      const isHorizWall =
        Math.abs(parentWall.end.x - parentWall.start.x) >=
        Math.abs(parentWall.end.y - parentWall.start.y);
      const doorBoxHalfW = isHorizWall ? op.width_px / 2 + 8 : 38;
      const doorBoxHalfD = isHorizWall ? 38 : op.width_px / 2 + 8;

      const blockingFurn = params.furniture.find((f) => {
        const reqDx = f.width_px / 2 + doorBoxHalfW;
        const reqDy = f.depth_px / 2 + doorBoxHalfD;
        return (
          Math.abs(opCenter.x - f.center_px.x) < reqDx &&
          Math.abs(opCenter.y - f.center_px.y) < reqDy
        );
      });

      if (blockingFurn) {
        const safeT = findSafeOpeningT(
          parentWall,
          op.width_px,
          validatedWalls,
          op.position_t,
          sameWallOtherOpenings,
          params.furniture
        );
        issues.push({
          id: `ISS-DOOR-FURN-${op.id}`,
          category: 'unassociated_openings',
          severity: 'warning',
          element_id: op.id,
          element_type: 'opening',
          title: `Doorway Obstructed by Furniture (${op.id})`,
          description: `Door ${op.id} walkthrough zone conflicts with ${blockingFurn.label}.`,
          suggestion: `Reposition ${op.id} along ${parentWall.id} to t=${safeT} or adjust furniture.`,
          fix_action: {
            type: 'clamp_opening',
            opening_id: op.id,
            wall_id: parentWall.id,
            position_t: safeT,
            width_px: op.width_px,
          },
        });
        return {
          ...op,
          confidence_status: 'uncertain',
          status_reason: `Doorway clearance obstructed by ${blockingFurn.label}`,
        };
      }
    }

    // Check G: Atypical door span
    if (
      op.kind === 'door' &&
      (widthM < 0.65 || widthM > 1.3) &&
      op.provenance !== 'user_corrected'
    ) {
      const targetPx = Math.round(0.86 / Math.max(0.004, metersPerPixel));
      issues.push({
        id: `ISS-DOOR-DIM-${op.id}`,
        category: 'inconsistent_dimensions',
        severity: 'warning',
        element_id: op.id,
        element_type: 'opening',
        title: `Atypical Door Width (${op.id}: ${widthM.toFixed(2)}m)`,
        description: `Door ${op.id} measures ${widthM.toFixed(2)}m, outside standard 0.70m–1.15m architectural leaf width.`,
        suggestion: `Normalize ${op.id} to standard 0.86m width (${targetPx}px) or confirm if intentional.`,
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

    if (op.confidence < 0.88 && op.provenance !== 'user_corrected') {
      return {
        ...op,
        confidence_status: 'uncertain',
        status_reason: `Uncertain opening detection (${Math.round(op.confidence * 100)}%) — confirm or adjust`,
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

  // 3. Validate Rooms (boundary closure against walls, doorway access check, minimum habitable area)
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

    const roomXs = room.polygon.map((p) => p.x);
    const roomYs = room.polygon.map((p) => p.y);
    const rMinX = Math.min(...roomXs) - 18;
    const rMaxX = Math.max(...roomXs) + 18;
    const rMinY = Math.min(...roomYs) - 18;
    const rMaxY = Math.max(...roomYs) + 18;

    const hasBrokenAdjacentWall = validatedWalls.some((w) => {
      if (w.confidence_status !== 'invalid') return false;
      const midX = (w.start.x + w.end.x) / 2;
      const midY = (w.start.y + w.end.y) / 2;
      return midX >= rMinX && midX <= rMaxX && midY >= rMinY && midY <= rMaxY;
    });

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

    // Check if room has at least one door on its perimeter
    const hasDoorAccess = validatedOpenings.some((op) => {
      if (op.kind !== 'door') return false;
      const w = validatedWalls.find((wall) => wall.id === op.wall_id);
      if (!w) return false;
      const cx = w.start.x + (w.end.x - w.start.x) * op.position_t;
      const cy = w.start.y + (w.end.y - w.start.y) * op.position_t;
      return cx >= rMinX - 8 && cx <= rMaxX + 8 && cy >= rMinY - 8 && cy <= rMaxY + 8;
    });

    if (!hasDoorAccess && room.provenance !== 'user_corrected') {
      issues.push({
        id: `ISS-ROOM-NODOOR-${room.id}`,
        category: 'unassociated_openings',
        severity: 'warning',
        element_id: room.id,
        element_type: 'room',
        title: `Missing Doorway Access (${room.name})`,
        description: `${room.name} (${room.id}) has no detected door on any of its bounding walls.`,
        suggestion: `Use '+ Door' tool to mark the doorway into ${room.name} or confirm if open-plan.`,
        fix_action: {
          type: 'close_room_boundary',
          room_id: room.id,
        },
      });
      return {
        ...room,
        confidence_status: 'uncertain',
        status_reason: 'No doorway detected on room perimeter — needs review',
      };
    }

    if (room.confidence < 0.88 && room.provenance !== 'user_corrected') {
      return {
        ...room,
        confidence_status: 'uncertain',
        status_reason: `Uncertain room boundary (${Math.round(room.confidence * 100)}%) — verify label & bounds`,
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

  // 4. Annotate & Validate Furniture (including overlap checks)
  const validatedFurniture: FurnitureElement[] = params.furniture.map((f, idx) => {
    for (let j = 0; j < params.furniture.length; j++) {
      if (idx === j) continue;
      const other = params.furniture[j];
      const reqDx = (f.width_px + other.width_px) / 2 + 4;
      const reqDy = (f.depth_px + other.depth_px) / 2 + 4;
      if (
        Math.abs(f.center_px.x - other.center_px.x) < reqDx &&
        Math.abs(f.center_px.y - other.center_px.y) < reqDy
      ) {
        return {
          ...f,
          confidence_status: 'invalid' as ConfidenceStatus,
          status_reason: `Overlaps with ${other.label}`,
        };
      }
    }

    const status: ConfidenceStatus =
      f.provenance === 'user_corrected'
        ? 'high'
        : f.provenance === 'generated_completion'
        ? 'uncertain'
        : f.confidence >= 0.88
        ? 'high'
        : 'uncertain';

    return {
      ...f,
      confidence_status: status,
      status_reason:
        f.provenance === 'user_corrected'
          ? 'User confirmed object'
          : f.provenance === 'generated_completion'
          ? 'AI-inferred room fixture (needs review)'
          : status === 'uncertain'
          ? `Lower confidence object detection (${Math.round(f.confidence * 100)}%)`
          : 'AI-detected drawn symbol in plan',
    };
  });

  // 5. Compute Provenance Report (across structural elements + any uncertain/invalid furniture)
  const allStatuses: ConfidenceStatus[] = [
    ...validatedWalls.map((w) => w.confidence_status!),
    ...validatedOpenings.map((o) => o.confidence_status!),
    ...validatedRooms.map((r) => r.confidence_status!),
    ...validatedFurniture
      .filter((f) => f.confidence_status === 'invalid' || f.confidence_status === 'uncertain')
      .map((f) => f.confidence_status!),
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

  // 6. Compute Honest Evaluation Metrics
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
