import type { Map } from 'maplibre-gl';
import * as THREE from 'three';
import type { PointCloudLayer } from './pointCloud';
import { INIT_ZOOM } from './constants';

const SITE_FILL_LAYERS   = ['site-plan-fill', 'bldg-fill'] as const;
const SITE_LINE_LAYERS   = ['site-plan-outline', 'bldg-outline'] as const;

function setSiteOpacity(map: Map, fill: number, line: number) {
  map.setPaintProperty('site-plan-fill',    'fill-opacity', fill);
  map.setPaintProperty('site-plan-outline', 'line-opacity', line);
  map.setPaintProperty('bldg-fill',         'fill-opacity', fill * 1.8);
  map.setPaintProperty('bldg-outline',      'line-opacity', line);

  // Silence unused variable warning — arrays are for documentation only
  void SITE_FILL_LAYERS;
  void SITE_LINE_LAYERS;
}

function fadeMaterial(mat: THREE.PointsMaterial, to: number, ms: number): void {
  const from = mat.opacity;
  const t0   = performance.now();
  const tick = () => {
    const p  = Math.min(1, (performance.now() - t0) / ms);
    const ep = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p; // ease in-out quad
    mat.opacity = from + (to - from) * ep;
    mat.needsUpdate = true;
    if (p < 1) requestAnimationFrame(tick);
  };
  tick();
}

function flyTo(map: Map, options: Parameters<Map['flyTo']>[0]): Promise<void> {
  return new Promise(resolve => {
    map.flyTo({ ...options, essential: true });
    map.once('moveend', resolve);
  });
}

export interface TransitionController {
  is3D: boolean;
  toggle(): Promise<void>;
}

export interface TransitionUI {
  statusEl: HTMLElement;
  loaderEl: HTMLElement;
  badgeEl: HTMLElement;
  toggleBtn: HTMLButtonElement;
}

/**
 * Creates a controller that drives the animated 2D ↔ 3D transition.
 */
export function createTransitionController(
  map: Map,
  layer: PointCloudLayer,
  ui: TransitionUI,
): TransitionController {
  let is3D          = false;
  let transitioning = false;

  async function goTo3D() {
    if (!layer.pointsMesh) return;
    const mat = layer.pointsMesh.material as THREE.PointsMaterial;

    transitioning           = true;
    ui.toggleBtn.disabled   = true;
    ui.statusEl.textContent = 'Transitioning…';
    ui.loaderEl.classList.add('visible');

    setSiteOpacity(map, 0, 0);
    await flyTo(map, { pitch: 65, bearing: -25, zoom: INIT_ZOOM - 0.6, duration: 1400 });

    fadeMaterial(mat, 1.0, 900);
    map.triggerRepaint();

    ui.loaderEl.classList.remove('visible');
    ui.toggleBtn.textContent  = '← Back to 2D';
    ui.statusEl.textContent   = '3D — LiDAR Point Cloud';
    ui.badgeEl.textContent    = '3D';
    ui.badgeEl.className      = 'mode-3d';
    is3D          = true;
    transitioning = false;
    ui.toggleBtn.disabled = false;
  }

  async function goTo2D() {
    if (!layer.pointsMesh) return;
    const mat = layer.pointsMesh.material as THREE.PointsMaterial;

    transitioning           = true;
    ui.toggleBtn.disabled   = true;
    ui.statusEl.textContent = 'Transitioning…';

    fadeMaterial(mat, 0, 500);
    await flyTo(map, { pitch: 0, bearing: 0, zoom: INIT_ZOOM, duration: 1200 });

    setSiteOpacity(map, 0.08, 0.85);

    ui.toggleBtn.textContent  = 'View in 3D →';
    ui.statusEl.textContent   = '2D — Satellite + Site Plan';
    ui.badgeEl.textContent    = '2D';
    ui.badgeEl.className      = 'mode-2d';
    is3D          = false;
    transitioning = false;
    ui.toggleBtn.disabled = false;
  }

  return {
    get is3D() { return is3D; },
    toggle() {
      if (transitioning) return Promise.resolve();
      return is3D ? goTo2D() : goTo3D();
    },
  };
}
