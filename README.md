# Auto-Manju · AI 漫剧生产流水线

把网文原文自动改写成 AI 视频/漫剧可分镜脚本的一站式工作台。本地优先（local-first），数据全部留在浏览器里，不依赖任何后端数据库。

## 它能做什么

一条从"小说文本"到"可拍摄分镜"的自动化流水线：

```
小说原文
  ↓ ① 剧情拆解（Plot Splitter）      按冲突密度重切集数，每集留强钩子
  ↓ ② 拆解质检（Breakdown Aligner）  校验冲突强度 / 钩子密度 / 压缩合理性
  ↓ ③ 分镜编写（Writer）             沉浸式四段句法，自动估算镜头时长
  ↓ ④ 剧本质检（Script Aligner）     格式合规 + 画面冲击力 + 跨集连贯性，可自动修复
  ↓ ⑤ 资产提取（Asset Extractor）    人物 / 场景 / 道具 → 英文绘图提示词
  ↓ ⑥ 出图 / 出视频                   Gemini 图像、火山方舟 Seedance 视频
  ↓ ⑦ 归档（Archivist）              更新 Story Bible，维护角色状态
```

配套能力：项目管理、素材库、分镜板、风格管理、ZIP 导入导出、视频片段拼接。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 |
| 状态/存储 | RxDB + Dexie（元数据）、OPFS（图片/音频等二进制） |
| AI | Google Gemini（文本 / 图像）、火山方舟 Ark（Seedance 视频） |
| 本地后端 | Python FastAPI（ffmpeg 拼接 + 火山 API 跨域代理） |

## 快速开始

### 1. 前端

```bash
npm install

# 生成你的本地配置（含 API Key，不会被提交到 git）
cp config.example.json config.json

npm run dev
```

打开 http://localhost:3000 。首次运行请在 **设置（Settings）** 中填入：

- **API Key** —— 任意 OpenAI 兼容接口的密钥
- **API Base URL** —— 对应服务地址（默认示例为第三方中转）
- **火山方舟 API Key** —— 仅在需要生成视频时填写

也可以直接编辑 `config.json` 的 `apiConfiguration` 字段。

### 2. 本地后端（可选，用于视频拼接与火山代理）

```bash
cd python_backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py          # 监听 127.0.0.1:8008
```

需要系统已安装 `ffmpeg`（macOS: `brew install ffmpeg`）。

| 接口 | 用途 |
|---|---|
| `GET  /api/health` | 健康检查 |
| `POST /api/concat` | 多段视频拼接 |
| `POST /api/volc/video/create` | 火山视频任务创建（代理） |
| `GET  /api/volc/video/query/*` | 火山任务查询 |
| `POST /api/volc/image/generate` | 火山图像生成 |

## 目录结构

```
├── App.tsx                  # 主应用（单文件版本）
├── src/
│   ├── App.tsx              # V3 架构入口
│   ├── modules/             # DDD 模块（gallery / pipeline）
│   └── shared/
├── components/              # UI 组件（侧栏、分镜板、素材库、设置…）
├── services/                # AI Agent、文件系统、ZIP、配置服务
├── bridge/                  # 新旧任务系统桥接层
├── hooks/
├── python_backend/          # FastAPI 本地服务
├── plans/ tasks/ scripts/   # 开发计划与脚本
├── config.example.json      # 配置模板（无密钥）
└── CLAUDE.md                # 开发日志 / Memory Bank
```

## 安全说明

- `config.json` 已加入 `.gitignore`，**你的 API Key 不会被提交**。
- 仓库中只保留 `config.example.json`，密钥字段为空。
- 如果曾经把 `config.json` 提交过，请立即吊销并重新生成相关密钥 —— git 历史不可逆。

## 文档

| 文件 | 内容 |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | V3 架构规则与设计原则 |
| [QUICKSTART.md](QUICKSTART.md) | 桥接层与功能开关 5 分钟上手 |
| [BRIDGE_GUIDE.md](BRIDGE_GUIDE.md) | 桥接层详细用法 |
| [MIGRATION.md](MIGRATION.md) | 8 周迁移计划 |
| [SHOT_SCHEMA_GUIDE.md](SHOT_SCHEMA_GUIDE.md) | 分镜数据结构说明 |
| [项目工作流程.md](项目工作流程.md) | 完整生产流程 |

## License

尚未指定。若希望他人可自由使用，建议补充 [MIT](https://choosealicense.com/licenses/mit/) 或 Apache-2.0 许可证文件。
