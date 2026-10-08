import { BlueprintPreset, FurnitureElement, RoomPolygon } from '../types/floorforge';

/**
 * Ensures no two furniture items in a room overlap and every item stays
 * comfortably inside the room's inner wall clearance boundary.
 */
export function decollideRoomFurniture(
  items: FurnitureElement[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  wallMarginPx = 22,
  minGapPx = 16
): FurnitureElement[] {
  const safeMinX = minX + wallMarginPx;
  const safeMaxX = maxX - wallMarginPx;
  const safeMinY = minY + wallMarginPx;
  const safeMaxY = maxY - wallMarginPx;
  const safeW = Math.max(40, safeMaxX - safeMinX);
  const safeH = Math.max(40, safeMaxY - safeMinY);

  const placed: FurnitureElement[] = [];

  for (const rawItem of items) {
    const item = structuredClone(rawItem);
    // Cap item dimensions so a single piece never dominates a tight room
    item.width_px = Math.min(item.width_px, Math.round(safeW * 0.46));
    item.depth_px = Math.min(item.depth_px, Math.round(safeH * 0.46));

    const hw = item.width_px / 2;
    const hd = item.depth_px / 2;

    // Clamp inside room safe zone
    item.center_px.x = Math.round(
      Math.max(safeMinX + hw, Math.min(safeMaxX - hw, item.center_px.x))
    );
    item.center_px.y = Math.round(
      Math.max(safeMinY + hd, Math.min(safeMaxY - hd, item.center_px.y))
    );

    // Iteratively resolve AABB overlap with already placed items in this room
    let hasUnresolvableOverlap = false;
    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (const other of placed) {
        const reqDx = (item.width_px + other.width_px) / 2 + minGapPx;
        const reqDy = (item.depth_px + other.depth_px) / 2 + minGapPx;
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

          // Re-clamp to room interior
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

    // Final check: if still overlapping after nudging, skip secondary item to keep room spacious
    for (const other of placed) {
      const reqDx = (item.width_px + other.width_px) / 2 + 6;
      const reqDy = (item.depth_px + other.depth_px) / 2 + 6;
      if (
        Math.abs(item.center_px.x - other.center_px.x) < reqDx &&
        Math.abs(item.center_px.y - other.center_px.y) < reqDy
      ) {
        hasUnresolvableOverlap = true;
        break;
      }
    }

    if (!hasUnresolvableOverlap) {
      placed.push(item);
    }
  }

  return placed;
}

/**
 * Generates spacious, architecturally balanced, collision-free interior furniture
 * sets for Bedrooms, Bathrooms, Living Rooms, Kitchens, and Offices.
 */
export function synthesizeFurnitureForRooms(
  rooms: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[],
  mPerPx: number
): FurnitureElement[] {
  const allItems: FurnitureElement[] = [];
  const pxForMeters = (m: number) => Math.round(m / Math.max(0.005, mPerPx));

  rooms.forEach((room, idx) => {
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = Math.round((minX + maxX) / 2);
    const cy = Math.round((minY + maxY) / 2);
    const spanW = maxX - minX;
    const spanH = maxY - minY;

    if (spanW < 90 || spanH < 90) return;

    const baseProv =
      room.provenance === 'generated_completion' ? 'generated_completion' : 'observed';
    const roomItems: FurnitureElement[] = [];
    const wallPad = 24;

    if (room.category === 'bedroom') {
      // 1. Center-North King/Queen Bed (compact, realistic scale leaving wide walking aisles)
      const bedW = Math.min(spanW * 0.36, pxForMeters(1.62));
      const bedD = Math.min(spanH * 0.44, pxForMeters(1.88));
      const bedX = Math.round(cx - spanW * 0.06);
      const bedY = Math.round(minY + wallPad + bedD / 2);

      roomItems.push({
        id: `FURN-${idx}-BED`,
        room_id: room.id,
        kind: 'bed',
        label: 'Teak King Bed, Pillows, Duvet & Wall Art',
        center_px: { x: bedX, y: bedY },
        width_px: Math.round(bedW),
        depth_px: Math.round(bedD),
        height_m: 1.02,
        rotation_deg: 0,
        confidence: 0.96,
        provenance: baseProv,
      });

      // 2. Left & Right Bedside Tables (Nightstands) with generous gap from bed
      if (spanW >= 260) {
        const nsW = Math.min(spanW * 0.1, pxForMeters(0.42));
        const nsD = Math.min(spanH * 0.12, pxForMeters(0.38));
        const nsY = Math.round(minY + wallPad + nsD / 2 + 2);
        const gapPx = 18;

        roomItems.push({
          id: `FURN-${idx}-NSL`,
          room_id: room.id,
          kind: 'nightstand',
          label: 'Left Bedside Table & Warm Lamp',
          center_px: { x: Math.round(bedX - bedW / 2 - nsW / 2 - gapPx), y: nsY },
          width_px: Math.round(nsW),
          depth_px: Math.round(nsD),
          height_m: 0.56,
          rotation_deg: 0,
          confidence: 0.94,
          provenance: baseProv,
        });

        roomItems.push({
          id: `FURN-${idx}-NSR`,
          room_id: room.id,
          kind: 'nightstand',
          label: 'Right Bedside Table & Warm Lamp',
          center_px: { x: Math.round(bedX + bedW / 2 + nsW / 2 + gapPx), y: nsY },
          width_px: Math.round(nsW),
          depth_px: Math.round(nsD),
          height_m: 0.56,
          rotation_deg: 0,
          confidence: 0.94,
          provenance: baseProv,
        });
      }

      // 3. Sliding Teak Wardrobe tucked against East wall (bottom-right), well clear of bed & doors
      const wardW = Math.min(spanW * 0.34, pxForMeters(1.45));
      const wardD = Math.min(spanH * 0.14, pxForMeters(0.52));
      roomItems.push({
        id: `FURN-${idx}-WARD`,
        room_id: room.id,
        kind: 'wardrobe',
        label: 'Sliding Teak & Fluted-Glass Wardrobe',
        center_px: {
          x: Math.round(maxX - wallPad - wardW / 2),
          y: Math.round(maxY - wallPad - wardD / 2),
        },
        width_px: Math.round(wardW),
        depth_px: Math.round(wardD),
        height_m: 2.1,
        rotation_deg: 180,
        confidence: 0.94,
        provenance: baseProv,
      });
    } else if (room.category === 'bathroom') {
      // 1. Walk-In Glass Shower Enclosure in North-East corner
      const shwW = Math.min(spanW * 0.36, pxForMeters(1.0));
      const shwD = Math.min(spanH * 0.34, pxForMeters(0.92));
      roomItems.push({
        id: `FURN-${idx}-SHOWER`,
        room_id: room.id,
        kind: 'shower',
        label: 'Frameless Glass Shower Enclosure & Rainhead',
        center_px: {
          x: Math.round(maxX - wallPad - shwW / 2),
          y: Math.round(minY + wallPad + shwD / 2),
        },
        width_px: Math.round(shwW),
        depth_px: Math.round(shwD),
        height_m: 2.0,
        rotation_deg: 0,
        confidence: 0.95,
        provenance: baseProv,
      });

      // 2. Wall-Hung Ceramic Toilet (WC) in South-West corner
      const wcW = Math.min(spanW * 0.18, pxForMeters(0.44));
      const wcD = Math.min(spanH * 0.2, pxForMeters(0.58));
      roomItems.push({
        id: `FURN-${idx}-WC`,
        room_id: room.id,
        kind: 'toilet',
        label: 'Wall-Hung Ceramic WC & Flush Plate',
        center_px: {
          x: Math.round(minX + wallPad + wcW / 2 + 8),
          y: Math.round(maxY - wallPad - wcD / 2),
        },
        width_px: Math.round(wcW),
        depth_px: Math.round(wcD),
        height_m: 0.78,
        rotation_deg: 180,
        confidence: 0.96,
        provenance: baseProv,
      });

      // 3. Marble Washbasin Vanity & Backlit LED Mirror in South-East corner
      const sinkW = Math.min(spanW * 0.32, pxForMeters(0.88));
      const sinkD = Math.min(spanH * 0.18, pxForMeters(0.48));
      roomItems.push({
        id: `FURN-${idx}-SINK`,
        room_id: room.id,
        kind: 'sink_vanity',
        label: 'Marble Washbasin Vanity & LED Mirror',
        center_px: {
          x: Math.round(maxX - wallPad - sinkW / 2),
          y: Math.round(maxY - wallPad - sinkD / 2),
        },
        width_px: Math.round(sinkW),
        depth_px: Math.round(sinkD),
        height_m: 1.8,
        rotation_deg: 180,
        confidence: 0.95,
        provenance: baseProv,
      });
    } else if (room.category === 'living') {
      // 1. Designer Sofa along North wall
      const sofaW = Math.min(spanW * 0.42, pxForMeters(2.15));
      const sofaD = Math.min(spanH * 0.22, pxForMeters(0.86));
      const sofaX = Math.round(cx - spanW * 0.05);
      const sofaY = Math.round(minY + wallPad + sofaD / 2 + 6);

      roomItems.push({
        id: `FURN-${idx}-SOFA`,
        room_id: room.id,
        kind: 'sofa',
        label: 'Designer Sofa, Silk Cushions & Floor Lamp',
        center_px: { x: sofaX, y: sofaY },
        width_px: Math.round(sofaW),
        depth_px: Math.round(sofaD),
        height_m: 0.84,
        rotation_deg: 0,
        confidence: 0.97,
        provenance: baseProv,
      });

      // 2. Travertine Coffee Table in center with 32px legroom gap from sofa
      const ctW = Math.min(spanW * 0.24, pxForMeters(1.1));
      const ctD = Math.min(spanH * 0.14, pxForMeters(0.58));
      const ctY = Math.round(sofaY + sofaD / 2 + ctD / 2 + 32);

      roomItems.push({
        id: `FURN-${idx}-CT`,
        room_id: room.id,
        kind: 'coffee_table',
        label: 'Travertine & Brass Coffee Table',
        center_px: { x: sofaX, y: ctY },
        width_px: Math.round(ctW),
        depth_px: Math.round(ctD),
        height_m: 0.42,
        rotation_deg: 0,
        confidence: 0.95,
        provenance: baseProv,
      });

      // 3. Fluted Teak TV Unit along South wall facing sofa
      const tvW = Math.min(spanW * 0.36, pxForMeters(1.75));
      const tvD = Math.min(spanH * 0.12, pxForMeters(0.4));
      roomItems.push({
        id: `FURN-${idx}-TV`,
        room_id: room.id,
        kind: 'tv_stand',
        label: 'Fluted Teak TV Unit & 65" OLED Panel',
        center_px: {
          x: sofaX,
          y: Math.round(maxY - wallPad - tvD / 2),
        },
        width_px: Math.round(tvW),
        depth_px: Math.round(tvD),
        height_m: 1.6,
        rotation_deg: 180,
        confidence: 0.95,
        provenance: baseProv,
      });
    } else if (room.category === 'kitchen') {
      // 1. Modular Kitchen Counter, Sink, Hob & Backsplash along South-West wall
      const cntW = Math.min(spanW * 0.48, pxForMeters(2.05));
      const cntD = Math.min(spanH * 0.2, pxForMeters(0.58));
      roomItems.push({
        id: `FURN-${idx}-KCNT`,
        room_id: room.id,
        kind: 'kitchen_counter',
        label: 'Modular Cabinets, Quartz Counter, Sink & Backsplash',
        center_px: {
          x: Math.round(minX + wallPad + cntW / 2),
          y: Math.round(maxY - wallPad - cntD / 2),
        },
        width_px: Math.round(cntW),
        depth_px: Math.round(cntD),
        height_m: 2.05,
        rotation_deg: 180,
        confidence: 0.96,
        provenance: baseProv,
      });

      // 2. Double-Door Smart Refrigerator in South-East corner (cleanly separated from counter)
      const frW = Math.min(spanW * 0.18, pxForMeters(0.76));
      const frD = Math.min(spanH * 0.2, pxForMeters(0.62));
      roomItems.push({
        id: `FURN-${idx}-FRIDGE`,
        room_id: room.id,
        kind: 'fridge',
        label: 'Double-Door Smart Refrigerator',
        center_px: {
          x: Math.round(maxX - wallPad - frW / 2),
          y: Math.round(maxY - wallPad - frD / 2),
        },
        width_px: Math.round(frW),
        depth_px: Math.round(frD),
        height_m: 1.82,
        rotation_deg: 180,
        confidence: 0.95,
        provenance: baseProv,
      });

      // 3. Compact 4-Seat Teak Dining Table in North zone with wide aisle clearance
      const dtW = Math.min(spanW * 0.34, pxForMeters(1.25));
      const dtD = Math.min(spanH * 0.24, pxForMeters(0.78));
      roomItems.push({
        id: `FURN-${idx}-DINE`,
        room_id: room.id,
        kind: 'dining_table',
        label: 'Teak Dining Table & 4 Upholstered Chairs',
        center_px: {
          x: Math.round(minX + wallPad + dtW / 2 + 18),
          y: Math.round(minY + wallPad + dtD / 2 + 12),
        },
        width_px: Math.round(dtW),
        depth_px: Math.round(dtD),
        height_m: 0.76,
        rotation_deg: 0,
        confidence: 0.93,
        provenance: baseProv,
      });
    } else if (room.category === 'office') {
      const dskW = Math.min(spanW * 0.42, pxForMeters(1.38));
      const dskD = Math.min(spanH * 0.2, pxForMeters(0.66));
      roomItems.push({
        id: `FURN-${idx}-DESK`,
        room_id: room.id,
        kind: 'desk',
        label: 'Study Desk, Chair & Bookshelf',
        center_px: { x: cx, y: Math.round(minY + wallPad + dskD / 2 + 8) },
        width_px: Math.round(dskW),
        depth_px: Math.round(dskD),
        height_m: 0.76,
        rotation_deg: 0,
        confidence: 0.93,
        provenance: baseProv,
      });
    }

    // Run strict per-room de-collision pass so zero objects ever overlap!
    const cleanRoomItems = decollideRoomFurniture(roomItems, minX, minY, maxX, maxY, wallPad, 18);
    allItems.push(...cleanRoomItems);
  });

  return allItems;
}

const RESIDENCE_2BHK_ROOMS: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[] = [
  {
    id: 'R-01',
    name: 'Living & Dining Salon',
    category: 'living',
    polygon: [
      { x: 80, y: 70 },
      { x: 520, y: 70 },
      { x: 520, y: 390 },
      { x: 80, y: 390 },
    ],
    area_px2: 440 * 320,
    confidence: 0.98,
    provenance: 'observed',
  },
  {
    id: 'R-02',
    name: 'Master Bedroom Suite',
    category: 'bedroom',
    polygon: [
      { x: 520, y: 70 },
      { x: 920, y: 70 },
      { x: 920, y: 390 },
      { x: 520, y: 390 },
    ],
    area_px2: 400 * 320,
    confidence: 0.97,
    provenance: 'observed',
  },
  {
    id: 'R-03',
    name: 'Modular Kitchen & Dining',
    category: 'kitchen',
    polygon: [
      { x: 80, y: 390 },
      { x: 430, y: 390 },
      { x: 430, y: 680 },
      { x: 80, y: 680 },
    ],
    area_px2: 350 * 290,
    confidence: 0.96,
    provenance: 'observed',
  },
  {
    id: 'R-04',
    name: 'Guest Bedroom & Study',
    category: 'bedroom',
    polygon: [
      { x: 430, y: 390 },
      { x: 680, y: 390 },
      { x: 680, y: 680 },
      { x: 430, y: 680 },
    ],
    area_px2: 250 * 290,
    confidence: 0.94,
    provenance: 'observed',
  },
  {
    id: 'R-05',
    name: 'Luxury Spa Bathroom',
    category: 'bathroom',
    polygon: [
      { x: 680, y: 390 },
      { x: 920, y: 390 },
      { x: 920, y: 680 },
      { x: 680, y: 680 },
    ],
    area_px2: 240 * 290,
    confidence: 0.96,
    provenance: 'observed',
  },
];

const LOFT_ROOMS: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[] = [
  {
    id: 'R-01',
    name: 'Primary Bedroom Suite',
    category: 'bedroom',
    polygon: [
      { x: 100, y: 80 },
      { x: 470, y: 80 },
      { x: 470, y: 385 },
      { x: 100, y: 385 },
    ],
    area_px2: 370 * 305,
    confidence: 0.96,
    provenance: 'observed',
  },
  {
    id: 'R-02',
    name: 'Open Living Salon',
    category: 'living',
    polygon: [
      { x: 470, y: 80 },
      { x: 900, y: 80 },
      { x: 900, y: 385 },
      { x: 470, y: 385 },
    ],
    area_px2: 430 * 305,
    confidence: 0.97,
    provenance: 'observed',
  },
  {
    id: 'R-03',
    name: 'Chef Kitchen & Dining',
    category: 'kitchen',
    polygon: [
      { x: 100, y: 385 },
      { x: 570, y: 385 },
      { x: 570, y: 670 },
      { x: 100, y: 670 },
    ],
    area_px2: 470 * 285,
    confidence: 0.96,
    provenance: 'observed',
  },
  {
    id: 'R-04',
    name: 'Spa Bathroom Suite',
    category: 'bathroom',
    polygon: [
      { x: 570, y: 385 },
      { x: 900, y: 385 },
      { x: 900, y: 670 },
      { x: 570, y: 670 },
    ],
    area_px2: 330 * 285,
    confidence: 0.95,
    provenance: 'observed',
  },
];

const SUITE_ROOMS: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[] = [
  {
    id: 'R-01',
    name: 'Executive Lounge & Living',
    category: 'living',
    polygon: [
      { x: 80, y: 70 },
      { x: 490, y: 70 },
      { x: 490, y: 390 },
      { x: 80, y: 390 },
    ],
    area_px2: 410 * 320,
    confidence: 0.98,
    provenance: 'observed',
  },
  {
    id: 'R-02',
    name: 'Master Bedroom Suite',
    category: 'bedroom',
    polygon: [
      { x: 490, y: 70 },
      { x: 920, y: 70 },
      { x: 920, y: 390 },
      { x: 490, y: 390 },
    ],
    area_px2: 430 * 320,
    confidence: 0.97,
    provenance: 'observed',
  },
  {
    id: 'R-03',
    name: 'Modular Kitchen & Bar',
    category: 'kitchen',
    polygon: [
      { x: 80, y: 390 },
      { x: 420, y: 390 },
      { x: 420, y: 680 },
      { x: 80, y: 680 },
    ],
    area_px2: 340 * 290,
    confidence: 0.95,
    provenance: 'observed',
  },
  {
    id: 'R-04',
    name: 'Private Study Office',
    category: 'office',
    polygon: [
      { x: 420, y: 390 },
      { x: 670, y: 390 },
      { x: 670, y: 680 },
      { x: 420, y: 680 },
    ],
    area_px2: 250 * 290,
    confidence: 0.94,
    provenance: 'observed',
  },
  {
    id: 'R-05',
    name: 'En-Suite Bathroom',
    category: 'bathroom',
    polygon: [
      { x: 670, y: 390 },
      { x: 920, y: 390 },
      { x: 920, y: 680 },
      { x: 670, y: 680 },
    ],
    area_px2: 250 * 290,
    confidence: 0.95,
    provenance: 'observed',
  },
];

export const BLUEPRINT_PRESETS: BlueprintPreset[] = [
  {
    id: 'nordic-courtyard-2br',
    name: '2-Bed Residence',
    subtitle: '99.4 m² · 2 Bedrooms, Spa Bath, Kitchen & Living',
    width_px: 1000,
    height_px: 750,
    ocr_dimension_text: '11.76 m × 8.54 m',
    reference_width_m: 11.76,
    default_m_per_px: 0.014,
    has_ground_truth: true,
    walls: [
      { id: 'W-01', start: { x: 80, y: 70 }, end: { x: 920, y: 70 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
      { id: 'W-02', start: { x: 920, y: 70 }, end: { x: 920, y: 680 }, thickness_px: 18, is_exterior: true, confidence: 0.98, provenance: 'observed' },
      { id: 'W-03', start: { x: 920, y: 680 }, end: { x: 80, y: 680 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
      { id: 'W-04', start: { x: 80, y: 680 }, end: { x: 80, y: 70 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
      { id: 'W-05', start: { x: 520, y: 70 }, end: { x: 520, y: 390 }, thickness_px: 13, is_exterior: false, confidence: 0.97, provenance: 'observed' },
      { id: 'W-06', start: { x: 80, y: 390 }, end: { x: 920, y: 390 }, thickness_px: 13, is_exterior: false, confidence: 0.96, provenance: 'observed' },
      { id: 'W-07', start: { x: 430, y: 390 }, end: { x: 430, y: 680 }, thickness_px: 13, is_exterior: false, confidence: 0.95, provenance: 'observed' },
      { id: 'W-08', start: { x: 680, y: 390 }, end: { x: 680, y: 680 }, thickness_px: 13, is_exterior: false, confidence: 0.95, provenance: 'observed' },
    ],
    openings: [
      { id: 'D-01', kind: 'door', wall_id: 'W-03', position_t: 0.44, width_px: 64, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.97, provenance: 'observed' },
      { id: 'D-02', kind: 'door', wall_id: 'W-06', position_t: 0.44, width_px: 64, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.96, provenance: 'observed' },
      { id: 'D-03', kind: 'door', wall_id: 'W-06', position_t: 0.62, width_px: 64, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.95, provenance: 'observed' },
      { id: 'D-04', kind: 'door', wall_id: 'W-06', position_t: 0.80, width_px: 62, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.94, provenance: 'observed' },
      { id: 'D-05', kind: 'door', wall_id: 'W-07', position_t: 0.32, width_px: 62, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.94, provenance: 'observed' },
      { id: 'WIN-01', kind: 'window', wall_id: 'W-01', position_t: 0.26, width_px: 150, sill_height_m: 0.85, head_height_m: 2.2, confidence: 0.97, provenance: 'observed' },
      { id: 'WIN-02', kind: 'window', wall_id: 'W-01', position_t: 0.74, width_px: 150, sill_height_m: 0.9, head_height_m: 2.15, confidence: 0.96, provenance: 'observed' },
      { id: 'WIN-03', kind: 'window', wall_id: 'W-04', position_t: 0.26, width_px: 130, sill_height_m: 0.85, head_height_m: 2.2, confidence: 0.96, provenance: 'observed' },
      { id: 'WIN-04', kind: 'window', wall_id: 'W-02', position_t: 0.26, width_px: 130, sill_height_m: 0.9, head_height_m: 2.15, confidence: 0.95, provenance: 'observed' },
    ],
    rooms: RESIDENCE_2BHK_ROOMS,
    furniture: synthesizeFurnitureForRooms(RESIDENCE_2BHK_ROOMS, 0.014),
    warnings: [],
  },
  {
    id: 'minimalist-urban-loft',
    name: '1-Bed Urban Loft',
    subtitle: '84.5 m² · Bedroom, Spa Bath, Kitchen & Salon',
    width_px: 1000,
    height_px: 750,
    ocr_dimension_text: '10.80 m × 7.96 m',
    reference_width_m: 10.8,
    default_m_per_px: 0.0135,
    has_ground_truth: true,
    walls: [
      { id: 'W-01', start: { x: 100, y: 80 }, end: { x: 900, y: 80 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
      { id: 'W-02', start: { x: 900, y: 80 }, end: { x: 900, y: 670 }, thickness_px: 18, is_exterior: true, confidence: 0.98, provenance: 'observed' },
      { id: 'W-03', start: { x: 900, y: 670 }, end: { x: 100, y: 670 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
      { id: 'W-04', start: { x: 100, y: 670 }, end: { x: 100, y: 80 }, thickness_px: 18, is_exterior: true, confidence: 0.98, provenance: 'observed' },
      { id: 'W-05', start: { x: 470, y: 80 }, end: { x: 470, y: 385 }, thickness_px: 13, is_exterior: false, confidence: 0.96, provenance: 'observed' },
      { id: 'W-06', start: { x: 100, y: 385 }, end: { x: 900, y: 385 }, thickness_px: 13, is_exterior: false, confidence: 0.96, provenance: 'observed' },
      { id: 'W-07', start: { x: 570, y: 385 }, end: { x: 570, y: 670 }, thickness_px: 13, is_exterior: false, confidence: 0.95, provenance: 'observed' },
    ],
    openings: [
      { id: 'D-01', kind: 'door', wall_id: 'W-03', position_t: 0.56, width_px: 66, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.15, confidence: 0.96, provenance: 'observed' },
      { id: 'D-02', kind: 'door', wall_id: 'W-05', position_t: 0.72, width_px: 64, swing_direction: 'outward-left', sill_height_m: 0, head_height_m: 2.15, confidence: 0.95, provenance: 'observed' },
      { id: 'D-03', kind: 'door', wall_id: 'W-07', position_t: 0.35, width_px: 64, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.94, provenance: 'observed' },
      { id: 'WIN-01', kind: 'window', wall_id: 'W-04', position_t: 0.25, width_px: 140, sill_height_m: 0.75, head_height_m: 2.2, confidence: 0.97, provenance: 'observed' },
      { id: 'WIN-02', kind: 'window', wall_id: 'W-01', position_t: 0.72, width_px: 180, sill_height_m: 0.8, head_height_m: 2.2, confidence: 0.98, provenance: 'observed' },
      { id: 'WIN-03', kind: 'window', wall_id: 'W-02', position_t: 0.26, width_px: 140, sill_height_m: 0.85, head_height_m: 2.2, confidence: 0.95, provenance: 'observed' },
    ],
    rooms: LOFT_ROOMS,
    furniture: synthesizeFurnitureForRooms(LOFT_ROOMS, 0.0135),
    warnings: [],
  },
  {
    id: 'courtyard-office-suite',
    name: 'Executive Residence',
    subtitle: '98.5 m² · Bedroom, Study, Bath, Kitchen & Lounge',
    width_px: 1000,
    height_px: 750,
    ocr_dimension_text: '11.50 m × 8.36 m',
    reference_width_m: 11.5,
    default_m_per_px: 0.0137,
    has_ground_truth: true,
    walls: [
      { id: 'W-01', start: { x: 80, y: 70 }, end: { x: 920, y: 70 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
      { id: 'W-02', start: { x: 920, y: 70 }, end: { x: 920, y: 680 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
      { id: 'W-03', start: { x: 920, y: 680 }, end: { x: 80, y: 680 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
      { id: 'W-04', start: { x: 80, y: 680 }, end: { x: 80, y: 70 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
      { id: 'W-05', start: { x: 490, y: 70 }, end: { x: 490, y: 390 }, thickness_px: 13, is_exterior: false, confidence: 0.96, provenance: 'observed' },
      { id: 'W-06', start: { x: 80, y: 390 }, end: { x: 920, y: 390 }, thickness_px: 13, is_exterior: false, confidence: 0.96, provenance: 'observed' },
      { id: 'W-07', start: { x: 420, y: 390 }, end: { x: 420, y: 680 }, thickness_px: 13, is_exterior: false, confidence: 0.95, provenance: 'observed' },
      { id: 'W-08', start: { x: 670, y: 390 }, end: { x: 670, y: 680 }, thickness_px: 13, is_exterior: false, confidence: 0.95, provenance: 'observed' },
    ],
    openings: [
      { id: 'D-01', kind: 'door', wall_id: 'W-03', position_t: 0.46, width_px: 66, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.98, provenance: 'observed' },
      { id: 'D-02', kind: 'door', wall_id: 'W-06', position_t: 0.42, width_px: 64, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.96, provenance: 'observed' },
      { id: 'D-03', kind: 'door', wall_id: 'W-06', position_t: 0.62, width_px: 64, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.95, provenance: 'observed' },
      { id: 'D-04', kind: 'door', wall_id: 'W-06', position_t: 0.80, width_px: 62, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.95, provenance: 'observed' },
      { id: 'WIN-01', kind: 'window', wall_id: 'W-01', position_t: 0.25, width_px: 160, sill_height_m: 0.85, head_height_m: 2.2, confidence: 0.97, provenance: 'observed' },
      { id: 'WIN-02', kind: 'window', wall_id: 'W-01', position_t: 0.74, width_px: 160, sill_height_m: 0.85, head_height_m: 2.2, confidence: 0.97, provenance: 'observed' },
      { id: 'WIN-03', kind: 'window', wall_id: 'W-02', position_t: 0.26, width_px: 140, sill_height_m: 0.85, head_height_m: 2.2, confidence: 0.95, provenance: 'observed' },
    ],
    rooms: SUITE_ROOMS,
    furniture: synthesizeFurnitureForRooms(SUITE_ROOMS, 0.0137),
    warnings: [],
  },
];

export function renderPresetBlueprintDataUrl(preset: BlueprintPreset): string {
  const canvas = document.createElement('canvas');
  canvas.width = preset.width_px;
  canvas.height = preset.height_px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#F6F5F0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 25) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 25) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  for (const room of preset.rooms) {
    if (room.polygon.length < 3) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(room.polygon[0].x, room.polygon[0].y);
    for (let i = 1; i < room.polygon.length; i++) {
      ctx.lineTo(room.polygon[i].x, room.polygon[i].y);
    }
    ctx.closePath();
    ctx.fillStyle =
      room.category === 'bathroom'
        ? 'rgba(148, 163, 184, 0.16)'
        : room.category === 'kitchen'
        ? 'rgba(203, 213, 225, 0.2)'
        : 'rgba(255, 255, 255, 0.68)';
    ctx.fill();
    ctx.restore();
  }

  // Draw observed furniture on the physical 2D paper blueprint
  for (const item of preset.furniture.filter((f) => f.provenance === 'observed')) {
    ctx.save();
    ctx.translate(item.center_px.x, item.center_px.y);
    ctx.rotate((item.rotation_deg * Math.PI) / 180);
    const hw = item.width_px / 2;
    const hd = item.depth_px / 2;

    ctx.strokeStyle = '#475569';
    ctx.fillStyle = '#E2E8F0';
    ctx.lineWidth = 1.4;

    if (item.kind === 'bed') {
      ctx.fillRect(-hw, -hd, item.width_px, item.depth_px);
      ctx.strokeRect(-hw, -hd, item.width_px, item.depth_px);
      ctx.fillStyle = '#FFFFFF';
      const pw = item.width_px * 0.36;
      const pd = item.depth_px * 0.18;
      ctx.fillRect(-hw + 8, -hd + 8, pw, pd);
      ctx.strokeRect(-hw + 8, -hd + 8, pw, pd);
      ctx.fillRect(hw - pw - 8, -hd + 8, pw, pd);
      ctx.strokeRect(hw - pw - 8, -hd + 8, pw, pd);
      ctx.beginPath();
      ctx.moveTo(-hw, -hd + pd + 16);
      ctx.lineTo(hw, -hd + pd + 16);
      ctx.stroke();
    } else if (item.kind === 'toilet') {
      ctx.fillRect(-hw, -hd, item.width_px, item.depth_px * 0.32);
      ctx.strokeRect(-hw, -hd, item.width_px, item.depth_px * 0.32);
      ctx.beginPath();
      ctx.ellipse(0, hd * 0.2, hw * 0.82, hd * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-hw, -hd, item.width_px, item.depth_px);
      ctx.strokeRect(-hw, -hd, item.width_px, item.depth_px);
    }
    ctx.restore();
  }

  for (const wall of preset.walls) {
    ctx.save();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = wall.thickness_px;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(wall.start.x, wall.start.y);
    ctx.lineTo(wall.end.x, wall.end.y);
    ctx.stroke();
    ctx.restore();
  }

  for (const op of preset.openings) {
    const wall = preset.walls.find((w) => w.id === op.wall_id);
    if (!wall) continue;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const cx = wall.start.x + dx * op.position_t;
    const cy = wall.start.y + dy * op.position_t;
    const halfW = op.width_px / 2;
    const p1x = cx - ux * halfW;
    const p1y = cy - uy * halfW;
    const p2x = cx + ux * halfW;
    const p2y = cy + uy * halfW;

    ctx.save();
    ctx.strokeStyle = '#F6F5F0';
    ctx.lineWidth = wall.thickness_px + 4;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();

    if (op.kind === 'window') {
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p1x + nx * 3, p1y + ny * 3);
      ctx.lineTo(p2x + nx * 3, p2y + ny * 3);
      ctx.moveTo(p1x - nx * 3, p1y - ny * 3);
      ctx.lineTo(p2x - nx * 3, p2y - ny * 3);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();
    }
    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}
