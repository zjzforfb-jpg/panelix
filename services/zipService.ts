import JSZip from 'jszip';
import { Project } from '../types';
import { loadAssetImage, saveImageToAssets } from './fileSystem';

export const exportProjectToZip = async (project: Project): Promise<number> => {
  const zip = new JSZip();
  let fileCount = 0;

  // 1. Save project.json
  const projectJson = JSON.stringify(project, null, 2);
  zip.file('project.json', projectJson);

  // 2. Save Assets folder
  const assetsFolder = zip.folder("assets");
  
  // Collect all unique image paths
  const pathsToSave = new Set<string>();
  
  // From Project Assets
  project.assets.forEach(a => {
    if (a.imagePath) pathsToSave.add(a.imagePath);
    a.imageHistory?.forEach(h => pathsToSave.add(h));
  });

  // From Episodes
  project.volumes.forEach(vol => {
     Object.values(vol.scriptCache).forEach(script => {
         (script.panels || []).forEach(p => {
             if(p.imagePath) pathsToSave.add(p.imagePath);
             p.imageHistory?.forEach(h => pathsToSave.add(h));
             p.triptych_sources?.forEach(s => { if(s) pathsToSave.add(s); });
             p.triptych_history?.flat().forEach(s => { if(s) pathsToSave.add(s); });
         });
     });
  });

  // Fetch and add files
  for (const path of Array.from(pathsToSave)) {
      // Check if it's a blob url (local session) or base64
      if (path.startsWith('blob:')) {
          try {
              const response = await fetch(path);
              const blob = await response.blob();
              // Cannot easily map blob: URLs back to filenames without a lookup table or extracting from path context
              // If the system uses "assets/..." internally but loadAssetImage returns blob:, we are in trouble here unless we persisted the original path.
              // However, typically imagePath in DB is "assets/xyz.png". 
              // If it's "blob:", it means it hasn't been saved to virtual FS yet or is ephemeral.
          } catch (e) {
              console.warn("Failed to fetch blob for zip", path);
          }
      } else if (path.startsWith('assets/')) {
           try {
               // Use static import for loadAssetImage
               const blobUrl = await loadAssetImage(path);
               if (blobUrl) {
                   const res = await fetch(blobUrl);
                   const blob = await res.blob();
                   const filename = path.split('/').pop();
                   if (filename && assetsFolder) {
                       assetsFolder.file(filename, blob);
                       fileCount++;
                   }
               }
           } catch (e) {
               console.warn("Failed to add asset to zip", path);
           }
      } else if (path.startsWith('http')) {
          // Remote URL - try to fetch and save?
          // Or just let it be remote in JSON.
          // Optional: download remote assets to zip.
          try {
              const res = await fetch(path);
              if (res.ok) {
                  const blob = await res.blob();
                  // Create a filename hash or usage based name
                  const filename = `remote_${Math.random().toString(36).substr(2,9)}.png`; 
                  // Note: This changes the path, we would need to update project.json to point to local file.
                  // For now, simpler to skip or just save it but not update reference (which is useless).
                  // So skipping remote urls in asset folder, they remain in JSON.
              }
          } catch(e) {}
      }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  
  // Trigger download
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${project.name.replace(/\s+/g, '_')}_backup.zip`;
  link.click();

  return fileCount;
};

export const importProjectFromZip = async (file: File): Promise<Project> => {
  const zip = await JSZip.loadAsync(file);
  
  const projectFile = zip.file('project.json');
  if (!projectFile) throw new Error("Invalid Zip: project.json missing");
  
  const projectText = await projectFile.async('string');
  const project = JSON.parse(projectText) as Project;

  // 3. Compatibility check
  if (!project.customStyles) project.customStyles = [];
  if (!project.assets) project.assets = [];
  if (!project.volumes) project.volumes = [];

  // 4. Restore Assets to Virtual FS
  // We need to write the files from ZIP 'assets/' folder into our Virtual FS
  // so `loadAssetImage` can find them.
  const assetsFolder = zip.folder("assets");
  if (assetsFolder) {
      // Use static import for saveImageToAssets
      const entries: Array<{name: string, obj: any}> = [];
      assetsFolder.forEach((relativePath, fileObj) => {
          entries.push({ name: relativePath, obj: fileObj });
      });

      for (const entry of entries) {
          if (!entry.obj.dir) {
              const blob = await entry.obj.async('blob');
              // We must save it with the exact filename expected by the project references
              // references are like "assets/filename.png"
              // `saveImageToAssets` takes a blob and filename, and returns "assets/filename".
              // So we pass just the filename.
              await saveImageToAssets(blob, entry.name);
          }
      }
  }

  return project;
};