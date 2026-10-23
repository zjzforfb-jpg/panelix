
import { useState, useCallback } from 'react';

interface MergeOptions {
  width?: number;   // Default 1920
  height?: number;  // Default 1080
  format?: 'image/jpeg' | 'image/png';
  quality?: number; // 0-1
}

interface ReferenceSheetData {
  mainImageUrl: string | null;
  assets: { url: string; name: string; type: string }[];
  info: {
    script: string;
    duration: string;
    scene: string;
    style: string;
    notes: string;
  };
}

export const useStoryboardMerger = () => {
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // 1. Existing Triptych Merger (Side-by-side 3 images)
  const mergeImages = useCallback(async (
    imageUrls: string[], 
    options: MergeOptions = {}
  ): Promise<string | null> => {
    if (imageUrls.length !== 3) {
      setMergeError("必须提供 3 张图片链接");
      return null;
    }

    setIsMerging(true);
    setMergeError(null);

    const { 
      width = 1920, 
      height = 1080, 
      format = 'image/jpeg', 
      quality = 0.95 
    } = options;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error("Canvas context creation failed");

      // Fill Background Black
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Load Images
      const loadImg = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "Anonymous"; 
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load image`));
          img.src = url;
        });
      };

      const images = await Promise.all(imageUrls.map(loadImg));

      // Draw Logic (Triptych Layout)
      const sectionWidth = width / 3; 
      
      images.forEach((img, index) => {
        // Logic: Object-fit Cover
        const imgRatio = img.width / img.height;
        const targetRatio = sectionWidth / height;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgRatio > targetRatio) {
          drawHeight = height;
          drawWidth = height * imgRatio;
          offsetY = 0;
          offsetX = (sectionWidth - drawWidth) / 2;
        } else {
          drawWidth = sectionWidth;
          drawHeight = sectionWidth / imgRatio;
          offsetX = 0;
          offsetY = (height - drawHeight) / 2;
        }

        const targetX = index * sectionWidth;

        ctx.save();
        ctx.beginPath();
        ctx.rect(targetX, 0, sectionWidth, height);
        ctx.clip();

        ctx.drawImage(img, targetX + offsetX, offsetY, drawWidth, drawHeight);
        
        // Divider
        if (index > 0) {
            const grad = ctx.createLinearGradient(0, 0, 0, height);
            grad.addColorStop(0, "rgba(0,0,0,0)");
            grad.addColorStop(0.5, "rgba(255,255,255,0.3)");
            grad.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = grad;
            ctx.fillRect(targetX, 0, 2, height);
        }

        ctx.restore();
      });

      const dataUrl = canvas.toDataURL(format, quality);
      setIsMerging(false);
      return dataUrl;

    } catch (err: any) {
      console.error(err);
      setMergeError(err.message || "Unknown error");
      setIsMerging(false);
      return null;
    }
  }, []);

  // 2. New Reference Sheet Generator (Detailed Composite)
  const generateReferenceSheet = useCallback(async (
    data: ReferenceSheetData,
    options: MergeOptions = {}
  ): Promise<string | null> => {
    setIsMerging(true);
    setMergeError(null);

    const { 
        width = 1920, 
        height = 1080, 
        format = 'image/jpeg', 
        quality = 0.95 
    } = options;

    try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas context failed");

        // --- Layout Constants ---
        const padding = width * 0.02;
        const sidebarWidth = width * 0.3; // Right sidebar for info
        const mainViewWidth = width - sidebarWidth;
        
        // --- 1. Background ---
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, width, height);

        // --- 2. Main Visual (Left Side) ---
        if (data.mainImageUrl) {
            try {
                const mainImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error("Failed to load main image"));
                    img.src = data.mainImageUrl!;
                });

                // Draw Main Image (Cover/Contain logic within the main view area)
                const areaW = mainViewWidth;
                const areaH = height;
                
                const imgRatio = mainImg.width / mainImg.height;
                const targetRatio = areaW / areaH;
                
                let dw, dh, dx, dy;
                
                // "Fit" logic (contain) to ensure full shot is visible, black bars if needed
                if (imgRatio > targetRatio) {
                    dw = areaW;
                    dh = areaW / imgRatio;
                    dx = 0;
                    dy = (areaH - dh) / 2;
                } else {
                    dh = areaH;
                    dw = areaH * imgRatio;
                    dx = (areaW - dw) / 2;
                    dy = 0;
                }
                
                ctx.drawImage(mainImg, dx, dy, dw, dh);
                
                // Draw Label for Main Image
                const labelText = data.info.scene || "Main Storyboard";
                ctx.font = `bold ${width*0.015}px sans-serif`;
                const labelMetrics = ctx.measureText(labelText);
                const labelBgWidth = labelMetrics.width + width * 0.02;
                const labelBgHeight = width * 0.025;
                const labelX = width * 0.02;
                const labelY = height - width * 0.02; // Bottom left of main area

                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(labelX, labelY - labelBgHeight, labelBgWidth, labelBgHeight + 10);
                
                ctx.fillStyle = '#ffffff';
                ctx.fillText(labelText, labelX + width * 0.01, labelY);

                // Add a subtle border to separate main view
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 2;
                ctx.strokeRect(0, 0, mainViewWidth, height);

            } catch (e) {
                console.warn("Main image load failed", e);
                // Draw placeholder
                ctx.fillStyle = '#222';
                ctx.fillRect(0, 0, mainViewWidth, height);
                ctx.fillStyle = '#555';
                ctx.font = `${width*0.02}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText("No Image Source", mainViewWidth/2, height/2);
            }
        } else {
             // Placeholder
             ctx.fillStyle = '#1a1a1a';
             ctx.fillRect(0, 0, mainViewWidth, height);
             ctx.fillStyle = '#444';
             ctx.textAlign = 'center';
             ctx.font = `${width*0.03}px sans-serif`;
             ctx.fillText("VISUAL PENDING", mainViewWidth/2, height/2);
        }

        // --- 3. Sidebar Info (Right Side) ---
        const sbX = mainViewWidth;
        const sbP = width * 0.02; // Sidebar padding
        let cursorY = sbP;

        // Header: Scene & Time
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.font = `bold ${width*0.025}px sans-serif`;
        ctx.fillText(`SCENE: ${data.info.scene || 'Untitled'}`, sbX + sbP, cursorY + width*0.02);
        cursorY += width * 0.05;

        ctx.fillStyle = '#fbbf24'; // Amber
        ctx.font = `bold ${width*0.018}px monospace`;
        ctx.fillText(`DURATION: ${data.info.duration}`, sbX + sbP, cursorY);
        cursorY += width * 0.03;

        // Style Tag
        ctx.fillStyle = '#60a5fa'; // Blue
        ctx.font = `${width*0.012}px sans-serif`;
        ctx.fillText(`STYLE: ${data.info.style || 'Default'}`, sbX + sbP, cursorY);
        cursorY += width * 0.04;

        // Divider
        ctx.fillStyle = '#333';
        ctx.fillRect(sbX + sbP, cursorY, sidebarWidth - sbP*2, 2);
        cursorY += width * 0.02;

        // Script Text
        ctx.fillStyle = '#9ca3af'; // Gray 400
        ctx.font = `italic ${width*0.012}px sans-serif`;
        const wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
            const words = text.split(''); // Char split for Chinese
            let line = '';
            let testLine = '';
            let lineCount = 0;
            
            for(let n = 0; n < words.length; n++) {
                testLine = line + words[n];
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;
                if (testWidth > maxWidth && n > 0) {
                    ctx.fillText(line, x, y);
                    line = words[n];
                    y += lineHeight;
                    lineCount++;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, x, y);
            return y + lineHeight;
        };
        
        cursorY = wrapText(data.info.script || "No script content.", sbX + sbP, cursorY, sidebarWidth - sbP*2, width*0.018);
        cursorY += width * 0.02;

        // Divider
        ctx.fillStyle = '#333';
        ctx.fillRect(sbX + sbP, cursorY, sidebarWidth - sbP*2, 2);
        cursorY += width * 0.02;

        // Assets Row
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${width*0.012}px sans-serif`;
        ctx.fillText("ASSETS (CAST & PROPS)", sbX + sbP, cursorY);
        cursorY += width * 0.015;

        const assetSize = width * 0.06;
        const assetGap = width * 0.01;
        let assetX = sbX + sbP;
        
        // Load asset images
        for (const asset of data.assets.slice(0, 4)) { // Limit to 4 to fit
             // Draw background circle
             ctx.fillStyle = '#333';
             ctx.beginPath();
             ctx.arc(assetX + assetSize/2, cursorY + assetSize/2, assetSize/2, 0, Math.PI * 2);
             ctx.fill();
             ctx.save();
             ctx.beginPath();
             ctx.arc(assetX + assetSize/2, cursorY + assetSize/2, assetSize/2, 0, Math.PI * 2);
             ctx.clip();

             if (asset.url) {
                 try {
                    const aImg = await new Promise<HTMLImageElement>((resolve) => {
                        const i = new Image();
                        i.crossOrigin = "Anonymous";
                        i.onload = () => resolve(i);
                        i.onerror = () => resolve(new Image()); // fallback
                        i.src = asset.url;
                    });
                    if (aImg.width > 0) {
                        ctx.drawImage(aImg, assetX, cursorY, assetSize, assetSize);
                    }
                 } catch(e) {}
             }
             ctx.restore();
             
             // Label Background
             ctx.fillStyle = 'rgba(0,0,0,0.6)';
             const labelY = cursorY + assetSize + width*0.005;
             ctx.fillRect(assetX, labelY, assetSize, width * 0.018);

             // Label Text
             ctx.fillStyle = '#fff';
             ctx.font = `bold ${width*0.008}px sans-serif`;
             ctx.textAlign = 'center';
             ctx.fillText(asset.name.substring(0, 8), assetX + assetSize/2, labelY + width*0.012);

             assetX += assetSize + assetGap;
        }
        
        // Reset X for notes, Move Y down past assets
        cursorY += assetSize + width * 0.04;
        ctx.textAlign = 'left';

        // User Notes (Remarks)
        if (data.info.notes) {
            ctx.fillStyle = '#ef4444'; // Red title
            ctx.font = `bold ${width*0.012}px sans-serif`;
            ctx.fillText("PRODUCTION NOTES:", sbX + sbP, cursorY);
            cursorY += width * 0.02;
            
            ctx.fillStyle = '#fca5a5'; // Light red text
            ctx.font = `${width*0.014}px sans-serif`;
            wrapText(data.info.notes, sbX + sbP, cursorY, sidebarWidth - sbP*2, width*0.02);
        }

        // --- 4. Watermark / Footer ---
        ctx.fillStyle = '#333';
        ctx.font = `${width*0.01}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText("Panelix Video Gen Script", width - sbP, height - sbP);

        const dataUrl = canvas.toDataURL(format, quality);
        setIsMerging(false);
        return dataUrl;

    } catch (err: any) {
        console.error("Reference Sheet Gen Error:", err);
        setMergeError(err.message || "Ref Gen Failed");
        setIsMerging(false);
        return null;
    }

  }, []);

  return { mergeImages, generateReferenceSheet, isMerging, mergeError };
};
