# SoVITS（GPT-SoVITS）HTTP 接口调用文档（基于 `api.py`）

> 适用实现：`GPT-SoVITS/api.py`（FastAPI + Uvicorn）
>
> 默认端口：`9880`；默认绑定：`0.0.0.0`（可用 `-a/-p` 覆盖）

---

## 1. 服务启动

### 1.1 最简启动

在 GPT-SoVITS 项目根目录执行：

```bash
python api.py
```

### 1.2 带默认参考音频启动（推荐）

当调用方 **没有** 在请求里提供完整的参考音频三件套（`refer_wav_path/prompt_text/prompt_language`）时，服务端会使用 CLI 传入的默认参考音频；否则会报错。

```bash
python api.py \
  -dr "123.wav" \
  -dt "一二三。" \
  -dl "zh"
```

### 1.3 常用启动参数（摘自 `api.py`）

- **`-s/--sovits_path`**：SoVITS 权重路径（默认来自 `config.py`；为空会 fallback 到预训练）
- **`-g/--gpt_path`**：GPT 权重路径（默认来自 `config.py`；为空会 fallback 到预训练）
- **`-dr/--default_refer_path`**：默认参考音频路径
- **`-dt/--default_refer_text`**：默认参考音频对应文本
- **`-dl/--default_refer_language`**：默认参考音频语种（支持 `"中文","英文","日文","韩文","粤语","zh","en","ja","ko","yue"` 等）
- **`-d/--device`**：推理设备（`cuda` / `cpu`）
- **`-a/--bind_addr`**：监听地址（默认 `0.0.0.0`）
- **`-p/--port`**：端口（默认 `9880`）
- **`-fp/--full_precision`**：强制全精度（覆盖 `config.is_half`）
- **`-hp/--half_precision`**：强制半精度（覆盖 `config.is_half`）
- **`-sm/--stream_mode`**：流式返回模式（代码实际只区分 `normal/n` vs 其他→`close`）
- **`-mt/--media_type`**：返回音频编码（`wav` / `ogg` / `aac`）
- **`-st/--sub_type`**：返回 PCM 数据类型（`int16` / `int32`）
- **`-cp/--cut_punc`**：文本切分符号集合（形如 `",.，。"` 传入；实际会过滤为可识别的标点）
- **`-hb/--hubert_path`**：cnhubert 路径（覆盖 `config.cnhubert_path`）
- **`-b/--bert_path`**：bert 路径（覆盖 `config.bert_path`）

---

## 2. 统一约定

### 2.1 Base URL

- 本机：`http://127.0.0.1:9880`
- 局域网/远程：`http://<server-ip>:9880`

### 2.2 语言码（`text_language` / `prompt_language`）

服务端会把输入映射到内部语言字典（`dict_language`）。常用可用值：

- **纯语种**：`en`（英文）、`all_zh`（中文）、`all_ja`（日文）、`all_ko`（韩文）、`all_yue`（粤语）
- **中英混合**：`zh`（注意：这是“混合模式”的 zh，不是 all_zh）
- **粤英混合**：`yue`
- **日英混合**：`ja`
- **韩英混合**：`ko`
- **多语种自动切分**：`auto`
- **多语种自动切分（把 zh 当 yue）**：`auto_yue`

也支持中文名（例如 `"中文"`）——服务端会映射为上面的 key。

### 2.3 “参考音频路径”是服务端路径

接口参数 `refer_wav_path` / `inp_refs[]` **不是上传文件**，而是 **服务端文件系统路径**。

- ✅ 你需要确保这些音频文件存在于运行 `api.py` 的机器上，并且路径可被进程访问。
- ⚠️ 如果你在别的机器上调用该 API，需要先把 wav 文件同步到服务端，或在服务端侧做二次封装（比如增加上传接口）。

### 2.4 成功/失败返回

- **成功**：HTTP 200，直接返回音频二进制流（`Content-Type: audio/<media_type>`）
- **失败**：HTTP 400，返回 JSON：

```json
{ "code": 400, "message": "错误原因..." }
```

---

## 3. 接口一览

| 方法 | Path | 用途 |
|---|---|---|
| GET/POST | `/` | TTS 推理（核心） |
| GET/POST | `/change_refer` | 更换“默认参考音频三件套” |
| GET/POST | `/set_model` | 动态切换 GPT/SoVITS 权重 |
| GET/POST | `/control` | 控制：重启/退出 |

---

## 4. `GET/POST /`：TTS 推理（核心）

### 4.1 参数说明

#### 必需参数（两套逻辑）

- **文本必需**：
  - **`text`**：要合成的文本（可包含 `\n`，服务端会逐段合成并拼接）
  - **`text_language`**：文本语言（见 2.2）

- **参考音频三件套**（以下任意缺失会触发 fallback）：
  - **`refer_wav_path`**：参考音频 wav 路径（服务端本地路径）
  - **`prompt_text`**：参考音频对应的提示文本（建议以句号/句末符号结尾；代码会自动补 `。` 或 `.`）
  - **`prompt_language`**：参考音频文本语言（见 2.2）

> 如果参考音频三件套不完整：服务端会尝试使用启动参数 `-dr/-dt/-dl` 指定的默认参考音频；若默认参考音频也不完整，则返回 400：`"未指定参考音频且接口无预设"`。

#### 可选参数（推理控制）

- **`top_k`**：默认 `15`（POST 默认值同 GET）
- **`top_p`**：默认 `1.0`（注意：docstring 示例里常见 `0.6`）
- **`temperature`**：默认 `1.0`
- **`speed`**：默认 `1.0`
- **`inp_refs`**：额外参考音频列表（服务端路径）。GET 方式可重复传参：`...&inp_refs=a.wav&inp_refs=b.wav`
- **`sample_steps`**：仅允许 `4/8/16/32`，否则强制回退为 `32`
- **`if_sr`**：是否启用音频超分（24k→48k）。默认 `false`
- **`cut_punc`**：文本切分符号集合。若不提供则使用启动参数 `-cp` 的默认切分符号；若 `-cp` 也为空则不切分。

### 4.2 GET 调用示例

#### 使用“默认参考音频”（启动时用 `-dr/-dt/-dl` 指定）

```bash
curl -G "http://127.0.0.1:9880/" \
  --data-urlencode "text=先帝创业未半而中道崩殂，今天下三分，益州疲弊，此诚危急存亡之秋也。" \
  --data-urlencode "text_language=zh" \
  --output out.wav
```

#### 指定本次推理的参考音频（推荐）

```bash
curl -G "http://127.0.0.1:9880/" \
  --data-urlencode "refer_wav_path=123.wav" \
  --data-urlencode "prompt_text=一二三。" \
  --data-urlencode "prompt_language=zh" \
  --data-urlencode "text=先帝创业未半而中道崩殂，今天下三分，益州疲弊，此诚危急存亡之秋也。" \
  --data-urlencode "text_language=zh" \
  --output out.wav
```

#### 指定切分符号（让长文本按标点换行切段）

```bash
curl -G "http://127.0.0.1:9880/" \
  --data-urlencode "refer_wav_path=123.wav" \
  --data-urlencode "prompt_text=一二三。" \
  --data-urlencode "prompt_language=zh" \
  --data-urlencode "text=先帝创业未半而中道崩殂，今天下三分，益州疲弊，此诚危急存亡之秋也。" \
  --data-urlencode "text_language=zh" \
  --data-urlencode "cut_punc=，。" \
  --output out.wav
```

#### 带采样/随机性参数 + 多参考音频 inp_refs

```bash
curl -G "http://127.0.0.1:9880/" \
  --data-urlencode "refer_wav_path=123.wav" \
  --data-urlencode "prompt_text=一二三。" \
  --data-urlencode "prompt_language=zh" \
  --data-urlencode "text=先帝创业未半而中道崩殂，今天下三分，益州疲弊，此诚危急存亡之秋也。" \
  --data-urlencode "text_language=zh" \
  --data-urlencode "top_k=20" \
  --data-urlencode "top_p=0.6" \
  --data-urlencode "temperature=0.6" \
  --data-urlencode "speed=1.0" \
  --data-urlencode "inp_refs=456.wav" \
  --data-urlencode "inp_refs=789.wav" \
  --output out.wav
```

### 4.3 POST 调用示例（JSON Body）

```bash
curl "http://127.0.0.1:9880/" \
  -H "Content-Type: application/json" \
  -d '{
    "refer_wav_path": "123.wav",
    "prompt_text": "一二三。",
    "prompt_language": "zh",
    "text": "先帝创业未半而中道崩殂，今天下三分，益州疲弊，此诚危急存亡之秋也。",
    "text_language": "zh",
    "cut_punc": "，。",
    "top_k": 20,
    "top_p": 0.6,
    "temperature": 0.6,
    "speed": 1.0,
    "inp_refs": ["456.wav", "789.wav"],
    "sample_steps": 32,
    "if_sr": false
  }' \
  --output out.wav
```

### 4.4 Python 调用示例（requests）

```python
import requests

url = "http://127.0.0.1:9880/"
payload = {
    "refer_wav_path": "123.wav",
    "prompt_text": "一二三。",
    "prompt_language": "zh",
    "text": "先帝创业未半而中道崩殂，今天下三分，益州疲弊，此诚危急存亡之秋也。",
    "text_language": "zh",
    "top_k": 15,
    "top_p": 1.0,
    "temperature": 1.0,
    "speed": 1.0,
    "inp_refs": [],
    "sample_steps": 32,
    "if_sr": False,
}

resp = requests.post(url, json=payload, timeout=300)
resp.raise_for_status()
with open("out.wav", "wb") as f:
    f.write(resp.content)
print("Saved -> out.wav")
```

---

## 5. 流式返回（stream_mode）

### 5.1 如何开启

服务端是否流式返回由启动参数控制：

- `python api.py -sm normal` 或 `python api.py -sm n`：开启流式（`stream_mode="normal"`）
- 其他值：关闭流式（`stream_mode="close"`）

### 5.2 流式 vs 非流式的编码格式

服务端会根据 `-mt/--media_type` 与 `stream_mode` 决定最终返回的 `Content-Type`：

- 若 `-mt` 显式指定为 `ogg`/`aac`：直接返回对应格式（无论是否流式）
- 否则：
  - **非流式（close）**：默认返回 `wav`
  - **流式（normal）**：默认返回 `ogg`

> 代码注释说明：`wav` 无法真正流式（会先暂存 raw 再统一封装）。所以如果你希望“边生成边播”，建议用 `-sm normal` 并让返回格式为 `ogg`（默认即如此）。

### 5.3 播放/保存

- 客户端如果要边收边播，需要按 `audio/ogg` 或 `audio/aac` 进行流式解码播放（浏览器/播放器/ffmpeg 均可）。
- `aac` 编码依赖服务端环境有 `ffmpeg` 可执行文件。

---

## 6. `GET/POST /change_refer`：更换默认参考音频

把“默认参考音频三件套”改成新的值。之后，若调用 `/` 时缺少参考音频三件套，就会使用这里设置的默认值。

### 参数

- `refer_wav_path`
- `prompt_text`
- `prompt_language`

### 示例（POST）

```bash
curl "http://127.0.0.1:9880/change_refer" \
  -H "Content-Type: application/json" \
  -d '{
    "refer_wav_path": "123.wav",
    "prompt_text": "一二三。",
    "prompt_language": "zh"
  }'
```

### 返回

- 成功：`{ "code": 0, "message": "Success" }`
- 失败：HTTP 400，`{ "code": 400, "message": "缺少任意一项以下参数: \"path\", \"text\", \"language\"" }`

---

## 7. `GET/POST /set_model`：动态切换权重

切换 GPT / SoVITS 权重（服务端会重新加载模型）。

### 参数

- `gpt_model_path`
- `sovits_model_path`

### 示例（POST）

```bash
curl "http://127.0.0.1:9880/set_model" \
  -H "Content-Type: application/json" \
  -d '{
    "gpt_model_path": "path/to/s1.ckpt",
    "sovits_model_path": "path/to/s2.pth"
  }'
```

### 返回

- 成功：`{ "code": 0, "message": "Success" }`
- 失败：HTTP 400，`{ "code": 400, "message": "异常信息..." }`

---

## 8. `GET/POST /control`：命令控制（重启/退出）

### 参数

- `command`：
  - `restart`：重启当前进程（`os.execl(...)`）
  - `exit`：退出进程（发送 SIGTERM）

### 示例（GET）

```bash
curl "http://127.0.0.1:9880/control?command=restart"
```

> 该接口返回体不稳定（实现里直接执行进程级操作），建议用于本地运维调试场景。

---

## 9. 常见坑与排查

### 9.1 参考音频三件套缺失导致 400

你在 `/` 请求里如果没有同时给齐：
`refer_wav_path` + `prompt_text` + `prompt_language`

那么必须满足：
启动时用 `-dr/-dt/-dl` 或调用 `/change_refer` 设置过默认参考音频，否则会返回：
`"未指定参考音频且接口无预设"`。

### 9.2 GET 请求中文/标点必须 URL 编码

建议使用 curl 的 `--data-urlencode`，避免中文/空格/标点导致参数解析错误。

### 9.3 `inp_refs`（GET）需要重复参数

FastAPI 的 `Query(default=[])` 对应的 querystring 形式应为：

`...&inp_refs=a.wav&inp_refs=b.wav`

### 9.4 `aac` 编码需要 ffmpeg

如果服务端找不到 `ffmpeg`，`aac` 打包会失败。优先考虑 `ogg` 或 `wav`。

---

## 10. 版本备注（以当前 `api.py` 为准）

- `-sm` 参数帮助里写了 `keepalive`，但当前代码逻辑只识别 `normal/n`，其余都当作 `close`。
- `wav` “流式”在代码里会先暂存 raw 再统一封装，不适合实时边播边听；要实时建议用 `ogg` 并开启 `-sm normal`。

