import React, { useState, useRef, useEffect } from 'react';
import { CanvasElement, CadTool, Point, SoilType, CustomTool } from '../types';
import {
  getLineLengthInfo,
  formatLineLabel,
  resizeLineElement,
  PIXELS_PER_METER,
} from '../utils/lineLengthUtils';
import { Ruler, Plus, Minus, ArrowRight, ArrowLeft, Sparkles, Check } from 'lucide-react';

interface CadCanvasProps {
  elements: CanvasElement[];
  setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
  activeTool: CadTool;
  setActiveTool: (tool: CadTool) => void;
  orthoMode: boolean;
  snapToGrid: boolean;
  showGrid: boolean;
  selectedElementId: string | null;
  setSelectedElementId: (id: string | null) => void;
  customTools: CustomTool[];
  onElementsChange?: (newElements: CanvasElement[]) => void;
  width?: number;
  height?: number;
  onAutoCalculateLengths?: () => void;
  onDoubleClickElement?: (element: CanvasElement) => void;
}

export const CadCanvas: React.FC<CadCanvasProps> = ({
  elements,
  setElements,
  activeTool,
  setActiveTool,
  orthoMode,
  snapToGrid,
  showGrid,
  selectedElementId,
  setSelectedElementId,
  customTools,
  onElementsChange,
  width = 750,
  height = 700,
  onAutoCalculateLengths,
  onDoubleClickElement,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drawingStart, setDrawingStart] = useState<Point | null>(null);
  const [currentMouse, setCurrentMouse] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Rock-solid dragging refs (prevent accumulation drift)
  const dragStartMouseRef = useRef<Point>({ x: 0, y: 0 });
  const dragInitialElementRef = useRef<CanvasElement | null>(null);
  const dragConnectedSymbolsRef = useRef<
    { id: string; initialX: number; initialY: number }[]
  >([]);

  // Direct on-canvas inline length input state
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineText, setEditingLineText] = useState<string>('');
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [tempLabelText, setTempLabelText] = useState<string>('');

  // Grip stretching states (AutoCAD vertex grips & textbox resizing)
  const [activeGrip, setActiveGrip] = useState<'start' | 'end' | 'resize-textbox' | null>(null);
  const [gripElementId, setGripElementId] = useState<string | null>(null);
  const [liveGripLength, setLiveGripLength] = useState<number | null>(null);
  const [liveGripCoord, setLiveGripCoord] = useState<Point | null>(null);
  const [initialSymbolPositions, setInitialSymbolPositions] = useState<
    { id: string; x: number; y: number }[]
  >([]);

  // Direct line length change on the drawing
  const handleDirectLineLengthChange = (
    lineId: string,
    targetMeters: number,
    soilType?: SoilType
  ) => {
    const updated = resizeLineElement(elements, lineId, targetMeters, {
      anchor: 'start',
      updateLabel: true,
      moveConnectedSymbols: true,
    });
    setElements(updated);
    onElementsChange?.(updated);
    // Trench and soil lengths in header are preserved and edited manually
  };

  const handleCommitLineLength = (
    lineId: string,
    rawText: string,
    soilType?: SoilType
  ) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    const matchNumber = trimmed.match(/(\d+(\.\d+)?)/);
    const parsedMeters = matchNumber ? parseFloat(matchNumber[1]) : null;

    let detectedSoil: SoilType | undefined = soilType;
    const upper = trimmed.toUpperCase();
    if (upper.includes('AS')) detectedSoil = 'AS';
    else if (upper.includes('NG')) detectedSoil = 'NG';
    else if (upper.includes('T')) detectedSoil = 'T';

    if (parsedMeters && parsedMeters > 0) {
      const updated = elements.map((item) => {
        if (item.id === lineId) {
          const resized = resizeLineElement([item], lineId, parsedMeters, {
            anchor: 'start',
            updateLabel: false,
            moveConnectedSymbols: true,
          })[0];
          return {
            ...resized,
            soilType: detectedSoil || item.soilType,
            label: formatLineLabel(parsedMeters, detectedSoil || item.soilType),
          };
        }
        return item;
      });
      setElements(updated);
      onElementsChange?.(updated);
      // Trench and soil lengths in header are preserved and edited manually
    }
  };

  const snapCoord = (val: number, step = 10): number => {
    return snapToGrid ? Math.round(val / step) * step : val;
  };

  const getCanvasCoords = (e: React.MouseEvent<SVGSVGElement>): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    return {
      x: snapCoord(rawX),
      y: snapCoord(rawY),
    };
  };

  const applyOrtho = (start: Point, current: Point): Point => {
    if (!orthoMode) return current;
    const dx = Math.abs(current.x - start.x);
    const dy = Math.abs(current.y - start.y);
    if (dx >= dy) {
      return { x: current.x, y: start.y };
    } else {
      return { x: start.x, y: current.y };
    }
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (editingLabelId) {
      handleSaveLabel(editingLabelId);
    }
    const coords = getCanvasCoords(e);

    // If in select mode
    if (activeTool === 'select') {
      const target = e.target as SVGElement;
      const gripType = target.getAttribute('data-grip-type') as 'start' | 'end' | 'resize-textbox' | null;
      const gripElemId = target.getAttribute('data-grip-element-id');

      if (gripType && gripElemId) {
        setActiveGrip(gripType);
        setGripElementId(gripElemId);
        setSelectedElementId(gripElemId);

        if (gripType === 'start' || gripType === 'end') {
          // Record any connected symbols at this endpoint (e.g. SP or Substation)
          const targetLine = elements.find((x) => x.id === gripElemId);
          if (targetLine) {
            const gripPoint =
              gripType === 'start'
                ? { x: targetLine.x, y: targetLine.y }
                : { x: targetLine.x2 ?? targetLine.x, y: targetLine.y2 ?? targetLine.y };

            const connected = elements
              .filter(
                (item) =>
                  item.id !== gripElemId &&
                  (item.type === 'symbol' || item.type === 'custom_symbol') &&
                  Math.hypot(item.x - gripPoint.x, item.y - gripPoint.y) <= 26
              )
              .map((item) => ({ id: item.id, x: item.x, y: item.y }));

            setInitialSymbolPositions(connected);
          }
        }
        return;
      }

      const elementId = target.getAttribute('data-element-id');
      if (elementId) {
        setSelectedElementId(elementId);
        const el = elements.find((x) => x.id === elementId);
        if (el) {
          setIsDragging(true);
          dragStartMouseRef.current = coords;
          dragInitialElementRef.current = { ...el };

          // If line or dimension, also record connected symbols at either endpoint
          if (el.type === 'line' || el.type === 'dimension') {
            const p1 = { x: el.x, y: el.y };
            const p2 = { x: el.x2 ?? el.x, y: el.y2 ?? el.y };
            const connected = elements
              .filter(
                (item) =>
                  item.id !== el.id &&
                  (item.type === 'symbol' || item.type === 'custom_symbol') &&
                  (Math.hypot(item.x - p1.x, item.y - p1.y) <= 28 ||
                    Math.hypot(item.x - p2.x, item.y - p2.y) <= 28)
              )
              .map((item) => ({ id: item.id, initialX: item.x, initialY: item.y }));
            dragConnectedSymbolsRef.current = connected;
          } else {
            dragConnectedSymbolsRef.current = [];
          }
        }
      } else {
        setSelectedElementId(null);
      }
      return;
    }

    // Direct symbol insertion tools (SP, Substation, Joint, North, Pinned Tools)
    if (activeTool === 'sp') {
      const newEl: CanvasElement = {
        id: `sp-${Date.now()}`,
        type: 'symbol',
        symbolKind: 'sp',
        x: coords.x,
        y: coords.y,
        width: 26,
        height: 26,
        strokeColor: '#0022cc',
        strokeWidth: 2,
        label: 'SP',
        labelPosition: 'top',
      };
      const updated = [...elements, newEl];
      setElements(updated);
      onElementsChange?.(updated);
      setSelectedElementId(newEl.id);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'substation') {
      const newEl: CanvasElement = {
        id: `substation-${Date.now()}`,
        type: 'symbol',
        symbolKind: 'substation',
        x: coords.x,
        y: coords.y,
        width: 44,
        height: 24,
        strokeColor: '#000000',
        strokeWidth: 1.5,
        label: 'محطة 973018',
        labelPosition: 'bottom',
      };
      const updated = [...elements, newEl];
      setElements(updated);
      onElementsChange?.(updated);
      setSelectedElementId(newEl.id);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'cabinet' || activeTool === 'substation_cross') {
      const newEl: CanvasElement = {
        id: `cabinet-${Date.now()}`,
        type: 'symbol',
        symbolKind: 'cabinet',
        x: coords.x,
        y: coords.y,
        width: 44,
        height: 24,
        strokeColor: '#000000',
        strokeWidth: 1.5,
        label: 'كابينة C973018/5',
        labelPosition: 'bottom',
      };
      const updated = [...elements, newEl];
      setElements(updated);
      onElementsChange?.(updated);
      setSelectedElementId(newEl.id);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'textbox') {
      const newEl: CanvasElement = {
        id: `textbox-${Date.now()}`,
        type: 'textbox',
        x: coords.x,
        y: coords.y,
        width: 160,
        height: 56,
        strokeColor: '#ea7c15',
        strokeWidth: 1.5,
        fillColor: '#ffffff',
        text: 'ملاحظة مساحية',
        label: 'ملاحظة مساحية',
        fontSize: 12,
      };
      const updated = [...elements, newEl];
      setElements(updated);
      onElementsChange?.(updated);
      setSelectedElementId(newEl.id);
      setEditingLabelId(newEl.id);
      setTempLabelText('');
      setActiveTool('select');
      return;
    }

    if (activeTool === 'joint') {
      const newEl: CanvasElement = {
        id: `joint-${Date.now()}`,
        type: 'symbol',
        symbolKind: 'joint',
        x: coords.x,
        y: coords.y,
        width: 20,
        height: 20,
        strokeColor: '#dc2626',
        strokeWidth: 2,
        label: 'لحام 70',
        labelPosition: 'bottom',
      };
      const updated = [...elements, newEl];
      setElements(updated);
      onElementsChange?.(updated);
      setSelectedElementId(newEl.id);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'north') {
      const newEl: CanvasElement = {
        id: `north-${Date.now()}`,
        type: 'symbol',
        symbolKind: 'north_arrow',
        x: coords.x,
        y: coords.y,
        width: 36,
        height: 48,
        strokeColor: '#000000',
        strokeWidth: 2,
        label: 'N',
        labelPosition: 'bottom',
      };
      const updated = [...elements, newEl];
      setElements(updated);
      onElementsChange?.(updated);
      setSelectedElementId(newEl.id);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'text') {
      const newEl: CanvasElement = {
        id: `text-${Date.now()}`,
        type: 'text',
        x: coords.x,
        y: coords.y,
        text: 'شارع عرض 15م',
        strokeColor: '#1e293b',
        strokeWidth: 1,
        fontSize: 13,
      };
      const updated = [...elements, newEl];
      setElements(updated);
      onElementsChange?.(updated);
      setSelectedElementId(newEl.id);
      setEditingLabelId(newEl.id);
      setTempLabelText(newEl.text || '');
      setActiveTool('select');
      return;
    }

    // Check if tool is custom tool
    const customTool = customTools.find((t) => t.id === activeTool);
    if (customTool) {
      const newEl: CanvasElement = {
        id: `custom-${Date.now()}`,
        type: 'custom_symbol',
        symbolKind: customTool.symbolKind,
        x: coords.x,
        y: coords.y,
        width: 30,
        height: 30,
        strokeColor: customTool.color,
        strokeWidth: 2,
        fillColor: customTool.color,
        label: customTool.defaultLabel,
        text: customTool.name,
        customToolId: customTool.id,
      };
      const updated = [...elements, newEl];
      setElements(updated);
      onElementsChange?.(updated);
      setSelectedElementId(newEl.id);
      setActiveTool('select');
      return;
    }

    // Geometry tools with drag: line, cable_as, cable_ng, cable_t, rect, circle, dimension
    setDrawingStart(coords);
    setCurrentMouse(coords);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rawCoords = getCanvasCoords(e);

    // If dragging a line endpoint grip (lengthening / stretching line)
    if (activeGrip && gripElementId) {
      const targetLine = elements.find((x) => x.id === gripElementId);
      if (
        targetLine &&
        targetLine.x2 !== undefined &&
        targetLine.y2 !== undefined
      ) {
        const fixedPoint =
          activeGrip === 'start'
            ? { x: targetLine.x2, y: targetLine.y2 }
            : { x: targetLine.x, y: targetLine.y };

        const movedPoint = applyOrtho(fixedPoint, rawCoords);
        const newDistPixels = Math.hypot(
          movedPoint.x - fixedPoint.x,
          movedPoint.y - fixedPoint.y
        );
        const newDistMeters = Math.max(0.5, newDistPixels / PIXELS_PER_METER);

        setLiveGripLength(newDistMeters);
        setLiveGripCoord(movedPoint);

        const prevMovingX = activeGrip === 'start' ? targetLine.x : targetLine.x2;
        const prevMovingY = activeGrip === 'start' ? targetLine.y : targetLine.y2;
        const dx = movedPoint.x - prevMovingX;
        const dy = movedPoint.y - prevMovingY;

        const updated = elements.map((item) => {
          if (item.id === gripElementId) {
            return {
              ...item,
              x: activeGrip === 'start' ? movedPoint.x : item.x,
              y: activeGrip === 'start' ? movedPoint.y : item.y,
              x2: activeGrip === 'end' ? movedPoint.x : item.x2,
              y2: activeGrip === 'end' ? movedPoint.y : item.y2,
              label: formatLineLabel(
                newDistMeters,
                item.soilType,
                getLineLengthInfo(item)?.prefix
              ),
            };
          }

          // Shift connected symbols (e.g. SP point, substation box) along with moving endpoint
          const connectedInitial = initialSymbolPositions.find(
            (s) => s.id === item.id
          );
          if (connectedInitial) {
            return {
              ...item,
              x: connectedInitial.x + dx,
              y: connectedInitial.y + dy,
            };
          }

          return item;
        });

        setElements(updated);
      }
      return;
    }

    // If resizing a textbox via bottom-right grip
    if (activeGrip === 'resize-textbox' && gripElementId) {
      const target = elements.find((x) => x.id === gripElementId);
      if (target) {
        const newW = Math.max(50, rawCoords.x - target.x);
        const newH = Math.max(26, rawCoords.y - target.y);
        const updated = elements.map((item) =>
          item.id === gripElementId ? { ...item, width: newW, height: newH } : item
        );
        setElements(updated);
      }
      return;
    }

    // If dragging an element in select mode
    if (isDragging && selectedElementId && dragInitialElementRef.current) {
      const initEl = dragInitialElementRef.current;
      const dx = rawCoords.x - dragStartMouseRef.current.x;
      const dy = rawCoords.y - dragStartMouseRef.current.y;

      const snappedDx = snapCoord(dx);
      const snappedDy = snapCoord(dy);

      const updated = elements.map((item) => {
        if (item.id === selectedElementId) {
          return {
            ...item,
            x: snapCoord(initEl.x + snappedDx),
            y: snapCoord(initEl.y + snappedDy),
            x2:
              initEl.x2 !== undefined
                ? snapCoord(initEl.x2 + snappedDx)
                : undefined,
            y2:
              initEl.y2 !== undefined
                ? snapCoord(initEl.y2 + snappedDy)
                : undefined,
          };
        }
        // Also move connected symbols if attached
        const conn = dragConnectedSymbolsRef.current.find(
          (c) => c.id === item.id
        );
        if (conn) {
          return {
            ...item,
            x: snapCoord(conn.initialX + snappedDx),
            y: snapCoord(conn.initialY + snappedDy),
          };
        }
        return item;
      });
      setElements(updated);
      return;
    }

    if (!drawingStart) return;

    const orthoPoint = applyOrtho(drawingStart, rawCoords);
    setCurrentMouse(orthoPoint);
  };

  const handleMouseUp = () => {
    if (activeGrip && gripElementId) {
      setActiveGrip(null);
      setGripElementId(null);
      setLiveGripLength(null);
      setLiveGripCoord(null);
      setInitialSymbolPositions([]);
      onElementsChange?.(elements);
      return;
    }

    if (isDragging) {
      setIsDragging(false);
      dragInitialElementRef.current = null;
      dragConnectedSymbolsRef.current = [];
      onElementsChange?.(elements);
      return;
    }

    if (!drawingStart || !currentMouse) {
      setDrawingStart(null);
      setCurrentMouse(null);
      return;
    }

    const dist = Math.hypot(
      currentMouse.x - drawingStart.x,
      currentMouse.y - drawingStart.y
    );

    // If just clicked without dragging
    if (dist < 4) {
      setDrawingStart(null);
      setCurrentMouse(null);
      return;
    }

    const meters = (dist / PIXELS_PER_METER).toFixed(2);
    let newElement: CanvasElement | null = null;

    if (activeTool === 'cable_as') {
      newElement = {
        id: `cable-as-${Date.now()}`,
        type: 'line',
        x: drawingStart.x,
        y: drawingStart.y,
        x2: currentMouse.x,
        y2: currentMouse.y,
        strokeColor: '#0022cc',
        strokeWidth: 2.5,
        soilType: 'AS',
        label: `AS ${parseFloat(meters)}M`,
        labelPosition:
          Math.abs(currentMouse.x - drawingStart.x) >
          Math.abs(currentMouse.y - drawingStart.y)
            ? 'top'
            : 'left',
      };
    } else if (activeTool === 'cable_ng') {
      newElement = {
        id: `cable-ng-${Date.now()}`,
        type: 'line',
        x: drawingStart.x,
        y: drawingStart.y,
        x2: currentMouse.x,
        y2: currentMouse.y,
        strokeColor: '#0022cc', // standard SEC cable blue with NG tag
        strokeWidth: 2.5,
        soilType: 'NG',
        label: `NG${parseFloat(meters)}M`,
        labelPosition: 'left',
      };
    } else if (activeTool === 'cable_t') {
      newElement = {
        id: `cable-t-${Date.now()}`,
        type: 'line',
        x: drawingStart.x,
        y: drawingStart.y,
        x2: currentMouse.x,
        y2: currentMouse.y,
        strokeColor: '#059669',
        strokeWidth: 2.5,
        soilType: 'T',
        label: `T ${parseFloat(meters)}M`,
        labelPosition: 'top',
      };
    } else if (activeTool === 'line') {
      newElement = {
        id: `line-${Date.now()}`,
        type: 'line',
        x: drawingStart.x,
        y: drawingStart.y,
        x2: currentMouse.x,
        y2: currentMouse.y,
        strokeColor: '#334155',
        strokeWidth: 2,
        label: `${parseFloat(meters)}M`,
        labelPosition: 'top',
      };
    } else if (activeTool === 'dimension') {
      newElement = {
        id: `dim-${Date.now()}`,
        type: 'dimension',
        x: drawingStart.x,
        y: drawingStart.y,
        x2: currentMouse.x,
        y2: currentMouse.y,
        strokeColor: '#dc2626',
        strokeWidth: 1.5,
        label: `${parseFloat(meters)}M`,
        labelPosition: 'top',
      };
    } else if (activeTool === 'rect') {
      const rx = Math.min(drawingStart.x, currentMouse.x);
      const ry = Math.min(drawingStart.y, currentMouse.y);
      const rw = Math.abs(currentMouse.x - drawingStart.x);
      const rh = Math.abs(currentMouse.y - drawingStart.y);
      newElement = {
        id: `rect-${Date.now()}`,
        type: 'rect',
        x: rx,
        y: ry,
        width: rw,
        height: rh,
        strokeColor: '#0f172a',
        strokeWidth: 2,
        fillColor: 'transparent',
      };
    } else if (activeTool === 'circle') {
      const radius = Math.hypot(
        currentMouse.x - drawingStart.x,
        currentMouse.y - drawingStart.y
      );
      newElement = {
        id: `circle-${Date.now()}`,
        type: 'circle',
        x: drawingStart.x,
        y: drawingStart.y,
        width: radius * 2,
        height: radius * 2,
        strokeColor: '#0f172a',
        strokeWidth: 2,
        fillColor: 'transparent',
      };
    }

    if (newElement) {
      const updated = [...elements, newElement];
      setElements(updated);
      onElementsChange?.(updated);
      setSelectedElementId(newElement.id);
    }

    setDrawingStart(null);
    setCurrentMouse(null);
    setActiveTool('select');
  };

  const handleDoubleClick = (el: CanvasElement) => {
    setSelectedElementId(el.id);
    if (el.type === 'textbox' || el.type === 'text') {
      setEditingLabelId(el.id);
      setTempLabelText(el.text || el.label || '');
    } else if (onDoubleClickElement) {
      onDoubleClickElement(el);
    } else {
      setEditingLabelId(el.id);
      setTempLabelText(el.label || el.text || '');
    }
  };

  const handleSvgDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    const elementId = target.getAttribute('data-element-id');
    if (elementId) {
      const el = elements.find((x) => x.id === elementId);
      if (el) {
        handleDoubleClick(el);
        return;
      }
    }
    const coords = getCanvasCoords(e);
    // Find closest element
    for (const el of [...elements].reverse()) {
      if (el.type === 'line' || el.type === 'dimension') {
        const p1 = { x: el.x, y: el.y };
        const p2 = { x: el.x2 ?? el.x, y: el.y2 ?? el.y };
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lengthSq = dx * dx + dy * dy;
        let t = lengthSq === 0 ? 0 : ((coords.x - p1.x) * dx + (coords.y - p1.y) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        const dist = Math.hypot(coords.x - projX, coords.y - projY);
        if (dist <= 22) {
          handleDoubleClick(el);
          return;
        }
      } else {
        const w = el.width || 36;
        const h = el.height || 36;
        if (
          coords.x >= el.x - w / 2 - 12 &&
          coords.x <= el.x + w / 2 + 12 &&
          coords.y >= el.y - h / 2 - 12 &&
          coords.y <= el.y + h / 2 + 12
        ) {
          handleDoubleClick(el);
          return;
        }
      }
    }
  };

  const handleSaveLabel = (id: string, textToSave?: string) => {
    const rawVal = textToSave !== undefined ? textToSave : tempLabelText;
    const trimmedVal = rawVal.trim();
    const updated = elements.map((item) => {
      if (item.id === id) {
        if (item.type === 'textbox' || item.type === 'text') {
          const finalVal = trimmedVal || (item.type === 'textbox' ? 'ملاحظة مساحية' : 'نص توضيحي');
          return {
            ...item,
            text: finalVal,
            label: finalVal,
          };
        } else {
          return { ...item, label: trimmedVal || item.label };
        }
      }
      return item;
    });
    setElements(updated);
    onElementsChange?.(updated);
    setEditingLabelId(null);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-white overflow-hidden select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full touch-none"
        style={{ cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleSvgDoubleClick}
      >
        <defs>
          {/* Dimension arrow markers */}
          <marker
            id="arrow-start"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 10 0 L 0 5 L 10 10 z" fill="#dc2626" />
          </marker>
          <marker
            id="arrow-end"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
          </marker>

          {/* Grid pattern */}
          {showGrid && (
            <pattern
              id="cad-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="0.8" fill="#cbd5e1" />
            </pattern>
          )}

          {/* SP Radial Glow gradient matching image */}
          <radialGradient id="spGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="45%" stopColor="#84cc16" />
            <stop offset="90%" stopColor="#15803d" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </radialGradient>
        </defs>

        {/* Background & Grid */}
        <rect width={width} height={height} fill="#ffffff" />
        {showGrid && (
          <rect width={width} height={height} fill="url(#cad-grid)" />
        )}

        {/* Render Saved Elements */}
        {elements.map((el) => {
          const isSelected = el.id === selectedElementId;

          // Lines and Cables
          if (el.type === 'line' && el.x2 !== undefined && el.y2 !== undefined) {
            const midX = (el.x + el.x2) / 2;
            const midY = (el.y + el.y2) / 2;
            const isHoriz = Math.abs(el.x2 - el.x) >= Math.abs(el.y2 - el.y);
            const labelOffset = isHoriz
              ? { x: midX, y: midY - 9 }
              : { x: midX - 12, y: midY, rotate: -90 };

            const lengthInfo = getLineLengthInfo(el);
            const displayMeters = lengthInfo ? lengthInfo.lengthMeters : 0;

            return (
              <g
                key={el.id}
                data-element-id={el.id}
                className="group cursor-move"
                style={{ cursor: isDragging && isSelected ? 'grabbing' : 'grab' }}
              >
                {/* Thick invisible click boundary for effortless line moving */}
                <line
                  x1={el.x}
                  y1={el.y}
                  x2={el.x2}
                  y2={el.y2}
                  stroke="transparent"
                  strokeWidth={20}
                  data-element-id={el.id}
                  className="cursor-move"
                />
                {/* Selection outline */}
                {isSelected && (
                  <line
                    x1={el.x}
                    y1={el.y}
                    x2={el.x2}
                    y2={el.y2}
                    stroke="#2563eb"
                    strokeWidth={el.strokeWidth + 5}
                    strokeOpacity={0.35}
                    strokeLinecap="round"
                  />
                )}
                {/* Visible Line */}
                <line
                  x1={el.x}
                  y1={el.y}
                  x2={el.x2}
                  y2={el.y2}
                  stroke={el.strokeColor}
                  strokeWidth={el.strokeWidth}
                  data-element-id={el.id}
                  strokeLinecap="round"
                  className="cursor-move"
                />

                {/* Direct On-Canvas Editable Length Badge right on the line */}
                <foreignObject
                  x={midX - 52}
                  y={midY - 14}
                  width={104}
                  height={28}
                  className="overflow-visible pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-center w-full h-full">
                    <div
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded shadow-sm border transition-all ${
                        isSelected || editingLineId === el.id
                          ? 'bg-white border-blue-600 ring-2 ring-blue-500/25'
                          : 'bg-white/95 hover:bg-white border-slate-300 hover:border-blue-400'
                      }`}
                    >
                      <input
                        type="text"
                        value={
                          editingLineId === el.id
                            ? editingLineText
                            : (el.label || `${displayMeters}M`)
                        }
                        onFocus={() => {
                          setSelectedElementId(el.id);
                          setEditingLineId(el.id);
                          setEditingLineText(`${displayMeters}`);
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingLineId(el.id);
                          setEditingLineText(val);
                          const parsed = parseFloat(val);
                          if (!isNaN(parsed) && parsed > 0 && parsed <= 500) {
                            handleDirectLineLengthChange(el.id, parsed, el.soilType);
                          }
                        }}
                        onBlur={() => {
                          if (editingLineId === el.id) {
                            handleCommitLineLength(el.id, editingLineText, el.soilType);
                            setEditingLineId(null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCommitLineLength(el.id, editingLineText, el.soilType);
                            setEditingLineId(null);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-12 text-center font-bold font-mono text-[11px] text-blue-900 bg-transparent border-0 outline-none p-0 select-text"
                        placeholder="الطول"
                        title="اكتب طول الخط بالمتر مباشرة هنا (مثال: 15 أو 10M AS)"
                      />
                      <span className="text-[10px] font-bold text-slate-600 font-mono select-none">
                        م
                      </span>
                      {el.soilType && (
                        <span className="text-[9px] font-black px-1 rounded bg-slate-800 text-white font-mono select-none">
                          {el.soilType}
                        </span>
                      )}
                    </div>
                  </div>
                </foreignObject>

                {/* Interactive AutoCAD Grips for stretching / lengthening */}
                {isSelected && (
                  <>
                    {/* Grip 1: Start Point (x, y) */}
                    <g className="cursor-crosshair">
                      <circle
                        cx={el.x}
                        cy={el.y}
                        r={13}
                        fill="transparent"
                        data-grip-type="start"
                        data-grip-element-id={el.id}
                      />
                      <rect
                        x={el.x - 5}
                        y={el.y - 5}
                        width={10}
                        height={10}
                        rx={2}
                        fill="#2563eb"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        className="pointer-events-none"
                      />
                    </g>

                    {/* Grip 2: End Point (x2, y2) */}
                    <g className="cursor-crosshair">
                      <circle
                        cx={el.x2}
                        cy={el.y2}
                        r={13}
                        fill="transparent"
                        data-grip-type="end"
                        data-grip-element-id={el.id}
                      />
                      <rect
                        x={el.x2 - 5}
                        y={el.y2 - 5}
                        width={10}
                        height={10}
                        rx={2}
                        fill="#2563eb"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        className="pointer-events-none"
                      />
                    </g>

                    {/* Midpoint handle for moving line */}
                    <g className="cursor-move">
                      <circle
                        cx={midX}
                        cy={midY}
                        r={16}
                        fill="transparent"
                        data-element-id={el.id}
                      />
                    </g>
                  </>
                )}
              </g>
            );
          }

          // Dimension Line with Arrows
          if (
            el.type === 'dimension' &&
            el.x2 !== undefined &&
            el.y2 !== undefined
          ) {
            const midX = (el.x + el.x2) / 2;
            const midY = (el.y + el.y2) / 2;
            const lengthInfo = getLineLengthInfo(el);
            const displayMeters = lengthInfo ? lengthInfo.lengthMeters : 0;

            return (
              <g
                key={el.id}
                data-element-id={el.id}
                className="cursor-move"
                style={{ cursor: isDragging && isSelected ? 'grabbing' : 'grab' }}
              >
                {/* Thick invisible click boundary for moving dimension */}
                <line
                  x1={el.x}
                  y1={el.y}
                  x2={el.x2}
                  y2={el.y2}
                  stroke="transparent"
                  strokeWidth={20}
                  data-element-id={el.id}
                  className="cursor-move"
                />
                <line
                  x1={el.x}
                  y1={el.y}
                  x2={el.x2}
                  y2={el.y2}
                  stroke={el.strokeColor}
                  strokeWidth={el.strokeWidth}
                  markerStart="url(#arrow-start)"
                  markerEnd="url(#arrow-end)"
                  data-element-id={el.id}
                  className="cursor-move"
                />

                {/* Direct On-Canvas Editable Length Badge right on the dimension line */}
                <foreignObject
                  x={midX - 45}
                  y={midY - 12}
                  width={90}
                  height={24}
                  className="overflow-visible pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-center w-full h-full">
                    <div
                      className={`flex items-center gap-0.5 px-1 py-0.5 rounded shadow-xs border transition-all ${
                        isSelected || editingLineId === el.id
                          ? 'bg-white border-red-600 ring-2 ring-red-500/20'
                          : 'bg-white/95 hover:bg-white border-red-300'
                      }`}
                    >
                      <input
                        type="text"
                        value={
                          editingLineId === el.id
                            ? editingLineText
                            : (el.label || `${displayMeters}M`)
                        }
                        onFocus={() => {
                          setSelectedElementId(el.id);
                          setEditingLineId(el.id);
                          setEditingLineText(`${displayMeters}`);
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingLineId(el.id);
                          setEditingLineText(val);
                          const parsed = parseFloat(val);
                          if (!isNaN(parsed) && parsed > 0 && parsed <= 500) {
                            handleDirectLineLengthChange(el.id, parsed);
                          }
                        }}
                        onBlur={() => {
                          if (editingLineId === el.id) {
                            handleCommitLineLength(el.id, editingLineText);
                            setEditingLineId(null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCommitLineLength(el.id, editingLineText);
                            setEditingLineId(null);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-10 text-center font-bold font-mono text-[11px] text-red-600 bg-transparent border-0 outline-none p-0 select-text"
                        placeholder="البعد"
                        title="اكتب البعد بالمتر مباشرة هنا"
                      />
                      <span className="text-[10px] font-bold text-red-500 font-mono select-none">
                        م
                      </span>
                    </div>
                  </div>
                </foreignObject>

                {/* Interactive Dimension Grips */}
                {isSelected && (
                  <>
                    <g className="cursor-crosshair">
                      <circle
                        cx={el.x}
                        cy={el.y}
                        r={13}
                        fill="transparent"
                        data-grip-type="start"
                        data-grip-element-id={el.id}
                      />
                      <rect
                        x={el.x - 5}
                        y={el.y - 5}
                        width={10}
                        height={10}
                        rx={2}
                        fill="#dc2626"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        className="pointer-events-none"
                      />
                    </g>
                    <g className="cursor-crosshair">
                      <circle
                        cx={el.x2}
                        cy={el.y2}
                        r={13}
                        fill="transparent"
                        data-grip-type="end"
                        data-grip-element-id={el.id}
                      />
                      <rect
                        x={el.x2 - 5}
                        y={el.y2 - 5}
                        width={10}
                        height={10}
                        rx={2}
                        fill="#dc2626"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        className="pointer-events-none"
                      />
                    </g>

                    {/* Midpoint handle for moving dimension */}
                    <g className="cursor-move">
                      <circle
                        cx={midX}
                        cy={midY}
                        r={16}
                        fill="transparent"
                        data-element-id={el.id}
                      />
                    </g>
                  </>
                )}
              </g>
            );
          }

          // Rectangles
          if (el.type === 'rect') {
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
              >
                {isSelected && (
                  <rect
                    x={el.x - 3}
                    y={el.y - 3}
                    width={(el.width || 40) + 6}
                    height={(el.height || 40) + 6}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                )}
                <rect
                  x={el.x}
                  y={el.y}
                  width={el.width || 40}
                  height={el.height || 40}
                  stroke={el.strokeColor}
                  strokeWidth={el.strokeWidth}
                  fill={el.fillColor || 'transparent'}
                  data-element-id={el.id}
                />
              </g>
            );
          }

          // Circles
          if (el.type === 'circle') {
            const r = (el.width || 40) / 2;
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
              >
                {isSelected && (
                  <circle
                    cx={el.x}
                    cy={el.y}
                    r={r + 3}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                )}
                <circle
                  cx={el.x}
                  cy={el.y}
                  r={r}
                  stroke={el.strokeColor}
                  strokeWidth={el.strokeWidth}
                  fill={el.fillColor || 'transparent'}
                  data-element-id={el.id}
                />
              </g>
            );
          }

          // SP Symbol (Service Point matching exactly IMG_5554 and IMG_5555)
          if (el.symbolKind === 'sp') {
            const r = 9;
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
                className="cursor-pointer"
              >
                {/* SP Label in Cyan/Teal */}
                <text
                  x={el.x}
                  y={el.labelPosition === 'bottom' ? el.y + 22 : el.y - 14}
                  textAnchor="middle"
                  className="font-black text-[13px] fill-[#00a2b8] select-none font-mono tracking-wider"
                  data-element-id={el.id}
                >
                  SP
                </text>
                {/* Outer dark blue border */}
                <circle
                  cx={el.x}
                  cy={el.y}
                  r={r}
                  fill="url(#spGlow)"
                  stroke="#0022cc"
                  strokeWidth={2}
                  data-element-id={el.id}
                />
                {/* Inner shine */}
                <circle
                  cx={el.x - 2}
                  cy={el.y - 2}
                  r={3}
                  fill="#ffffff"
                  fillOpacity={0.6}
                />
                {isSelected && (
                  <circle
                    cx={el.x}
                    cy={el.y}
                    r={r + 4}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          }

          // Substation Symbol (المحطة: صندوق بخطين عكسيين متقاطعين ⤫)
          if (el.symbolKind === 'substation') {
            const w = el.width || 44;
            const h = el.height || 24;
            const halfW = w / 2;
            const halfH = h / 2;
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
                className="cursor-pointer"
              >
                {/* Station Box with Two Reverse Diagonal Lines Inside (⤫) */}
                <g transform={`translate(${el.x - halfW}, ${el.y - halfH})`}>
                  <rect
                    width={w}
                    height={h}
                    fill="#fef08a"
                    stroke="#000000"
                    strokeWidth={1.8}
                    data-element-id={el.id}
                  />
                  {/* Reverse diagonal line 1 (top-left to bottom-right) */}
                  <line
                    x1={0}
                    y1={0}
                    x2={w}
                    y2={h}
                    stroke="#000000"
                    strokeWidth={1.5}
                    data-element-id={el.id}
                  />
                  {/* Reverse diagonal line 2 (top-right to bottom-left) */}
                  <line
                    x1={w}
                    y1={0}
                    x2={0}
                    y2={h}
                    stroke="#000000"
                    strokeWidth={1.5}
                    data-element-id={el.id}
                  />
                </g>
                {/* Station Code label underneath like C973018/5 */}
                {el.label && (
                  <text
                    x={el.x}
                    y={el.y + halfH + 16}
                    textAnchor="middle"
                    className="font-bold text-[13px] fill-black select-none font-mono"
                    data-element-id={el.id}
                  >
                    {el.label}
                  </text>
                )}
                {isSelected && (
                  <rect
                    x={el.x - halfW - 3}
                    y={el.y - halfH - 3}
                    width={w + 6}
                    height={h + 24}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          }

          // Cabinet Symbol (الكبينة: كابينة توزيع بنصفين مثلثين أصفر وأزرق)
          if (el.symbolKind === 'cabinet' || el.symbolKind === 'substation_cross') {
            const w = el.width || 44;
            const h = el.height || 24;
            const halfW = w / 2;
            const halfH = h / 2;
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
                className="cursor-pointer"
              >
                {/* Cabinet Box: split diagonally blue and yellow */}
                <g transform={`translate(${el.x - halfW}, ${el.y - halfH})`}>
                  {/* Outer border & yellow base */}
                  <rect
                    width={w}
                    height={h}
                    fill="#facc15"
                    stroke="#000000"
                    strokeWidth={1.5}
                    data-element-id={el.id}
                  />
                  {/* Dark Blue Triangle Half */}
                  <polygon
                    points={`0,0 ${w},0 0,${h}`}
                    fill="#0022cc"
                    data-element-id={el.id}
                  />
                  {/* Diagonal dividing line */}
                  <line
                    x1={0}
                    y1={h}
                    x2={w}
                    y2={0}
                    stroke="#000000"
                    strokeWidth={1}
                  />
                </g>
                {/* Cabinet Code label underneath like C973018/5 */}
                {el.label && (
                  <text
                    x={el.x}
                    y={el.y + halfH + 16}
                    textAnchor="middle"
                    className="font-bold text-[13px] fill-black select-none font-mono"
                    data-element-id={el.id}
                  >
                    {el.label}
                  </text>
                )}
                {isSelected && (
                  <rect
                    x={el.x - halfW - 3}
                    y={el.y - halfH - 3}
                    width={w + 6}
                    height={h + 24}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          }

          // Joint Symbol
          if (el.symbolKind === 'joint') {
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
                className="cursor-pointer"
              >
                <circle
                  cx={el.x}
                  cy={el.y}
                  r={7}
                  fill="#dc2626"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  data-element-id={el.id}
                />
                <line
                  x1={el.x - 10}
                  y1={el.y}
                  x2={el.x + 10}
                  y2={el.y}
                  stroke="#dc2626"
                  strokeWidth={2}
                />
                <line
                  x1={el.x}
                  y1={el.y - 10}
                  x2={el.x}
                  y2={el.y + 10}
                  stroke="#dc2626"
                  strokeWidth={2}
                />
                {el.label && (
                  <text
                    x={el.x}
                    y={el.y + 18}
                    textAnchor="middle"
                    className="font-bold text-[10px] fill-red-700"
                  >
                    {el.label}
                  </text>
                )}
              </g>
            );
          }

          // North Arrow
          if (el.symbolKind === 'north_arrow') {
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
                className="cursor-pointer"
              >
                <polygon
                  points={`${el.x},${el.y - 25} ${el.x - 8},${el.y + 10} ${el.x},${el.y + 5}`}
                  fill="#000000"
                  data-element-id={el.id}
                />
                <polygon
                  points={`${el.x},${el.y - 25} ${el.x + 8},${el.y + 10} ${el.x},${el.y + 5}`}
                  fill="#ffffff"
                  stroke="#000000"
                  strokeWidth={1}
                  data-element-id={el.id}
                />
                <circle
                  cx={el.x}
                  cy={el.y}
                  r={18}
                  fill="none"
                  stroke="#000000"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                />
                <text
                  x={el.x}
                  y={el.y - 28}
                  textAnchor="middle"
                  className="font-black text-[12px] fill-black"
                >
                  N
                </text>
              </g>
            );
          }

          // Custom Symbols pinned to toolbar
          if (el.type === 'custom_symbol') {
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
                className="cursor-pointer"
              >
                <rect
                  x={el.x - 14}
                  y={el.y - 14}
                  width={28}
                  height={28}
                  rx={4}
                  fill={el.fillColor || '#0284c7'}
                  stroke="#ffffff"
                  strokeWidth={2}
                  data-element-id={el.id}
                />
                <text
                  x={el.x}
                  y={el.y + 4}
                  textAnchor="middle"
                  className="font-bold text-[10px] fill-white select-none pointer-events-none"
                >
                  {el.label?.slice(0, 3) || 'SYM'}
                </text>
                <text
                  x={el.x}
                  y={el.y + 24}
                  textAnchor="middle"
                  className="font-semibold text-[10px] fill-gray-800"
                >
                  {el.label || el.text}
                </text>
              </g>
            );
          }

          // Text Element (نص حر)
          if (el.type === 'text') {
            const isEditing = editingLabelId === el.id;
            const content = el.text || el.label || 'نص توضيحي';
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
                className="cursor-pointer"
              >
                {isSelected && !isEditing && (
                  <>
                    <rect
                      x={el.x - 4}
                      y={el.y - (el.fontSize || 13)}
                      width={(content.length || 5) * 8 + 12}
                      height={(el.fontSize || 13) + 8}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                    {/* Floating Quick Action Pill above text */}
                    <foreignObject
                      x={el.x - 4}
                      y={Math.max(0, el.y - (el.fontSize || 13) - 32)}
                      width={180}
                      height={28}
                      className="overflow-visible pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1 bg-slate-900/90 text-white rounded-md px-1.5 py-0.5 shadow-lg text-[10px] font-bold border border-slate-700 w-max">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLabelId(el.id);
                            setTempLabelText(el.text || el.label || '');
                          }}
                          className="flex items-center gap-1 hover:text-amber-400 px-1 py-0.5 rounded text-amber-300"
                          title="تعديل النص"
                        >
                          <span>✍️ تعديل</span>
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newSize = Math.min(26, (el.fontSize || 13) + 1);
                            const updated = elements.map((item) =>
                              item.id === el.id ? { ...item, fontSize: newSize } : item
                            );
                            setElements(updated);
                            onElementsChange?.(updated);
                          }}
                          className="hover:text-amber-400 px-1 py-0.5 rounded font-mono"
                          title="تكبير الخط"
                        >
                          A+
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const newSize = Math.max(9, (el.fontSize || 13) - 1);
                            const updated = elements.map((item) =>
                              item.id === el.id ? { ...item, fontSize: newSize } : item
                            );
                            setElements(updated);
                            onElementsChange?.(updated);
                          }}
                          className="hover:text-amber-400 px-1 py-0.5 rounded font-mono"
                          title="تصغير الخط"
                        >
                          A-
                        </button>
                      </div>
                    </foreignObject>
                  </>
                )}

                {isEditing ? (
                  <foreignObject
                    x={el.x - 4}
                    y={el.y - 20}
                    width={220}
                    height={38}
                    className="overflow-visible pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1 bg-white border-2 border-blue-600 rounded-lg p-1 shadow-2xl ring-2 ring-blue-400/30">
                      <input
                        type="text"
                        autoFocus
                        value={tempLabelText}
                        onChange={(e) => setTempLabelText(e.target.value)}
                        onBlur={() => handleSaveLabel(el.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveLabel(el.id);
                          if (e.key === 'Escape') setEditingLabelId(null);
                        }}
                        className="flex-1 bg-transparent border-0 outline-none px-1 text-xs font-bold font-['Cairo',sans-serif] text-slate-900"
                        placeholder="اكتب النص المطلوب هنا..."
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveLabel(el.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded px-2 py-0.5 text-[11px] font-bold cursor-pointer"
                      >
                        حفظ
                      </button>
                    </div>
                  </foreignObject>
                ) : (
                  <text
                    x={el.x}
                    y={el.y}
                    fontSize={el.fontSize || 13}
                    fontFamily="Cairo, sans-serif"
                    fontWeight="bold"
                    fill={el.strokeColor || '#0f172a'}
                    className="select-none"
                    data-element-id={el.id}
                  >
                    {content}
                  </text>
                )}
              </g>
            );
          }

          // Textbox Element (مربع نصي محدد مع إمكانية كتابة نص وتحريك وتغيير حجم)
          if (el.type === 'textbox') {
            const w = el.width || 160;
            const h = el.height || 56;
            const isEditing = editingLabelId === el.id;
            const content = el.text || el.label || 'ملاحظة مساحية';

            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => {
                  setEditingLabelId(el.id);
                  setTempLabelText(el.text || el.label || '');
                }}
                className="cursor-pointer"
              >
                {/* Border Box with fill */}
                <rect
                  x={el.x}
                  y={el.y}
                  width={w}
                  height={h}
                  rx={4}
                  fill={el.fillColor || '#ffffff'}
                  stroke={isSelected ? '#3b82f6' : (el.strokeColor || '#ea7c15')}
                  strokeWidth={isSelected ? 2.5 : (el.strokeWidth || 1.5)}
                  strokeDasharray={isSelected ? '4 2' : 'none'}
                  data-element-id={el.id}
                  className="shadow-sm"
                />

                {/* Pure SVG Text with multi-line support so it ALWAYS appears in PDF, PNG, and Print! */}
                {!isEditing && (() => {
                  const lines = content.split('\n');
                  const fontSize = el.fontSize || 12;
                  const lineHeight = fontSize * 1.35;
                  const totalH = lines.length * lineHeight;
                  const startY = el.y + Math.max(fontSize + 3, (h - totalH) / 2 + fontSize * 0.9);

                  return (
                    <text
                      x={el.x + w / 2}
                      y={startY}
                      textAnchor="middle"
                      fontSize={fontSize}
                      fontFamily="Cairo, sans-serif"
                      fontWeight="bold"
                      fill={el.strokeColor && el.strokeColor !== '#ffffff' && el.strokeColor !== '#ea7c15' ? el.strokeColor : '#1e293b'}
                      data-element-id={el.id}
                      className="select-none pointer-events-none"
                    >
                      {lines.map((lineText, idx) => (
                        <tspan
                          key={idx}
                          x={el.x + w / 2}
                          dy={idx === 0 ? 0 : lineHeight}
                          data-element-id={el.id}
                        >
                          {lineText}
                        </tspan>
                      ))}
                    </text>
                  );
                })()}

                {/* Floating Quick Action Pill when selected and not editing */}
                {isSelected && !isEditing && (
                  <foreignObject
                    x={el.x}
                    y={Math.max(0, el.y - 32)}
                    width={240}
                    height={30}
                    className="overflow-visible pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5 bg-slate-900/95 text-white rounded-lg px-2 py-1 shadow-2xl text-[11px] font-bold border border-slate-700 w-max">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLabelId(el.id);
                          setTempLabelText(el.text || el.label || '');
                        }}
                        className="flex items-center gap-1 hover:text-orange-400 px-1 py-0.5 rounded transition-colors text-orange-300"
                        title="كتابة وتعديل النص المطلوب"
                      >
                        <span>✍️ تعديل النص</span>
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newSize = Math.min(26, (el.fontSize || 12) + 1);
                          const updated = elements.map((item) =>
                            item.id === el.id ? { ...item, fontSize: newSize } : item
                          );
                          setElements(updated);
                          onElementsChange?.(updated);
                        }}
                        className="hover:text-amber-400 px-1 py-0.5 rounded font-mono"
                        title="تكبير الخط"
                      >
                        A+
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newSize = Math.max(9, (el.fontSize || 12) - 1);
                          const updated = elements.map((item) =>
                            item.id === el.id ? { ...item, fontSize: newSize } : item
                          );
                          setElements(updated);
                          onElementsChange?.(updated);
                        }}
                        className="hover:text-amber-400 px-1 py-0.5 rounded font-mono"
                        title="تصغير الخط"
                      >
                        A-
                      </button>
                    </div>
                  </foreignObject>
                )}

                {/* Interactive In-Place Editor when editing */}
                {isEditing && (
                  <foreignObject
                    x={el.x - 2}
                    y={el.y - 2}
                    width={Math.max(180, w + 16)}
                    height={Math.max(120, h + 60)}
                    className="overflow-visible pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div
                      className="bg-white border-2 border-orange-500 rounded-lg p-2.5 shadow-2xl flex flex-col gap-1.5 ring-4 ring-orange-500/25"
                      style={{ width: `${Math.max(180, w + 10)}px` }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold text-orange-600 border-b border-orange-100 pb-1">
                        <span>مربع نصي - كتابة وتعديل النص</span>
                        <span className="text-[10px] text-slate-400">Ctrl+Enter للحفظ</span>
                      </div>
                      <textarea
                        autoFocus
                        rows={3}
                        value={tempLabelText}
                        onChange={(e) => setTempLabelText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleSaveLabel(el.id);
                          } else if (e.key === 'Escape') {
                            setEditingLabelId(null);
                          }
                        }}
                        className="w-full text-xs font-bold text-slate-900 bg-orange-50/50 border border-orange-200 rounded p-1.5 outline-none focus:ring-2 focus:ring-orange-400 select-text resize-none font-['Cairo',sans-serif]"
                        placeholder="اكتب النص المطلوب ظهوره على الصفحة..."
                      />
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleSaveLabel(el.id)}
                          className="flex-1 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold py-1.5 px-2 rounded-md text-xs flex items-center justify-center gap-1 shadow-sm transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>تأكيد وحفظ النص</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingLabelId(null)}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-1.5 px-2 rounded-md text-xs transition-colors cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  </foreignObject>
                )}

                {/* Resize Grip at Bottom-Right */}
                {isSelected && !isEditing && (
                  <g className="cursor-se-resize">
                    <title>سحب لتغيير حجم المربع النصي</title>
                    <circle
                      cx={el.x + w}
                      cy={el.y + h}
                      r={7}
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      data-grip-type="resize-textbox"
                      data-grip-element-id={el.id}
                    />
                  </g>
                )}
              </g>
            );
          }

          // Image / Signature / Stamp
          if (
            (el.type === 'image' ||
              el.type === 'signature' ||
              el.type === 'stamp') &&
            el.imageUrl
          ) {
            return (
              <g
                key={el.id}
                data-element-id={el.id}
                onDoubleClick={() => handleDoubleClick(el)}
                className="cursor-pointer"
              >
                {isSelected && (
                  <rect
                    x={el.x - 2}
                    y={el.y - 2}
                    width={(el.width || 120) + 4}
                    height={(el.height || 60) + 4}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                )}
                <image
                  href={el.imageUrl}
                  x={el.x}
                  y={el.y}
                  width={el.width || 120}
                  height={el.height || 60}
                  preserveAspectRatio="xMidYMid meet"
                  data-element-id={el.id}
                />
              </g>
            );
          }

          return null;
        })}

        {/* Live Drawing Preview */}
        {drawingStart && currentMouse && (
          <g>
            {(activeTool === 'line' ||
              activeTool === 'cable_as' ||
              activeTool === 'cable_ng' ||
              activeTool === 'cable_t') && (
              <>
                <line
                  x1={drawingStart.x}
                  y1={drawingStart.y}
                  x2={currentMouse.x}
                  y2={currentMouse.y}
                  stroke={
                    activeTool === 'cable_ng'
                      ? '#0022cc'
                      : activeTool === 'cable_t'
                      ? '#059669'
                      : '#0022cc'
                  }
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                />
                <circle
                  cx={drawingStart.x}
                  cy={drawingStart.y}
                  r={3}
                  fill="#3b82f6"
                />
                <circle
                  cx={currentMouse.x}
                  cy={currentMouse.y}
                  r={3}
                  fill="#3b82f6"
                />
                <text
                  x={(drawingStart.x + currentMouse.x) / 2}
                  y={(drawingStart.y + currentMouse.y) / 2 - 8}
                  textAnchor="middle"
                  className="font-bold text-[11px] fill-blue-700 bg-white"
                >
                  {(
                    Math.hypot(
                      currentMouse.x - drawingStart.x,
                      currentMouse.y - drawingStart.y
                    ) / PIXELS_PER_METER
                  ).toFixed(2)}
                  M
                </text>
              </>
            )}

            {activeTool === 'rect' && (
              <rect
                x={Math.min(drawingStart.x, currentMouse.x)}
                y={Math.min(drawingStart.y, currentMouse.y)}
                width={Math.abs(currentMouse.x - drawingStart.x)}
                height={Math.abs(currentMouse.y - drawingStart.y)}
                fill="#3b82f6"
                fillOpacity={0.1}
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            )}

            {activeTool === 'circle' && (
              <circle
                cx={drawingStart.x}
                cy={drawingStart.y}
                r={Math.hypot(
                  currentMouse.x - drawingStart.x,
                  currentMouse.y - drawingStart.y
                )}
                fill="#3b82f6"
                fillOpacity={0.1}
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            )}

            {activeTool === 'dimension' && (
              <line
                x1={drawingStart.x}
                y1={drawingStart.y}
                x2={currentMouse.x}
                y2={currentMouse.y}
                stroke="#dc2626"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            )}
          </g>
        )}

        {/* Live stretching dimension tooltip badge */}
        {liveGripCoord && liveGripLength !== null && (
          <g
            transform={`translate(${liveGripCoord.x}, ${liveGripCoord.y - 18})`}
            className="pointer-events-none select-none"
          >
            <rect
              x={-44}
              y={-14}
              width={88}
              height={24}
              rx={6}
              fill="#0f172a"
              fillOpacity={0.94}
              stroke="#3b82f6"
              strokeWidth={1.5}
            />
            <text
              x={0}
              y={2}
              textAnchor="middle"
              fill="#ffffff"
              className="font-mono font-black text-[12px] tracking-wide"
            >
              📏 {liveGripLength.toFixed(2)} م
            </text>
          </g>
        )}
      </svg>

    </div>
  );
};
