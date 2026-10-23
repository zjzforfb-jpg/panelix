/**
 * TestV3Upload - V3.0 架构测试组件
 * 
 * 测试 OPFSService 和 RxDB 的集成：
 * - 文件上传到 OPFS
 * - 数据存储到 RxDB
 * - 实时订阅 RxDB 变化
 * - 从 OPFS 读取并显示图片
 */

import React, { useState, useEffect, useRef } from 'react';
import { getOPFSService } from '../../../../shared/infrastructure/storage/opfs-service';
import { getAssetsCollection, AssetDocument } from '../../../../shared/infrastructure/db/database';
import type { RxCollection } from 'rxdb';
import type { Subscription } from 'rxjs';

// ==================== 类型定义 ====================

/**
 * 显示的资产项
 */
interface DisplayAsset {
  id: string;
  fileName: string;
  createdAt: number;
  mimeType: string;
  url: string;  // Blob URL
  storagePath: string;
}

// ==================== 组件实现 ====================

export const TestV3Upload: React.FC = () => {
  const [assets, setAssets] = useState<DisplayAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOPFSSupported, setIsOPFSSupported] = useState(false);
  
  const subscriptionRef = useRef<Subscription | null>(null);
  const blobUrlRefs = useRef<Map<string, string>>(new Map());

  // ==================== 初始化检查 ====================

  useEffect(() => {
    // 检查 OPFS 支持
    const opfsService = getOPFSService();
    const supported = opfsService.isOPFSSupported();
    setIsOPFSSupported(supported);

    if (!supported) {
      setError('OPFS is not supported in this browser. Please use a modern browser.');
      return;
    }

    // 清理函数
    return () => {
      // 清理所有 Blob URL
      blobUrlRefs.current.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      blobUrlRefs.current.clear();

      // 取消订阅
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, []);

  // ==================== RxDB 订阅 ====================

  useEffect(() => {
    if (!isOPFSSupported) {
      return;
    }

    let isMounted = true;

    const setupSubscription = async () => {
      try {
        const collection = await getAssetsCollection();

        // 订阅集合变化（使用 RxDB 的 Observable）
        const subscription = collection.find().$.subscribe((docs) => {
          if (!isMounted) return;

          // 使用立即执行的异步函数处理异步操作
          (async () => {
            try {
              const opfsService = getOPFSService();
              const displayAssets: DisplayAsset[] = [];

              // 处理每个文档
              for (const doc of docs) {
                const assetDoc = doc.toJSON() as AssetDocument;
                
                // 检查是否已有 Blob URL
                let blobUrl = blobUrlRefs.current.get(assetDoc.id);

                if (!blobUrl) {
                  try {
                    // 从 OPFS 读取文件
                    const blob = await opfsService.loadFile(assetDoc.fileName);
                    // 创建 Blob URL
                    blobUrl = URL.createObjectURL(blob);
                    blobUrlRefs.current.set(assetDoc.id, blobUrl);
                  } catch (loadError: any) {
                    console.error(`Failed to load file ${assetDoc.fileName}:`, loadError);
                    // 如果加载失败，使用占位符
                    blobUrl = '';
                  }
                }

                displayAssets.push({
                  id: assetDoc.id,
                  fileName: assetDoc.fileName,
                  createdAt: assetDoc.createdAt,
                  mimeType: assetDoc.mimeType,
                  url: blobUrl || '',
                  storagePath: assetDoc.fileName,  // 使用 fileName 作为 storagePath
                });
              }

              if (isMounted) {
                setAssets(displayAssets);
                setError(null);
              }
            } catch (error: any) {
              console.error('Error processing assets:', error);
              if (isMounted) {
                setError(`Error loading assets: ${error.message}`);
              }
            }
          })();
        });

        subscriptionRef.current = subscription;
      } catch (error: any) {
        console.error('Failed to setup RxDB subscription:', error);
        setError(`Database error: ${error.message}`);
      }
    };

    setupSubscription();

    return () => {
      isMounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [isOPFSSupported]);

  // ==================== 文件上传处理 ====================

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // 只处理图片文件
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      event.target.value = '';  // 重置 input
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const opfsService = getOPFSService();
      const collection = await getAssetsCollection();

      // 生成文件名（使用时间戳确保唯一性）
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop() || 'bin';
      const fileName = `images/${timestamp}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;

      // a. 保存文件到 OPFS
      const storagePath = await opfsService.saveFile(fileName, file);
      console.log('File saved to OPFS:', storagePath);

      // b. 插入记录到 RxDB
      const assetDoc: AssetDocument = {
        id: `asset_${timestamp}_${Math.random().toString(36).substring(2, 9)}`,
        fileName: storagePath,
        createdAt: timestamp,
        mimeType: file.type,
      };

      await collection.insert(assetDoc);
      console.log('Asset document inserted:', assetDoc.id);

      // 重置 input
      event.target.value = '';
    } catch (error: any) {
      console.error('Upload error:', error);
      setError(`Upload failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // ==================== 格式化日期 ====================

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // ==================== 渲染 ====================

  if (!isOPFSSupported) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-lg font-bold text-red-800 mb-2">OPFS Not Supported</h2>
        <p className="text-red-600">
          Your browser does not support Origin Private File System API.
          Please use a modern browser like Chrome, Edge, or Safari.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">V3.0 Upload Test</h2>

      {/* 文件上传区域 */}
      <div className="mb-6">
        <label className="block mb-2 text-sm font-medium text-gray-700">
          Upload Image
        </label>
        <div className="flex items-center gap-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={isUploading}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {isUploading && (
            <span className="text-sm text-gray-500">Uploading...</span>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 资产列表 */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          Assets ({assets.length})
        </h3>

        {assets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No assets yet. Upload an image to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* 图片预览 */}
                <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden">
                  {asset.url ? (
                    <img
                      src={asset.url}
                      alt={asset.fileName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // 如果图片加载失败，显示占位符
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = '<div class="text-gray-400 text-sm">Failed to load</div>';
                        }
                      }}
                    />
                  ) : (
                    <div className="text-gray-400 text-sm">Loading...</div>
                  )}
                </div>

                {/* 资产信息 */}
                <div className="p-3 bg-white">
                  <p className="text-sm font-medium text-gray-800 truncate" title={asset.fileName}>
                    {asset.fileName}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(asset.createdAt)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {asset.mimeType}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

