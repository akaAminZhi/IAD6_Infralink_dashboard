# NETA 报告测试位置基准（Position Baseline）实施计划

状态：阶段 1-5 已实现（2026-11-20）。`MDS6|R` 已确认，其余族待审核。
涉及仓库：Dashboard（本仓库，下称 A）和 `IAD6_EPS_Testing_Tracker`（下称 B），两边需同步修改。

## 1. 目标

同类设备 NETA Complete 后，报告的数量和测试内容应当一致。系统需要做到：

1. **自动生成基准**：按设备族，从已 NETA Complete 的设备推算出"应有的测试位置清单"，作为草稿。
2. **前端确认基准**：新增独立的基准设置页，由用户审核、修改并确认；确认后的基准才参与比对。
3. **自动比对**：每台设备的报告按"测试位置"比对已确认的基准，报出缺失、只有 FAIL、重复、多出、无法识别等问题。
4. **Equipment 页过滤**：能直接筛选出不符合基准的设备，并在详情里看到具体是哪个位置有问题。
5. **提高位置识别精度**：解决 OCR 把 0 识别成 O、5 识别成 S、`(` 识别成 `C`，以及现场 ASSET 字段写错等问题。

### 不在范围内

- 不改变 PASS/FAIL 判定逻辑（仍以 B 的 `test_reports_result.json` 和人工覆盖为准）。
- 不修改 SystemElements 的 `neta_complete`，只把矛盾报为质量问题。
- 不自动重命名 GC 文件。命名修正只产生建议，由操作员通过现有的重命名流程确认（会联动 CxAlloy 重命名）。

### 命名约定

B 已经用 `approved_baselines` 指"冻结的文件名审批"（`tools/approve_existing_neta_names.py`）。新概念统一叫 **position baseline / 测试位置基准**，文件和代码都用 `neta_position_*`，避免混淆。

## 2. 已验证的真实案例（作为验收用例）

| 设备 | 现象 | 期望结果 |
|---|---|---|
| MDS6-01D | 21 份报告，但缺 CDS-SEC；CDS-PRI 只有 FAIL（#18）；MCB2-PRI 有 FAIL（#19）和复测 PASS（#20）| 报"缺失 CDS-SEC"、"CDS-PRI 未通过"。MCB2-PRI 的两份报告日期同为 2026-11-10，标为 `failed_only` 和 `same_day_fail`。确认该族基准后，Data Quality 收录 NETA Complete 与报告内容的矛盾。 |
| MDS6-01D #18-20 | Original 是纯图片 PDF，无文字层 | 走 OCR 路径，能识别出位置 |
| PDU6-01D-2 #09-12 | ASSET 写成 `PDU6-01D-4-FCB-F5~F8`，但 SUBSTATION 和 EQUIPMENT ID 都是 `PDU6-01D-2`，断路器 SN（`CE31229473`）也和 01D-4 的 F5（`CE71018646`）不同 | 按多数字段判定属于 01D-2，标"ASSET 字段笔误"，并给出 GC 命名修正建议 |
| PDU6 位置写法 | `FCB-F5 PRI INJ`、`FB5 PRI`，CUBICLE CODE 都是 `52-F5` | 归为同一位置 |
| MDS6 位置写法 | `MCB1-PRI`、`MCB1 PRI`、`MCB1 MAIN-PRI` | 归为同一位置 |
| GC 文件名 | `CDS-PRICFAILED)`、`P H A S E`、`MSD6`、`PDU06` | 归一化后正确识别 |
| 数量异常 | CDS6-01R-2（26 vs 14）、CUPP6-01R-3 / 03R-3（3 vs 1）、UTILITY6-03（35 vs 34）| 进入异常清单，由用户判断是否属于基准例外 |

## 3. 总体设计

```
B: PDF ──► 字段提取（文字层优先，OCR 兜底）──► report_fields.json（按 sha256 缓存）
                                                   │
A ETL: manifest + reviews + report_fields ──► 位置解析 ──► 设备族分组
        ──► 基准草稿（proposal）+ 已确认基准（config）──► 比对 ──► neta_position_check.json
                                                                 │
A 前端: 基准设置页（读 check，写 config）     Equipment 页过滤 + 详情     Data Quality
```

**分工原则**：PDF 读取和 OCR 只在 B 做（B 已有共享 OCR 上下文和持久化 hash 缓存），A 的 ETL 只处理 JSON，保持 ETL 快速。

### 3.1 报告字段提取（B）

新增模块 `B/neta_report_fields.py`（纯函数加一个运行入口）。对每份 GC 报告提取：

| 字段 | 用途 |
|---|---|
| `form_id`（如 `15000RIC`、`15055RIC`、`50900-7.1`、CT 的 EZCT 格式）| 表单类型 |
| `title`（如 `LOW VOLTAGE POWER CIRCUIT BREAKER TEST`）| 表单类型 |
| `asset` | 位置的主要来源 |
| `substation`、`equipment_id_field` | 设备编号投票 |
| `serial_number`、`cubicle_code`、`frame_size`、`rating_plug` | 位置交叉验证、复测识别 |
| `test_date`、`assessment` | 复测先后、结果 |
| CT 报告：`station`、`filename`、`circuit` | CT 位置 |

精度措施：

1. **文字层优先**：有文字层就不用 OCR。
2. **按坐标取字段**：文字层的行顺序不可靠（标签和值经常不相邻），按标签的 bbox 取右侧或下方区域的值，而不是按行相邻关系取。每种 `form_id` 定义一个字段版式模板。
3. **OCR 只做纯图片页，且只裁字段区域**：先识别出 `form_id`/标题定位版式，再把 ASSET、EQUIPMENT ID、SN 等区域裁出来，以 300 DPI 单独识别（复用 `ReportOCR` 和 `neta_processing_runtime` 的 OCR 共享上下文）。
4. **按位置语法修正混淆字符**：编号切分成 token，数字槽位做 O→0、S→5、I/l→1、B→8、Z→2、G→6，字母槽位反向修正；其他符号（`C`↔`(`、多余空格、`P H A S E`）用规则修正。原始值和修正后的值都保留。
5. **每个字段给置信度**：`text`、`ocr_corrected`、`ocr_raw`、`missing`。

输出 `B/NETA_eport_To_GC/report_fields.json`：`{version, parser_version, records: {sha256: {...字段, field_confidence}}}`。缓存键为 `source_sha256 + parser_version`，复用 `PersistentHashCache`，只解析新增或变更的文件。在 NETA 后处理（organize 之后、review 之前或之后均可）中作为一步运行，Daily Data Refresh 里只跑一次。

### 3.2 位置解析（A ETL）

新增 `scripts/etl/neta_positions.py`（纯函数，带单元测试）：

1. **设备编号投票**：`asset` 中的设备编号、`substation`、`equipment_id_field`、所在文件夹，多数决定归属。ASSET 与多数不一致时标 `asset_equipment_conflict`（PDU6-01D-2 的情况）。
2. **位置 key**：从 `asset`（或 CT 的 `filename + circuit`）中去掉 `IAD0?6-` 前缀和设备编号，剩余部分归一化：大写、统一分隔符、去掉 `(FAILED)` / `FAILED)` 这类结果后缀、去掉 `INJ` 之类的测试方式后缀。例如 `MCB1 MAIN-PRI` → `MCB1-PRI`，`FCB-F5 PRI INJ` → `F5-PRI`。
3. **别名**：基准里每个位置可以带别名列表（`FB5-PRI`、`FCB-F5-PRI`）；同时用 `cubicle_code` 作为佐证（`52-F5`）。
4. **约束吸附**：已有确认基准时，把位置 key 与该族的位置清单做混淆加权编辑距离匹配（混淆字符代价低），要求第一名唯一且与第二名拉开差距，才算匹配。不允许凭空补出 PRI/SEC 或编号（沿用 B 中 `reconcile_component_identifier` 的原则）。
5. **置信度**：`exact` / `alias` / `snapped` / `needs_review`。`needs_review` 不参与"符合"判定，单独列出。
6. **范围**：只统计属于设备本身的报告；`FDR-*` 馈线电缆报告、`ATR-*Cable*` 电缆报告、`CB ...` 跨设备报告排除在基准之外（它们属于电缆或其他设备）。
7. **独立于 GC 文件名**：位置从 PDF 字段解析，再和 GC 文件名（`rename_manifest.csv` 的 `parsed_value`）比对；不一致时产生"GC 命名修正建议"。

### 3.3 设备族分组

族 key = 编号族 + 版本，例如 `MDS6|A-F`、`MDS6|R`、`PDU6|A-F|sub`。规则：

- 去掉 `IAD06-`，取编号族（`MDS6`、`TX-CUPP6`、`ATS-TX-HTP6`），按 lineup 字母分为 `R` 和 `A-F`，有子编号（`-2`）的再加 `sub`。
- 不用 `equipment_type`（"Distribution Switchboard" 下混有 CDS6、MDB6 的 A-F/R，报告数 3/5/9/14/26 不等）。
- 基准页允许把个别设备设为该族的"例外"（例如以后确认 UTILITY6-03 本来就多一项），例外可以有自己的附加位置。

### 3.4 基准草稿生成

- 只用 `neta_complete = True` 的设备，且该族至少 2 台。
- 统计每个位置的支持度（多少台设备有这个位置的 PASS 或任何报告），出现在超过半数设备中的位置进入草稿。
- 每个位置记录：`key`、`form`、预期份数（通常为 1）、支持度、别名候选（同一 cubicle code 的不同写法）。
- 只有 2 台且不一致时，草稿标为"需人工判断"，不自动取舍。
- 草稿每次 ETL 都重算；已确认的基准不会被自动修改。草稿与已确认基准出现差异时，基准页显示"有新变化"提示。

### 3.5 已确认基准的存储

`config/neta_position_baselines.json`（提交进 git）：

```json
{
  "version": 1,
  "revision": 7,
  "families": {
    "MDS6|A-F": {
      "status": "confirmed",
      "confirmed_at": "2026-11-21T09:00:00-05:00",
      "confirmed_by": "local-operator",
      "positions": [
        { "key": "CDS-PRI", "form": "lv_breaker", "count": 1, "optional": false, "aliases": [] },
        { "key": "PQM1-CT01-A", "form": "ct", "count": 1, "optional": false, "aliases": [] }
      ],
      "exceptions": {
        "IAD06-MDS6-01X": { "extra_positions": [], "waived_positions": [], "note": "" }
      }
    }
  }
}
```

`revision` 用于乐观并发控制：保存时带上读取时的 revision，不一致就返回 409，防止多人同时编辑互相覆盖。

### 3.6 比对规则（每台设备、每个基准位置）

| 情况 | 结果 | 级别 |
|---|---|---|
| 最新结果为 PASS（复测日期须晚于 FAIL）| 合格，被覆盖的 FAIL 记为 `superseded_fail` | 信息 |
| 同日有 PASS 和 FAIL | `failed_only`，附 `same_day_fail` | 异常 |
| 只有 FAIL | `failed_only` | 异常 |
| 没有任何报告 | `missing` | 异常 |
| 同一位置多份 PASS（SN 相同视为重复，SN 不同视为位置识别可疑）| `duplicate` | 提示 |
| 报告位置不在基准内 | `extra` | 提示 |
| 位置识别为 `needs_review` 或报告不可读 | `needs_review` | 待确认 |
| ASSET 设备编号与多数字段冲突 | `asset_equipment_conflict` | 提示 |
| GC 文件名与解析位置不一致 | `gc_name_mismatch` | 提示 |
| `neta_complete = True` 但存在 `missing` / `failed_only` | `complete_but_nonconforming` | 异常（进 Data Quality）|

PASS/FAIL 取自现有 review 结果（含人工覆盖）。REVIEW_REQUIRED 的报告不算 PASS，也不算 FAIL，按 `needs_review` 处理。

对象范围：所有有报告的设备都比对（不只是 NETA Complete 的），这样进行中的设备也能看到缺项；但 `complete_but_nonconforming` 只针对已 Complete 的设备。遵守现有的跟踪排除规则（BATTERY/UPS6/MBC/直接 INV6 不跟踪）。

### 3.7 输出数据集

`frontend/public/data/neta_position_check.json`（生成文件，gitignored）：

- `families[]`：族 key、成员、NETA Complete 数、草稿（位置 + 支持度矩阵）、已确认基准的 revision、草稿与基准的差异。
- `equipment[]`：设备编号、族、基准状态（`confirmed` / `draft_only` / `none`）、问题列表、每个位置的解析结果及对应报告。
- `reports[]`：文件、sha256、位置 key、置信度、提取到的字段、冲突、GC 命名建议。

ETL 顺序调整：新步骤 `build_neta_position_check.py` 放在 `build_neta_report_reviews.py` 之后；`build_data_quality_report.py` 移到它之后（已确认目前 ETL 中除 `run_etl.py` 统计外，没有其他步骤读取 data quality 输出）。在 `OUTPUT_FILES` 中登记新文件。

## 4. 实施阶段

每个阶段结束都要跑对应测试，并用第 2 节的真实案例验证。

### 阶段 1：B 字段提取

- `B/neta_report_fields.py`：版式模板、bbox 取值、OCR 区域裁剪、混淆字符修正、置信度。
- 接入 B 的 NETA 后处理和 `neta_processing_runtime` 的缓存及 OCR 共享。
- 测试：`B/tests/test_neta_report_fields.py`（文字层、纯图片页、混淆字符、坐标取值、缓存命中）。
- 验收：MDS6-01D #18-20 能提取出 ASSET；PDU6-01D-2 #09 能提取出 SUBSTATION、EQUIPMENT ID、SN。

### 阶段 2：A 位置解析、分组、草稿、比对（只读诊断）

- `scripts/etl/neta_positions.py`、`scripts/etl/build_neta_position_check.py`，以及 `schemas.py` 中的 dataclass。
- 通过 `tracker_module()` 方式或直接读文件消费 B 的输出；B 输出缺失时写 `available: false`，不中断 ETL。
- 测试：`scripts/tests/test_neta_positions.py`、`test_build_neta_position_check.py`。
- **交付一份全量异常清单给用户审核**（所有族、所有设备），确认规则无误后再进入阶段 3。

### 阶段 3：基准 API 和基准设置页

- API（`scripts/automation/api.py`）：
  - `GET /api/automation/neta-position-baselines`：返回已确认基准和 revision。
  - `PUT /api/automation/neta-position-baselines/{family}`：保存一个族的基准，带 revision，原子写入（临时文件 + `os.replace`），只允许本地操作员（`require_local_operator`）。
  - 保存后提示运行 ETL（复用已注册的 `run_dashboard_etl` 任务），不开放任意命令执行。
  - `AutomationConfig` 新增 `neta_position_baselines_path`。
- 前端：
  - 新页面 `pages/NetaBaselinesPage.tsx`，路由 `/neta-baselines`，在 `Sidebar.tsx` 中加入口，在 `dashboardResources.ts` 中加路由资源。
  - 族列表：状态标签（无草稿 / 草稿 / 已确认 / 有新变化）、成员数、异常设备数。
  - 族详情：位置清单（可改名、增删、标可选、编辑别名、改预期份数）+ 支持度矩阵（设备 × 位置，每格显示 PASS/FAIL/缺失，点击可打开报告）+ 例外设备设置 + "确认基准"按钮。
  - 非本地操作员只读。
- 类型：`types/data.ts`（数据集）、`types/automation.ts`（API）、`utils/automationApi.ts`（客户端）。
- 测试：`test_automation_api.py`（读写、409、403、原子写）、`NetaBaselinesPage.test.tsx`。

### 阶段 4：Equipment 页过滤、详情、Data Quality

- `EquipmentFilters.tsx`：新增"报告基准"下拉框：全部 / 不符合基准 / 缺失位置 / 只有 FAIL / 重复 / 多出 / 待确认 / GC 命名不一致 / 无基准。
- `EquipmentPage.tsx`：`filterEquipmentRows` 增加过滤逻辑；URL 参数 `baselineIssue` 同步，方便从基准页跳转过来；可选加一个快捷卡片。
- 设备详情抽屉：新增"测试位置"区块，逐项显示基准位置、对应报告、结果、问题。
- Data Quality：新增 `neta_complete_but_nonconforming` 类别（Python builder + `DataQualityReport` 类型）。
- 测试：`EquipmentPage.test.tsx`、`test_data_quality.py`、`useDashboardData.test.ts`。

### 阶段 5：GC 命名修正建议和精度回馈（B + A）

- B 读取 A 的已确认基准，作为 OCR 吸附的候选清单（只用于建议，不自动改名）。
- 基准页或 Equipment 详情中列出"GC 命名修正建议"，操作员确认后走现有的重命名流程（`neta_report_rename.py`，`USER_CONFIRMED`，联动 CxAlloy 重命名队列）。
- 不提升 B 的 `IDENTIFIER_VERSION`，避免全量重新识别和批量改名。
- 测试：`B/tests/test_organize_neta_reports_for_gc.py`、`test_neta_report_rename.py`。

## 5. 数据契约变更清单

按 AGENTS.md 要求，同一次修改中同步更新：

- Python：`schemas.py` dataclass、新 builder、`run_etl.py` 的步骤和 `OUTPUT_FILES`。
- TypeScript：`types/data.ts` 的接口和 `DashboardData`、`useDashboardData.ts` 的空默认值、`dashboardResources.ts` 的文件映射。
- 配置：`config/neta_position_baselines.json`（初始为空 `families: {}`）。
- 文档：`ARCHITECTURE.md` 数据流、`CODEX_HANDOFF.md` 当前进度，B 的 `NETA_OCR.md`。

## 6. 性能

- PDF 解析只在 B 做，按 sha256 + parser_version 缓存；每天只处理新增或变更的文件。
- OCR 只针对没有文字层的页面，且只识别字段区域。
- A 的新步骤只处理 JSON，预计耗时在秒级。首次全量运行（约 4,300 份 GC 报告）需单独计时记录。

## 7. 待确认问题

1. **分组粒度**：MDS6 的 01 排和 02 排（以及其他族的不同 lineup）位置清单是否一定相同？如果不同，基准页需要支持把一个族拆成子族。 -->同意
2. **临时报告**：`_temporary` 下的报告是否参与比对？建议：参与，但在详情里标出"临时"。
3. **CT 报告**：每相 CT 各算一个位置（如 MDS6 的 PQM1-CT01 A/B/C 算 3 项），与现在 21 份的计数方式一致。是否同意？-->同意。
4. **复测判定**：同一位置 FAIL 之后有 PASS 即视为合格，不要求 PASS 日期晚于 FAIL 日期（MDS6-01D 的两份同为 11/10）。是否同意？ -->如果PASS 日期等于 FAIL 日期 以fail为主，如果日期不同，以最新的为主
