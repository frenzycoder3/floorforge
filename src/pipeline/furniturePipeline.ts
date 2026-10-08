import {
  EpistemicProvenance,
  FurnitureCategory,
  FurnitureElement,
  OpeningElement,
  Point2D,
  RoomCategory,
  RoomPolygon,
  WallSegment,
} from '../types/floorforge';

export interface DoorClearanceBox {
  id: string;
  cx: number;
  cy: number;
  width_px: number;
  depth_px: number;
}

/**
 * Canonical coordinate transformation utilities between:
 * 1. Normalized VLM coordinates (0..1000)
 * 2. Source image / 2D SVG canvas pixel coordinates (0..imageWidth, 0..imageHeight)
 * 3. Three.js 3D world coordinates in meters (centered at floor-plan origin)
 */
export function normalizedToImagePx(
  normX: number,
  normY: number,
  imageWidth: number,
  imageHeight: number
): Point2D {
  const clampedX = Math.max(0, Math.min(1000, Number(normX) || 0));
  const clampedY = Math.max(0, Math.min(1000, Number(normY) || 0));
  return {
    x: Math.round((clampedX / 1000) * imageWidth),
    y: Math.round((clampedY / 1000) * imageHeight),
  };
}

export function computeWorldOriginMeters(
  imageWidthPx: number,
  imageHeightPx: number,
  metersPerPixel: number
): { centerX: number; centerZ: number } {
  return {
    centerX: Number(((imageWidthPx * metersPerPixel) / 2).toFixed(4)),
    centerZ: Number(((imageHeightPx * metersPerPixel) / 2).toFixed(4)),
  };
}

export function imagePxToWorldMeters(
  ptPx: Point2D,
  metersPerPixel: number,
  originM: { centerX: number; centerZ: number }
): Point2D {
  return {
    x: Number((ptPx.x * metersPerPixel - originM.centerX).toFixed(3)),
    y: Number((ptPx.y * metersPerPixel - originM.centerZ).toFixed(3)),
  };
}

/**
 * Converts an axis-aligned bounding box (xmin, ymin, xmax, ymax) in image pixel space
 * plus an orientation angle (0, 90, 180, 270 deg) into local unrotated (width_px, depth_px)
 * so that applying `rotate(rotation_deg)` in 2D SVG and `rotation.y = -rad` in Three.js
 * matches the exact drawn footprint on the source floor plan.
 */
export function bboxToOrientedDimensions(
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
  rotationDeg: number
): {
  center_px: Point2D;
  width_px: number;
  depth_px: number;
  normalizedRotationDeg: number;
  bbox_px: { xmin: number; ymin: number; xmax: number; ymax: number };
} {
  const x0 = Math.round(Math.min(xmin, xmax));
  const y0 = Math.round(Math.min(ymin, ymax));
  const x1 = Math.round(Math.max(xmin, xmax));
  const y1 = Math.round(Math.max(ymin, ymax));
  const bboxW = Math.max(24, x1 - x0);
  const bboxH = Math.max(24, y1 - y0);

  // Snap rotation to nearest 90° cardinal angle or preserve custom angle
  const normRot = (((Math.round(rotationDeg / 15) * 15) % 360) + 360) % 360;
  const isQuarterTurn =
    (normRot >= 45 && normRot <= 135) || (normRot >= 225 && normRot <= 315);

  return {
    center_px: {
      x: Math.round((x0 + x1) / 2),
      y: Math.round((y0 + y1) / 2),
    },
    width_px: isQuarterTurn ? bboxH : bboxW,
    depth_px: isQuarterTurn ? bboxW : bboxH,
    normalizedRotationDeg: normRot,
    bbox_px: { xmin: x0, ymin: y0, xmax: x1, ymax: y1 },
  };
}

/**
 * Computes the axis-aligned bounding box in image pixel space for a possibly rotated FurnitureElement.
 */
export function getFurnitureAxisAlignedBBox(item: FurnitureElement): {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
} {
  const rad = ((item.rotation_deg || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const aabbW = item.width_px * cos + item.depth_px * sin;
  const aabbH = item.width_px * sin + item.depth_px * cos;
  return {
    xmin: Math.round(item.center_px.x - aabbW / 2),
    ymin: Math.round(item.center_px.y - aabbH / 2),
    xmax: Math.round(item.center_px.x + aabbW / 2),
    ymax: Math.round(item.center_px.y + aabbH / 2),
  };
}

/**
 * Ray-casting point-in-polygon check for assigning detected furniture to its enclosing room.
 */
export function pointInPolygon(pt: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Finds the best enclosing room for a 2D point `(cx, cy)`.
 * Prefers exact polygon containment; falls back to nearest room centroid.
 */
export function findEnclosingRoom<
  T extends { id: string; category: RoomCategory; polygon: Point2D[] }
>(pt: Point2D, rooms: T[]): T | undefined {
  if (rooms.length === 0) return undefined;
  const containing = rooms.filter((r) => pointInPolygon(pt, r.polygon));
  if (containing.length === 1) return containing[0];
  if (containing.length > 1) {
    // Pick the smallest enclosing room polygon (most specific room)
    return containing.sort((a, b) => {
      const areaA =
        (Math.max(...a.polygon.map((p) => p.x)) - Math.min(...a.polygon.map((p) => p.x))) *
        (Math.max(...a.polygon.map((p) => p.y)) - Math.min(...a.polygon.map((p) => p.y)));
      const areaB =
        (Math.max(...b.polygon.map((p) => p.x)) - Math.min(...b.polygon.map((p) => p.x))) *
        (Math.max(...b.polygon.map((p) => p.y)) - Math.min(...b.polygon.map((p) => p.y)));
      return areaA - areaB;
    })[0];
  }

  // Fallback: closest room centroid
  let bestRoom = rooms[0];
  let bestDist = Infinity;
  for (const r of rooms) {
    const cx = r.polygon.reduce((acc, p) => acc + p.x, 0) / (r.polygon.length || 1);
    const cy = r.polygon.reduce((acc, p) => acc + p.y, 0) / (r.polygon.length || 1);
    const d = Math.hypot(pt.x - cx, pt.y - cy);
    if (d < bestDist) {
      bestDist = d;
      bestRoom = r;
    }
  }
  return bestRoom;
}

/**
 * Computes 2D bounding-box Intersection over Union (IoU) between two furniture items.
 */
export function computeFurnitureIoU(a: FurnitureElement, b: FurnitureElement): number {
  const boxA = getFurnitureAxisAlignedBBox(a);
  const boxB = getFurnitureAxisAlignedBBox(b);

  const interX0 = Math.max(boxA.xmin, boxB.xmin);
  const interY0 = Math.max(boxA.ymin, boxB.ymin);
  const interX1 = Math.min(boxA.xmax, boxB.xmax);
  const interY1 = Math.min(boxA.ymax, boxB.ymax);

  const interW = Math.max(0, interX1 - interX0);
  const interH = Math.max(0, interY1 - interY0);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;

  const areaA = Math.max(1, (boxA.xmax - boxA.xmin) * (boxA.ymax - boxA.ymin));
  const areaB = Math.max(1, (boxB.xmax - boxB.xmin) * (boxB.ymax - boxB.ymin));
  return interArea / (areaA + areaB - interArea);
}

/**
 * Categories that are normally singular anchor fixtures per room,
 * whereas 'nightstand' or 'desk' can legitimately appear multiple times in a room.
 */
const SINGULAR_ANCHOR_CATEGORIES = new Set<FurnitureCategory>([
  'bed',
  'sofa',
  'dining_table',
  'kitchen_counter',
  'fridge',
  'toilet',
  'sink_vanity',
  'shower',
  'bathtub',
  'tv_stand',
]);

/**
 * Prevents accidental duplicate furniture detections using object-level Non-Maximum Suppression (NMS),
 * category matching, and spatial overlap checks, while preserving legitimate multiple objects
 * (such as left and right bedside tables/nightstands).
 */
export function deduplicateFurnitureElements(items: FurnitureElement[]): FurnitureElement[] {
  // Priority order: user_corrected > observed > generated_completion, then by confidence descending
  const rankProvenance = (p: EpistemicProvenance) =>
    p === 'user_corrected' ? 3 : p === 'observed' ? 2 : 1;

  const sorted = [...items].sort((a, b) => {
    const provDiff = rankProvenance(b.provenance) - rankProvenance(a.provenance);
    if (provDiff !== 0) return provDiff;
    return b.confidence - a.confidence;
  });

  const kept: FurnitureElement[] = [];

  for (const cand of sorted) {
    let isDuplicate = false;

    for (const existing of kept) {
      const iou = computeFurnitureIoU(cand, existing);
      const centerDist = Math.hypot(
        cand.center_px.x - existing.center_px.x,
        cand.center_px.y - existing.center_px.y
      );
      const avgSpan =
        (Math.max(cand.width_px, cand.depth_px) +
          Math.max(existing.width_px, existing.depth_px)) /
        2;

      // 1. High spatial overlap between any two objects -> duplicate / conflicting detection
      if (iou > 0.35) {
        isDuplicate = true;
        break;
      }

      // 2. Same category in the same room:
      if (cand.kind === existing.kind && cand.room_id === existing.room_id) {
        if (SINGULAR_ANCHOR_CATEGORIES.has(cand.kind)) {
          // Singular room fixture (e.g. two beds or two sofas predicted in the same room)
          if (iou > 0.08 || centerDist < avgSpan * 1.35) {
            isDuplicate = true;
            break;
          }
        } else {
          // Repeatable items (e.g. nightstands, desks): only suppress if centers are very close
          if (iou > 0.18 || centerDist < avgSpan * 0.65) {
            isDuplicate = true;
            break;
          }
        }
      }
    }

    if (!isDuplicate) {
      kept.push(cand);
    }
  }

  return kept;
}

/**
 * Computes 2D clearance boxes around every door so furniture never blocks a doorway
 * on either side of the wall.
 */
export function computeDoorClearanceBoxes(
  walls: WallSegment[],
  openings: OpeningElement[]
): DoorClearanceBox[] {
  const boxes: DoorClearanceBox[] = [];
  for (const op of openings) {
    if (op.kind !== 'door') continue;
    const wall = walls.find((w) => w.id === op.wall_id);
    if (!wall) continue;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const cx = wall.start.x + dx * op.position_t;
    const cy = wall.start.y + dy * op.position_t;
    const isHorizontal = Math.abs(dx) >= Math.abs(dy);
    const spanAlongWall = op.width_px + 24;
    const clearancePerp = 104;

    boxes.push({
      id: op.id,
      cx: Math.round(cx),
      cy: Math.round(cy),
      width_px: isHorizontal ? spanAlongWall : clearancePerp,
      depth_px: isHorizontal ? clearancePerp : spanAlongWall,
    });
  }
  return boxes;
}

/**
 * Resolves minor wall/door/object collisions for generated or heuristic furniture,
 * while preserving the detected position of observed / user-corrected furniture
 * unless it physically protrudes outside the room's walls.
 */
export function clampAndDecollideRoomFurniture(
  items: FurnitureElement[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  wallMarginPx = 14,
  minGapPx = 10,
  doorBoxes: DoorClearanceBox[] = []
): FurnitureElement[] {
  const safeMinX = minX + wallMarginPx;
  const safeMaxX = maxX - wallMarginPx;
  const safeMinY = minY + wallMarginPx;
  const safeMaxY = maxY - wallMarginPx;
  const safeW = Math.max(40, safeMaxX - safeMinX);
  const safeH = Math.max(40, safeMaxY - safeMinY);

  const relevantDoors = doorBoxes.filter(
    (d) =>
      d.cx + d.width_px / 2 >= minX - 20 &&
      d.cx - d.width_px / 2 <= maxX + 20 &&
      d.cy + d.depth_px / 2 >= minY - 20 &&
      d.cy - d.depth_px / 2 <= maxY + 20
  );

  // Deduplicate first
  const deduped = deduplicateFurnitureElements(items);
  const placed: FurnitureElement[] = [];

  for (const rawItem of deduped) {
    const item = structuredClone(rawItem);

    // If user manually positioned this item, preserve exact coordinates
    if (item.provenance === 'user_corrected') {
      placed.push(item);
      continue;
    }

    // Clamp overly large bounding boxes so they fit inside the room
    const aabb = getFurnitureAxisAlignedBBox(item);
    const aabbW = aabb.xmax - aabb.xmin;
    const aabbH = aabb.ymax - aabb.ymin;
    if (aabbW > safeW * 0.72) {
      const scale = (safeW * 0.72) / aabbW;
      item.width_px = Math.max(26, Math.round(item.width_px * scale));
      item.depth_px = Math.max(26, Math.round(item.depth_px * scale));
    }
    if (aabbH > safeH * 0.72) {
      const scale = (safeH * 0.72) / aabbH;
      item.width_px = Math.max(26, Math.round(item.width_px * scale));
      item.depth_px = Math.max(26, Math.round(item.depth_px * scale));
    }

    const updatedBox = getFurnitureAxisAlignedBBox(item);
    const hw = (updatedBox.xmax - updatedBox.xmin) / 2;
    const hd = (updatedBox.ymax - updatedBox.ymin) / 2;

    // Keep within room interior wall boundaries
    item.center_px.x = Math.round(
      Math.max(safeMinX + hw, Math.min(safeMaxX - hw, item.center_px.x))
    );
    item.center_px.y = Math.round(
      Math.max(safeMinY + hd, Math.min(safeMaxY - hd, item.center_px.y))
    );

    // Only apply iterative de-collision shifting to generated_completion or low-confidence heuristic objects.
    // For observed objects from the source plan, we keep their detected coordinates so 2D & 3D match the drawing!
    if (
      item.provenance === 'generated_completion' ||
      item.detector_source === 'raster_contour_heuristic'
    ) {
      for (let iter = 0; iter < 10; iter++) {
        let moved = false;

        for (const door of relevantDoors) {
          const reqDx = hw + door.width_px / 2;
          const reqDy = hd + door.depth_px / 2;
          const dx = item.center_px.x - door.cx;
          const dy = item.center_px.y - door.cy;

          if (Math.abs(dx) < reqDx && Math.abs(dy) < reqDy) {
            const overlapX = reqDx - Math.abs(dx);
            const overlapY = reqDy - Math.abs(dy);
            if (overlapX <= overlapY) {
              const roomMidX = (safeMinX + safeMaxX) / 2;
              const dirX = dx === 0 ? (door.cx < roomMidX ? 1 : -1) : dx > 0 ? 1 : -1;
              item.center_px.x = Math.round(item.center_px.x + dirX * (overlapX + 4));
            } else {
              const roomMidY = (safeMinY + safeMaxY) / 2;
              const dirY = dy === 0 ? (door.cy < roomMidY ? 1 : -1) : dy > 0 ? 1 : -1;
              item.center_px.y = Math.round(item.center_px.y + dirY * (overlapY + 4));
            }
            item.center_px.x = Math.round(
              Math.max(safeMinX + hw, Math.min(safeMaxX - hw, item.center_px.x))
            );
            item.center_px.y = Math.round(
              Math.max(safeMinY + hd, Math.min(safeMaxY - hd, item.center_px.y))
            );
            moved = true;
          }
        }

        for (const other of placed) {
          const otherBox = getFurnitureAxisAlignedBBox(other);
          const otherHw = (otherBox.xmax - otherBox.xmin) / 2;
          const otherHd = (otherBox.ymax - otherBox.ymin) / 2;
          const reqDx = hw + otherHw + minGapPx;
          const reqDy = hd + otherHd + minGapPx;
          const dx = item.center_px.x - other.center_px.x;
          const dy = item.center_px.y - other.center_px.y;

          if (Math.abs(dx) < reqDx && Math.abs(dy) < reqDy) {
            const overlapX = reqDx - Math.abs(dx);
            const overlapY = reqDy - Math.abs(dy);
            if (overlapX < overlapY) {
              const dirX = dx >= 0 ? 1 : -1;
              item.center_px.x = Math.round(item.center_px.x + dirX * (overlapX + 2));
            } else {
              const dirY = dy >= 0 ? 1 : -1;
              item.center_px.y = Math.round(item.center_px.y + dirY * (overlapY + 2));
            }
            item.center_px.x = Math.round(
              Math.max(safeMinX + hw, Math.min(safeMaxX - hw, item.center_px.x))
            );
            item.center_px.y = Math.round(
              Math.max(safeMinY + hd, Math.min(safeMaxY - hd, item.center_px.y))
            );
            moved = true;
          }
        }
        if (!moved) break;
      }
    }

    placed.push(item);
  }

  return deduplicateFurnitureElements(placed);
}

/**
 * STAGE 1A: Local Raster Connected-Component Furniture Detector (`raster_contour_heuristic`).
 * Inspects actual dark-ink connected components inside each room's interior in the uploaded image,
 * extracts their real pixel bounding boxes, centers, and aspect ratios, and marks uncertain
 * heuristic detections for user review instead of blindly inventing confident coordinates.
 */
export function detectFurnitureFromRasterContours(params: {
  isInk: Uint8Array;
  sampleW: number;
  sampleH: number;
  imageWidth: number;
  imageHeight: number;
  rooms: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[];
}): FurnitureElement[] {
  const { isInk, sampleW, sampleH, imageWidth, imageHeight, rooms } = params;
  const visited = new Uint8Array(sampleW * sampleH);
  const detected: FurnitureElement[] = [];

  const toPxX = (sx: number) => Math.round((sx / sampleW) * imageWidth);
  const toPxY = (sy: number) => Math.round((sy / sampleH) * imageHeight);

  rooms.forEach((room, rIdx) => {
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const rMinX = Math.min(...xs);
    const rMaxX = Math.max(...xs);
    const rMinY = Math.min(...ys);
    const rMaxY = Math.max(...ys);

    // Scan strictly inside the room interior (inset from walls by 12% so wall lines aren't mistaken for furniture)
    const padX = Math.max(18, Math.round((rMaxX - rMinX) * 0.12));
    const padY = Math.max(18, Math.round((rMaxY - rMinY) * 0.12));
    const sX0 = Math.max(4, Math.round(((rMinX + padX) / imageWidth) * sampleW));
    const sX1 = Math.min(sampleW - 4, Math.round(((rMaxX - padX) / imageWidth) * sampleW));
    const sY0 = Math.max(4, Math.round(((rMinY + padY) / imageHeight) * sampleH));
    const sY1 = Math.min(sampleH - 4, Math.round(((rMaxY - padY) / imageHeight) * sampleH));

    if (sX1 - sX0 < 12 || sY1 - sY0 < 12) return;

    interface Blob {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      inkCount: number;
      area: number;
    }
    const roomBlobs: Blob[] = [];

    for (let sy = sY0; sy <= sY1; sy++) {
      for (let sx = sX0; sx <= sX1; sx++) {
        const idx = sy * sampleW + sx;
        if (!isInk[idx] || visited[idx]) continue;

        // BFS connected component with 2px morphological bridge
        const queue: [number, number][] = [[sx, sy]];
        visited[idx] = 1;
        let bMinX = sx;
        let bMaxX = sx;
        let bMinY = sy;
        let bMaxY = sy;
        let inkCount = 0;

        while (queue.length > 0) {
          const [cx, cy] = queue.pop()!;
          inkCount++;
          if (cx < bMinX) bMinX = cx;
          if (cx > bMaxX) bMaxX = cx;
          if (cy < bMinY) bMinY = cy;
          if (cy > bMaxY) bMaxY = cy;

          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < sX0 || nx > sX1 || ny < sY0 || ny > sY1) continue;
              const nIdx = ny * sampleW + nx;
              if (isInk[nIdx] && !visited[nIdx]) {
                visited[nIdx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
        }

        const bw = bMaxX - bMinX + 1;
        const bh = bMaxY - bMinY + 1;
        const area = bw * bh;
        // Filter out tiny text labels (< 45 sample px²) and full-room grid noise (> 55% of room area)
        const roomSampleArea = (sX1 - sX0) * (sY1 - sY0);
        if (bw >= 7 && bh >= 7 && area >= 55 && area <= roomSampleArea * 0.52 && inkCount >= 14) {
          roomBlobs.push({ minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY, inkCount, area });
        }
      }
    }

    // Sort blobs by bounding-box area descending and keep top distinct interior symbols
    roomBlobs.sort((a, b) => b.area - a.area);
    const topBlobs = roomBlobs.slice(0, 3);

    topBlobs.forEach((blob, bIdx) => {
      const xmin = toPxX(blob.minX);
      const ymin = toPxY(blob.minY);
      const xmax = toPxX(blob.maxX);
      const ymax = toPxY(blob.maxY);
      const wPx = Math.max(32, xmax - xmin);
      const dPx = Math.max(32, ymax - ymin);
      const cx = Math.round((xmin + xmax) / 2);
      const cy = Math.round((ymin + ymax) / 2);

      // Determine orientation from proximity to room walls (headboard/back against nearest wall)
      const distTop = Math.abs(ymin - rMinY);
      const distBot = Math.abs(rMaxY - ymax);
      const distLeft = Math.abs(xmin - rMinX);
      const distRight = Math.abs(rMaxX - xmax);
      const minWallDist = Math.min(distTop, distBot, distLeft, distRight);
      const rotDeg =
        minWallDist === distBot
          ? 180
          : minWallDist === distLeft
          ? 270
          : minWallDist === distRight
          ? 90
          : 0;

      // Classify symbol kind based on room category & blob aspect ratio / rank
      let kind: FurnitureCategory = 'sofa';
      let label = 'Detected Floor-Plan Fixture';
      let heightM = 0.85;

      if (room.category === 'bedroom') {
        if (bIdx === 0) {
          kind = 'bed';
          label = 'Detected Bed Symbol (Heuristic)';
          heightM = 1.02;
        } else if (Math.max(wPx, dPx) / Math.max(1, Math.min(wPx, dPx)) > 1.8) {
          kind = 'wardrobe';
          label = 'Detected Wardrobe Symbol (Heuristic)';
          heightM = 2.1;
        } else {
          kind = 'nightstand';
          label = 'Detected Bedside Table (Heuristic)';
          heightM = 0.56;
        }
      } else if (room.category === 'living') {
        if (bIdx === 0) {
          kind = 'sofa';
          label = 'Detected Sofa Symbol (Heuristic)';
          heightM = 0.84;
        } else if (bIdx === 1) {
          kind = 'coffee_table';
          label = 'Detected Coffee Table (Heuristic)';
          heightM = 0.42;
        } else {
          kind = 'tv_stand';
          label = 'Detected Media Console (Heuristic)';
          heightM = 1.6;
        }
      } else if (room.category === 'kitchen') {
        if (bIdx === 0) {
          kind = 'kitchen_counter';
          label = 'Detected Kitchen Counter Symbol (Heuristic)';
          heightM = 2.05;
        } else if (bIdx === 1) {
          kind = 'dining_table';
          label = 'Detected Dining Table (Heuristic)';
          heightM = 0.76;
        } else {
          kind = 'fridge';
          label = 'Detected Refrigerator (Heuristic)';
          heightM = 1.82;
        }
      } else if (room.category === 'bathroom') {
        if (bIdx === 0) {
          kind = 'shower';
          label = 'Detected Shower Enclosure (Heuristic)';
          heightM = 2.0;
        } else if (bIdx === 1) {
          kind = 'sink_vanity';
          label = 'Detected Washbasin Vanity (Heuristic)';
          heightM = 1.8;
        } else {
          kind = 'toilet';
          label = 'Detected Toilet WC (Heuristic)';
          heightM = 0.78;
        }
      } else if (room.category === 'office') {
        kind = 'desk';
        label = 'Detected Study Desk (Heuristic)';
        heightM = 0.76;
      }

      const oriented = bboxToOrientedDimensions(xmin, ymin, xmax, ymax, rotDeg);

      // Heuristic contour detections are honestly marked with 0.81 confidence (< 0.88 -> Amber Uncertain)
      // so the user knows it came from an untrained contour heuristic and can review or await AI Vision.
      detected.push({
        id: `CV-FURN-${rIdx + 1}-${bIdx + 1}`,
        room_id: room.id,
        kind,
        label,
        center_px: oriented.center_px,
        width_px: oriented.width_px,
        depth_px: oriented.depth_px,
        height_m: heightM,
        rotation_deg: oriented.normalizedRotationDeg,
        confidence: 0.81,
        provenance: 'observed',
        detected_bbox_px: oriented.bbox_px,
        detected_center_px: { ...oriented.center_px },
        detector_source: 'raster_contour_heuristic',
      });
    });
  });

  return deduplicateFurnitureElements(detected);
}

/**
 * STAGE 1B: Parses Gemini Vision furniture predictions into canonical pixel space,
 * preserves the exact detected bounding boxes & centers, fixes 90°/270° rotated dimensions,
 * and deduplicates overlapping predictions.
 */
export function parseGeminiDetectedFurniture(params: {
  rawFurniture: any[];
  imageWidth: number;
  imageHeight: number;
  rooms: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[];
}): FurnitureElement[] {
  const { rawFurniture, imageWidth, imageHeight, rooms } = params;
  const validFurnKinds: FurnitureCategory[] = [
    'bed',
    'nightstand',
    'wardrobe',
    'sofa',
    'coffee_table',
    'tv_stand',
    'dining_table',
    'kitchen_counter',
    'fridge',
    'bathtub',
    'toilet',
    'sink_vanity',
    'shower',
    'desk',
  ];

  const parsed: FurnitureElement[] = (rawFurniture || [])
    .filter((f: any) => f && validFurnKinds.includes(f.kind))
    .map((f: any, idx: number) => {
      const p0 = normalizedToImagePx(f.xmin, f.ymin, imageWidth, imageHeight);
      const p1 = normalizedToImagePx(f.xmax, f.ymax, imageWidth, imageHeight);
      const rotDeg = Number(f.rotation_deg) || 0;
      const oriented = bboxToOrientedDimensions(p0.x, p0.y, p1.x, p1.y, rotDeg);

      const enclosingRoom = findEnclosingRoom(oriented.center_px, rooms);
      const rawConf = Number(f.confidence);
      const conf =
        !isNaN(rawConf) && rawConf >= 0.5 && rawConf <= 0.99 ? rawConf : 0.89;

      const defaultHeight: Record<FurnitureCategory, number> = {
        bed: 1.02,
        nightstand: 0.56,
        wardrobe: 2.1,
        sofa: 0.84,
        coffee_table: 0.42,
        tv_stand: 1.6,
        dining_table: 0.76,
        kitchen_counter: 2.05,
        fridge: 1.82,
        bathtub: 0.62,
        toilet: 0.78,
        sink_vanity: 1.8,
        shower: 2.0,
        desk: 0.76,
      };

      const kind = f.kind as FurnitureCategory;
      return {
        id: `OBS-FURN-${idx + 1}`,
        room_id: enclosingRoom?.id || rooms[0]?.id || 'R-01',
        kind,
        label: f.label || String(kind).replace(/_/g, ' '),
        center_px: oriented.center_px,
        width_px: oriented.width_px,
        depth_px: oriented.depth_px,
        height_m: defaultHeight[kind] || 0.82,
        rotation_deg: oriented.normalizedRotationDeg,
        confidence: conf,
        provenance: 'observed' as EpistemicProvenance,
        detected_bbox_px: oriented.bbox_px,
        detected_center_px: { ...oriented.center_px },
        detector_source: 'gemini_vision' as const,
      };
    });

  return deduplicateFurnitureElements(parsed);
}

/**
 * STAGE 2: Separate Furniture Generation / Auto-Furnish Engine (`generated_completion`).
 * - ONLY generates furniture for rooms or categories NOT already present in `existingDetectedFurniture`.
 * - Never overwrites or duplicates detected furniture in the source floor plan.
 * - Uses each room polygon's actual geometry and doorway clearance zones rather than hardcoded coordinates.
 */
export function generateRoomCompletionFurniture(
  rooms: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[],
  mPerPx: number,
  walls: WallSegment[] = [],
  openings: OpeningElement[] = [],
  existingDetectedFurniture: FurnitureElement[] = [],
  markAsObservedForPreset = false
): FurnitureElement[] {
  const allItems: FurnitureElement[] = [...existingDetectedFurniture];
  const pxForMeters = (m: number) => Math.round(m / Math.max(0.005, mPerPx));
  const doorBoxes = computeDoorClearanceBoxes(walls, openings);

  rooms.forEach((room, idx) => {
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = Math.round((minX + maxX) / 2);
    const spanW = maxX - minX;
    const spanH = maxY - minY;

    if (spanW < 90 || spanH < 90) return;

    // Inspect what furniture is ALREADY detected in this room
    const roomExisting = allItems.filter(
      (f) => f.room_id === room.id || pointInPolygon(f.center_px, room.polygon)
    );

    // Rule: If a room already has ANY detected furniture from the uploaded plan (and we are not building a preset),
    // do NOT blindly invent extra furniture on top of the room!
    if (!markAsObservedForPreset && roomExisting.length > 0) {
      return;
    }

    const hasKind = (k: FurnitureCategory) => roomExisting.some((f) => f.kind === k);
    const prov: EpistemicProvenance = markAsObservedForPreset
      ? 'observed'
      : 'generated_completion';
    const sourceTag = markAsObservedForPreset
      ? 'blueprint_annotation'
      : 'generated_completion';
    const conf = markAsObservedForPreset ? 0.95 : 0.82;

    const candidates: FurnitureElement[] = [];
    const wallPad = Math.max(18, Math.round(Math.min(spanW, spanH) * 0.075));

    // Check which walls of this room have doors so we place anchor furniture against a door-free wall
    const hasNorthDoor = doorBoxes.some(
      (d) => Math.abs(d.cy - minY) < 48 && d.cx >= minX - 15 && d.cx <= maxX + 15
    );
    const hasSouthDoor = doorBoxes.some(
      (d) => Math.abs(d.cy - maxY) < 48 && d.cx >= minX - 15 && d.cx <= maxX + 15
    );
    const hasEastDoor = doorBoxes.some(
      (d) => Math.abs(d.cx - maxX) < 75 && d.cy >= minY - 15 && d.cy <= maxY + 15
    );

    const makeItem = (
      idSuffix: string,
      kind: FurnitureCategory,
      label: string,
      centerX: number,
      centerY: number,
      wPx: number,
      dPx: number,
      heightM: number,
      rotDeg: number
    ): FurnitureElement => {
      const item: FurnitureElement = {
        id: `FURN-${idx + 1}-${idSuffix}`,
        room_id: room.id,
        kind,
        label,
        center_px: { x: Math.round(centerX), y: Math.round(centerY) },
        width_px: Math.round(wPx),
        depth_px: Math.round(dPx),
        height_m: heightM,
        rotation_deg: rotDeg,
        confidence: conf,
        provenance: prov,
        detected_center_px: { x: Math.round(centerX), y: Math.round(centerY) },
        detector_source: sourceTag,
      };
      item.detected_bbox_px = getFurnitureAxisAlignedBBox(item);
      return item;
    };

    if (room.category === 'bedroom') {
      // Place headboard against whichever wall (North or South) does NOT have a doorway
      const placeHeadboardSouth = hasNorthDoor && !hasSouthDoor;
      const bedW = Math.min(spanW * 0.36, pxForMeters(1.62));
      const bedD = Math.min(spanH * 0.44, pxForMeters(1.86));
      const bedX = cx;
      const bedY = placeHeadboardSouth
        ? Math.round(maxY - wallPad - bedD / 2)
        : Math.round(minY + wallPad + bedD / 2);
      const bedRot = placeHeadboardSouth ? 180 : 0;

      if (!hasKind('bed')) {
        candidates.push(
          makeItem(
            'BED',
            'bed',
            'Teak King Bed, Pillows & Duvet',
            bedX,
            bedY,
            bedW,
            bedD,
            1.02,
            bedRot
          )
        );
      }

      if (!hasKind('nightstand') && spanW >= 290) {
        const nsW = Math.min(spanW * 0.1, pxForMeters(0.42));
        const nsD = Math.min(spanH * 0.12, pxForMeters(0.38));
        const nsY = placeHeadboardSouth
          ? Math.round(maxY - wallPad - nsD / 2 - 2)
          : Math.round(minY + wallPad + nsD / 2 + 2);
        const gapPx = 18;

        candidates.push(
          makeItem(
            'NSL',
            'nightstand',
            'Left Bedside Table & Warm Lamp',
            bedX - bedW / 2 - nsW / 2 - gapPx,
            nsY,
            nsW,
            nsD,
            0.56,
            bedRot
          ),
          makeItem(
            'NSR',
            'nightstand',
            'Right Bedside Table & Warm Lamp',
            bedX + bedW / 2 + nsW / 2 + gapPx,
            nsY,
            nsW,
            nsD,
            0.56,
            bedRot
          )
        );
      }

      if (!hasKind('wardrobe')) {
        const wardW = Math.min(spanW * 0.34, pxForMeters(1.4));
        const wardD = Math.min(spanH * 0.14, pxForMeters(0.5));
        const wardY = placeHeadboardSouth
          ? Math.round(minY + wallPad + wardD / 2)
          : Math.round(maxY - wallPad - wardD / 2);
        const wardX = hasEastDoor
          ? Math.round(minX + wallPad + wardW / 2)
          : Math.round(maxX - wallPad - wardW / 2);

        candidates.push(
          makeItem(
            'WARD',
            'wardrobe',
            'Sliding Teak & Fluted-Glass Wardrobe',
            wardX,
            wardY,
            wardW,
            wardD,
            2.1,
            placeHeadboardSouth ? 0 : 180
          )
        );
      }
    } else if (room.category === 'bathroom') {
      if (!hasKind('shower')) {
        const shwW = Math.min(spanW * 0.35, pxForMeters(0.96));
        const shwD = Math.min(spanH * 0.32, pxForMeters(0.88));
        candidates.push(
          makeItem(
            'SHOWER',
            'shower',
            'Frameless Glass Shower Enclosure',
            maxX - wallPad - shwW / 2,
            minY + wallPad + shwD / 2,
            shwW,
            shwD,
            2.0,
            0
          )
        );
      }
      if (!hasKind('toilet')) {
        const wcW = Math.min(spanW * 0.18, pxForMeters(0.44));
        const wcD = Math.min(spanH * 0.2, pxForMeters(0.58));
        candidates.push(
          makeItem(
            'WC',
            'toilet',
            'Wall-Hung Ceramic WC',
            minX + wallPad + wcW / 2 + 8,
            maxY - wallPad - wcD / 2,
            wcW,
            wcD,
            0.78,
            180
          )
        );
      }
      if (!hasKind('sink_vanity')) {
        const sinkW = Math.min(spanW * 0.32, pxForMeters(0.86));
        const sinkD = Math.min(spanH * 0.18, pxForMeters(0.48));
        candidates.push(
          makeItem(
            'SINK',
            'sink_vanity',
            'Marble Washbasin Vanity & Mirror',
            maxX - wallPad - sinkW / 2,
            maxY - wallPad - sinkD / 2,
            sinkW,
            sinkD,
            1.8,
            180
          )
        );
      }
    } else if (room.category === 'living') {
      const sofaW = Math.min(spanW * 0.42, pxForMeters(2.1));
      const sofaD = Math.min(spanH * 0.22, pxForMeters(0.86));
      const sofaX = Math.round(cx + spanW * 0.02);
      const sofaY = Math.round(minY + wallPad + sofaD / 2 + 6);

      if (!hasKind('sofa')) {
        candidates.push(
          makeItem(
            'SOFA',
            'sofa',
            'Designer Sofa & Cushions',
            sofaX,
            sofaY,
            sofaW,
            sofaD,
            0.84,
            0
          )
        );
      }
      if (!hasKind('coffee_table')) {
        const ctW = Math.min(spanW * 0.24, pxForMeters(1.08));
        const ctD = Math.min(spanH * 0.14, pxForMeters(0.56));
        const ctY = Math.round(sofaY + sofaD / 2 + ctD / 2 + 28);
        candidates.push(
          makeItem(
            'CT',
            'coffee_table',
            'Travertine Coffee Table',
            sofaX,
            ctY,
            ctW,
            ctD,
            0.42,
            0
          )
        );
      }
      if (!hasKind('tv_stand')) {
        const tvW = Math.min(spanW * 0.32, pxForMeters(1.55));
        const tvD = Math.min(spanH * 0.12, pxForMeters(0.38));
        candidates.push(
          makeItem(
            'TV',
            'tv_stand',
            'Fluted Teak TV Unit & OLED Panel',
            sofaX,
            maxY - wallPad - tvD / 2,
            tvW,
            tvD,
            1.6,
            180
          )
        );
      }
    } else if (room.category === 'kitchen') {
      if (!hasKind('kitchen_counter')) {
        const cntW = Math.min(spanW * 0.48, pxForMeters(2.0));
        const cntD = Math.min(spanH * 0.2, pxForMeters(0.58));
        candidates.push(
          makeItem(
            'KCNT',
            'kitchen_counter',
            'Modular Kitchen Counter & Sink',
            minX + wallPad + cntW / 2,
            maxY - wallPad - cntD / 2,
            cntW,
            cntD,
            2.05,
            180
          )
        );
      }
      if (!hasKind('fridge')) {
        const frW = Math.min(spanW * 0.18, pxForMeters(0.76));
        const frD = Math.min(spanH * 0.2, pxForMeters(0.62));
        candidates.push(
          makeItem(
            'FRIDGE',
            'fridge',
            'Double-Door Refrigerator',
            maxX - wallPad - frW / 2,
            maxY - wallPad - frD / 2,
            frW,
            frD,
            1.82,
            180
          )
        );
      }
      if (!hasKind('dining_table')) {
        const dtW = Math.min(spanW * 0.34, pxForMeters(1.2));
        const dtD = Math.min(spanH * 0.24, pxForMeters(0.74));
        candidates.push(
          makeItem(
            'DINE',
            'dining_table',
            'Teak Dining Table & 4 Chairs',
            maxX - wallPad - dtW / 2 - 12,
            minY + wallPad + dtD / 2 + 12,
            dtW,
            dtD,
            0.76,
            0
          )
        );
      }
    } else if (room.category === 'office') {
      if (!hasKind('desk')) {
        const dskW = Math.min(spanW * 0.42, pxForMeters(1.38));
        const dskD = Math.min(spanH * 0.2, pxForMeters(0.66));
        candidates.push(
          makeItem(
            'DESK',
            'desk',
            'Study Desk, Chair & Bookshelf',
            cx,
            maxY - wallPad - dskD / 2 - 8,
            dskW,
            dskD,
            0.76,
            180
          )
        );
      }
    }

    const combinedRoom = clampAndDecollideRoomFurniture(
      [...roomExisting, ...candidates],
      minX,
      minY,
      maxX,
      maxY,
      wallPad,
      14,
      doorBoxes
    );

    for (const c of combinedRoom) {
      if (!allItems.some((existing) => existing.id === c.id)) {
        allItems.push(c);
      }
    }
  });

  return deduplicateFurnitureElements(allItems);
}
