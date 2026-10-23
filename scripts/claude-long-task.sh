#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# 🚀 Claude 长任务执行器 (Panelix V3.0)
# ═══════════════════════════════════════════════════════════════════════════════
# 支持: 自动循环、错误恢复、进度保存、Memory Bank 自动更新
# 用法: ./scripts/claude-long-task.sh <task-file> [max-iterations]
# 示例: ./scripts/claude-long-task.sh tasks/v3-upgrade.md 30
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# ─────────────────────────────────────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────────────────────────────────────
TASK_FILE="${1:-tasks/v3-upgrade.md}"
MAX_ITERATIONS="${2:-50}"
CHECKPOINT_INTERVAL="${3:-5}"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
MEMORY_FILE="$PROJECT_ROOT/CLAUDE.md"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/claude-task-$TIMESTAMP.log"
CHECKPOINT_FILE="$LOG_DIR/checkpoint-$TIMESTAMP.json"

# ─────────────────────────────────────────────────────────────────────────────
# 颜色定义
# ─────────────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${CYAN}[$timestamp]${NC} ${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${CYAN}[$timestamp]${NC} ${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${CYAN}[$timestamp]${NC} ${RED}[ERROR]${NC} $message" ;;
        DEBUG) echo -e "${CYAN}[$timestamp]${NC} ${BLUE}[DEBUG]${NC} $message" ;;
    esac
    
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

save_checkpoint() {
    local iteration=$1
    local status=$2
    cat > "$CHECKPOINT_FILE" << EOF
{
    "task_file": "$TASK_FILE",
    "iteration": $iteration,
    "max_iterations": $MAX_ITERATIONS,
    "status": "$status",
    "timestamp": "$(date -Iseconds)",
    "log_file": "$LOG_FILE"
}
EOF
    log DEBUG "Checkpoint saved at iteration $iteration"
}

load_checkpoint() {
    if [[ -f "$CHECKPOINT_FILE" ]]; then
        local iteration=$(jq -r '.iteration' "$CHECKPOINT_FILE" 2>/dev/null || echo "0")
        log INFO "Resuming from checkpoint: iteration $iteration"
        echo "$iteration"
    else
        echo "0"
    fi
}

update_memory_bank() {
    local error_message="$1"
    local category="$2"
    
    if [[ -n "$error_message" && -f "$MEMORY_FILE" ]]; then
        local date_str=$(date +%Y-%m-%d)
        local entry="\n### $category\n- ❌ **Anti-pattern:** $error_message\n- ✅ **Fix:** [需要人工补充]\n- 📅 **Date:** $date_str\n"
        
        # 在 Memory Bank 部分追加
        sed -i.bak "/## 🧠 Memory Bank/a\\
$entry" "$MEMORY_FILE" 2>/dev/null || true
        
        log WARN "Added error to Memory Bank: $error_message"
    fi
}

check_prerequisites() {
    log INFO "Checking prerequisites..."
    
    # 检查必要工具
    local missing=()
    command -v node >/dev/null 2>&1 || missing+=("node")
    command -v npm >/dev/null 2>&1 || missing+=("npm")
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log ERROR "Missing required tools: ${missing[*]}"
        exit 1
    fi
    
    # 检查任务文件
    if [[ ! -f "$PROJECT_ROOT/$TASK_FILE" ]]; then
        log ERROR "Task file not found: $TASK_FILE"
        exit 1
    fi
    
    # 检查 Memory 文件
    if [[ ! -f "$MEMORY_FILE" ]]; then
        log WARN "Memory file not found, creating: $MEMORY_FILE"
        touch "$MEMORY_FILE"
    fi
    
    log INFO "Prerequisites check passed ✓"
}

run_build_check() {
    log INFO "Running build check..."
    
    cd "$PROJECT_ROOT"
    
    # TypeScript 编译检查
    if npm run build 2>&1 | tee -a "$LOG_FILE"; then
        log INFO "Build check passed ✓"
        return 0
    else
        log ERROR "Build check failed ✗"
        return 1
    fi
}

run_lint_check() {
    log INFO "Running lint check..."
    
    cd "$PROJECT_ROOT"
    
    if npm run lint 2>&1 | tee -a "$LOG_FILE"; then
        log INFO "Lint check passed ✓"
        return 0
    else
        log WARN "Lint check had warnings/errors"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 主执行逻辑
# ─────────────────────────────────────────────────────────────────────────────
main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo "  🚀 Claude 长任务执行器 - Panelix V3.0"
    echo "═══════════════════════════════════════════════════════════════════════════════"
    echo ""
    
    mkdir -p "$LOG_DIR"
    
    log INFO "Starting long task execution"
    log INFO "Task file: $TASK_FILE"
    log INFO "Max iterations: $MAX_ITERATIONS"
    log INFO "Log file: $LOG_FILE"
    log INFO "Memory file: $MEMORY_FILE"
    echo ""
    
    check_prerequisites
    
    # 尝试从检查点恢复
    local start_iteration=$(load_checkpoint)
    
    # 主循环
    for i in $(seq $((start_iteration + 1)) $MAX_ITERATIONS); do
        echo ""
        echo "───────────────────────────────────────────────────────────────────────────────"
        log INFO "=== Iteration $i / $MAX_ITERATIONS ==="
        echo "───────────────────────────────────────────────────────────────────────────────"
        echo ""
        
        # 保存检查点
        if [[ $((i % CHECKPOINT_INTERVAL)) -eq 0 ]]; then
            save_checkpoint "$i" "running"
        fi
        
        # 读取 Memory Bank (模拟 Claude 读取)
        log DEBUG "Reading Memory Bank..."
        if [[ -f "$MEMORY_FILE" ]]; then
            local memory_size=$(wc -l < "$MEMORY_FILE")
            log DEBUG "Memory Bank has $memory_size lines"
        fi
        
        # 运行 Claude (这里是占位符，实际使用时替换为真正的 Claude CLI)
        # claude --permission-mode=dontAsk \
        #        --memory-file="$MEMORY_FILE" \
        #        --continue-on-error \
        #        --max-turns=20 \
        #        "$TASK_FILE" 2>&1 | tee -a "$LOG_FILE"
        
        # 模拟执行 (实际使用时删除这段)
        log INFO "Simulating Claude execution..."
        log INFO "In real usage, replace this with actual Claude CLI command"
        sleep 1
        
        EXIT_CODE=$?
        
        # 根据退出码决定下一步
        case $EXIT_CODE in
            0)
                log INFO "Task iteration completed successfully ✓"
                
                # 运行构建检查
                if run_build_check && run_lint_check; then
                    log INFO "All checks passed!"
                    
                    # 检查是否任务完成 (可以解析任务文件中的 checkbox)
                    local completed=$(grep -c '\[x\]' "$PROJECT_ROOT/$TASK_FILE" 2>/dev/null || echo "0")
                    local total=$(grep -c '\[ \]' "$PROJECT_ROOT/$TASK_FILE" 2>/dev/null || echo "0")
                    total=$((completed + total))
                    
                    if [[ $total -gt 0 ]]; then
                        local progress=$((completed * 100 / total))
                        log INFO "Task progress: $completed/$total ($progress%)"
                        
                        if [[ $completed -eq $total ]]; then
                            log INFO "🎉 All tasks completed!"
                            save_checkpoint "$i" "completed"
                            exit 0
                        fi
                    fi
                else
                    log WARN "Some checks failed, continuing with next iteration..."
                fi
                ;;
            
            1)
                log WARN "Task incomplete, continuing to next iteration..."
                sleep 2
                ;;
            
            130)
                log INFO "Task interrupted by user (Ctrl+C)"
                save_checkpoint "$i" "interrupted"
                exit 130
                ;;
            
            *)
                log ERROR "Error occurred (code: $EXIT_CODE)"
                update_memory_bank "Iteration $i failed with exit code $EXIT_CODE" "执行错误"
                log INFO "Retrying in 5 seconds..."
                sleep 5
                ;;
        esac
    done
    
    log WARN "Max iterations ($MAX_ITERATIONS) reached without completion"
    save_checkpoint "$MAX_ITERATIONS" "max_iterations_reached"
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 入口点
# ─────────────────────────────────────────────────────────────────────────────
main "$@"

