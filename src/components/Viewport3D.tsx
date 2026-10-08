import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ConfidenceStatus,
  EpistemicProvenance,
  FloorPlanPipelineResult,
  FurnitureMesh3D,
  PipelineConfig,
  SelectedElementRef,
} from '../types/floorforge';
import { RotateCcw, Layers, Compass, Download, ShieldAlert, GitBranch } from 'lucide-react';

export interface Viewport3DHandle {
  exportGLB: () => void;
  resetCamera: () => void;
}

interface Viewport3DProps {
  pipelineResult: FloorPlanPipelineResult;
  config: PipelineConfig;
  selectedElement: SelectedElementRef | null;
  onSelectElement: (el: SelectedElementRef | null) => void;
  onChangeMaterialTheme: (theme: PipelineConfig['material_theme']) => void;
}

function get3DConfidenceColor(status: ConfidenceStatus): string {
  if (status === 'invalid') return '#EF4444'; // Red
  if (status === 'uncertain') return '#F59E0B'; // Amber
  return '#10B981'; // Green
}

function get3DProvenanceColor(prov: EpistemicProvenance): string {
  if (prov === 'user_corrected') return '#A855F7'; // Violet: User-Corrected
  if (prov === 'generated_completion') return '#F59E0B'; // Amber: Inferred
  return '#38BDF8'; // Cyan: AI-Detected
}

// ============================================================================
// PROCEDURAL PBR TEXTURE GENERATOR (Wood Flooring, Ceramic Tiles, Marble,
// Backsplash, Woven Jaipur Rugs, Indian Wall Art, & Ambient Occlusion Shadows)
// ============================================================================
const textureCache = new Map<string, THREE.CanvasTexture>();

function getProceduralTexture(
  kind:
    | 'wood_floor'
    | 'marble_floor'
    | 'ceramic_tile'
    | 'kitchen_tile'
    | 'backsplash_tile'
    | 'jaipur_rug'
    | 'indian_art'
    | 'ao_shadow',
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const key = `${kind}_${repeatX.toFixed(1)}_${repeatY.toFixed(1)}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (kind === 'wood_floor') {
    // Rich Indian Teak / Sheesham plank flooring
    ctx.fillStyle = '#7C4D2B';
    ctx.fillRect(0, 0, 512, 512);
    const planks = 8;
    const plankH = 512 / planks;
    for (let p = 0; p < planks; p++) {
      const y = p * plankH;
      ctx.fillStyle = p % 2 === 0 ? '#855330' : '#734526';
      ctx.fillRect(0, y, 512, plankH);

      // Wood grain fibers
      ctx.strokeStyle = 'rgba(58, 30, 12, 0.24)';
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 18; g++) {
        ctx.beginPath();
        const gy = y + (g / 18) * plankH;
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(
          170,
          gy + Math.sin(p + g) * 4,
          340,
          gy - Math.cos(p + g) * 4,
          512,
          gy
        );
        ctx.stroke();
      }

      // Plank seam & staggered vertical joint
      ctx.strokeStyle = '#3B1F0E';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, y, 512, plankH);
      const jointX = ((p * 173) % 360) + 70;
      ctx.beginPath();
      ctx.moveTo(jointX, y);
      ctx.lineTo(jointX, y + plankH);
      ctx.stroke();
    }
  } else if (kind === 'marble_floor') {
    // Warm Italian / Indian Botticino Ivory Marble with subtle veining
    ctx.fillStyle = '#EAE4DC';
    ctx.fillRect(0, 0, 512, 512);

    // Soft marble veins
    ctx.strokeStyle = 'rgba(180, 165, 145, 0.38)';
    ctx.lineWidth = 2.2;
    for (let v = 0; v < 10; v++) {
      ctx.beginPath();
      ctx.moveTo((v * 67) % 512, 0);
      ctx.bezierCurveTo(
        150 + v * 25,
        180,
        380 - v * 20,
        330,
        (v * 97 + 120) % 512,
        512
      );
      ctx.stroke();
    }

    // Large 2x2 vitrified slab grid lines
    ctx.strokeStyle = 'rgba(148, 138, 126, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 256, 256);
    ctx.strokeRect(256, 0, 256, 256);
    ctx.strokeRect(0, 256, 256, 256);
    ctx.strokeRect(256, 256, 256, 256);
  } else if (kind === 'ceramic_tile') {
    // Glossy Bathroom Ceramic & Statuario Marble Tiles
    ctx.fillStyle = '#E2ECEF';
    ctx.fillRect(0, 0, 512, 512);
    const cells = 6;
    const step = 512 / cells;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#EBF3F5' : '#DCE8EC';
        ctx.fillRect(c * step + 2, r * step + 2, step - 4, step - 4);
        // Subtle diagonal marble vein inside tile
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(c * step + 8, r * step + 12);
        ctx.lineTo((c + 1) * step - 10, (r + 1) * step - 8);
        ctx.stroke();
      }
    }
  } else if (kind === 'kitchen_tile') {
    // Warm Sandstone / Slate Matte Kitchen Tile
    ctx.fillStyle = '#D6CFC7';
    ctx.fillRect(0, 0, 512, 512);
    const cells = 4;
    const step = 512 / cells;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#DDD6CE' : '#CFC7BE';
        ctx.fillRect(c * step + 2, r * step + 2, step - 4, step - 4);
      }
    }
  } else if (kind === 'backsplash_tile') {
    // Artisan Jaipur / Moroccan Geometric Ceramic Backsplash
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, 512, 512);
    const cells = 8;
    const step = 512 / cells;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const x = c * step;
        const y = r * step;
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, step, step);

        ctx.fillStyle = (r + c) % 2 === 0 ? '#0F766E' : '#D97706';
        ctx.beginPath();
        ctx.arc(x + step / 2, y + step / 2, step * 0.24, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'jaipur_rug') {
    // Woven Jaipur Dhurrie / Persian-inspired Contemporary Area Rug
    ctx.fillStyle = '#DFD5C8';
    ctx.fillRect(0, 0, 512, 512);
    // Terracotta & Indigo border frame
    ctx.strokeStyle = '#9A3412';
    ctx.lineWidth = 24;
    ctx.strokeRect(28, 28, 456, 456);
    ctx.strokeStyle = '#1E3A8A';
    ctx.lineWidth = 8;
    ctx.strokeRect(54, 54, 404, 404);
    // Center geometric medallion
    ctx.fillStyle = 'rgba(180, 83, 9, 0.22)';
    ctx.fillRect(80, 80, 352, 352);
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(256, 110);
    ctx.lineTo(390, 256);
    ctx.lineTo(256, 402);
    ctx.lineTo(122, 256);
    ctx.closePath();
    ctx.stroke();
  } else if (kind === 'indian_art') {
    // Warm Modern Indian Arch & Terracotta Sun Canvas Painting
    ctx.fillStyle = '#F5EFE6';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#C2410C';
    ctx.beginPath();
    ctx.arc(256, 220, 110, Math.PI, 0, false);
    ctx.lineTo(366, 420);
    ctx.lineTo(146, 420);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(256, 190, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.arc(256, 360, 70, Math.PI, 0, false);
    ctx.fill();
  } else if (kind === 'ao_shadow') {
    // Soft radial ambient occlusion contact shadow
    const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 250);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.48)');
    grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.18)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (kind !== 'ao_shadow' && kind !== 'indian_art' && kind !== 'jaipur_rug') {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  textureCache.set(key, tex);
  return tex;
}

/**
 * Adds a soft Ambient Occlusion (AO) contact shadow under any 3D furniture model
 * so furniture pieces look naturally grounded on the floor slab.
 */
function addContactShadow(group: THREE.Group, w: number, d: number) {
  const aoTex = getProceduralTexture('ao_shadow');
  const planeGeo = new THREE.PlaneGeometry(w * 1.06, d * 1.06);
  planeGeo.rotateX(-Math.PI / 2);
  const planeMat = new THREE.MeshBasicMaterial({
    map: aoTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.52,
  });
  const shadowMesh = new THREE.Mesh(planeGeo, planeMat);
  shadowMesh.position.y = 0.004;
  group.add(shadowMesh);
}

/**
 * Builds photorealistic, multi-part 3D interior design models for:
 * - Bedroom: King bed with layered pillows, bolsters & folded blanket, bedside tables with warm lamps,
 *            full-height sliding teak & fluted-glass wardrobe, woven rug, and wall artwork.
 * - Bathroom: Frameless tempered glass shower enclosure with brass rain showerhead, ceramic toilet with flush plate,
 *             floating marble washbasin vanity with backlit LED mirror.
 * - Living Room: Designer sofa with colorful cushions & floor lamp, travertine coffee table with decor,
 *                fluted teak TV unit with 65" OLED TV & warm backlit cove panel.
 * - Kitchen: Modular base & overhead cabinets, quartz countertop, stainless sink & faucet, 4-burner hob,
 *            patterned ceramic backsplash, chimney hood, double-door refrigerator, and dining set.
 */
function buildFurniture3DObject(
  item: FurnitureMesh3D,
  theme: PipelineConfig['material_theme'],
  isSelected: boolean
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(item.center_m.x, 0.05, item.center_m.y);
  group.rotation.y = -item.rotation_rad;
  group.name = `Furniture_${item.kind}_${item.id}`;
  group.userData = { elementKind: 'furniture', elementId: item.id };

  const w = item.width_m;
  const d = item.depth_m;
  const h = item.height_m;

  // Ground contact ambient occlusion shadow
  addContactShadow(group, w, d);

  const makeMat = (
    hex: string,
    roughness = 0.55,
    metalness = 0.08,
    extra?: Partial<THREE.MeshPhysicalMaterialParameters>
  ) => {
    if (isSelected) {
      return new THREE.MeshStandardMaterial({
        color: '#F59E0B',
        emissive: '#78350F',
        roughness: 0.35,
      });
    }
    if (theme === 'confidence_overlay') {
      return new THREE.MeshStandardMaterial({
        color: get3DConfidenceColor(item.confidence_status),
        roughness: 0.45,
        metalness: 0.1,
      });
    }
    if (theme === 'provenance_overlay') {
      return new THREE.MeshStandardMaterial({
        color: get3DProvenanceColor(item.provenance),
        roughness: 0.45,
        metalness: 0.1,
        transparent: item.provenance === 'generated_completion',
        opacity: item.provenance === 'generated_completion' ? 0.72 : 0.95,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness,
      metalness,
      ...extra,
    });
  };

  if (item.kind === 'bed') {
    // 1. Woven Jaipur Area Rug neatly under the bed footprint
    if (theme === 'studio') {
      const rugGeo = new THREE.BoxGeometry(w * 1.06, 0.01, d * 1.06);
      const rugMat = new THREE.MeshStandardMaterial({
        map: getProceduralTexture('jaipur_rug'),
        roughness: 0.9,
      });
      const rugMesh = new THREE.Mesh(rugGeo, rugMat);
      rugMesh.position.set(0, 0.005, d * 0.03);
      rugMesh.receiveShadow = true;
      group.add(rugMesh);
    }

    // 2. Solid Sheesham/Teak Bed Frame & Tapered Legs
    const frameGeo = new THREE.BoxGeometry(w, 0.18, d);
    const frameMesh = new THREE.Mesh(frameGeo, makeMat('#5C3419', 0.48, 0.06));
    frameMesh.position.y = 0.16;
    frameMesh.castShadow = true;
    frameMesh.receiveShadow = true;
    group.add(frameMesh);

    const legGeo = new THREE.CylinderGeometry(0.035, 0.02, 0.1, 12);
    const legMat = makeMat('#3B1F0E', 0.4, 0.1);
    for (const [lx, lz] of [
      [-w * 0.46, -d * 0.46],
      [w * 0.46, -d * 0.46],
      [-w * 0.46, d * 0.46],
      [w * 0.46, d * 0.46],
    ]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.05, lz);
      group.add(leg);
    }

    // 3. Plush Orthopedic Mattress
    const matGeo = new THREE.BoxGeometry(w * 0.94, 0.24, d * 0.92);
    const matMesh = new THREE.Mesh(matGeo, makeMat('#FAF8F5', 0.78));
    matMesh.position.y = 0.36;
    matMesh.castShadow = true;
    matMesh.receiveShadow = true;
    group.add(matMesh);

    // 4. Layered Quilted Duvet Blanket + Terracotta Foot Runner
    const duvetGeo = new THREE.BoxGeometry(w * 0.96, 0.25, d * 0.62);
    const duvetMesh = new THREE.Mesh(duvetGeo, makeMat('#E6DEC8', 0.82));
    duvetMesh.position.set(0, 0.37, d * 0.15);
    duvetMesh.castShadow = true;
    group.add(duvetMesh);

    const runnerGeo = new THREE.BoxGeometry(w * 0.97, 0.26, d * 0.22);
    const runnerMesh = new THREE.Mesh(runnerGeo, makeMat('#9A3412', 0.85));
    runnerMesh.position.set(0, 0.375, d * 0.34);
    runnerMesh.castShadow = true;
    group.add(runnerMesh);

    // 5. Four Plump Pillows + Two Cylindrical Decorative Bolsters
    const backPillowGeo = new THREE.BoxGeometry(w * 0.38, 0.12, d * 0.16);
    const p1 = new THREE.Mesh(backPillowGeo, makeMat('#FFFFFF', 0.75));
    p1.position.set(-w * 0.22, 0.52, -d * 0.34);
    p1.rotation.x = 0.18;
    const p2 = new THREE.Mesh(backPillowGeo, makeMat('#FFFFFF', 0.75));
    p2.position.set(w * 0.22, 0.52, -d * 0.34);
    p2.rotation.x = 0.18;
    group.add(p1, p2);

    const frontPillowGeo = new THREE.BoxGeometry(w * 0.32, 0.1, d * 0.14);
    const p3 = new THREE.Mesh(frontPillowGeo, makeMat('#D97706', 0.8));
    p3.position.set(-w * 0.22, 0.51, -d * 0.22);
    p3.rotation.x = 0.12;
    const p4 = new THREE.Mesh(frontPillowGeo, makeMat('#D97706', 0.8));
    p4.position.set(w * 0.22, 0.51, -d * 0.22);
    p4.rotation.x = 0.12;
    group.add(p3, p4);

    const bolsterGeo = new THREE.CylinderGeometry(0.065, 0.065, w * 0.45, 16);
    bolsterGeo.rotateZ(Math.PI / 2);
    const bolster = new THREE.Mesh(bolsterGeo, makeMat('#78350F', 0.8));
    bolster.position.set(0, 0.52, -d * 0.12);
    group.add(bolster);

    // 6. Upholstered Fluted Headboard with Teak Trim
    const hbOuterGeo = new THREE.BoxGeometry(w * 1.04, 1.08, 0.11);
    const hbOuter = new THREE.Mesh(hbOuterGeo, makeMat('#4A2810', 0.5));
    hbOuter.position.set(0, 0.54, -d / 2 + 0.055);
    hbOuter.castShadow = true;
    group.add(hbOuter);

    const hbPadGeo = new THREE.BoxGeometry(w * 0.96, 0.68, 0.13);
    const hbPad = new THREE.Mesh(hbPadGeo, makeMat('#D6CFC7', 0.85));
    hbPad.position.set(0, 0.62, -d / 2 + 0.06);
    group.add(hbPad);

    // 7. Framed Contemporary Indian Wall Art + Warm Picture Light above headboard
    const artFrameGeo = new THREE.BoxGeometry(w * 0.68, 0.52, 0.035);
    const artFrame = new THREE.Mesh(artFrameGeo, makeMat('#3B1F0E', 0.4));
    artFrame.position.set(0, 1.42, -d / 2 + 0.02);
    group.add(artFrame);

    if (theme === 'studio') {
      const artCanvasGeo = new THREE.BoxGeometry(w * 0.62, 0.46, 0.04);
      const artCanvas = new THREE.Mesh(
        artCanvasGeo,
        new THREE.MeshStandardMaterial({
          map: getProceduralTexture('indian_art'),
          roughness: 0.6,
        })
      );
      artCanvas.position.set(0, 1.42, -d / 2 + 0.022);
      group.add(artCanvas);
    }

    // Warm brass picture light bar above wall art
    const picLightGeo = new THREE.BoxGeometry(w * 0.35, 0.025, 0.08);
    const picLight = new THREE.Mesh(
      picLightGeo,
      makeMat('#F59E0B', 0.3, 0.8, { emissive: new THREE.Color('#F59E0B'), emissiveIntensity: 0.6 })
    );
    picLight.position.set(0, 1.72, -d / 2 + 0.05);
    group.add(picLight);
  } else if (item.kind === 'nightstand') {
    // Teak Bedside Table + Drawer + Warm Glowing Table Lamp
    const bodyGeo = new THREE.BoxGeometry(w, 0.34, d);
    const bodyMesh = new THREE.Mesh(bodyGeo, makeMat('#5C3419', 0.5));
    bodyMesh.position.y = 0.32;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    const drawerGeo = new THREE.BoxGeometry(w * 0.88, 0.14, 0.02);
    const drawerMesh = new THREE.Mesh(drawerGeo, makeMat('#784421', 0.5));
    drawerMesh.position.set(0, 0.36, d / 2 + 0.01);
    group.add(drawerMesh);

    const knobGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.025, 12);
    knobGeo.rotateX(Math.PI / 2);
    const knobMesh = new THREE.Mesh(knobGeo, makeMat('#F59E0B', 0.25, 0.85));
    knobMesh.position.set(0, 0.36, d / 2 + 0.025);
    group.add(knobMesh);

    // Lamp base & warm glowing linen lampshade
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.16, 16),
      makeMat('#D97706', 0.25, 0.8)
    );
    lampBase.position.set(0, 0.57, 0);
    group.add(lampBase);

    const lampShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.13, 0.2, 20),
      makeMat('#FEF3C7', 0.6, 0.0, {
        emissive: new THREE.Color('#F59E0B'),
        emissiveIntensity: theme === 'studio' ? 0.85 : 0.1,
      })
    );
    lampShade.position.set(0, 0.74, 0);
    group.add(lampShade);
  } else if (item.kind === 'wardrobe') {
    // Full-Height Teak & Fluted Glass Sliding Wardrobe
    const carcassGeo = new THREE.BoxGeometry(w, h, d);
    const carcassMesh = new THREE.Mesh(carcassGeo, makeMat('#4A2810', 0.5));
    carcassMesh.position.y = h / 2;
    carcassMesh.castShadow = true;
    carcassMesh.receiveShadow = true;
    group.add(carcassMesh);

    // 3 Sliding Door Panels with Fluted Translucent Glass inserts
    const panelW = (w * 0.94) / 3;
    for (let i = -1; i <= 1; i++) {
      const doorFrame = new THREE.Mesh(
        new THREE.BoxGeometry(panelW * 0.96, h * 0.92, 0.03),
        makeMat('#6E3F1D', 0.45)
      );
      doorFrame.position.set(i * panelW, h * 0.5, d / 2 + 0.015);
      group.add(doorFrame);

      const glassInsert = new THREE.Mesh(
        new THREE.BoxGeometry(panelW * 0.76, h * 0.68, 0.036),
        makeMat('#CBD5E1', 0.18, 0.1, {
          transmission: theme === 'studio' ? 0.45 : 0,
          reflectivity: 0.8,
        })
      );
      glassInsert.position.set(i * panelW, h * 0.54, d / 2 + 0.018);
      group.add(glassInsert);

      // Long vertical brushed-brass handle bar
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, h * 0.38, 0.045),
        makeMat('#F59E0B', 0.25, 0.88)
      );
      handle.position.set(i * panelW + panelW * 0.38, h * 0.5, d / 2 + 0.025);
      group.add(handle);
    }
  } else if (item.kind === 'shower') {
    // Walk-In Frameless Tempered Glass Shower Enclosure + Brass Rain Showerhead
    // 1. Marble Shower Tray Curb
    const trayGeo = new THREE.BoxGeometry(w, 0.06, d);
    const trayMesh = new THREE.Mesh(trayGeo, makeMat('#F1F5F9', 0.2, 0.05));
    trayMesh.position.y = 0.03;
    trayMesh.receiveShadow = true;
    group.add(trayMesh);

    // Linear stainless drain channel
    const drainMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.7, 0.065, 0.06),
      makeMat('#64748B', 0.25, 0.85)
    );
    drainMesh.position.set(0, 0.032, -d * 0.3);
    group.add(drainMesh);

    // 2. Frameless Tempered Glass Panels (Front & Side)
    const glassMat =
      theme === 'studio'
        ? new THREE.MeshPhysicalMaterial({
            color: '#E0F2FE',
            transparent: true,
            opacity: 0.36,
            roughness: 0.05,
            metalness: 0.1,
            transmission: 0.72,
            ior: 1.5,
            reflectivity: 0.9,
          })
        : makeMat('#38BDF8', 0.2, 0.1);

    const frontGlass = new THREE.Mesh(
      new THREE.BoxGeometry(w, h * 0.92, 0.022),
      glassMat
    );
    frontGlass.position.set(0, h * 0.46, d / 2 - 0.01);
    group.add(frontGlass);

    const sideGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, h * 0.92, d),
      glassMat
    );
    sideGlass.position.set(-w / 2 + 0.01, h * 0.46, 0);
    group.add(sideGlass);

    // Top metallic support rail & vertical door pull handle
    const frameMetalMat = makeMat('#1E293B', 0.25, 0.85);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.028, 0.03), frameMetalMat);
    topBar.position.set(0, h * 0.92, d / 2 - 0.01);
    group.add(topBar);

    const doorHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.45, 0.06),
      makeMat('#F59E0B', 0.2, 0.9)
    );
    doorHandle.position.set(w * 0.18, h * 0.48, d / 2);
    group.add(doorHandle);

    // 3. Brass Rain Showerhead Pipe & Disc
    const brassMat = makeMat('#D97706', 0.2, 0.9);
    const riserPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, h * 0.75, 12),
      brassMat
    );
    riserPipe.position.set(0, h * 0.52, -d / 2 + 0.05);
    group.add(riserPipe);

    const showerArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.02, 0.36),
      brassMat
    );
    showerArm.position.set(0, h * 0.88, -d / 2 + 0.22);
    group.add(showerArm);

    const rainHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.02, 24),
      brassMat
    );
    rainHead.position.set(0, h * 0.86, -d / 2 + 0.38);
    group.add(rainHead);
  } else if (item.kind === 'toilet') {
    // Sculpted Ceramic Western Toilet (WC) + Concealed Cistern Ledge + Brass Flush Plate
    const porcelainMat = makeMat('#FFFFFF', 0.12, 0.05, { clearcoat: 0.85 });

    // Concealed cistern wall box
    const cisternGeo = new THREE.BoxGeometry(w * 0.96, 0.82, d * 0.32);
    const cisternMesh = new THREE.Mesh(cisternGeo, makeMat('#F1F5F9', 0.25));
    cisternMesh.position.set(0, 0.41, -d * 0.34);
    cisternMesh.castShadow = true;
    group.add(cisternMesh);

    // Brushed Brass Dual-Flush Wall Plate
    const flushPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.14, 0.02),
      makeMat('#F59E0B', 0.2, 0.9)
    );
    flushPlate.position.set(0, 0.96, -d * 0.48);
    group.add(flushPlate);

    // Ceramic Bowl & Contoured Seat Lid
    const bowlGeo = new THREE.CylinderGeometry(w * 0.42, w * 0.32, 0.4, 24);
    const bowlMesh = new THREE.Mesh(bowlGeo, porcelainMat);
    bowlMesh.position.set(0, 0.22, d * 0.12);
    bowlMesh.castShadow = true;
    group.add(bowlMesh);

    const lidGeo = new THREE.CylinderGeometry(w * 0.43, w * 0.43, 0.035, 24);
    const lidMesh = new THREE.Mesh(lidGeo, porcelainMat);
    lidMesh.position.set(0, 0.43, d * 0.12);
    group.add(lidMesh);
  } else if (item.kind === 'sink_vanity') {
    // Floating Fluted-Teak Vanity + Marble Counter + Ceramic Washbasin + Reflective Mirror
    const cabGeo = new THREE.BoxGeometry(w, 0.56, d);
    const cabMesh = new THREE.Mesh(cabGeo, makeMat('#5C3419', 0.48));
    cabMesh.position.y = 0.52;
    cabMesh.castShadow = true;
    group.add(cabMesh);

    // White Carrara Marble Countertop
    const topGeo = new THREE.BoxGeometry(w * 1.03, 0.05, d * 1.04);
    const topMesh = new THREE.Mesh(topGeo, makeMat('#F8FAFC', 0.15, 0.05, { clearcoat: 0.7 }));
    topMesh.position.y = 0.825;
    group.add(topMesh);

    // Ceramic Vessel Washbasin
    const basinOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(w, d) * 0.34, Math.min(w, d) * 0.26, 0.13, 24),
      makeMat('#FFFFFF', 0.12, 0.05, { clearcoat: 0.9 })
    );
    basinOuter.position.set(0, 0.91, 0);
    basinOuter.castShadow = true;
    group.add(basinOuter);

    // Brushed Brass Tall Mixer Tap
    const tapMat = makeMat('#F59E0B', 0.2, 0.9);
    const tapStem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.22, 12), tapMat);
    tapStem.position.set(0, 0.95, -d * 0.28);
    const tapSpout = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.14), tapMat);
    tapSpout.position.set(0, 1.04, -d * 0.21);
    group.add(tapStem, tapSpout);

    // Backlit Warm LED Halo + High-Reflection Bathroom Mirror
    const haloGeo = new THREE.CylinderGeometry(w * 0.42, w * 0.42, 0.02, 32);
    haloGeo.rotateX(Math.PI / 2);
    const haloMesh = new THREE.Mesh(
      haloGeo,
      makeMat('#FEF3C7', 0.3, 0.0, {
        emissive: new THREE.Color('#F59E0B'),
        emissiveIntensity: theme === 'studio' ? 0.9 : 0.1,
      })
    );
    haloMesh.position.set(0, 1.48, -d / 2 + 0.015);
    group.add(haloMesh);

    const mirrorGeo = new THREE.CylinderGeometry(w * 0.39, w * 0.39, 0.028, 32);
    mirrorGeo.rotateX(Math.PI / 2);
    const mirrorMat =
      theme === 'studio'
        ? new THREE.MeshPhysicalMaterial({
            color: '#F8FAFC',
            metalness: 0.98,
            roughness: 0.02,
            reflectivity: 1.0,
            clearcoat: 1.0,
          })
        : makeMat('#38BDF8', 0.1, 0.8);
    const mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
    mirrorMesh.position.set(0, 1.48, -d / 2 + 0.026);
    group.add(mirrorMesh);
  } else if (item.kind === 'sofa') {
    // 1. Woven Jaipur Area Rug neatly proportioned under the sofa
    if (theme === 'studio') {
      const rugGeo = new THREE.BoxGeometry(w * 1.04, 0.01, d * 1.16);
      const rugMat = new THREE.MeshStandardMaterial({
        map: getProceduralTexture('jaipur_rug'),
        roughness: 0.88,
      });
      const rugMesh = new THREE.Mesh(rugGeo, rugMat);
      rugMesh.position.set(0, 0.005, d * 0.08);
      rugMesh.receiveShadow = true;
      group.add(rugMesh);
    }

    // 2. Teak Plinth Base & Legs
    const basePlinth = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.08, d),
      makeMat('#5C3419', 0.45)
    );
    basePlinth.position.y = 0.08;
    group.add(basePlinth);

    // 3. Three Individual Plush Seat Cushions (Warm Bouclé Ivory/Beige Fabric)
    const fabricMat = makeMat('#E5DEC9', 0.85);
    const seatW = (w * 0.84) / 3;
    for (let i = -1; i <= 1; i++) {
      const seatCushion = new THREE.Mesh(
        new THREE.BoxGeometry(seatW * 0.96, 0.24, d * 0.78),
        fabricMat
      );
      seatCushion.position.set(i * seatW, 0.24, d * 0.06);
      seatCushion.castShadow = true;
      seatCushion.receiveShadow = true;
      group.add(seatCushion);

      // Tufted Backrest Cushion
      const backCushion = new THREE.Mesh(
        new THREE.BoxGeometry(seatW * 0.95, 0.42, d * 0.22),
        fabricMat
      );
      backCushion.position.set(i * seatW, 0.54, -d * 0.32);
      backCushion.rotation.x = -0.1;
      backCushion.castShadow = true;
      group.add(backCushion);
    }

    // 4. Sculpted Armrests & Back Frame
    const backFrame = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.68, d * 0.16),
      makeMat('#D5CCB4', 0.85)
    );
    backFrame.position.set(0, 0.42, -d * 0.42);
    backFrame.castShadow = true;
    group.add(backFrame);

    const armGeo = new THREE.BoxGeometry(w * 0.09, 0.48, d * 0.96);
    const leftArm = new THREE.Mesh(armGeo, fabricMat);
    leftArm.position.set(-w * 0.455, 0.34, 0);
    leftArm.castShadow = true;
    const rightArm = new THREE.Mesh(armGeo, fabricMat);
    rightArm.position.set(w * 0.455, 0.34, 0);
    rightArm.castShadow = true;
    group.add(leftArm, rightArm);

    // 5. Five Colorful Indian Silk & Linen Throw Cushions (Terracotta, Mustard, Emerald, Indigo)
    const cushionColors = ['#C2410C', '#D97706', '#0F766E', '#9A3412', '#B45309'];
    const cushionPositions = [
      [-w * 0.34, 0.48, -d * 0.16, 0.22],
      [-w * 0.18, 0.47, -d * 0.18, -0.15],
      [0, 0.47, -d * 0.19, 0.08],
      [w * 0.19, 0.47, -d * 0.18, 0.18],
      [w * 0.34, 0.48, -d * 0.16, -0.22],
    ];
    cushionPositions.forEach(([cx, cy, cz, rotZ], idx) => {
      const throwPillow = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.32, 0.11),
        makeMat(cushionColors[idx % cushionColors.length], 0.78)
      );
      throwPillow.position.set(cx, cy, cz);
      throwPillow.rotation.z = rotZ;
      throwPillow.rotation.x = 0.2;
      throwPillow.castShadow = true;
      group.add(throwPillow);
    });

    // 6. Decorative Brass Arc Floor Lamp next to the sofa
    const lampPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.02, 1.65, 12),
      makeMat('#D97706', 0.2, 0.9)
    );
    lampPole.position.set(w * 0.56, 0.82, -d * 0.25);
    group.add(lampPole);

    const lampGlobe = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 20, 20),
      makeMat('#FEF3C7', 0.3, 0.0, {
        emissive: new THREE.Color('#F59E0B'),
        emissiveIntensity: theme === 'studio' ? 0.95 : 0.1,
      })
    );
    lampGlobe.position.set(w * 0.56, 1.62, -d * 0.25);
    group.add(lampGlobe);
  } else if (item.kind === 'coffee_table') {
    // Designer Travertine & Brass Center Coffee Table + Art Books + Brass Urli Bowl
    const topGeo = new THREE.CylinderGeometry(w * 0.48, w * 0.48, 0.05, 32);
    const topMesh = new THREE.Mesh(
      topGeo,
      makeMat('#EDE6D6', 0.25, 0.05, { clearcoat: 0.5 })
    );
    topMesh.position.y = h - 0.025;
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    group.add(topMesh);

    // Fluted Walnut Pedestal Drum Base
    const baseDrum = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.28, w * 0.32, h - 0.05, 24),
      makeMat('#5C3419', 0.5)
    );
    baseDrum.position.y = (h - 0.05) / 2;
    baseDrum.castShadow = true;
    group.add(baseDrum);

    // Decorative Brass Urli Bowl + Coffee Table Art Book
    const urliBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.09, 0.07, 20),
      makeMat('#F59E0B', 0.2, 0.9)
    );
    urliBowl.position.set(-w * 0.12, h + 0.035, 0);
    group.add(urliBowl);

    const bookMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.04, 0.32),
      makeMat('#9A3412', 0.6)
    );
    bookMesh.position.set(w * 0.14, h + 0.02, 0.04);
    bookMesh.rotation.y = 0.25;
    group.add(bookMesh);
  } else if (item.kind === 'tv_stand') {
    // Low Fluted-Teak TV Console + Acoustic Slat Back Panel + 65" OLED TV + Cove Lighting
    const consoleGeo = new THREE.BoxGeometry(w, 0.42, d);
    const consoleMesh = new THREE.Mesh(consoleGeo, makeMat('#4A2810', 0.48));
    consoleMesh.position.y = 0.28;
    consoleMesh.castShadow = true;
    group.add(consoleMesh);

    // Brass console doors trim
    const frontTrim = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.94, 0.32, 0.02),
      makeMat('#6E3F1D', 0.45)
    );
    frontTrim.position.set(0, 0.28, d / 2 + 0.01);
    group.add(frontTrim);

    // Warm LED Backlit Wall Panel behind TV
    const covePanel = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, 1.15, 0.03),
      makeMat('#784421', 0.55, 0.05, {
        emissive: new THREE.Color('#D97706'),
        emissiveIntensity: theme === 'studio' ? 0.22 : 0,
      })
    );
    covePanel.position.set(0, 1.18, -d / 2 + 0.02);
    group.add(covePanel);

    // 65" Ultra-Thin OLED Television with Glossy Reflective Screen
    const tvScreen = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.76, 0.82, 0.035),
      makeMat('#090D16', 0.08, 0.85, { clearcoat: 1.0, reflectivity: 0.95 })
    );
    tvScreen.position.set(0, 1.18, -d / 2 + 0.06);
    tvScreen.castShadow = true;
    group.add(tvScreen);

    // Dolby Atmos Soundbar on console
    const soundbar = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.48, 0.06, 0.1),
      makeMat('#1E293B', 0.3, 0.6)
    );
    soundbar.position.set(0, 0.52, 0);
    group.add(soundbar);
  } else if (item.kind === 'kitchen_counter') {
    // Complete Modular Indian Kitchen: Base Cabinets + Quartz Top + Sink & Faucet + 4-Burner Hob
    // + Jaipur Tile Backsplash + Overhead Wall Cabinets + Chimney Hood
    const counterH = 0.88;

    // 1. Base Cabinets (Matte Sage & Teak Finish)
    const baseGeo = new THREE.BoxGeometry(w, counterH - 0.04, d);
    const baseMesh = new THREE.Mesh(baseGeo, makeMat('#2F4F4F', 0.52));
    baseMesh.position.y = (counterH - 0.04) / 2;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Cabinet drawer division lines & brass handles
    const doors = 4;
    const doorW = (w * 0.94) / doors;
    for (let i = 0; i < doors; i++) {
      const dx = -w * 0.47 + doorW * (i + 0.5);
      const doorFace = new THREE.Mesh(
        new THREE.BoxGeometry(doorW * 0.94, counterH * 0.78, 0.02),
        makeMat('#3B5E5E', 0.48)
      );
      doorFace.position.set(dx, counterH * 0.45, d / 2 + 0.01);
      group.add(doorFace);

      const pull = new THREE.Mesh(
        new THREE.BoxGeometry(doorW * 0.35, 0.018, 0.03),
        makeMat('#F59E0B', 0.25, 0.88)
      );
      pull.position.set(dx, counterH * 0.76, d / 2 + 0.022);
      group.add(pull);
    }

    // 2. White Quartz Countertop Slab
    const stoneGeo = new THREE.BoxGeometry(w * 1.02, 0.045, d * 1.04);
    const stoneMesh = new THREE.Mesh(
      stoneGeo,
      makeMat('#F8FAFC', 0.16, 0.05, { clearcoat: 0.75 })
    );
    stoneMesh.position.y = counterH;
    stoneMesh.receiveShadow = true;
    group.add(stoneMesh);

    // 3. Patterned Ceramic Backsplash Panel (Between Countertop & Upper Cabinets)
    const bsH = 0.62;
    const bsGeo = new THREE.BoxGeometry(w, bsH, 0.025);
    const bsMat =
      theme === 'studio'
        ? new THREE.MeshPhysicalMaterial({
            map: getProceduralTexture('backsplash_tile', 4, 1.5),
            roughness: 0.18,
            clearcoat: 0.65,
          })
        : makeMat('#CBD5E1', 0.3);
    const bsMesh = new THREE.Mesh(bsGeo, bsMat);
    bsMesh.position.set(0, counterH + bsH / 2, -d / 2 + 0.015);
    group.add(bsMesh);

    // 4. Overhead Teak & Fluted-Glass Wall Cabinets + Warm Under-Cabinet LED Strip
    const upperH = 0.58;
    const upperD = d * 0.58;
    const upperGeo = new THREE.BoxGeometry(w * 0.58, upperH, upperD);
    const upperCab = new THREE.Mesh(upperGeo, makeMat('#5C3419', 0.48));
    upperCab.position.set(-w * 0.2, counterH + bsH + upperH / 2, -d / 2 + upperD / 2);
    upperCab.castShadow = true;
    group.add(upperCab);

    const ledStrip = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.9, 0.015, 0.04),
      makeMat('#FEF3C7', 0.2, 0.0, {
        emissive: new THREE.Color('#F59E0B'),
        emissiveIntensity: theme === 'studio' ? 0.95 : 0.1,
      })
    );
    ledStrip.position.set(0, counterH + bsH - 0.01, -d / 2 + upperD * 0.6);
    group.add(ledStrip);

    // 5. Brushed Stainless Chimney Range Hood above 4-Burner Hob
    const hoodCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.32, 0.08, d * 0.75),
      makeMat('#CBD5E1', 0.22, 0.88)
    );
    hoodCanopy.position.set(w * 0.24, counterH + bsH + 0.04, -d * 0.1);
    const hoodFlue = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.14, 0.54, d * 0.4),
      makeMat('#CBD5E1', 0.22, 0.88)
    );
    hoodFlue.position.set(w * 0.24, counterH + bsH + 0.35, -d * 0.26);
    group.add(hoodCanopy, hoodFlue);

    // 6. Stainless Steel Under-Mount Sink & High-Arc Gooseneck Faucet
    const sinkBasin = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(0.68, w * 0.28), 0.03, d * 0.62),
      makeMat('#94A3B8', 0.2, 0.9)
    );
    sinkBasin.position.set(-w * 0.24, counterH + 0.02, 0);
    group.add(sinkBasin);

    const faucetNeck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.016, 0.28, 12),
      makeMat('#E2E8F0', 0.15, 0.95)
    );
    faucetNeck.position.set(-w * 0.24, counterH + 0.16, -d * 0.26);
    group.add(faucetNeck);

    // 7. 4-Burner Black Tempered-Glass Gas/Induction Hob with Brass Burners
    const hobGlass = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(0.72, w * 0.3), 0.025, d * 0.64),
      makeMat('#0F172A', 0.1, 0.8, { clearcoat: 1.0 })
    );
    hobGlass.position.set(w * 0.24, counterH + 0.02, 0);
    group.add(hobGlass);

    const burnerMat = makeMat('#F59E0B', 0.25, 0.88);
    for (const [bx, bz] of [
      [-0.14, -0.1],
      [0.14, -0.1],
      [-0.14, 0.1],
      [0.14, 0.1],
    ]) {
      const burner = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.035, 16),
        burnerMat
      );
      burner.position.set(w * 0.24 + bx, counterH + 0.025, bz);
      group.add(burner);
    }
  } else if (item.kind === 'fridge') {
    // Double-Door Brushed Graphite Smart Refrigerator
    const bodyGeo = new THREE.BoxGeometry(w, h, d * 0.88);
    const bodyMesh = new THREE.Mesh(bodyGeo, makeMat('#334155', 0.28, 0.78));
    bodyMesh.position.set(0, h / 2, -d * 0.06);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Left & Right Brushed Steel Doors + Water Dispenser
    const doorW = w * 0.48;
    const doorMat = makeMat('#475569', 0.22, 0.85, { clearcoat: 0.4 });
    const leftDoor = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, h * 0.96, 0.04),
      doorMat
    );
    leftDoor.position.set(-w * 0.25, h * 0.5, d * 0.4);
    const rightDoor = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, h * 0.96, 0.04),
      doorMat
    );
    rightDoor.position.set(w * 0.25, h * 0.5, d * 0.4);
    group.add(leftDoor, rightDoor);

    // Dispenser recess
    const dispenser = new THREE.Mesh(
      new THREE.BoxGeometry(doorW * 0.45, 0.26, 0.045),
      makeMat('#0F172A', 0.2, 0.5)
    );
    dispenser.position.set(-w * 0.25, h * 0.62, d * 0.405);
    group.add(dispenser);
  } else if (item.kind === 'dining_table' || item.kind === 'desk') {
    // Solid Teak Dining Table + 4 Upholstered Chairs
    const topH = 0.055;
    const topGeo = new THREE.BoxGeometry(w, topH, d);
    const topMesh = new THREE.Mesh(topGeo, makeMat('#5C3419', 0.42, 0.06, { clearcoat: 0.35 }));
    topMesh.position.y = h - topH / 2;
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    group.add(topMesh);

    const legGeo = new THREE.CylinderGeometry(0.035, 0.022, h - topH, 12);
    const legMat = makeMat('#3B1F0E', 0.45);
    for (const [ox, oz] of [
      [-w * 0.42, -d * 0.42],
      [w * 0.42, -d * 0.42],
      [-w * 0.42, d * 0.42],
      [w * 0.42, d * 0.42],
    ]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(ox, (h - topH) / 2, oz);
      leg.castShadow = true;
      group.add(leg);
    }

    if (item.kind === 'dining_table') {
      // 4 Upholstered Dining Chairs tucked cleanly within table footprint
      const chairPositions = [
        [-w * 0.24, -d * 0.36, 0],
        [w * 0.24, -d * 0.36, 0],
        [-w * 0.24, d * 0.36, Math.PI],
        [w * 0.24, d * 0.36, Math.PI],
      ];
      for (const [cx, cz, rotY] of chairPositions) {
        const chair = new THREE.Group();
        chair.position.set(cx, 0, cz);
        chair.rotation.y = rotY;
        const seat = new THREE.Mesh(
          new THREE.BoxGeometry(0.36, 0.05, 0.34),
          makeMat('#D6CFC7', 0.8)
        );
        seat.position.y = 0.44;
        seat.castShadow = true;
        const back = new THREE.Mesh(
          new THREE.BoxGeometry(0.36, 0.34, 0.045),
          makeMat('#5C3419', 0.5)
        );
        back.position.set(0, 0.62, -0.15);
        chair.add(seat, back);
        group.add(chair);
      }
    }
  }

  return group;
}

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(
  ({ pipelineResult, config, selectedElement, onSelectElement, onChangeMaterialTheme }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const exportableGroupRef = useRef<THREE.Group | null>(null);

    const [cutawayMode, setCutawayMode] = useState<boolean>(true);
    const [webglLost, setWebglLost] = useState<boolean>(false);
    const [isExporting, setIsExporting] = useState<boolean>(false);

    const setCameraView = (preset: 'iso' | 'top' | 'low') => {
      const cam = cameraRef.current;
      const controls = controlsRef.current;
      if (!cam || !controls) return;

      const span = Math.max(
        pipelineResult.model3d.bounding_box_m.width,
        pipelineResult.model3d.bounding_box_m.depth,
        8
      );

      if (preset === 'iso') {
        cam.position.set(span * 0.68, span * 0.76, span * 0.82);
      } else if (preset === 'top') {
        cam.position.set(0, span * 1.28, 0.01);
      } else if (preset === 'low') {
        cam.position.set(span * 0.72, 2.25, span * 0.78);
      }
      controls.target.set(0, 0.5, 0);
      controls.update();
    };

    const handleExportGLB = () => {
      const exportGroup = exportableGroupRef.current;
      if (!exportGroup) return;

      setIsExporting(true);
      const exporter = new GLTFExporter();
      exporter.parse(
        exportGroup,
        (result) => {
          setIsExporting(false);
          if (result instanceof ArrayBuffer) {
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const safeName = pipelineResult.blueprint_name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-');
            a.href = url;
            a.download = `floorforge-${safeName}-3d.glb`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        },
        (error) => {
          console.error('GLTF export error:', error);
          setIsExporting(false);
        },
        { binary: true }
      );
    };

    useImperativeHandle(ref, () => ({
      exportGLB: handleExportGLB,
      resetCamera: () => setCameraView('iso'),
    }));

    // Initialize Photorealistic WebGL Scene + RoomEnvironment Reflections
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0E1218');
      sceneRef.current = scene;

      const width = container.clientWidth || 640;
      const height = container.clientHeight || 480;

      const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 250);
      camera.position.set(9.2, 9.8, 10.6);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;

      // Generate realistic interior reflection environment for mirrors, glass & ceramic tiles
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
      scene.environment = envTexture;
      scene.environmentIntensity = 0.78;

      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setWebglLost(true);
      };
      const handleContextRestored = () => {
        setWebglLost(false);
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.maxPolarAngle = Math.PI / 2 - 0.02;
      controls.minDistance = 2.0;
      controls.maxDistance = 55;
      controls.target.set(0, 0.5, 0);
      controls.update();
      controlsRef.current = controls;

      // Natural Daylight Hemisphere + Warm Golden-Hour Sun Light with Soft Shadows
      const hemiLight = new THREE.HemisphereLight('#FFFBEB', '#334155', 0.85);
      hemiLight.position.set(0, 20, 0);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight('#FFF7ED', 1.85);
      sunLight.position.set(13, 22, 15);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      sunLight.shadow.camera.near = 1;
      sunLight.shadow.camera.far = 65;
      const d = 15;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0004;
      sunLight.shadow.radius = 2.5;
      scene.add(sunLight);

      const bounceLight = new THREE.DirectionalLight('#BAE6FD', 0.45);
      bounceLight.position.set(-14, 12, -12);
      scene.add(bounceLight);

      const gridHelper = new THREE.GridHelper(32, 32, '#1E2533', '#131822');
      gridHelper.position.y = -0.03;
      scene.add(gridHelper);

      const exportGroup = new THREE.Group();
      exportGroup.name = 'FloorForge_3D_Scene';
      scene.add(exportGroup);
      exportableGroupRef.current = exportGroup;

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let downPos = { x: 0, y: 0 };

      const onPointerDown = (ev: MouseEvent) => {
        downPos = { x: ev.clientX, y: ev.clientY };
      };

      const onPointerUp = (ev: MouseEvent) => {
        if (Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y) > 5) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const hits = raycaster.intersectObjects(exportGroup.children, true);
        for (const hit of hits) {
          let curr: THREE.Object3D | null = hit.object;
          while (curr && curr !== exportGroup) {
            if (curr.userData?.elementKind && curr.userData?.elementId) {
              onSelectElement({
                kind: curr.userData.elementKind,
                id: curr.userData.elementId,
              });
              return;
            }
            curr = curr.parent;
          }
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          if (w > 0 && h > 0 && cameraRef.current && rendererRef.current) {
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, h);
          }
        }
      });
      resizeObserver.observe(container);

      let animId = 0;
      const animate = () => {
        animId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      return () => {
        cancelAnimationFrame(animId);
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
        pmremGenerator.dispose();
        envTexture.dispose();
        controls.dispose();
        renderer.dispose();
      };
    }, []);

    // Rebuild Photorealistic 3D Room Architecture & Furniture
    useEffect(() => {
      const exportGroup = exportableGroupRef.current;
      if (!exportGroup) return;

      while (exportGroup.children.length > 0) {
        const child = exportGroup.children[0];
        exportGroup.remove(child);
      }

      const { model3d } = pipelineResult;
      const theme = config.material_theme;

      // 1. Architectural Foundation Plinth with Warm Stone Rim
      const plinthGeo = new THREE.BoxGeometry(
        model3d.bounding_box_m.width + 0.5,
        0.09,
        model3d.bounding_box_m.depth + 0.5
      );
      const plinthMesh = new THREE.Mesh(
        plinthGeo,
        new THREE.MeshStandardMaterial({ color: '#1B2230', roughness: 0.85 })
      );
      plinthMesh.position.set(0, -0.045, 0);
      plinthMesh.receiveShadow = true;
      exportGroup.add(plinthMesh);

      // 2. Room Floor Slabs with Photorealistic Wood, Marble, & Ceramic Tile Textures + Warm Room Lighting
      if (config.include_floor_slabs) {
        for (const slab of model3d.room_slabs) {
          if (slab.points_m.length < 3) continue;
          const shape = new THREE.Shape();
          shape.moveTo(slab.points_m[0].x, slab.points_m[0].y);
          for (let i = 1; i < slab.points_m.length; i++) {
            shape.lineTo(slab.points_m[i].x, slab.points_m[i].y);
          }
          shape.closePath();

          const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.05,
            bevelEnabled: false,
          });
          extrudeGeo.rotateX(Math.PI / 2);

          const isSelected =
            selectedElement?.kind === 'room' && selectedElement.id === slab.id;

          let floorMat: THREE.Material;
          if (isSelected) {
            floorMat = new THREE.MeshStandardMaterial({
              color: '#D97706',
              roughness: 0.45,
            });
          } else if (theme === 'confidence_overlay') {
            floorMat = new THREE.MeshStandardMaterial({
              color:
                slab.confidence_status === 'invalid'
                  ? '#7F1D1D'
                  : slab.confidence_status === 'uncertain'
                  ? '#78350F'
                  : '#064E3B',
              roughness: 0.6,
            });
          } else if (theme === 'provenance_overlay') {
            floorMat = new THREE.MeshStandardMaterial({
              color:
                slab.provenance === 'user_corrected'
                  ? '#581C87'
                  : slab.provenance === 'generated_completion'
                  ? '#78350F'
                  : '#0C4A6E',
              roughness: 0.6,
            });
          } else if (theme === 'blueprint') {
            floorMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.8 });
          } else {
            // Photorealistic Studio Flooring per Room Type
            if (slab.category === 'bedroom' || slab.category === 'office') {
              floorMat = new THREE.MeshPhysicalMaterial({
                map: getProceduralTexture('wood_floor', 0.45, 0.45),
                roughness: 0.34,
                metalness: 0.04,
                clearcoat: 0.25,
              });
            } else if (slab.category === 'bathroom') {
              floorMat = new THREE.MeshPhysicalMaterial({
                map: getProceduralTexture('ceramic_tile', 0.6, 0.6),
                roughness: 0.12,
                metalness: 0.06,
                clearcoat: 0.85,
                reflectivity: 0.9,
              });
            } else if (slab.category === 'kitchen') {
              floorMat = new THREE.MeshPhysicalMaterial({
                map: getProceduralTexture('kitchen_tile', 0.5, 0.5),
                roughness: 0.28,
                metalness: 0.04,
                clearcoat: 0.35,
              });
            } else {
              // Living room & Hallway: Polished Italian/Indian Botticino Marble
              floorMat = new THREE.MeshPhysicalMaterial({
                map: getProceduralTexture('marble_floor', 0.4, 0.4),
                roughness: 0.18,
                metalness: 0.05,
                clearcoat: 0.6,
              });
            }
          }

          const mesh = new THREE.Mesh(extrudeGeo, floorMat);
          mesh.position.y = 0.05;
          mesh.receiveShadow = true;
          mesh.userData = { elementKind: 'room', elementId: slab.id };
          exportGroup.add(mesh);

          // Add warm 2700K architectural interior point light inside each room in Studio mode
          if (theme === 'studio') {
            const roomLight = new THREE.PointLight('#FED7AA', 0.65, 6.5, 1.8);
            roomLight.position.set(slab.centroid_m.x, 2.1, slab.centroid_m.y);
            exportGroup.add(roomLight);
          }
        }
      }

      // 3. Extruded Exterior & Interior Partition Walls with Warm Ivory Paint & Teak Baseboard Skirting
      for (const seg of model3d.wall_segments) {
        const dx = seg.end_m.x - seg.start_m.x;
        const dz = seg.end_m.y - seg.start_m.y;
        const length = Math.hypot(dx, dz);
        if (length < 0.02) continue;

        const effectiveMaxY = cutawayMode
          ? seg.is_exterior
            ? Math.min(config.wall_height_m, 1.15)
            : Math.min(config.wall_height_m, 2.05)
          : config.wall_height_m;

        if (seg.bottom_y_m >= effectiveMaxY) continue;
        const effectiveHeight = Math.min(seg.height_m, effectiveMaxY - seg.bottom_y_m);
        if (effectiveHeight <= 0.02) continue;

        const isSelected =
          selectedElement?.kind === 'wall' && selectedElement.id === seg.parent_wall_id;

        let wallColor = seg.is_exterior ? '#F5F2EB' : '#EBE5DA';
        if (isSelected) {
          wallColor = '#F59E0B';
        } else if (theme === 'confidence_overlay') {
          wallColor = get3DConfidenceColor(seg.confidence_status);
        } else if (theme === 'provenance_overlay') {
          wallColor = get3DProvenanceColor(seg.provenance);
        } else if (theme === 'blueprint') {
          wallColor = '#1E293B';
        }

        const wallMat = new THREE.MeshStandardMaterial({
          color: wallColor,
          roughness: 0.72,
          metalness: 0.03,
          transparent:
            theme === 'blueprint' ||
            (theme === 'provenance_overlay' && seg.provenance === 'generated_completion'),
          opacity:
            theme === 'blueprint'
              ? 0.75
              : theme === 'provenance_overlay' && seg.provenance === 'generated_completion'
              ? 0.68
              : 1.0,
        });

        const boxGeo = new THREE.BoxGeometry(length, effectiveHeight, seg.thickness_m);
        const wallMesh = new THREE.Mesh(boxGeo, wallMat);

        const midX = (seg.start_m.x + seg.end_m.x) / 2;
        const midZ = (seg.start_m.y + seg.end_m.y) / 2;
        const midY = seg.bottom_y_m + effectiveHeight / 2;
        const angle = Math.atan2(dz, dx);

        wallMesh.position.set(midX, midY, midZ);
        wallMesh.rotation.y = -angle;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        wallMesh.userData = { elementKind: 'wall', elementId: seg.parent_wall_id };
        exportGroup.add(wallMesh);

        // Add wooden skirting / baseboard along floor-touching walls for ambient occlusion & architectural realism
        if (seg.bottom_y_m < 0.05 && theme === 'studio') {
          const skirtGeo = new THREE.BoxGeometry(
            length + 0.01,
            0.09,
            seg.thickness_m + 0.022
          );
          const skirtMesh = new THREE.Mesh(
            skirtGeo,
            new THREE.MeshStandardMaterial({ color: '#5C3419', roughness: 0.5 })
          );
          skirtMesh.position.set(midX, 0.095, midZ);
          skirtMesh.rotation.y = -angle;
          exportGroup.add(skirtMesh);
        }
      }

      // 4. Closed Teak Doors & Windows with Flowing Fabric Curtains
      if (config.include_openings_3d) {
        const frameMat = new THREE.MeshStandardMaterial({ color: '#3B1F0E', roughness: 0.45 });
        const handleMat = new THREE.MeshStandardMaterial({
          color: '#F59E0B',
          roughness: 0.2,
          metalness: 0.9,
        });

        for (const op of model3d.openings) {
          const maxOpH = cutawayMode ? Math.min(op.height_m, 1.65) : op.height_m;
          if (maxOpH <= 0.2) continue;

          const isSelected =
            selectedElement?.kind === 'opening' && selectedElement.id === op.id;

          const group = new THREE.Group();
          group.position.set(op.center_m.x, op.sill_y_m + maxOpH / 2, op.center_m.y);
          group.rotation.y = -op.angle_rad;
          group.userData = { elementKind: 'opening', elementId: op.id };

          if (op.kind === 'window') {
            const winColor = isSelected
              ? '#F59E0B'
              : theme === 'confidence_overlay'
              ? get3DConfidenceColor(op.confidence_status)
              : theme === 'provenance_overlay'
              ? get3DProvenanceColor(op.provenance)
              : '#BAE6FD';

            const glassMat = new THREE.MeshPhysicalMaterial({
              color: winColor,
              transparent: true,
              opacity: isSelected ? 0.75 : 0.38,
              roughness: 0.05,
              transmission: 0.65,
              reflectivity: 0.9,
            });
            const glassMesh = new THREE.Mesh(
              new THREE.BoxGeometry(op.width_m, maxOpH, 0.03),
              glassMat
            );
            group.add(glassMesh);

            // Window Perimeter Frame & Mullion
            const mullion = new THREE.Mesh(
              new THREE.BoxGeometry(0.035, maxOpH, op.thickness_m * 0.95),
              frameMat
            );
            group.add(mullion);

            // Flowing Pleated Curtains & Brass Curtain Rod (Studio mode)
            if (theme === 'studio') {
              const rod = new THREE.Mesh(
                new THREE.CylinderGeometry(0.012, 0.012, op.width_m * 1.26, 12),
                handleMat
              );
              rod.rotation.z = Math.PI / 2;
              rod.position.set(0, maxOpH / 2 + 0.06, op.thickness_m * 0.55);
              group.add(rod);

              const drapeH = maxOpH + op.sill_y_m * 0.75;
              const drapeMat = new THREE.MeshStandardMaterial({
                color: '#C27D56',
                roughness: 0.88,
              });
              const sheerMat = new THREE.MeshPhysicalMaterial({
                color: '#FAF8F5',
                transparent: true,
                opacity: 0.55,
                roughness: 0.85,
              });

              // Left & Right Pleated Outer Drapes
              for (const side of [-1, 1]) {
                for (let p = 0; p < 3; p++) {
                  const pleat = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.045, 0.055, drapeH, 12),
                    drapeMat
                  );
                  pleat.position.set(
                    side * (op.width_m * 0.44 + p * 0.065),
                    -op.sill_y_m * 0.35,
                    op.thickness_m * 0.55
                  );
                  pleat.castShadow = true;
                  group.add(pleat);
                }

                // Soft sheer inner curtain panel
                const sheer = new THREE.Mesh(
                  new THREE.BoxGeometry(op.width_m * 0.24, drapeH * 0.96, 0.018),
                  sheerMat
                );
                sheer.position.set(
                  side * op.width_m * 0.28,
                  -op.sill_y_m * 0.35,
                  op.thickness_m * 0.48
                );
                group.add(sheer);
              }
            }
          } else {
            // CLOSED FLUSH TEAK DOOR (rotation.y = 0, never open)
            const doorColor = isSelected
              ? '#F59E0B'
              : theme === 'confidence_overlay'
              ? get3DConfidenceColor(op.confidence_status)
              : theme === 'provenance_overlay'
              ? get3DProvenanceColor(op.provenance)
              : '#6E3F1D';

            const doorMat = new THREE.MeshPhysicalMaterial({
              color: doorColor,
              roughness: 0.42,
              clearcoat: 0.25,
            });

            const leafWidth = Math.max(0.4, op.width_m - 0.08);
            const leafMesh = new THREE.Mesh(
              new THREE.BoxGeometry(leafWidth, maxOpH, 0.055),
              doorMat
            );
            leafMesh.position.set(0, 0, 0);
            leafMesh.castShadow = true;
            leafMesh.receiveShadow = true;
            group.add(leafMesh);

            // Molded recessed door panels
            const upperPanel = new THREE.Mesh(
              new THREE.BoxGeometry(leafWidth * 0.72, maxOpH * 0.38, 0.064),
              new THREE.MeshStandardMaterial({ color: '#5C3419', roughness: 0.48 })
            );
            upperPanel.position.set(0, maxOpH * 0.2, 0);
            const lowerPanel = new THREE.Mesh(
              new THREE.BoxGeometry(leafWidth * 0.72, maxOpH * 0.34, 0.064),
              new THREE.MeshStandardMaterial({ color: '#5C3419', roughness: 0.48 })
            );
            lowerPanel.position.set(0, -maxOpH * 0.22, 0);
            group.add(upperPanel, lowerPanel);

            // Brass lever handle on both sides of the closed door
            const handleGeo = new THREE.BoxGeometry(0.12, 0.026, 0.1);
            const handleMesh = new THREE.Mesh(handleGeo, handleMat);
            handleMesh.position.set(leafWidth * 0.34, -maxOpH * 0.04, 0);
            group.add(handleMesh);

            // Left & Right Door Jambs
            const leftJamb = new THREE.Mesh(
              new THREE.BoxGeometry(0.045, maxOpH, op.thickness_m * 1.08),
              frameMat
            );
            leftJamb.position.x = -op.width_m / 2 + 0.022;
            const rightJamb = new THREE.Mesh(
              new THREE.BoxGeometry(0.045, maxOpH, op.thickness_m * 1.08),
              frameMat
            );
            rightJamb.position.x = op.width_m / 2 - 0.022;
            group.add(leftJamb, rightJamb);
          }

          exportGroup.add(group);
        }
      }

      // 5. Photorealistic 3D Furniture & Bathroom/Kitchen Fixtures
      for (const item of model3d.furniture) {
        const isSelected =
          selectedElement?.kind === 'furniture' && selectedElement.id === item.id;
        const furnObj = buildFurniture3DObject(item, theme, isSelected);
        exportGroup.add(furnObj);
      }
    }, [pipelineResult, config, selectedElement, cutawayMode]);

    const { bounding_box_m, total_floor_area_m2, provenance_report } = pipelineResult.model3d;

    return (
      <div className="relative flex flex-col h-full w-full bg-[#0B0D11] select-none overflow-hidden">
        {/* Clean 3D Sub-Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#12161F] border-b border-[#222938]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#F1F5F9]">3D Interior Render</span>
            <span className="text-xs text-[#64748B]" aria-hidden="true">·</span>
            <span className="text-xs font-mono text-[#94A3B8] tabular-nums">
              {bounding_box_m.width.toFixed(1)}m × {bounding_box_m.depth.toFixed(1)}m ({total_floor_area_m2.toFixed(1)} m²)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* 3D Material / Confidence / Provenance Switcher */}
            <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-md border border-[#222938]">
              <button
                type="button"
                onClick={() => onChangeMaterialTheme('studio')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  config.material_theme === 'studio'
                    ? 'bg-[#D97706] text-[#F8FAFC] font-semibold'
                    : 'text-[#64748B] hover:text-[#94A3B8]'
                }`}
              >
                Photoreal Interior
              </button>
              <button
                type="button"
                onClick={() => onChangeMaterialTheme('confidence_overlay')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 whitespace-nowrap ${
                  config.material_theme === 'confidence_overlay'
                    ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                    : 'text-[#64748B] hover:text-[#94A3B8]'
                }`}
                title="3D AI Confidence Overlay: High (Green), Uncertain (Amber), Invalid (Red)"
              >
                <ShieldAlert className="w-3 h-3" />
                <span>3D Confidence</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeMaterialTheme('provenance_overlay')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 whitespace-nowrap ${
                  config.material_theme === 'provenance_overlay'
                    ? 'bg-[#A855F7]/20 text-[#C084FC] border border-[#A855F7]/40'
                    : 'text-[#64748B] hover:text-[#94A3B8]'
                }`}
                title="3D Provenance: AI-Detected (Cyan), User-Corrected (Violet), Inferred (Amber)"
              >
                <GitBranch className="w-3 h-3" />
                <span>3D Provenance</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCutawayMode((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap flex items-center gap-1 ${
                cutawayMode
                  ? 'bg-[#D97706]/20 border-[#D97706] text-[#F59E0B]'
                  : 'bg-[#0B0D11] border-[#222938] text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
              title="Toggle Dollhouse Cutaway to inspect interior bedrooms, bathrooms, curtains, and lighting"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{cutawayMode ? 'Cutaway' : 'Full Walls'}</span>
            </button>
          </div>
        </div>

        {/* WebGL Canvas */}
        <div className="relative flex-1 w-full h-full overflow-hidden">
          <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          {webglLost && (
            <div className="absolute inset-0 bg-[#0B0D11]/95 flex flex-col items-center justify-center gap-2 p-6 text-center z-20">
              <p className="text-sm font-semibold text-[#F1F5F9]">WebGL Context Paused</p>
            </div>
          )}

          {/* Floating Legend when 3D Confidence or Provenance theme is active */}
          {config.material_theme === 'confidence_overlay' && (
            <div className="absolute top-3 right-4 z-10 px-3 py-2 rounded-md bg-[#0B0D11]/90 backdrop-blur-md border border-[#222938] text-xs space-y-1 pointer-events-none">
              <div className="font-semibold text-[#F8FAFC]">3D AI Confidence Overlay</div>
              <div className="flex items-center gap-3 text-[#94A3B8]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#10B981] inline-block" />
                  <span>High ({provenance_report.high_confidence_count})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] inline-block" />
                  <span>Uncertain ({provenance_report.uncertain_count})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#EF4444] inline-block" />
                  <span>Invalid ({provenance_report.invalid_count})</span>
                </span>
              </div>
            </div>
          )}

          {config.material_theme === 'provenance_overlay' && (
            <div className="absolute top-3 right-4 z-10 px-3 py-2 rounded-md bg-[#0B0D11]/90 backdrop-blur-md border border-[#222938] text-xs space-y-1 pointer-events-none">
              <div className="font-semibold text-[#F8FAFC]">3D Reconstruction Provenance</div>
              <div className="flex items-center gap-3 text-[#94A3B8]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#38BDF8] inline-block" />
                  <span>AI-Detected ({provenance_report.ai_detected_count})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#A855F7] inline-block" />
                  <span>User-Corrected ({provenance_report.user_corrected_count})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] inline-block" />
                  <span>Inferred ({provenance_report.inferred_completion_count})</span>
                </span>
              </div>
            </div>
          )}

          {/* Bottom Camera & Export Controls */}
          <div className="absolute bottom-3 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-[#0B0D11]/90 backdrop-blur-md border border-[#222938] text-xs pointer-events-auto">
            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#38BDF8] mr-1" />
              <button
                type="button"
                onClick={() => setCameraView('iso')}
                className="px-2 py-1 rounded bg-[#181D29] hover:bg-[#222938] text-[#F1F5F9] transition-colors whitespace-nowrap"
              >
                Isometric
              </button>
              <button
                type="button"
                onClick={() => setCameraView('top')}
                className="px-2 py-1 rounded bg-[#181D29] hover:bg-[#222938] text-[#F1F5F9] transition-colors whitespace-nowrap"
              >
                Top Plan
              </button>
              <button
                type="button"
                onClick={() => setCameraView('low')}
                className="px-2 py-1 rounded bg-[#181D29] hover:bg-[#222938] text-[#F1F5F9] transition-colors whitespace-nowrap"
              >
                Interior Walkthrough
              </button>
              <button
                type="button"
                onClick={() => setCameraView('iso')}
                className="p-1 rounded bg-[#181D29] hover:bg-[#222938] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
                title="Reset Camera"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportGLB}
              disabled={isExporting}
              className="px-3 py-1 bg-[#D97706] hover:bg-[#F59E0B] text-[#F8FAFC] font-semibold rounded transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Exporting...' : 'Download .GLB'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
);
