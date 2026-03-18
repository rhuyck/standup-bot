/**
 * SVG drawing overlay — tools: pen (freehand), rect, circle.
 * Shapes are persisted to localStorage under the key STORAGE_KEY.
 *
 * The SVG sits above the map (#draw-overlay). While a drawing tool is active
 * the overlay captures pointer events (cursor: crosshair); in pan mode it
 * passes them through (pointer-events: none) so MapLibre panning still works.
 */

export type ToolName = 'none' | 'pen' | 'rect' | 'circle';

const STORAGE_KEY = 'drawing-overlay-shapes';
const NS = 'http://www.w3.org/2000/svg';

const STROKE_COLOR  = '#ff6b6b';
const STROKE_WIDTH  = 2;
const FILL_NONE     = 'none';
const FILL_SHAPE    = 'rgba(255,107,107,0.12)';

// ── Serialisation ────────────────────────────────────────────────────────────

function saveShapes(svg: SVGSVGElement): void {
  localStorage.setItem(STORAGE_KEY, svg.innerHTML);
}

function loadShapes(svg: SVGSVGElement): void {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) svg.innerHTML = saved;
}

// ── SVG element helpers ──────────────────────────────────────────────────────

function applyBaseStyle(el: SVGElement): void {
  el.setAttribute('stroke', STROKE_COLOR);
  el.setAttribute('stroke-width', String(STROKE_WIDTH));
  el.setAttribute('fill', FILL_NONE);
}

function createPolyline(): SVGPolylineElement {
  const el = document.createElementNS(NS, 'polyline') as SVGPolylineElement;
  applyBaseStyle(el);
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('stroke-linecap', 'round');
  return el;
}

function createRect(): SVGRectElement {
  const el = document.createElementNS(NS, 'rect') as SVGRectElement;
  applyBaseStyle(el);
  el.setAttribute('fill', FILL_SHAPE);
  return el;
}

function createCircle(): SVGCircleElement {
  const el = document.createElementNS(NS, 'circle') as SVGCircleElement;
  applyBaseStyle(el);
  el.setAttribute('fill', FILL_SHAPE);
  return el;
}

// ── Coordinate helpers ───────────────────────────────────────────────────────

function svgPoint(svg: SVGSVGElement, e: PointerEvent): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ── Tool implementations ─────────────────────────────────────────────────────

interface ActiveShape {
  element: SVGElement;
  startX: number;
  startY: number;
  points?: string; // accumulated for pen
}

function startPen(svg: SVGSVGElement, x: number, y: number): ActiveShape {
  const el = createPolyline();
  el.setAttribute('points', `${x},${y}`);
  svg.appendChild(el);
  return { element: el, startX: x, startY: y, points: `${x},${y}` };
}

function updatePen(active: ActiveShape, x: number, y: number): void {
  active.points = `${active.points} ${x},${y}`;
  active.element.setAttribute('points', active.points);
}

function startRect(svg: SVGSVGElement, x: number, y: number): ActiveShape {
  const el = createRect();
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('width', '0');
  el.setAttribute('height', '0');
  svg.appendChild(el);
  return { element: el, startX: x, startY: y };
}

function updateRect(active: ActiveShape, x: number, y: number): void {
  const rx = Math.min(x, active.startX);
  const ry = Math.min(y, active.startY);
  active.element.setAttribute('x', String(rx));
  active.element.setAttribute('y', String(ry));
  active.element.setAttribute('width',  String(Math.abs(x - active.startX)));
  active.element.setAttribute('height', String(Math.abs(y - active.startY)));
}

function startCircle(svg: SVGSVGElement, x: number, y: number): ActiveShape {
  const el = createCircle();
  el.setAttribute('cx', String(x));
  el.setAttribute('cy', String(y));
  el.setAttribute('r', '0');
  svg.appendChild(el);
  return { element: el, startX: x, startY: y };
}

function updateCircle(active: ActiveShape, x: number, y: number): void {
  const r = Math.hypot(x - active.startX, y - active.startY);
  active.element.setAttribute('r', String(r));
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface DrawingController {
  setTool(tool: ToolName): void;
  clearAll(): void;
}

/**
 * Attaches drawing behaviour to an SVG overlay element.
 * Returns a controller for changing the active tool and clearing shapes.
 */
export function createDrawingController(svg: SVGSVGElement): DrawingController {
  let activeTool: ToolName = 'none';
  let activeShape: ActiveShape | null = null;

  loadShapes(svg);

  function setOverlayInteractive(on: boolean): void {
    svg.classList.toggle('drawing', on);
  }

  // ── Pointer events ──────────────────────────────────────────────────────

  svg.addEventListener('pointerdown', (e: PointerEvent) => {
    if (activeTool === 'none') return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);

    const { x, y } = svgPoint(svg, e);

    switch (activeTool) {
      case 'pen':    activeShape = startPen(svg, x, y);    break;
      case 'rect':   activeShape = startRect(svg, x, y);   break;
      case 'circle': activeShape = startCircle(svg, x, y); break;
    }
  });

  svg.addEventListener('pointermove', (e: PointerEvent) => {
    if (!activeShape) return;
    const { x, y } = svgPoint(svg, e);

    switch (activeTool) {
      case 'pen':    updatePen(activeShape, x, y);    break;
      case 'rect':   updateRect(activeShape, x, y);   break;
      case 'circle': updateCircle(activeShape, x, y); break;
    }
  });

  const finishDraw = () => {
    if (!activeShape) return;
    activeShape = null;
    saveShapes(svg);
  };

  svg.addEventListener('pointerup',     finishDraw);
  svg.addEventListener('pointercancel', finishDraw);

  // ── Controller ──────────────────────────────────────────────────────────

  return {
    setTool(tool: ToolName) {
      activeTool = tool;
      setOverlayInteractive(tool !== 'none');
    },

    clearAll() {
      svg.innerHTML = '';
      localStorage.removeItem(STORAGE_KEY);
    },
  };
}
