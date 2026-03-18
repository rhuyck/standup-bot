import './styles.css';
import { Map } from 'maplibre-gl';
import { CENTER_LNG, CENTER_LAT, INIT_ZOOM } from './constants';
import { buildSitePlan } from './sitePlan';
import { createPointCloudLayer } from './pointCloud';
import { createTransitionController } from './transitions';
import { createDrawingController, type ToolName } from './drawing';

// ── Map ──────────────────────────────────────────────────────────────────────

const map = new Map({
  container: 'map',
  style: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Tiles © Esri — Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN',
      },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
  },
  center: [CENTER_LNG, CENTER_LAT],
  zoom: INIT_ZOOM,
  pitch: 0,
  bearing: 0,
  antialias: true,
});

// ── UI element refs ──────────────────────────────────────────────────────────

const toggleBtn = document.getElementById('toggle-btn')  as HTMLButtonElement;
const statusEl  = document.getElementById('status')      as HTMLElement;
const loaderEl  = document.getElementById('loader')      as HTMLElement;
const badgeEl   = document.getElementById('mode-badge')  as HTMLElement;
const svgEl     = document.getElementById('draw-overlay') as unknown as SVGSVGElement;

// ── Drawing toolbar ──────────────────────────────────────────────────────────

const drawing = createDrawingController(svgEl);

document.querySelectorAll<HTMLButtonElement>('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawing.setTool(btn.dataset['tool'] as ToolName);
  });
});

document.getElementById('clear-btn')?.addEventListener('click', () => {
  drawing.clearAll();
});

// ── Point cloud layer + transitions ─────────────────────────────────────────

const pcLayer = createPointCloudLayer(map);

const transition = createTransitionController(map, pcLayer, {
  statusEl,
  loaderEl,
  badgeEl,
  toggleBtn,
});

toggleBtn.addEventListener('click', () => { void transition.toggle(); });

// ── Map load ─────────────────────────────────────────────────────────────────

map.on('load', () => {
  const plan = buildSitePlan();

  map.addSource('site-plan', { type: 'geojson', data: plan });

  map.addLayer({
    id: 'site-plan-fill',
    type: 'fill',
    source: 'site-plan',
    filter: ['==', ['get', 'kind'], 'block'],
    paint: { 'fill-color': '#ffdd00', 'fill-opacity': 0.08 },
  });
  map.addLayer({
    id: 'site-plan-outline',
    type: 'line',
    source: 'site-plan',
    filter: ['==', ['get', 'kind'], 'block'],
    paint: { 'line-color': '#ffdd00', 'line-width': 1.5, 'line-opacity': 0.85 },
  });
  map.addLayer({
    id: 'bldg-fill',
    type: 'fill',
    source: 'site-plan',
    filter: ['==', ['get', 'kind'], 'building'],
    paint: { 'fill-color': '#22ee88', 'fill-opacity': 0.45 },
  });
  map.addLayer({
    id: 'bldg-outline',
    type: 'line',
    source: 'site-plan',
    filter: ['==', ['get', 'kind'], 'building'],
    paint: { 'line-color': '#00ff99', 'line-width': 1.2, 'line-opacity': 1.0 },
  });

  map.addLayer(pcLayer);

  statusEl.textContent = '2D — Satellite + Site Plan';
});
