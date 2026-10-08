import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  FloorPlanPipelineResult,
  FurnitureMesh3D,
  PipelineConfig,
} from '../types/floorforge';
import { RotateCcw, Layers, Compass, Download, ShieldCheck } from 'lucide-react';

export interface Viewport3DHandle {
  exportGLB: () => void;
  resetCamera: () => void;
}

interface Viewport3DProps {
  pipelineResult: FloorPlanPipelineResult;
  config: PipelineConfig;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onChangeMaterialTheme: (theme: PipelineConfig['material_theme']) => void;
}

/**
 * Builds detailed multi-part 3D architectural meshes for beds, bathtubs, toilets,
 * vanity sinks, sofas, kitchen counters, dining tables, wardrobes, and desks.
 */
function buildFurniture3DObject(
  item: FurnitureMesh3D,
  epistemicMode: boolean
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(item.center_m.x, 0.05, item.center_m.y);
  group.rotation.y = -item.rotation_rad;
  group.name = `Furniture_${item.kind}_${item.id}`;

  const w = item.width_m;
  const d = item.depth_m;
  const h = item.height_m;

  const isGenerated = item.provenance === 'generated_completion';

  const makeMat = (hex: string, roughness = 0.6, metalness = 0.08) => {
    if (epistemicMode) {
      return new THREE.MeshStandardMaterial({
        color: isGenerated ? '#F59E0B' : '#10B981',
        roughness: 0.4,
        metalness: 0.15,
        transparent: isGenerated,
        opacity: isGenerated ? 0.72 : 0.95,
      });
    }
    return new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
  };

  if (item.kind === 'bed') {
    // 1. Wooden platform frame
    const frameGeo = new THREE.BoxGeometry(w, 0.22, d);
    const frameMesh = new THREE.Mesh(frameGeo, makeMat('#78350F', 0.7));
    frameMesh.position.y = 0.11;
    frameMesh.castShadow = true;
    group.add(frameMesh);

    // 2. Plush white mattress
    const matGeo = new THREE.BoxGeometry(w * 0.94, 0.24, d * 0.92);
    const matMesh = new THREE.Mesh(matGeo, makeMat('#F8FAFC', 0.85));
    matMesh.position.y = 0.34;
    matMesh.castShadow = true;
    group.add(matMesh);

    // 3. Blanket / duvet cover on lower 65% of bed
    const duvetGeo = new THREE.BoxGeometry(w * 0.95, 0.25, d * 0.6);
    const duvetMesh = new THREE.Mesh(duvetGeo, makeMat('#3B82F6', 0.8));
    duvetMesh.position.set(0, 0.35, d * 0.15);
    group.add(duvetMesh);

    // 4. Two pillows near headboard
    const pillowGeo = new THREE.BoxGeometry(w * 0.36, 0.1, d * 0.18);
    const p1 = new THREE.Mesh(pillowGeo, makeMat('#FFFFFF', 0.8));
    p1.position.set(-w * 0.22, 0.5, -d * 0.32);
    const p2 = new THREE.Mesh(pillowGeo, makeMat('#FFFFFF', 0.8));
    p2.position.set(w * 0.22, 0.5, -d * 0.32);
    group.add(p1, p2);

    // 5. Headboard
    const hbGeo = new THREE.BoxGeometry(w, 0.95, 0.1);
    const hbMesh = new THREE.Mesh(hbGeo, makeMat('#451A03', 0.65));
    hbMesh.position.set(0, 0.475, -d / 2 + 0.05);
    hbMesh.castShadow = true;
    group.add(hbMesh);
  } else if (item.kind === 'bathtub') {
    // Outer porcelain tub shell
    const tubGeo = new THREE.BoxGeometry(w, 0.58, d);
    const tubMesh = new THREE.Mesh(tubGeo, makeMat('#F8FAFC', 0.2, 0.1));
    tubMesh.position.y = 0.29;
    tubMesh.castShadow = true;
    group.add(tubMesh);

    // Inner aqua water surface
    const waterGeo = new THREE.BoxGeometry(w * 0.84, 0.04, d * 0.78);
    const waterMesh = new THREE.Mesh(waterGeo, makeMat('#38BDF8', 0.15, 0.2));
    waterMesh.position.y = 0.57;
    group.add(waterMesh);
  } else if (item.kind === 'toilet') {
    // Bowl
    const bowlGeo = new THREE.CylinderGeometry(w * 0.42, w * 0.34, 0.42, 16);
    const bowlMesh = new THREE.Mesh(bowlGeo, makeMat('#F8FAFC', 0.2));
    bowlMesh.position.set(0, 0.21, d * 0.12);
    bowlMesh.castShadow = true;
    group.add(bowlMesh);

    // Cistern tank
    const tankGeo = new THREE.BoxGeometry(w * 0.9, 0.44, d * 0.34);
    const tankMesh = new THREE.Mesh(tankGeo, makeMat('#F1F5F9', 0.2));
    tankMesh.position.set(0, 0.56, -d * 0.3);
    tankMesh.castShadow = true;
    group.add(tankMesh);
  } else if (item.kind === 'sink_vanity') {
    // Vanity cabinet
    const cabGeo = new THREE.BoxGeometry(w, 0.82, d);
    const cabMesh = new THREE.Mesh(cabGeo, makeMat('#475569', 0.6));
    cabMesh.position.y = 0.41;
    cabMesh.castShadow = true;
    group.add(cabMesh);

    // White porcelain countertop
    const topGeo = new THREE.BoxGeometry(w * 1.02, 0.06, d * 1.02);
    const topMesh = new THREE.Mesh(topGeo, makeMat('#F8FAFC', 0.25));
    topMesh.position.y = 0.85;
    group.add(topMesh);

    // Basin
    const basinGeo = new THREE.CylinderGeometry(Math.min(w, d) * 0.3, Math.min(w, d) * 0.25, 0.08, 16);
    const basinMesh = new THREE.Mesh(basinGeo, makeMat('#38BDF8', 0.2));
    basinMesh.position.y = 0.86;
    group.add(basinMesh);
  } else if (item.kind === 'sofa') {
    // Seat base
    const seatGeo = new THREE.BoxGeometry(w, 0.4, d);
    const seatMesh = new THREE.Mesh(seatGeo, makeMat('#475569', 0.85));
    seatMesh.position.y = 0.2;
    seatMesh.castShadow = true;
    group.add(seatMesh);

    // Backrest
    const backGeo = new THREE.BoxGeometry(w, 0.42, d * 0.24);
    const backMesh = new THREE.Mesh(backGeo, makeMat('#334155', 0.85));
    backMesh.position.set(0, 0.61, -d / 2 + d * 0.12);
    backMesh.castShadow = true;
    group.add(backMesh);

    // Left & right armrests
    const armGeo = new THREE.BoxGeometry(w * 0.1, 0.26, d);
    const leftArm = new THREE.Mesh(armGeo, makeMat('#334155', 0.85));
    leftArm.position.set(-w / 2 + w * 0.05, 0.52, 0);
    const rightArm = new THREE.Mesh(armGeo, makeMat('#334155', 0.85));
    rightArm.position.set(w / 2 - w * 0.05, 0.52, 0);
    group.add(leftArm, rightArm);
  } else if (item.kind === 'kitchen_counter') {
    // Base cabinetry
    const baseGeo = new THREE.BoxGeometry(w, 0.85, d);
    const baseMesh = new THREE.Mesh(baseGeo, makeMat('#334155', 0.65));
    baseMesh.position.y = 0.425;
    baseMesh.castShadow = true;
    group.add(baseMesh);

    // Quartz countertop
    const topGeo = new THREE.BoxGeometry(w * 1.02, 0.05, d * 1.04);
    const topMesh = new THREE.Mesh(topGeo, makeMat('#E2E8F0', 0.3));
    topMesh.position.y = 0.875;
    group.add(topMesh);

    // Black glass induction cooktop
    const hobGeo = new THREE.BoxGeometry(w * 0.32, 0.02, d * 0.68);
    const hobMesh = new THREE.Mesh(hobGeo, makeMat('#0F172A', 0.15, 0.4));
    hobMesh.position.set(-w * 0.22, 0.905, 0);
    group.add(hobMesh);

    // Stainless kitchen sink
    const sinkGeo = new THREE.BoxGeometry(w * 0.28, 0.02, d * 0.65);
    const sinkMesh = new THREE.Mesh(sinkGeo, makeMat('#94A3B8', 0.25, 0.7));
    sinkMesh.position.set(w * 0.22, 0.905, 0);
    group.add(sinkMesh);
  } else if (item.kind === 'dining_table' || item.kind === 'coffee_table' || item.kind === 'desk') {
    const topY = item.kind === 'coffee_table' ? 0.42 : 0.75;
    const topGeo = new THREE.BoxGeometry(w, 0.06, d);
    const topMesh = new THREE.Mesh(topGeo, makeMat('#92400E', 0.55));
    topMesh.position.y = topY;
    topMesh.castShadow = true;
    group.add(topMesh);

    const legGeo = new THREE.CylinderGeometry(0.035, 0.03, topY, 8);
    const legMat = makeMat('#1E293B', 0.5, 0.4);
    const offsets = [
      [-w * 0.42, -d * 0.4],
      [w * 0.42, -d * 0.4],
      [-w * 0.42, d * 0.4],
      [w * 0.42, d * 0.4],
    ];
    for (const [lx, lz] of offsets) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, topY / 2, lz);
      group.add(leg);
    }
  } else {
    // Wardrobe, Fridge, Nightstand, TV Stand
    const boxGeo = new THREE.BoxGeometry(w, h, d);
    const color =
      item.kind === 'fridge'
        ? '#CBD5E1'
        : item.kind === 'wardrobe'
        ? '#78350F'
        : '#475569';
    const mesh = new THREE.Mesh(boxGeo, makeMat(color, 0.55));
    mesh.position.y = h / 2;
    mesh.castShadow = true;
    group.add(mesh);
  }

  return group;
}

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(
  ({ pipelineResult, config, selectedRoomId, onSelectRoom, onChangeMaterialTheme }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const exportGroupRef = useRef<THREE.Group | null>(null);
    const roomMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());

    // Default cutawayMode to TRUE so exterior walls don't hide interior bedrooms, bathrooms, and furniture!
    const [cutawayMode, setCutawayMode] = useState(true);
    const [webglLost, setWebglLost] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const setCameraView = (preset: 'iso' | 'top' | 'low') => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const span = Math.max(
        pipelineResult.model3d.bounding_box_m.width,
        pipelineResult.model3d.bounding_box_m.depth,
        10
      );

      if (preset === 'iso') {
        camera.position.set(span * 0.78, span * 0.85, span * 0.88);
      } else if (preset === 'top') {
        camera.position.set(0, span * 1.3, 0.01);
      } else {
        camera.position.set(span * 0.88, span * 0.35, span * 0.88);
      }
      controls.target.set(0, 0.9, 0);
      controls.update();
    };

    const handleExportGLB = () => {
      const exportGroup = exportGroupRef.current;
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
            const slug = pipelineResult.blueprint_name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, '');
            a.href = url;
            a.download = `floorforge-${slug || 'model'}-hnx26eps06.glb`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        },
        (error) => {
          console.error('GLTFExporter error:', error);
          setIsExporting(false);
        },
        { binary: true }
      );
    };

    useImperativeHandle(ref, () => ({
      exportGLB: handleExportGLB,
      resetCamera: () => setCameraView('iso'),
    }));

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0B0D11');
      scene.fog = new THREE.FogExp2('#0B0D11', 0.015);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 250);
      camera.position.set(10, 10.5, 11);
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
      renderer.toneMappingExposure = 1.1;
      rendererRef.current = renderer;

      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setWebglLost(true);
      };
      const handleContextRestored = () => setWebglLost(false);
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.minDistance = 3;
      controls.maxDistance = 45;
      controls.target.set(0, 0.9, 0);
      controls.update();
      controlsRef.current = controls;

      const hemiLight = new THREE.HemisphereLight('#F1F5F9', '#1E293B', 0.95);
      hemiLight.position.set(0, 25, 0);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight('#FFFBEB', 1.6);
      keyLight.position.set(14, 24, 16);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      const d = 14;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight('#38BDF8', 0.5);
      rimLight.position.set(-16, 12, -14);
      scene.add(rimLight);

      const gridHelper = new THREE.GridHelper(32, 32, '#222938', '#151922');
      gridHelper.position.y = -0.02;
      scene.add(gridHelper);

      const exportGroup = new THREE.Group();
      exportGroup.name = 'FloorForge_3D_Scene';
      scene.add(exportGroup);
      exportGroupRef.current = exportGroup;

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let downPos = { x: 0, y: 0 };

      const onPointerDown = (ev: PointerEvent) => {
        downPos = { x: ev.clientX, y: ev.clientY };
      };

      const onPointerUp = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y) > 5) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        const meshes = Array.from(roomMeshesRef.current.values());
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length > 0 && hits[0].object.userData.roomId) {
          onSelectRoom(hits[0].object.userData.roomId);
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: cw, height: ch } = entry.contentRect;
          if (cw > 0 && ch > 0) {
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
            renderer.setSize(cw, ch);
          }
        }
      });
      resizeObserver.observe(container);

      let frameId = 0;
      const animate = () => {
        frameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      return () => {
        cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
        renderer.dispose();
      };
    }, []);

    useEffect(() => {
      const exportGroup = exportGroupRef.current;
      if (!exportGroup) return;

      while (exportGroup.children.length > 0) {
        exportGroup.remove(exportGroup.children[0]);
      }
      roomMeshesRef.current.clear();

      const { model3d } = pipelineResult;
      const theme = config.material_theme;
      const isEpistemic = theme === 'epistemic_confidence';

      // 1. Base Plinth
      const plinthGeo = new THREE.BoxGeometry(
        model3d.bounding_box_m.width + 0.6,
        0.08,
        model3d.bounding_box_m.depth + 0.6
      );
      const plinthMesh = new THREE.Mesh(
        plinthGeo,
        new THREE.MeshStandardMaterial({ color: '#161B26', roughness: 0.9 })
      );
      plinthMesh.position.set(0, -0.04, 0);
      plinthMesh.receiveShadow = true;
      exportGroup.add(plinthMesh);

      // 2. Room Floor Slabs (Distinct architectural materials per room type)
      if (config.include_floor_slabs) {
        const roomColorsStudio: Record<string, string> = {
          living: '#8C6239', // Warm oak parquet
          bedroom: '#754C29', // Walnut timber floor
          kitchen: '#475569', // Slate porcelain tile
          bathroom: '#1E3A4C', // Spa ceramic mosaic tile
          hallway: '#7E5734',
          office: '#6B4628',
          utility: '#334155',
          balcony: '#3F4E4F',
        };

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

          const isSelected = selectedRoomId === slab.id;
          const isGen = slab.provenance === 'generated_completion';
          const color = isSelected
            ? '#D97706'
            : isEpistemic
            ? isGen
              ? '#78350F'
              : '#064E3B'
            : theme === 'blueprint'
            ? '#0F172A'
            : roomColorsStudio[slab.category] || '#475569';

          const mesh = new THREE.Mesh(
            extrudeGeo,
            new THREE.MeshStandardMaterial({
              color,
              roughness: slab.category === 'bathroom' ? 0.35 : 0.65,
              metalness: 0.08,
            })
          );
          mesh.position.y = 0.05;
          mesh.receiveShadow = true;
          mesh.userData = { roomId: slab.id };
          exportGroup.add(mesh);
          roomMeshesRef.current.set(slab.id, mesh);
        }
      }

      // 3. Extruded Exterior & Interior Partition Walls
      for (const seg of model3d.wall_segments) {
        const dx = seg.end_m.x - seg.start_m.x;
        const dz = seg.end_m.y - seg.start_m.y;
        const length = Math.hypot(dx, dz);
        if (length < 0.02) continue;

        // In Cutaway Dollhouse Mode: exterior walls drop to 0.95m waist height while interior room walls stay higher (1.95m) so every room & object is clearly visible!
        const effectiveMaxY = cutawayMode
          ? seg.is_exterior
            ? Math.min(config.wall_height_m, 0.95)
            : Math.min(config.wall_height_m, 1.95)
          : config.wall_height_m;

        if (seg.bottom_y_m >= effectiveMaxY) continue;
        const effectiveHeight = Math.min(seg.height_m, effectiveMaxY - seg.bottom_y_m);
        if (effectiveHeight <= 0.02) continue;

        const isGen = seg.provenance === 'generated_completion';
        const wallColor = isEpistemic
          ? isGen
            ? '#F59E0B'
            : '#10B981'
          : theme === 'blueprint'
          ? '#1E293B'
          : seg.is_exterior
          ? '#F1F5F9'
          : '#CBD5E1';

        const wallMat = new THREE.MeshStandardMaterial({
          color: wallColor,
          roughness: 0.72,
          metalness: 0.05,
          transparent: theme === 'blueprint' || (isEpistemic && isGen),
          opacity: theme === 'blueprint' ? 0.75 : isEpistemic && isGen ? 0.68 : 1.0,
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
        exportGroup.add(wallMesh);

        const edgesGeo = new THREE.EdgesGeometry(boxGeo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: isEpistemic
            ? isGen
              ? '#FDE68A'
              : '#6EE7B7'
            : theme === 'blueprint'
            ? '#38BDF8'
            : '#475569',
          transparent: true,
          opacity: 0.45,
        });
        wallMesh.add(new THREE.LineSegments(edgesGeo, edgeMat));
      }

      // 4. Doors & Windows
      if (config.include_openings_3d) {
        const frameMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.4 });
        const doorMat = new THREE.MeshStandardMaterial({
          color: isEpistemic ? '#10B981' : '#B45309',
          roughness: 0.5,
        });
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: '#38BDF8',
          transparent: true,
          opacity: 0.38,
          roughness: 0.1,
        });

        for (const op of model3d.openings) {
          const maxOpH = cutawayMode ? Math.min(op.height_m, 1.5) : op.height_m;
          if (maxOpH <= 0.2) continue;

          const group = new THREE.Group();
          group.position.set(op.center_m.x, op.sill_y_m + maxOpH / 2, op.center_m.y);
          group.rotation.y = -op.angle_rad;

          if (op.kind === 'window') {
            const glassMesh = new THREE.Mesh(
              new THREE.BoxGeometry(op.width_m, maxOpH, 0.03),
              glassMat
            );
            group.add(glassMesh);
          } else {
            const leafWidth = Math.max(0.4, op.width_m - 0.06);
            const pivot = new THREE.Group();
            pivot.position.set(-op.width_m / 2 + 0.03, 0, 0);
            pivot.rotation.y = 0.48;
            const leafMesh = new THREE.Mesh(
              new THREE.BoxGeometry(leafWidth, maxOpH, 0.045),
              doorMat
            );
            leafMesh.position.x = leafWidth / 2;
            leafMesh.castShadow = true;
            pivot.add(leafMesh);
            group.add(pivot);

            const jamb = new THREE.Mesh(
              new THREE.BoxGeometry(0.05, maxOpH, op.thickness_m * 1.06),
              frameMat
            );
            jamb.position.x = -op.width_m / 2 + 0.025;
            group.add(jamb);
          }
          exportGroup.add(group);
        }
      }

      // 5. 3D Furniture & Bathroom/Kitchen Fixtures (Beds, Bathtubs, Toilets, Sinks, Sofas, Kitchens, Desks)
      for (const item of model3d.furniture) {
        const furnObj = buildFurniture3DObject(item, isEpistemic);
        exportGroup.add(furnObj);
      }

      // 6. PS06 Mode B Novelty: Render Walkthrough Video Camera Frustum Cone when in Mode B Fusion!
      if (config.input_mode === 'mode_b_video_fusion') {
        const camGroup = new THREE.Group();
        camGroup.position.set(-2.2, 1.4, -0.5);
        const coneGeo = new THREE.ConeGeometry(2.6, 5.2, 4, 1, true);
        coneGeo.rotateX(Math.PI / 2);
        coneGeo.rotateZ(Math.PI / 4);
        const coneMat = new THREE.MeshBasicMaterial({
          color: '#38BDF8',
          wireframe: true,
          transparent: true,
          opacity: 0.65,
        });
        const coneMesh = new THREE.Mesh(coneGeo, coneMat);
        coneMesh.position.z = 2.6;
        camGroup.rotation.y = -0.65;
        camGroup.add(coneMesh);
        exportGroup.add(camGroup);
      }
    }, [pipelineResult, config, selectedRoomId, cutawayMode]);

    const { bounding_box_m, total_floor_area_m2, epistemic_stats } = pipelineResult.model3d;
    const selectedRoom = pipelineResult.rooms.find((r) => r.id === selectedRoomId);

    return (
      <div className="relative flex flex-col h-full w-full bg-[#0B0D11] select-none overflow-hidden">
        {/* Clean 3D Sub-Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#12161F] border-b border-[#222938]">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold text-[#F1F5F9]">3D Furnished Scene</span>
            <span className="text-xs text-[#64748B]" aria-hidden="true">·</span>
            <span className="text-xs font-mono text-[#94A3B8] tabular-nums">
              {bounding_box_m.width.toFixed(1)}m × {bounding_box_m.depth.toFixed(1)}m ({total_floor_area_m2.toFixed(1)} m²)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Material & PS06 Epistemic Provenance Switcher */}
            <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-md border border-[#222938]">
              <button
                type="button"
                onClick={() => onChangeMaterialTheme('studio')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  config.material_theme === 'studio'
                    ? 'bg-[#181D29] text-[#F1F5F9]'
                    : 'text-[#64748B] hover:text-[#94A3B8]'
                }`}
              >
                Studio Materials
              </button>
              <button
                type="button"
                onClick={() => onChangeMaterialTheme('epistemic_confidence')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 whitespace-nowrap ${
                  config.material_theme === 'epistemic_confidence'
                    ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                    : 'text-[#64748B] hover:text-[#94A3B8]'
                }`}
                title="PS06 Novelty: Color-code Observed (Emerald) vs AI-Completed (Amber) geometry"
              >
                <ShieldCheck className="w-3 h-3" />
                <span>PS06 Provenance Map</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeMaterialTheme('blueprint')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  config.material_theme === 'blueprint'
                    ? 'bg-[#181D29] text-[#F1F5F9]'
                    : 'text-[#64748B] hover:text-[#94A3B8]'
                }`}
              >
                CAD Wire
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
              title="Toggle Dollhouse Cutaway to see inside bedrooms, bathrooms, and furniture"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{cutawayMode ? 'Dollhouse Cutaway' : 'Full Height Walls'}</span>
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

          {/* PS06 Epistemic Provenance Floating Legend when active */}
          {config.material_theme === 'epistemic_confidence' && (
            <div className="absolute top-3 right-4 z-10 px-3 py-2 rounded-md bg-[#0B0D11]/90 backdrop-blur-md border border-[#222938] text-xs space-y-1 pointer-events-none">
              <div className="font-semibold text-[#F8FAFC]">
                PS06 Epistemic Honesty Overlay ({epistemic_stats.observed_ratio_pct}% Observed)
              </div>
              <div className="flex items-center gap-3 text-[#94A3B8]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#10B981] inline-block" />
                  <span>Observed ({epistemic_stats.observed_count})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] inline-block" />
                  <span>AI Completed ({epistemic_stats.completed_count})</span>
                </span>
              </div>
            </div>
          )}

          {selectedRoom && (
            <div className="absolute top-3 left-4 z-10 px-3.5 py-2.5 rounded-md bg-[#0B0D11]/90 backdrop-blur-md border border-[#D97706]/50 text-xs max-w-xs pointer-events-auto">
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold text-[#F8FAFC]">{selectedRoom.name}</span>
                <button
                  type="button"
                  onClick={() => onSelectRoom(null)}
                  className="text-[#94A3B8] hover:text-[#F8FAFC] text-[11px]"
                >
                  Clear
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 font-mono text-[#94A3B8] tabular-nums">
                <span className="text-[#F59E0B] font-semibold">{selectedRoom.area_m2.toFixed(2)} m²</span>
                <span>·</span>
                <span>
                  {selectedRoom.width_m.toFixed(2)}m × {selectedRoom.length_m.toFixed(2)}m
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
                Interior View
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
