import React from 'react';
import { CanvasElement, SoilType } from '../types';
import {
  getLineLengthInfo,
} from '../utils/lineLengthUtils';
import {
  X,
  Sliders,
  Ruler,
  Sparkles,
  Trash2,
  Check,
  Type,
  Palette,
} from 'lucide-react';

interface ElementPropertiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  element: CanvasElement | null;
  elements: CanvasElement[];
  onElementsChange: (elements: CanvasElement[]) => void;
  onResizeLine: (lineId: string, targetMeters: number) => void;
  onDeleteElement: (id: string) => void;
  onAutoCalculateLengths?: () => void;
  inspectorAnchor: 'start' | 'end' | 'center';
  setInspectorAnchor: (anchor: 'start' | 'end' | 'center') => void;
  moveConnectedSymbols: boolean;
  setMoveConnectedSymbols: (val: boolean | ((prev: boolean) => boolean)) => void;
  autoSyncWorkOrder: boolean;
  setAutoSyncWorkOrder: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const ElementPropertiesModal: React.FC<ElementPropertiesModalProps> = ({
  isOpen,
  onClose,
  element,
  elements,
  onElementsChange,
  onResizeLine,
  onDeleteElement,
  onAutoCalculateLengths,
  inspectorAnchor,
  setInspectorAnchor,
  moveConnectedSymbols,
  setMoveConnectedSymbols,
  autoSyncWorkOrder,
  setAutoSyncWorkOrder,
}) => {
  if (!isOpen || !element) return null;

  const lengthInfo = getLineLengthInfo(element);
  const currentMeters = lengthInfo ? lengthInfo.lengthMeters : 0;

  const getElementTypeName = (el: CanvasElement) => {
    switch (el.type) {
      case 'line':
        if (el.soilType === 'AS') return 'كيبل أسفلت {AS}';
        if (el.soilType === 'NG') return 'كيبل ترابي {NG}';
        if (el.soilType === 'T') return 'كيبل بلاط {T}';
        return 'خط مستقيم / مسار شارع';
      case 'dimension':
        return 'قياس مسافة وبُعد';
      case 'symbol':
        if (el.symbolKind === 'substation') return 'محطة تحويل بخطين عكسيين ⤫';
        if (el.symbolKind === 'cabinet') return 'كابينة توزيع C مثلثية';
        if (el.symbolKind === 'sp') return 'نقطة خدمة SP';
        if (el.symbolKind === 'joint') return 'مفصل لحام كيبل';
        if (el.symbolKind === 'north_arrow') return 'سهم الشمال N';
        return `رمز مساحي (${el.symbolKind || 'رمز'})`;
      case 'textbox':
        return 'مربع نصي (Text Box)';
      case 'text':
        return 'نص حر';
      case 'rect':
        return 'مستطيل / غرفة';
      case 'circle':
        return 'دائرة / منهل';
      default:
        return el.type;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 overflow-y-auto font-['Cairo',sans-serif] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-800 my-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>خصائص العنصر المحدد</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                {getElementTypeName(element)}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="إغلاق (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {/* Line Length & Elongation Controls */}
          {(element.type === 'line' || element.type === 'dimension') &&
            element.x2 !== undefined &&
            element.y2 !== undefined && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200 rounded-xl p-3.5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                  <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                    <Ruler className="w-4 h-4 text-blue-600" />
                    <span>التحكم في طول الخط والمترات</span>
                  </div>
                  <span className="font-mono font-black text-blue-800 bg-white px-2.5 py-0.5 rounded-full border border-blue-300 text-xs shadow-xs">
                    {currentMeters} م
                  </span>
                </div>

                {/* Quick Increase Steppers */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    تعديل سريع لطول الخط:
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onResizeLine(element.id, currentMeters + 0.5)}
                      className="px-1 py-1.5 bg-white hover:bg-blue-600 hover:text-white border border-blue-300 text-blue-700 rounded-lg font-bold text-xs transition-colors shadow-2xs"
                      title="زيادة نصف متر"
                    >
                      +0.5م
                    </button>
                    <button
                      type="button"
                      onClick={() => onResizeLine(element.id, currentMeters + 1.0)}
                      className="px-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs transition-colors shadow-2xs"
                      title="زيادة متر واحد"
                    >
                      +1.0م
                    </button>
                    <button
                      type="button"
                      onClick={() => onResizeLine(element.id, currentMeters + 2.0)}
                      className="px-1 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-bold text-xs transition-colors shadow-2xs"
                      title="زيادة مترين"
                    >
                      +2.0م
                    </button>
                    <button
                      type="button"
                      onClick={() => onResizeLine(element.id, currentMeters + 5.0)}
                      className="px-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs transition-colors shadow-2xs"
                      title="زيادة 5 أمتار"
                    >
                      +5.0م
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => onResizeLine(element.id, Math.max(0.5, currentMeters - 1.0))}
                      className="px-2 py-1.5 bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg font-bold text-xs transition-colors"
                      title="إنقاص متر"
                    >
                      - 1.0م (إنقاص)
                    </button>
                    <button
                      type="button"
                      onClick={() => onResizeLine(element.id, Math.max(0.5, currentMeters - 5.0))}
                      className="px-2 py-1.5 bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg font-bold text-xs transition-colors"
                      title="إنقاص 5 أمتار"
                    >
                      - 5.0م (إنقاص)
                    </button>
                  </div>
                </div>

                {/* Direct Custom Length Input */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    تحديد الطول الإجمالي يدوياً:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={currentMeters}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          onResizeLine(element.id, val);
                        }
                      }}
                      className="w-full bg-white border border-blue-300 rounded-lg px-3 py-1.5 font-mono font-bold text-xs text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    <span className="font-bold text-blue-900 text-xs">متر</span>
                  </div>
                </div>

                {/* Extension Direction / Anchor */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-1">
                    جهة التمديد والزيادة:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setInspectorAnchor('start')}
                      className={`py-1.5 px-1 rounded-lg font-bold transition-all ${
                        inspectorAnchor === 'start'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                      title="تثبيت البداية وتمديد الطرف الآخر"
                    >
                      من النهاية ◀
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectorAnchor('end')}
                      className={`py-1.5 px-1 rounded-lg font-bold transition-all ${
                        inspectorAnchor === 'end'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                      title="تثبيت النهاية وتمديد البداية للخلف"
                    >
                      من البداية ▶
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectorAnchor('center')}
                      className={`py-1.5 px-1 rounded-lg font-bold transition-all ${
                        inspectorAnchor === 'center'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                      title="تمديد متساوي من الطرفين"
                    >
                      من الطرفين
                    </button>
                  </div>
                </div>

                {/* Connected symbols option */}
                <div className="space-y-1.5 pt-2 text-[11px] text-slate-600 border-t border-blue-200/60">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={moveConnectedSymbols}
                      onChange={(e) => setMoveConnectedSymbols(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 accent-blue-600"
                    />
                    <span>تحريك النقطة المتصلة بالخط تلقائياً (SP / المحطة)</span>
                  </label>
                  <p className="text-[10px] text-slate-500 pt-0.5">
                    ملاحظة: أطوال الحفرية والأسفلت والترابية والبلاط في الجدول بالأعلى تحرر يدوياً ومستقلة تماماً عن طول الكابل.
                  </p>
                </div>
              </div>
            )}

          {/* Label / Dimension Text */}
          {(element.label !== undefined ||
            element.type === 'line' ||
            element.type === 'dimension' ||
            element.type === 'symbol') && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                نص القياس / التسمية التوضيحية
              </label>
              <input
                type="text"
                value={element.label || ''}
                onChange={(e) => {
                  const updated = elements.map((item) =>
                    item.id === element.id ? { ...item, label: e.target.value } : item
                  );
                  onElementsChange(updated);
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 font-bold font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                placeholder="مثال: AS 6.00M أو NG15.0M أو محطة 973018"
              />
            </div>
          )}

          {/* Textbox / Text content */}
          {(element.type === 'textbox' || element.type === 'text') && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Type className="w-3.5 h-3.5 text-indigo-500" />
                <span>محتوى النص والملاحظات</span>
              </label>
              <textarea
                rows={3}
                value={element.text || ''}
                onChange={(e) => {
                  const updated = elements.map((item) =>
                    item.id === element.id ? { ...item, text: e.target.value } : item
                  );
                  onElementsChange(updated);
                }}
                className="w-full border border-slate-300 rounded-lg p-2.5 font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                placeholder="اكتب الملاحظات أو التفاصيل المساحية هنا..."
              />
            </div>
          )}

          {/* Soil Type Selector */}
          {element.soilType && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                نوع التربة والمسار
              </label>
              <select
                value={element.soilType}
                onChange={(e) => {
                  const soil = e.target.value as SoilType;
                  const updated = elements.map((item) =>
                    item.id === element.id
                      ? {
                          ...item,
                          soilType: soil,
                          strokeColor:
                            soil === 'T' ? '#059669' : soil === 'NG' ? '#0022cc' : '#0022cc',
                        }
                      : item
                  );
                  onElementsChange(updated);
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold"
              >
                <option value="AS">أسفلت (AS)</option>
                <option value="NG">ترابي (NG)</option>
                <option value="T">بلاط (T)</option>
                <option value="NONE">بدون تصنيف</option>
              </select>
            </div>
          )}

          {/* Stroke Width & Color */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                سماكة الخط ({element.strokeWidth}px)
              </label>
              <input
                type="range"
                min="1"
                max="8"
                step="0.5"
                value={element.strokeWidth}
                onChange={(e) => {
                  const w = parseFloat(e.target.value);
                  const updated = elements.map((item) =>
                    item.id === element.id ? { ...item, strokeWidth: w } : item
                  );
                  onElementsChange(updated);
                }}
                className="w-full accent-blue-600 mt-2"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Palette className="w-3.5 h-3.5 text-slate-500" />
                <span>اللون</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={element.strokeColor || '#000000'}
                  onChange={(e) => {
                    const c = e.target.value;
                    const updated = elements.map((item) =>
                      item.id === element.id ? { ...item, strokeColor: c } : item
                    );
                    onElementsChange(updated);
                  }}
                  className="w-8 h-8 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                />
                <span className="font-mono text-slate-600 text-xs">
                  {element.strokeColor}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              onDeleteElement(element.id);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>حذف العنصر</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-md active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>حفظ وإغلاق</span>
          </button>
        </div>
      </div>
    </div>
  );
};
