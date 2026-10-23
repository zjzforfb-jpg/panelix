/**
 * 重试服务
 * 提供指数退避重试机制，用于处理保存操作中的临时错误
 */

// 重试配置选项
export interface RetryOptions {
  maxRetries: number;      // 最大重试次数
  baseDelay: number;       // 基础延迟（毫秒）
  maxDelay?: number;       // 最大延迟（毫秒）
  onRetry?: (attempt: number, error: Error, delay: number) => void; // 重试回调
}

// 默认重试配置
const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000
};

// 可重试错误类型
const RETRYABLE_ERROR_NAMES = [
  'QuotaExceededError',     // 存储配额超限
  'NotReadableError',       // 文件读取错误
  'NotFoundError',          // 文件未找到（可能正在创建）
  'InvalidStateError',      // 无效状态（临时）
  'AbortError',             // 操作被中断
];

const RETRYABLE_ERROR_MESSAGES = [
  'network',
  'timeout',
  'connection',
  'ECONNRESET',
  'ETIMEDOUT',
  'rate limit',
  'too many requests',
  'temporarily unavailable',
  'service unavailable',
];

/**
 * 重试服务类
 */
export class RetryService {
  private defaultOptions: RetryOptions;

  constructor(options?: Partial<RetryOptions>) {
    this.defaultOptions = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 执行带重试的异步操作
   * @param operation 要执行的异步操作
   * @param options 重试配置（可选，覆盖默认配置）
   * @returns 操作结果
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>
  ): Promise<T> {
    const opts = { ...this.defaultOptions, ...options };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 检查是否是最后一次尝试
        if (attempt === opts.maxRetries) {
          console.error(`[RetryService] All ${opts.maxRetries + 1} attempts failed:`, lastError.message);
          throw lastError;
        }

        // 检查错误是否可重试
        if (!this.isRetryable(lastError)) {
          console.error('[RetryService] Non-retryable error:', lastError.message);
          throw lastError;
        }

        // 计算延迟时间（指数退避）
        const delay = this.calculateDelay(attempt, opts);
        
        console.warn(
          `[RetryService] Attempt ${attempt + 1}/${opts.maxRetries + 1} failed:`,
          lastError.message,
          `Retrying in ${delay}ms...`
        );

        // 回调通知
        if (opts.onRetry) {
          opts.onRetry(attempt + 1, lastError, delay);
        }

        // 等待后重试
        await this.sleep(delay);
      }
    }

    // 理论上不会到达这里，但 TypeScript 需要
    throw lastError || new Error('Unknown retry error');
  }

  /**
   * 判断错误是否可重试
   */
  isRetryable(error: Error): boolean {
    // 检查错误名称
    if (RETRYABLE_ERROR_NAMES.includes(error.name)) {
      return true;
    }

    // 检查错误消息
    const lowerMessage = error.message.toLowerCase();
    for (const keyword of RETRYABLE_ERROR_MESSAGES) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    // DOMException 的某些类型可重试
    if (error instanceof DOMException) {
      if (error.code === DOMException.QUOTA_EXCEEDED_ERR) {
        return true;
      }
    }

    return false;
  }

  /**
   * 计算指数退避延迟
   * delay = baseDelay * 2^attempt + random jitter
   */
  private calculateDelay(attempt: number, opts: RetryOptions): number {
    const exponentialDelay = opts.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 100; // 添加随机抖动避免雪崩
    const delay = Math.min(exponentialDelay + jitter, opts.maxDelay || 10000);
    return Math.round(delay);
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例实例
export const retryService = new RetryService();

// 导出便捷函数
export const executeWithRetry = <T>(
  operation: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> => {
  return retryService.executeWithRetry(operation, options);
};


