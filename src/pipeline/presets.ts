import { BlueprintPreset } from '../types/floorforge';

export const BLUEPRINT_PRESETS: BlueprintPreset[] = [
  {
    id: 'nordic-courtyard-2br',
    name: 'Nordic 2-Bed Residence',
    subtitle: '94.8 m² · 7 rooms · Standard 1:100 Metric Plan',
    width_px: 1000,
    height_px: 750,
    ocr_dimension_text: '11.20 m × 8.40 m (Scale 1:100)',
    default_m_per_px: 0.014,
    walls: [
      // Exterior perimeter (x: 100..900 -> 800px = 11.2m, y: 80..680 -> 600px = 8.4m)
      { id: 'W-01', start: { x: 100, y: 80 }, end: { x: 900, y: 80 }, thickness_px: 18, is_exterior: true, confidence: 0.99 },
      { id: 'W-02', start: { x: 900, y: 80 }, end: { x: 900, y: 680 }, thickness_px: 18, is_exterior: true, confidence: 0.98 },
      { id: 'W-03', start: { x: 900, y: 680 }, end: { x: 100, y: 680 }, thickness_px: 18, is_exterior: true, confidence: 0.99 },
      { id: 'W-04', start: { x: 100, y: 680 }, end: { x: 100, y: 80 }, thickness_px: 18, is_exterior: true, confidence: 0.99 },
      // Interior partitions
      { id: 'W-05', start: { x: 520, y: 80 }, end: { x: 520, y: 410 }, thickness_px: 12, is_exterior: false, confidence: 0.96 },
      { id: 'W-06', start: { x: 100, y: 410 }, end: { x: 900, y: 410 }, thickness_px: 12, is_exterior: false, confidence: 0.95 },
      { id: 'W-07', start: { x: 380, y: 410 }, end: { x: 380, y: 680 }, thickness_px: 12, is_exterior: false, confidence: 0.94 },
      { id: 'W-08', start: { x: 640, y: 410 }, end: { x: 640, y: 680 }, thickness_px: 12, is_exterior: false, confidence: 0.93 },
      { id: 'W-09', start: { x: 710, y: 80 }, end: { x: 710, y: 410 }, thickness_px: 11, is_exterior: false, confidence: 0.91 },
    ],
    openings: [
      // Doors
      { id: 'D-01', kind: 'door', wall_id: 'W-03', position_t: 0.49, width_px: 66, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.97 },
      { id: 'D-02', kind: 'door', wall_id: 'W-06', position_t: 0.24, width_px: 64, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.95 },
      { id: 'D-03', kind: 'door', wall_id: 'W-06', position_t: 0.64, width_px: 64, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.94 },
      { id: 'D-04', kind: 'door', wall_id: 'W-06', position_t: 0.88, width_px: 62, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.92 },
      { id: 'D-05', kind: 'door', wall_id: 'W-07', position_t: 0.52, width_px: 60, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.93 },
      { id: 'D-06', kind: 'door', wall_id: 'W-08', position_t: 0.50, width_px: 58, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.91 },
      // Windows
      { id: 'WIN-01', kind: 'window', wall_id: 'W-01', position_t: 0.25, width_px: 170, sill_height_m: 0.85, head_height_m: 2.2, confidence: 0.97 },
      { id: 'WIN-02', kind: 'window', wall_id: 'W-01', position_t: 0.64, width_px: 110, sill_height_m: 0.9, head_height_m: 2.15, confidence: 0.95 },
      { id: 'WIN-03', kind: 'window', wall_id: 'W-01', position_t: 0.88, width_px: 110, sill_height_m: 0.9, head_height_m: 2.15, confidence: 0.94 },
      { id: 'WIN-04', kind: 'window', wall_id: 'W-04', position_t: 0.72, width_px: 140, sill_height_m: 0.85, head_height_m: 2.2, confidence: 0.96 },
      { id: 'WIN-05', kind: 'window', wall_id: 'W-02', position_t: 0.75, width_px: 120, sill_height_m: 1.0, head_height_m: 2.1, confidence: 0.92 },
      { id: 'WIN-06', kind: 'window', wall_id: 'W-03', position_t: 0.82, width_px: 130, sill_height_m: 0.95, head_height_m: 2.1, confidence: 0.93 },
    ],
    rooms: [
      {
        id: 'R-01',
        name: 'Living & Dining Salon',
        category: 'living',
        polygon: [
          { x: 100, y: 80 },
          { x: 520, y: 80 },
          { x: 520, y: 410 },
          { x: 100, y: 410 },
        ],
        area_px2: 420 * 330,
        confidence: 0.98,
      },
      {
        id: 'R-02',
        name: 'Primary Bedroom',
        category: 'bedroom',
        polygon: [
          { x: 520, y: 80 },
          { x: 710, y: 80 },
          { x: 710, y: 410 },
          { x: 520, y: 410 },
        ],
        area_px2: 190 * 330,
        confidence: 0.95,
      },
      {
        id: 'R-03',
        name: 'Study / Guest Room',
        category: 'office',
        polygon: [
          { x: 710, y: 80 },
          { x: 900, y: 80 },
          { x: 900, y: 410 },
          { x: 710, y: 410 },
        ],
        area_px2: 190 * 330,
        confidence: 0.94,
      },
      {
        id: 'R-04',
        name: 'Chef Kitchen',
        category: 'kitchen',
        polygon: [
          { x: 100, y: 410 },
          { x: 380, y: 410 },
          { x: 380, y: 680 },
          { x: 100, y: 680 },
        ],
        area_px2: 280 * 270,
        confidence: 0.96,
      },
      {
        id: 'R-05',
        name: 'Central Foyer & Gallery',
        category: 'hallway',
        polygon: [
          { x: 380, y: 410 },
          { x: 640, y: 410 },
          { x: 640, y: 680 },
          { x: 380, y: 680 },
        ],
        area_px2: 260 * 270,
        confidence: 0.93,
      },
      {
        id: 'R-06',
        name: 'Bath & Wet Suite',
        category: 'bathroom',
        polygon: [
          { x: 640, y: 410 },
          { x: 900, y: 410 },
          { x: 900, y: 680 },
          { x: 640, y: 680 },
        ],
        area_px2: 260 * 270,
        confidence: 0.92,
      },
    ],
    warnings: [
      {
        code: 'PARTITION_THIN_W09',
        severity: 'info',
        stage: 'vectorize',
        element_id: 'W-09',
        message: 'Interior wall W-09 between Primary Bedroom and Study detected as non-load-bearing acoustic partition (11px raster width).',
      },
      {
        code: 'SCALE_DUAL_VERIFIED',
        severity: 'info',
        stage: 'solve_scale',
        message: 'OCR dimension callout (11.20 m) and 6 door-leaf priors (0.90 m) converged within 1.4% tolerance.',
      },
    ],
  },
  {
    id: 'minimalist-urban-loft',
    name: 'Minimalist Architectural Loft',
    subtitle: '68.4 m² · Open-concept studio with cantilevered terrace',
    width_px: 1000,
    height_px: 750,
    ocr_dimension_text: '9.60 m × 7.12 m (Scale 1:75)',
    default_m_per_px: 0.0126,
    walls: [
      { id: 'W-01', start: { x: 120, y: 95 }, end: { x: 880, y: 95 }, thickness_px: 18, is_exterior: true, confidence: 0.99 },
      { id: 'W-02', start: { x: 880, y: 95 }, end: { x: 880, y: 655 }, thickness_px: 18, is_exterior: true, confidence: 0.98 },
      { id: 'W-03', start: { x: 880, y: 655 }, end: { x: 120, y: 655 }, thickness_px: 18, is_exterior: true, confidence: 0.99 },
      { id: 'W-04', start: { x: 120, y: 655 }, end: { x: 120, y: 95 }, thickness_px: 18, is_exterior: true, confidence: 0.98 },
      // Terrace divider
      { id: 'W-05', start: { x: 280, y: 95 }, end: { x: 280, y: 655 }, thickness_px: 14, is_exterior: false, confidence: 0.94 },
      // Core wet-box
      { id: 'W-06', start: { x: 600, y: 390 }, end: { x: 880, y: 390 }, thickness_px: 12, is_exterior: false, confidence: 0.95 },
      { id: 'W-07', start: { x: 600, y: 390 }, end: { x: 600, y: 655 }, thickness_px: 12, is_exterior: false, confidence: 0.95 },
    ],
    openings: [
      { id: 'D-01', kind: 'door', wall_id: 'W-03', position_t: 0.45, width_px: 72, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.2, confidence: 0.96 },
      { id: 'D-02', kind: 'door', wall_id: 'W-05', position_t: 0.48, width_px: 95, swing_direction: 'outward-left', sill_height_m: 0, head_height_m: 2.2, confidence: 0.93 },
      { id: 'D-03', kind: 'door', wall_id: 'W-07', position_t: 0.45, width_px: 66, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.94 },
      { id: 'WIN-01', kind: 'window', wall_id: 'W-04', position_t: 0.30, width_px: 180, sill_height_m: 0.4, head_height_m: 2.4, confidence: 0.97 },
      { id: 'WIN-02', kind: 'window', wall_id: 'W-04', position_t: 0.72, width_px: 180, sill_height_m: 0.4, head_height_m: 2.4, confidence: 0.96 },
      { id: 'WIN-03', kind: 'window', wall_id: 'W-01', position_t: 0.62, width_px: 240, sill_height_m: 0.75, head_height_m: 2.3, confidence: 0.98 },
      { id: 'WIN-04', kind: 'window', wall_id: 'W-02', position_t: 0.28, width_px: 150, sill_height_m: 0.85, head_height_m: 2.2, confidence: 0.94 },
    ],
    rooms: [
      {
        id: 'R-01',
        name: 'West Loggia Terrace',
        category: 'balcony',
        polygon: [
          { x: 120, y: 95 },
          { x: 280, y: 95 },
          { x: 280, y: 655 },
          { x: 120, y: 655 },
        ],
        area_px2: 160 * 560,
        confidence: 0.95,
      },
      {
        id: 'R-02',
        name: 'Open Atelier & Living',
        category: 'living',
        polygon: [
          { x: 280, y: 95 },
          { x: 880, y: 95 },
          { x: 880, y: 390 },
          { x: 600, y: 390 },
          { x: 600, y: 655 },
          { x: 280, y: 655 },
        ],
        area_px2: 600 * 295 + 320 * 265,
        confidence: 0.96,
      },
      {
        id: 'R-03',
        name: 'Monolithic Bath & Utility',
        category: 'bathroom',
        polygon: [
          { x: 600, y: 390 },
          { x: 880, y: 390 },
          { x: 880, y: 655 },
          { x: 600, y: 655 },
        ],
        area_px2: 280 * 265,
        confidence: 0.95,
      },
    ],
    warnings: [
      {
        code: 'L_SHAPED_POLYGON_R02',
        severity: 'info',
        stage: 'vectorize',
        element_id: 'R-02',
        message: 'Room R-02 (Open Atelier & Living) decomposed into non-convex 6-vertex polygon for floor slab triangulation.',
      },
      {
        code: 'WIDE_GLAZED_DOOR_D02',
        severity: 'warning',
        stage: 'solve_scale',
        element_id: 'D-02',
        message: 'Terrace sliding door D-02 (95px) excluded from 0.90m standard single-leaf door heuristic to prevent scale skew.',
      },
    ],
  },
  {
    id: 'executive-corner-hub',
    name: 'Executive Corner Studio Suite',
    subtitle: '126.0 m² · Boardroom, 2 Acoustic Pods & Reception',
    width_px: 1000,
    height_px: 750,
    ocr_dimension_text: '12.60 m × 10.00 m (Scale 1:100)',
    default_m_per_px: 0.015,
    walls: [
      { id: 'W-01', start: { x: 80, y: 60 }, end: { x: 920, y: 60 }, thickness_px: 18, is_exterior: true, confidence: 0.99 },
      { id: 'W-02', start: { x: 920, y: 60 }, end: { x: 920, y: 690 }, thickness_px: 18, is_exterior: true, confidence: 0.99 },
      { id: 'W-03', start: { x: 920, y: 690 }, end: { x: 80, y: 690 }, thickness_px: 18, is_exterior: true, confidence: 0.98 },
      { id: 'W-04', start: { x: 80, y: 690 }, end: { x: 80, y: 60 }, thickness_px: 18, is_exterior: true, confidence: 0.99 },
      { id: 'W-05', start: { x: 460, y: 60 }, end: { x: 460, y: 400 }, thickness_px: 12, is_exterior: false, confidence: 0.96 },
      { id: 'W-06', start: { x: 80, y: 400 }, end: { x: 920, y: 400 }, thickness_px: 12, is_exterior: false, confidence: 0.95 },
      { id: 'W-07', start: { x: 360, y: 400 }, end: { x: 360, y: 690 }, thickness_px: 12, is_exterior: false, confidence: 0.93 },
      { id: 'W-08', start: { x: 640, y: 400 }, end: { x: 640, y: 690 }, thickness_px: 12, is_exterior: false, confidence: 0.94 },
    ],
    openings: [
      { id: 'D-01', kind: 'door', wall_id: 'W-03', position_t: 0.50, width_px: 64, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.2, confidence: 0.97 },
      { id: 'D-02', kind: 'door', wall_id: 'W-06', position_t: 0.22, width_px: 62, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.2, confidence: 0.95 },
      { id: 'D-03', kind: 'door', wall_id: 'W-06', position_t: 0.72, width_px: 62, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.2, confidence: 0.95 },
      { id: 'D-04', kind: 'door', wall_id: 'W-07', position_t: 0.50, width_px: 60, swing_direction: 'inward-left', sill_height_m: 0, head_height_m: 2.1, confidence: 0.92 },
      { id: 'D-05', kind: 'door', wall_id: 'W-08', position_t: 0.50, width_px: 60, swing_direction: 'inward-right', sill_height_m: 0, head_height_m: 2.1, confidence: 0.93 },
      { id: 'WIN-01', kind: 'window', wall_id: 'W-01', position_t: 0.23, width_px: 220, sill_height_m: 0.5, head_height_m: 2.5, confidence: 0.98 },
      { id: 'WIN-02', kind: 'window', wall_id: 'W-01', position_t: 0.73, width_px: 240, sill_height_m: 0.5, head_height_m: 2.5, confidence: 0.98 },
      { id: 'WIN-03', kind: 'window', wall_id: 'W-02', position_t: 0.28, width_px: 170, sill_height_m: 0.5, head_height_m: 2.5, confidence: 0.96 },
      { id: 'WIN-04', kind: 'window', wall_id: 'W-02', position_t: 0.75, width_px: 150, sill_height_m: 0.85, head_height_m: 2.3, confidence: 0.94 },
    ],
    rooms: [
      {
        id: 'R-01',
        name: 'Corner Boardroom',
        category: 'office',
        polygon: [
          { x: 80, y: 60 },
          { x: 460, y: 60 },
          { x: 460, y: 400 },
          { x: 80, y: 400 },
        ],
        area_px2: 380 * 340,
        confidence: 0.98,
      },
      {
        id: 'R-02',
        name: 'Design Engineering Bullpen',
        category: 'office',
        polygon: [
          { x: 460, y: 60 },
          { x: 920, y: 60 },
          { x: 920, y: 400 },
          { x: 460, y: 400 },
        ],
        area_px2: 460 * 340,
        confidence: 0.97,
      },
      {
        id: 'R-03',
        name: 'Pantry & Espresso Bar',
        category: 'kitchen',
        polygon: [
          { x: 80, y: 400 },
          { x: 360, y: 400 },
          { x: 360, y: 690 },
          { x: 80, y: 690 },
        ],
        area_px2: 280 * 290,
        confidence: 0.94,
      },
      {
        id: 'R-04',
        name: 'Reception & Gallery',
        category: 'hallway',
        polygon: [
          { x: 360, y: 400 },
          { x: 640, y: 400 },
          { x: 640, y: 690 },
          { x: 360, y: 690 },
        ],
        area_px2: 280 * 290,
        confidence: 0.95,
      },
      {
        id: 'R-05',
        name: 'Acoustic Focus Pod',
        category: 'office',
        polygon: [
          { x: 640, y: 400 },
          { x: 920, y: 400 },
          { x: 920, y: 690 },
          { x: 640, y: 690 },
        ],
        area_px2: 280 * 290,
        confidence: 0.93,
      },
    ],
    warnings: [
      {
        code: 'CURTAIN_WALL_GLAZING',
        severity: 'info',
        stage: 'build_model',
        element_id: 'WIN-02',
        message: 'North elevation glazing WIN-01 / WIN-02 exceeds 3.0m span; mullion dividers inserted in 3D geometry.',
      },
    ],
  },
];

/**
 * Generates a crisp architectural 2D blueprint PNG data URL on an offscreen canvas
 * so preset plans behave identically to uploaded raster floor-plan images.
 */
export function renderPresetBlueprintDataUrl(preset: BlueprintPreset): string {
  const canvas = document.createElement('canvas');
  canvas.width = preset.width_px;
  canvas.height = preset.height_px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Architectural vellum paper background
  ctx.fillStyle = '#F6F5F0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle millimeter architectural drafting grid
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.055)';
  ctx.lineWidth = 1;
  const gridStep = 25;
  for (let x = 0; x <= canvas.width; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Title block frame border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  // Room subtle hatches & architectural callout labels
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
      room.category === 'bathroom' || room.category === 'kitchen'
        ? 'rgba(148, 163, 184, 0.14)'
        : room.category === 'balcony'
        ? 'rgba(203, 213, 225, 0.25)'
        : 'rgba(255, 255, 255, 0.55)';
    ctx.fill();

    // Centroid for drafting text
    const cx = room.polygon.reduce((acc, p) => acc + p.x, 0) / room.polygon.length;
    const cy = room.polygon.reduce((acc, p) => acc + p.y, 0) / room.polygon.length;

    ctx.fillStyle = '#1E293B';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(room.name.toUpperCase(), cx, cy - 4);

    const areaM2 = (room.area_px2 * preset.default_m_per_px * preset.default_m_per_px).toFixed(1);
    ctx.fillStyle = '#475569';
    ctx.font = '400 11px "JetBrains Mono", monospace';
    ctx.fillText(`${areaM2} m²`, cx, cy + 14);
    ctx.restore();
  }

  // Draw solid architectural walls
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

  // Draw openings (doors with quarter-circle swing arc, windows with casement double lines)
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

    // Clear wall segment under opening
    ctx.save();
    ctx.strokeStyle = '#F6F5F0';
    ctx.lineWidth = wall.thickness_px + 4;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();

    if (op.kind === 'window') {
      // Double casement lines
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p1x + nx * 3, p1y + ny * 3);
      ctx.lineTo(p2x + nx * 3, p2y + ny * 3);
      ctx.moveTo(p1x - nx * 3, p1y - ny * 3);
      ctx.lineTo(p2x - nx * 3, p2y - ny * 3);
      ctx.stroke();
    } else {
      // Door leaf + quarter-circle swing arc
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2;
      const leafEndX = p1x + nx * op.width_px;
      const leafEndY = p1y + ny * op.width_px;
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(leafEndX, leafEndY);
      ctx.stroke();

      // Dashed swing arc
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const startAngle = Math.atan2(p2y - p1y, p2x - p1x);
      const endAngle = Math.atan2(leafEndY - p1y, leafEndX - p1x);
      ctx.arc(p1x, p1y, op.width_px, startAngle, endAngle, false);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw top architectural dimension line for OCR / visual reference
  const minX = Math.min(...preset.walls.map((w) => Math.min(w.start.x, w.end.x)));
  const maxX = Math.max(...preset.walls.map((w) => Math.max(w.start.x, w.end.x)));
  const minY = Math.min(...preset.walls.map((w) => Math.min(w.start.y, w.end.y)));

  ctx.save();
  ctx.strokeStyle = '#334155';
  ctx.fillStyle = '#0F172A';
  ctx.lineWidth = 1.2;
  const dimY = Math.max(36, minY - 26);
  ctx.beginPath();
  ctx.moveTo(minX, dimY);
  ctx.lineTo(maxX, dimY);
  ctx.moveTo(minX, dimY - 6);
  ctx.lineTo(minX, dimY + 6);
  ctx.moveTo(maxX, dimY - 6);
  ctx.lineTo(maxX, dimY + 6);
  ctx.stroke();

  const totalWidthM = ((maxX - minX) * preset.default_m_per_px).toFixed(2);
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`◄ ${totalWidthM} m ►`, (minX + maxX) / 2, dimY - 8);

  // Stamp footer metadata inside blueprint
  ctx.textAlign = 'left';
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#334155';
  ctx.fillText(`FLOORFORGE CAD REF: ${preset.id.toUpperCase()}  |  ${preset.ocr_dimension_text}`, 32, canvas.height - 28);
  ctx.restore();

  return canvas.toDataURL('image/png');
}
