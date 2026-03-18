import * as THREE from 'three';
import type { Map, CustomLayerInterface } from 'maplibre-gl';
import { MercatorCoordinate } from 'maplibre-gl';
import type { mat4 } from 'gl-matrix';
import { CENTER_LNG, CENTER_LAT, POINT_COUNT } from './constants';

type ClusterDef = { cx: number; cz: number; w: number; d: number; h: number };

const CLUSTERS: ClusterDef[] = [
  { cx: -120, cz:  -90, w: 22, d: 18, h: 28 },
  { cx:   55, cz: -130, w: 18, d: 24, h: 16 },
  { cx:  -75, cz:   85, w: 30, d: 20, h: 22 },
  { cx:  145, cz:   55, w: 16, d: 16, h: 35 },
  { cx:  -25, cz:   25, w: 25, d: 25, h: 12 },
  { cx:  185, cz:  -70, w: 20, d: 15, h: 20 },
  { cx: -165, cz:  115, w: 24, d: 18, h: 18 },
  { cx:   95, cz:  125, w: 28, d: 22, h: 25 },
  { cx: -200, cz:  -55, w: 16, d: 20, h: 30 },
  { cx:   30, cz:   80, w: 14, d: 14, h: 10 },
  { cx: -100, cz: -180, w: 20, d: 16, h: 14 },
  { cx:  120, cz: -170, w: 18, d: 18, h: 22 },
];

function generatePointCloud(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 800;
    const z = (Math.random() - 0.5) * 800;

    const f = 0.013;
    const ground =
      Math.sin(x * f) * 3.5 +
      Math.cos(z * f * 1.3) * 2.8 +
      Math.sin((x - z) * f * 0.6) * 1.5;

    const hit = CLUSTERS.find(c => Math.abs(x - c.cx) < c.w && Math.abs(z - c.cz) < c.d) ?? null;

    let y: number, r: number, g: number, b: number;

    if (hit) {
      if (Math.random() < 0.55) {
        // Roof
        y = ground + hit.h + Math.random() * 0.4;
        r = 0.75 + Math.random() * 0.25;
        g = 0.72 + Math.random() * 0.25;
        b = 0.70 + Math.random() * 0.25;
      } else {
        // Facade
        y = ground + Math.random() * hit.h;
        r = 0.55 + Math.random() * 0.25;
        g = 0.55 + Math.random() * 0.20;
        b = 0.55 + Math.random() * 0.20;
      }
    } else {
      y = ground + Math.random() * 0.4;
      const t = Math.random();
      if (t < 0.35) {
        // Vegetation
        r = 0.12 + Math.random() * 0.15;
        g = 0.45 + Math.random() * 0.30;
        b = 0.10 + Math.random() * 0.10;
      } else if (t < 0.65) {
        // Road / pavement
        r = g = b = 0.35 + Math.random() * 0.25;
      } else {
        // Bare ground
        r = 0.40 + Math.random() * 0.20;
        g = 0.28 + Math.random() * 0.18;
        b = 0.12 + Math.random() * 0.10;
      }
    }

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3]     = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

  const mat = new THREE.PointsMaterial({
    size: 2.2,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });

  return new THREE.Points(geo, mat);
}

export interface PointCloudLayer extends CustomLayerInterface {
  pointsMesh: THREE.Points | null;
}

/**
 * Creates a MapLibre custom layer that renders a Three.js point cloud
 * co-registered with the map's Mercator coordinate space.
 */
export function createPointCloudLayer(map: Map): PointCloudLayer {
  const originMerc = MercatorCoordinate.fromLngLat([CENTER_LNG, CENTER_LAT], 0);
  const meterScale = originMerc.meterInMercatorCoordinateUnits();

  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let renderer: THREE.WebGLRenderer;
  let pointsMesh: THREE.Points | null = null;

  const layer: PointCloudLayer = {
    id: 'point-cloud',
    type: 'custom',
    renderingMode: '3d',
    pointsMesh: null,

    onAdd(_map: Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
      scene    = new THREE.Scene();
      camera   = new THREE.Camera();
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGLRenderingContext,
        antialias: true,
      });
      renderer.autoClear = false;

      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const sun = new THREE.DirectionalLight(0xfff0e0, 0.7);
      sun.position.set(1, 2, 1);
      scene.add(sun);

      pointsMesh = generatePointCloud(POINT_COUNT);
      scene.add(pointsMesh);
      layer.pointsMesh = pointsMesh;
    },

    render(_gl: WebGLRenderingContext | WebGL2RenderingContext, matrix: mat4) {
      if (!pointsMesh) return;

      const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      const m = new THREE.Matrix4().fromArray(matrix as unknown as number[]);
      const l = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotX);

      camera.projectionMatrix = m.multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);

      if (pointsMesh.material instanceof THREE.PointsMaterial && pointsMesh.material.opacity > 0.01) {
        map.triggerRepaint();
      }
    },
  };

  return layer;
}
