import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Robust PDF export function that captures the engineering sheet
 * and triggers a reliable file download onto the user's local device.
 */
export const exportToPdf = async (
  elementId: string,
  filename = 'كروكي-مساحي.pdf'
): Promise<boolean> => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return false;
  }

  // Find parent element that might have zoom scaling applied
  const parentWithTransform = element.parentElement;
  let originalTransform = '';
  let originalTransition = '';

  try {
    // Temporarily reset CSS transform on parent to ensure 100% pixel-perfect capture
    if (parentWithTransform) {
      originalTransform = parentWithTransform.style.transform;
      originalTransition = parentWithTransform.style.transition;
      parentWithTransform.style.transition = 'none';
      parentWithTransform.style.transform = 'none';
    }

    // Ensure all web fonts (Cairo, JetBrains Mono) are completely loaded
    if (document.fonts) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Render high-res canvas at scale 2.5 for crisp lines, typography, and stamp/logos
    const canvas = await html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: element.offsetWidth,
      height: element.offsetHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);

    // Standard A4 portrait size: 210mm x 297mm
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

    // Uniform 3.5mm margin around the full engineering frame
    const margin = 3.5;
    const availWidth = pdfWidth - margin * 2;
    const availHeight = pdfHeight - margin * 2;

    const canvasAspect = canvas.width / canvas.height;
    let renderWidth = availWidth;
    let renderHeight = renderWidth / canvasAspect;

    // If height exceeds available height, scale down to fit full page
    if (renderHeight > availHeight) {
      renderHeight = availHeight;
      renderWidth = renderHeight * canvasAspect;
    }

    // Perfectly center the sheet on the page
    const posX = (pdfWidth - renderWidth) / 2;
    const posY = (pdfHeight - renderHeight) / 2;

    pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');

    // Direct Blob download approach to guarantee browser saves file to device
    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    link.target = '_self';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 2000);

    return true;
  } catch (error) {
    console.error('Failed to export PDF:', error);
    // Fallback: trigger standard browser print dialog which allows "Save as PDF"
    window.print();
    return false;
  } finally {
    // Restore parent zoom transform
    if (parentWithTransform) {
      parentWithTransform.style.transform = originalTransform;
      parentWithTransform.style.transition = originalTransition;
    }
  }
};

export const exportToPng = async (
  elementId: string,
  filename = 'كروكي-مساحي.png'
): Promise<boolean> => {
  const element = document.getElementById(elementId);
  if (!element) return false;

  const parentWithTransform = element.parentElement;
  let originalTransform = '';
  let originalTransition = '';

  try {
    if (parentWithTransform) {
      originalTransform = parentWithTransform.style.transform;
      originalTransition = parentWithTransform.style.transition;
      parentWithTransform.style.transition = 'none';
      parentWithTransform.style.transform = 'none';
    }

    if (document.fonts) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));

    const canvas = await html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: element.offsetWidth,
      height: element.offsetHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const blobUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    link.href = blobUrl;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
    }, 1000);

    return true;
  } catch (error) {
    console.error('Failed to export PNG:', error);
    return false;
  } finally {
    if (parentWithTransform) {
      parentWithTransform.style.transform = originalTransform;
      parentWithTransform.style.transition = originalTransition;
    }
  }
};

/**
 * Capture the engineering sheet directly as a binary Blob (PNG image or PDF)
 * suitable for uploading to Google Drive without downloading to disk first.
 */
export const captureSheetAsBlob = async (
  elementId: string,
  format: 'png' | 'pdf' = 'png'
): Promise<Blob> => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`تعذر العثور على العنصر ${elementId}`);
  }

  const parentWithTransform = element.parentElement;
  let originalTransform = '';
  let originalTransition = '';

  try {
    if (parentWithTransform) {
      originalTransform = parentWithTransform.style.transform;
      originalTransition = parentWithTransform.style.transition;
      parentWithTransform.style.transition = 'none';
      parentWithTransform.style.transform = 'none';
    }

    if (document.fonts) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));

    const canvas = await html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: element.offsetWidth,
      height: element.offsetHeight,
      scrollX: 0,
      scrollY: 0,
    });

    if (format === 'png') {
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('فشل إنشاء ملف الصورة PNG'));
        }, 'image/png');
      });
    } else {
      // PDF format with exact full A4 proportion
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 3.5;
      const availWidth = pdfWidth - margin * 2;
      const availHeight = pdfHeight - margin * 2;

      const canvasAspect = canvas.width / canvas.height;
      let renderWidth = availWidth;
      let renderHeight = renderWidth / canvasAspect;

      if (renderHeight > availHeight) {
        renderHeight = availHeight;
        renderWidth = renderHeight * canvasAspect;
      }

      const posX = (pdfWidth - renderWidth) / 2;
      const posY = (pdfHeight - renderHeight) / 2;

      pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');
      return pdf.output('blob');
    }
  } finally {
    if (parentWithTransform) {
      parentWithTransform.style.transform = originalTransform;
      parentWithTransform.style.transition = originalTransition;
    }
  }
};

