import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  FloorPlanPipelineResult,
  PipelineConfig,
} from '../types/floorforge';
import { RotateCcw, Box, Layers, Compass, Download } from 'lucide-react';

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

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(
  ({ pipelineResult, config, selectedRoomId, onSelectRoom, onChangeMaterialTheme }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const exportGroupRef = useRef<THREE.Group | null>(null);
    const roomMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());

    const [cutawayMode, setCutawayMode] = useState(false);
    const [showWireframeEdges, setShowWireframeEdges] = useState(true);
    const [webglLost, setWebglLost] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Camera preset helper
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
        camera.position.set(span * 0.85, span * 0.78, span * 0.95);
      } else if (preset === 'top') {
        camera.position.set(0, span * 1.35, 0.01);
      } else {
        camera.position.set(span * 0.95, span * 0.32, span * 0.95);
      }
      controls.target.set(0, config.wall_height_m * 0.35, 0);
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

    // Initialize WebGL Scene, Camera, Lighting, and OrbitControls
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0B0D11');
      scene.fog = new THREE.FogExp2('#0B0D11', 0.018);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 250);
      camera.position.set(11, 10, 12);
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
      renderer.toneMappingExposure = 1.08;
      rendererRef.current = renderer;

      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // WebGL context safety handlers
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
      controls.dampingFactor = 0.07;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.minDistance = 3;
      controls.maxDistance = 45;
      controls.target.set(0, 1.2, 0);
      controls.update();
      controlsRef.current = controls;

      // Three-Point Architectural Studio Lighting
      const hemiLight = new THREE.HemisphereLight('#E2E8F0', '#1E293B', 0.85);
      hemiLight.position.set(0, 25, 0);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight('#FFFBEB', 1.65);
      keyLight.position.set(14, 22, 16);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 60;
      const d = 14;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight('#38BDF8', 0.55);
      rimLight.position.set(-16, 12, -14);
      scene.add(rimLight);

      // Architectural Ground Grid (1m major divisions)
      const gridHelper = new THREE.GridHelper(32, 32, '#222938', '#161B26');
      gridHelper.position.y = -0.02;
      scene.add(gridHelper);

      // Exportable 3D Model Group
      const exportGroup = new THREE.Group();
      exportGroup.name = 'FloorForge_Architectural_Model';
      scene.add(exportGroup);
      exportGroupRef.current = exportGroup;

      // Raycaster for clicking rooms in 3D
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
        if (hits.length > 0) {
          const hitRoomId = hits[0].object.userData.roomId;
          if (hitRoomId) {
            onSelectRoom(hitRoomId);
          }
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);

      // Resize observer
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

    // Rebuild 3D geometry whenever pipelineResult, config, selectedRoomId, or cutawayMode changes
    useEffect(() => {
      const exportGroup = exportGroupRef.current;
      if (!exportGroup) return;

      // Clear previous meshes
      while (exportGroup.children.length > 0) {
        const child = exportGroup.children[0];
        exportGroup.remove(child);
      }
      roomMeshesRef.current.clear();

      const { model3d } = pipelineResult;
      const theme = config.material_theme;

      // Material palettes by architectural theme
      const exteriorWallMat = new THREE.MeshStandardMaterial({
        color:
          theme === 'clay'
            ? '#E2E8F0'
            : theme === 'timber'
            ? '#F8FAFC'
            : '#1E293B',
        roughness: theme === 'blueprint' ? 0.35 : 0.72,
        metalness: theme === 'blueprint' ? 0.2 : 0.05,
        transparent: theme === 'blueprint',
        opacity: theme === 'blueprint' ? 0.78 : 1.0,
      });

      const interiorWallMat = new THREE.MeshStandardMaterial({
        color:
          theme === 'clay'
            ? '#CBD5E1'
            : theme === 'timber'
            ? '#E2E8F0'
            : '#334155',
        roughness: 0.78,
        metalness: 0.05,
        transparent: theme === 'blueprint',
        opacity: theme === 'blueprint' ? 0.65 : 1.0,
      });

      const doorMat = new THREE.MeshStandardMaterial({
        color: theme === 'blueprint' ? '#F59E0B' : '#B45309',
        roughness: 0.5,
        metalness: 0.15,
      });

      const windowGlassMat = new THREE.MeshPhysicalMaterial({
        color: '#38BDF8',
        transparent: true,
        opacity: 0.36,
        roughness: 0.1,
        metalness: 0.1,
        transmission: 0.5,
      });

      const frameMat = new THREE.MeshStandardMaterial({
        color: '#0F172A',
        roughness: 0.4,
        metalness: 0.5,
      });

      const edgeLineMat = new THREE.LineBasicMaterial({
        color: theme === 'blueprint' ? '#38BDF8' : '#334155',
        transparent: true,
        opacity: theme === 'blueprint' ? 0.75 : 0.4,
      });

      // 1. Build Base Architectural Plinth beneath all rooms
      const plinthGeo = new THREE.BoxGeometry(
        model3d.bounding_box_m.width + 0.8,
        0.08,
        model3d.bounding_box_m.depth + 0.8
      );
      const plinthMat = new THREE.MeshStandardMaterial({
        color: '#161B26',
        roughness: 0.9,
      });
      const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
      plinthMesh.position.set(0, -0.04, 0);
      plinthMesh.receiveShadow = true;
      plinthMesh.name = 'Base_Foundation_Plinth';
      exportGroup.add(plinthMesh);

      // 2. Build Room Floor Slabs
      if (config.include_floor_slabs) {
        const roomColorsClay: Record<string, string> = {
          living: '#334155',
          bedroom: '#3B4252',
          kitchen: '#2E3440',
          bathroom: '#243B4A',
          hallway: '#29303D',
          office: '#37304A',
          utility: '#272E38',
          balcony: '#1F3A38',
        };
        const roomColorsTimber: Record<string, string> = {
          living: '#855836',
          bedroom: '#734B2D',
          kitchen: '#475569',
          bathroom: '#334155',
          hallway: '#7C5233',
          office: '#694429',
          utility: '#475569',
          balcony: '#52525B',
        };

        for (const slab of model3d.room_slabs) {
          if (slab.points_m.length < 3) continue;
          const shape = new THREE.Shape();
          // Note: shape is in XY plane; we rotate X by +90deg so shape Y maps to +Z
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
          const baseColor =
            theme === 'timber'
              ? roomColorsTimber[slab.category] || '#855836'
              : theme === 'blueprint'
              ? '#0F172A'
              : roomColorsClay[slab.category] || '#334155';

          const slabMat = new THREE.MeshStandardMaterial({
            color: isSelected ? '#D97706' : baseColor,
            roughness: 0.65,
            metalness: 0.08,
          });

          const mesh = new THREE.Mesh(extrudeGeo, slabMat);
          mesh.position.y = 0.05;
          mesh.receiveShadow = true;
          mesh.name = `Room_${slab.id}_${slab.name.replace(/\s+/g, '_')}`;
          mesh.userData = { roomId: slab.id, roomName: slab.name, areaM2: slab.area_m2 };
          exportGroup.add(mesh);
          roomMeshesRef.current.set(slab.id, mesh);
        }
      }

      // 3. Build Extruded Wall Segments (Full Walls, Lintels, Sills)
      for (const seg of model3d.wall_segments) {
        const dx = seg.end_m.x - seg.start_m.x;
        const dz = seg.end_m.y - seg.start_m.y;
        const length = Math.hypot(dx, dz);
        if (length < 0.02) continue;

        // In Dollhouse Cutaway mode, cap exterior walls to 1.05m for unobstructed interior viewing
        const effectiveMaxY =
          cutawayMode && seg.is_exterior ? Math.min(config.wall_height_m, 1.05) : config.wall_height_m;

        if (seg.bottom_y_m >= effectiveMaxY) continue;
        const effectiveHeight = Math.min(seg.height_m, effectiveMaxY - seg.bottom_y_m);
        if (effectiveHeight <= 0.02) continue;

        const boxGeo = new THREE.BoxGeometry(length, effectiveHeight, seg.thickness_m);
        const wallMesh = new THREE.Mesh(
          boxGeo,
          seg.is_exterior ? exteriorWallMat : interiorWallMat
        );

        const midX = (seg.start_m.x + seg.end_m.x) / 2;
        const midZ = (seg.start_m.y + seg.end_m.y) / 2;
        const midY = seg.bottom_y_m + effectiveHeight / 2;
        const angle = Math.atan2(dz, dx);

        wallMesh.position.set(midX, midY, midZ);
        wallMesh.rotation.y = -angle;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        wallMesh.name = `Wall_${seg.id}`;
        exportGroup.add(wallMesh);

        if (showWireframeEdges) {
          const edgesGeo = new THREE.EdgesGeometry(boxGeo);
          const line = new THREE.LineSegments(edgesGeo, edgeLineMat);
          wallMesh.add(line);
        }
      }

      // 4. Build 3D Doors & Windows
      if (config.include_openings_3d && !cutawayMode) {
        for (const op of model3d.openings) {
          const group = new THREE.Group();
          group.position.set(op.center_m.x, op.sill_y_m + op.height_m / 2, op.center_m.y);
          group.rotation.y = -op.angle_rad;
          group.name = `Opening_${op.id}`;

          if (op.kind === 'window') {
            // Window glass pane + perimeter mullion frame
            const glassGeo = new THREE.BoxGeometry(op.width_m, op.height_m, 0.03);
            const glassMesh = new THREE.Mesh(glassGeo, windowGlassMat);
            group.add(glassMesh);

            // Top and bottom frame rails
            const railGeo = new THREE.BoxGeometry(op.width_m, 0.05, op.thickness_m * 1.05);
            const topRail = new THREE.Mesh(railGeo, frameMat);
            topRail.position.y = op.height_m / 2 - 0.025;
            const botRail = new THREE.Mesh(railGeo, frameMat);
            botRail.position.y = -op.height_m / 2 + 0.025;
            group.add(topRail, botRail);

            // Center vertical mullion
            const mullionGeo = new THREE.BoxGeometry(0.04, op.height_m, op.thickness_m * 1.02);
            const mullion = new THREE.Mesh(mullionGeo, frameMat);
            group.add(mullion);
          } else {
            // Architectural Door Frame + Slightly Ajar Panel (25 degrees open)
            const jambGeo = new THREE.BoxGeometry(0.05, op.height_m, op.thickness_m * 1.08);
            const leftJamb = new THREE.Mesh(jambGeo, frameMat);
            leftJamb.position.x = -op.width_m / 2 + 0.025;
            const rightJamb = new THREE.Mesh(jambGeo, frameMat);
            rightJamb.position.x = op.width_m / 2 - 0.025;
            group.add(leftJamb, rightJamb);

            const leafWidth = Math.max(0.4, op.width_m - 0.08);
            const pivot = new THREE.Group();
            pivot.position.set(-op.width_m / 2 + 0.04, 0, 0);
            pivot.rotation.y = 0.42; // Partially open door leaf for spatial clarity

            const leafGeo = new THREE.BoxGeometry(leafWidth, op.height_m - 0.04, 0.045);
            const leafMesh = new THREE.Mesh(leafGeo, doorMat);
            leafMesh.position.x = leafWidth / 2;
            leafMesh.castShadow = true;
            pivot.add(leafMesh);
            group.add(pivot);
          }

          exportGroup.add(group);
        }
      }
    }, [pipelineResult, config, selectedRoomId, cutawayMode, showWireframeEdges]);

    const { bounding_box_m, total_floor_area_m2, total_wall_linear_m } = pipelineResult.model3d;
    const selectedRoom = pipelineResult.rooms.find((r) => r.id === selectedRoomId);

    return (
      <div className="relative flex flex-col h-full w-full bg-[#0B0D11] select-none overflow-hidden">
        {/* Pane Sub-Header: 3D Viewport & Material / Camera Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#12161F] border-b border-[#222938]">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[#F1F5F9] tracking-tight">
              3D Spatial Model (Three.js WebGL)
            </span>
            <span className="text-xs text-[#64748B]" aria-hidden="true">·</span>
            <span className="text-xs font-mono text-[#94A3B8] tabular-nums">
              {bounding_box_m.width.toFixed(1)}m × {bounding_box_m.depth.toFixed(1)}m × {config.wall_height_m.toFixed(1)}m
            </span>
            <span className="text-xs text-[#64748B]" aria-hidden="true">·</span>
            <span className="text-xs font-mono text-[#38BDF8] tabular-nums">
              {total_floor_area_m2.toFixed(1)} m² Floor
            </span>
          </div>

          {/* Interactive Material & View Mode Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-md border border-[#222938]">
              {(['clay', 'timber', 'blueprint'] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => onChangeMaterialTheme(theme)}
                  className={`px-2 py-1 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap ${
                    config.material_theme === theme
                      ? 'bg-[#181D29] text-[#F1F5F9] shadow-xs'
                      : 'text-[#64748B] hover:text-[#94A3B8]'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCutawayMode((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap flex items-center gap-1 ${
                cutawayMode
                  ? 'bg-[#D97706]/20 border-[#D97706] text-[#F59E0B]'
                  : 'bg-[#0B0D11] border-[#222938] text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
              title="Lower exterior walls to 1.05m for dollhouse interior inspection"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Cutaway</span>
            </button>

            <button
              type="button"
              onClick={() => setShowWireframeEdges((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap flex items-center gap-1 ${
                showWireframeEdges
                  ? 'bg-[#181D29] border-[#222938] text-[#F1F5F9]'
                  : 'bg-[#0B0D11] border-[#222938] text-[#64748B]'
              }`}
              title="Toggle architectural edge outlines"
            >
              <Box className="w-3.5 h-3.5" />
              <span>Edges</span>
            </button>
          </div>
        </div>

        {/* WebGL Canvas Host */}
        <div className="relative flex-1 w-full h-full overflow-hidden">
          <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          {/* WebGL Context Lost Fallback */}
          {webglLost && (
            <div className="absolute inset-0 bg-[#0B0D11]/95 flex flex-col items-center justify-center gap-2 p-6 text-center z-20">
              <p className="text-sm font-semibold text-[#F1F5F9]">WebGL Context Paused</p>
              <p className="text-xs text-[#94A3B8] max-w-sm">
                The 3D hardware context was suspended. Click below to restore the spatial viewport.
              </p>
            </div>
          )}

          {/* Selected Room Floating HUD Card */}
          {selectedRoom && (
            <div className="absolute top-3 left-4 z-10 px-3.5 py-2.5 rounded-md bg-[#0B0D11]/85 backdrop-blur-md border border-[#D97706]/50 text-xs max-w-xs pointer-events-auto">
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
                <span>·</span>
                <span>Perim {selectedRoom.perimeter_m.toFixed(1)}m</span>
              </div>
            </div>
          )}

          {/* Bottom Floating Camera & GLB Export HUD */}
          <div className="absolute bottom-3 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-[#0B0D11]/85 backdrop-blur-md border border-[#222938] text-xs pointer-events-auto">
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
                Eye-Level
              </button>
              <button
                type="button"
                onClick={() => setCameraView('iso')}
                className="p-1 rounded bg-[#181D29] hover:bg-[#222938] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
                title="Reset Orbit Camera"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden xl:inline text-[#94A3B8] font-mono tabular-nums">
                Linear Walls: {total_wall_linear_m.toFixed(1)}m
              </span>
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
      </div>
    );
  }
);
