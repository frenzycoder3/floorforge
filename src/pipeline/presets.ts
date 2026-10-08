import {
  BlueprintPreset,
  OpeningElement,
  RoomPolygon,
  WallSegment,
} from '../types/floorforge';
import {
  clampAndDecollideRoomFurniture,
  computeDoorClearanceBoxes,
  DoorClearanceBox,
  generateRoomCompletionFurniture,
} from './furniturePipeline';

export type { DoorClearanceBox };
export { computeDoorClearanceBoxes, clampAndDecollideRoomFurniture as decollideRoomFurniture };

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
      { x: 420, y: 390 },
      { x: 420, y: 680 },
      { x: 80, y: 680 },
    ],
    area_px2: 340 * 290,
    confidence: 0.96,
    provenance: 'observed',
  },
  {
    id: 'R-04',
    name: 'Guest Bedroom & Study',
    category: 'bedroom',
    polygon: [
      { x: 420, y: 390 },
      { x: 680, y: 390 },
      { x: 680, y: 680 },
      { x: 420, y: 680 },
    ],
    area_px2: 260 * 290,
    confidence: 0.85,
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
    confidence: 0.84,
    provenance: 'observed',
  },
];

const RESIDENCE_2BHK_WALLS: WallSegment[] = [
  // Exterior walls (all standardized West-to-East and North-to-South)
  { id: 'W-01', start: { x: 80, y: 70 }, end: { x: 920, y: 70 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
  { id: 'W-02', start: { x: 920, y: 70 }, end: { x: 920, y: 680 }, thickness_px: 18, is_exterior: true, confidence: 0.98, provenance: 'observed' },
  { id: 'W-03', start: { x: 80, y: 680 }, end: { x: 920, y: 680 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
  { id: 'W-04', start: { x: 80, y: 70 }, end: { x: 80, y: 680 }, thickness_px: 18, is_exterior: true, confidence: 0.99, provenance: 'observed' },
  // Interior partitions
  { id: 'W-05', start: { x: 520, y: 70 }, end: { x: 520, y: 390 }, thickness_px: 13, is_exterior: false, confidence: 0.96, provenance: 'observed' },
  { id: 'W-06', start: { x: 80, y: 390 }, end: { x: 920, y: 390 }, thickness_px: 13, is_exterior: false, confidence: 0.95, provenance: 'observed' },
  // W-07 has lower segmentation confidence (0.84 -> Amber Uncertain)
  { id: 'W-07', start: { x: 420, y: 390 }, end: { x: 420, y: 680 }, thickness_px: 13, is_exterior: false, confidence: 0.84, provenance: 'observed' },
  // W-08 has a realistic 22px unclosed detection gap at bottom (y=658 instead of 680 -> Red Invalid until snapped!)
  { id: 'W-08', start: { x: 680, y: 390 }, end: { x: 680, y: 658 }, thickness_px: 13, is_exterior: false, confidence: 0.78, provenance: 'observed' },
];

const RESIDENCE_2BHK_OPENINGS: OpeningElement[] = [
  // D-01: Main Entrance on West Wall W-04 (y: 70..680) at y=240 (t=0.28) into Living Room entry foyer
  { id: 'D-01', kind: 'door', wall_id: 'W-04', position_t: 0.28, width_px: 62, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.97, provenance: 'observed' },
  // D-02: Kitchen Door on W-06 (x: 80..920) at x=156 (t=0.09), between Living Room and Kitchen
  { id: 'D-02', kind: 'door', wall_id: 'W-06', position_t: 0.09, width_px: 60, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.95, provenance: 'observed' },
  // D-03: Guest Bedroom Door on W-06 at x=470 (t=0.464), centered cleanly between W-07 (x=420) and W-05 (x=520)
  { id: 'D-03', kind: 'door', wall_id: 'W-06', position_t: 0.464, width_px: 54, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.85, provenance: 'observed' },
  // D-04: Master Bedroom Door on vertical wall W-05 (y: 70..390) at y=316 (t=0.77)
  { id: 'D-04', kind: 'door', wall_id: 'W-05', position_t: 0.77, width_px: 60, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.95, provenance: 'observed' },
  // D-05: Spa Bathroom Door on W-06 at x=736 (t=0.78), clear of W-08 (x=680) and Shower (Amber Uncertain confidence=0.82)
  { id: 'D-05', kind: 'door', wall_id: 'W-06', position_t: 0.78, width_px: 56, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.82, provenance: 'observed' },
  // Exterior Windows
  { id: 'WIN-01', kind: 'window', wall_id: 'W-01', position_t: 0.26, width_px: 145, sill_height_m: 0.85, head_height_m: 2.1, confidence: 0.97, provenance: 'observed' },
  { id: 'WIN-02', kind: 'window', wall_id: 'W-01', position_t: 0.74, width_px: 145, sill_height_m: 0.85, head_height_m: 2.1, confidence: 0.96, provenance: 'observed' },
  { id: 'WIN-03', kind: 'window', wall_id: 'W-04', position_t: 0.74, width_px: 125, sill_height_m: 0.85, head_height_m: 2.1, confidence: 0.95, provenance: 'observed' },
  { id: 'WIN-04', kind: 'window', wall_id: 'W-02', position_t: 0.26, width_px: 125, sill_height_m: 0.85, head_height_m: 2.1, confidence: 0.84, provenance: 'observed' },
];

export const BLUEPRINT_PRESETS: BlueprintPreset[] = [
  {
    id: 'nordic-courtyard-2br',
    name: 'Reference Floor Plan',
    subtitle: '99.4 m² · 2 Bedrooms, Spa Bath, Kitchen & Living',
    width_px: 1000,
    height_px: 750,
    ocr_dimension_text: '11.76 m × 8.54 m',
    reference_width_m: 11.76,
    default_m_per_px: 0.014,
    has_ground_truth: true,
    walls: RESIDENCE_2BHK_WALLS,
    openings: RESIDENCE_2BHK_OPENINGS,
    rooms: RESIDENCE_2BHK_ROOMS,
    furniture: generateRoomCompletionFurniture(
      RESIDENCE_2BHK_ROOMS,
      0.014,
      RESIDENCE_2BHK_WALLS,
      RESIDENCE_2BHK_OPENINGS,
      [],
      true
    ),
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

  // Draw observed furniture symbols on the physical 2D paper blueprint at exact coordinates
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

  // Draw complete wall lines on paper blueprint (including full target endpoints so unclosed AI detection gaps are visually clear)
  for (const wall of preset.walls) {
    ctx.save();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = wall.thickness_px;
    ctx.lineCap = 'square';
    ctx.beginPath();
    const startY = wall.id === 'W-07' && wall.start.y === 405 ? 385 : wall.start.y;
    const endY = wall.id === 'W-08' && wall.end.y === 658 ? 680 : wall.end.y;
    ctx.moveTo(wall.start.x, startY);
    ctx.lineTo(wall.end.x, endY);
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
