export type SoilType = 'AS' | 'NG' | 'T' | 'NONE';

export interface WorkOrderData {
  id: string;
  orderNumber: string; // رقم البلاغ e.g. 39572523
  stationNumber: string; // رقم محطة e.g. 0000 or 973018
  district: string; // المنطقه e.g. الحرازات
  deliveryDate: string; // تاريخ تسليم e.g. 30/5/2026
  tempCable: string; // كيبل مؤقت e.g. 0000
  easting: string; // شرقيات e.g. 0000000
  northing: string; // شماليات e.g. 0000000
  
  // أطوال ونوع التربة
  trenchLengthDisplay: string; // e.g. "10M" or "15M"
  trenchLength: string; // e.g. "10.00 M" or "00 M"
  asphaltLength: string; // اسفلت {AS} e.g. "10.00 M" or "00 M"
  soilLength: string; // ترابية {NG} e.g. "0.00M" or "15.00M"
  tileLength: string; // بلاط {T} e.g. "0.00M"
  
  // اللحامات [500, 300, 70]
  welds: {
    w500: string;
    w300: string;
    w70: string;
  };
  
  // الكيابل [500, 300, 185, 70]
  cables: {
    c500: string;
    c300: string;
    c185: string;
    c70: string;
  };
  
  // محطة
  stationCount: string; // e.g. "00"
  
  // اللقزات [500, 300, 185, 70]
  lugs: {
    l500: string;
    l300: string;
    l185: string;
    l70: string;
  };
  
  // النهايات [500, 300, 185, 70]
  terminations: {
    t500: string;
    t300: string;
    t185: string;
    t70: string;
  };

  // جدول الاعتمادات السفلي
  approvals: {
    contractorRep: { name: string; date: string; signature?: string }; // مندوب المقاول
    secEmployee: { name: string; date: string; signature?: string }; // موظف الكهرباء
    boqReceiver: { name: string; date: string; signature?: string }; // مستلم المقايسة
    dataEntry: { name: string; date: string; signature?: string }; // مدخل البيانات
    itemsReviewer: { name: string; date: string; signature?: string }; // مراجعة البنود
    approval: { name: string; date: string; signature?: string }; // الاعتماد
  };

  // الشعار واسم الشركة
  companyNameAr?: string;
  companyNameEn?: string;
  companyLogoUrl?: string;
  companyCode?: string;
}

export type ElementType = 
  | 'line' 
  | 'polyline' 
  | 'rect' 
  | 'circle' 
  | 'dimension' 
  | 'symbol' 
  | 'text' 
  | 'textbox'
  | 'image' 
  | 'signature'
  | 'stamp'
  | 'custom_symbol';

export type SymbolKind = 
  | 'sp' // Service Point (دائرة خضراء مضيئة)
  | 'substation' // محطة تحويل (بخطين عكسيين متقاطعين ⤫)
  | 'cabinet' // كبينة توزيع (مربع بنصفين مثلثين أصفر وأزرق)
  | 'substation_cross' // alias for substation
  | 'box' // صندوق توزيع
  | 'joint' // مفصل / لحام
  | 'north_arrow' // اتجاه الشمال
  | 'ground' // تأريض
  | 'pole' // عمود
  | 'custom'; // أداة مخصصة

export interface Point {
  x: number;
  y: number;
}

export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  // For lines & dimensions
  x2?: number;
  y2?: number;
  points?: Point[]; // for polyline
  strokeColor: string;
  strokeWidth: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  text?: string;
  fontSize?: number;
  label?: string; // e.g. "AS 6.00M", "NG15.0M", "C973018/5"
  labelPosition?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'parallel';
  soilType?: SoilType;
  symbolKind?: SymbolKind;
  rotation?: number;
  scale?: number;
  imageUrl?: string;
  customToolId?: string;
  isLocked?: boolean;
}

export interface CustomTool {
  id: string;
  name: string;
  symbolKind: SymbolKind;
  iconName: string;
  color: string;
  defaultLabel: string;
  defaultText?: string;
  shapeType: 'sp' | 'substation' | 'cabinet' | 'substation_cross' | 'box' | 'circle' | 'rect' | 'textbox' | 'custom_icon';
  pinned: boolean;
}

export type CadTool = 
  | 'select' 
  | 'line' 
  | 'cable_as' 
  | 'cable_ng' 
  | 'cable_t' 
  | 'rect' 
  | 'circle' 
  | 'dimension' 
  | 'text' 
  | 'textbox'
  | 'sp' 
  | 'substation' 
  | 'cabinet'
  | 'substation_cross' 
  | 'box' 
  | 'joint' 
  | 'north' 
  | 'stamp' 
  | 'signature' 
  | 'image' 
  | string; // or custom tool id
