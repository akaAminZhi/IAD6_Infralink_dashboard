# Infralink 设备链接刷新与登录帮助

设备详情顶部的 **Open in Infralink** 使用已保存的设备 ID 映射生成链接。日常打开页面不需要重新获取映射；新增设备后才需要手动刷新。运行普通 ETL 时会重建本地链接文件，但会复用已有 ID，不会联网查询 Infralink。

以下命令均在 **Dashboard 项目根目录** 的 PowerShell 中运行。默认目录关系为：

```text
Automate/
  IAD6_Infralink_dashboard/    ← 在这里运行命令
  IAD6_EPS_Testing_Tracker/    ← 登录脚本所在目录
```

## Session 有效时刷新设备链接

运行：

```powershell
python scripts/etl/build_infralink_equipment_links.py --refresh --auth-state "$env:LOCALAPPDATA\iad6_eps_tracker\jc2_auth_state.json"
```

等待完成，查看命令末尾的统计：

```text
Infralink links: <已匹配数量>; missing: <缺失数量>; ambiguous: <冲突数量>
```

然后刷新 Dashboard 浏览器页面，打开设备详情，点击 **Open in Infralink**。

## Session 过期时重新登录

如果刷新命令提示 session 过期、需要登录，或返回 HTTP 401 或 403，先运行：

```powershell
python ..\IAD6_EPS_Testing_Tracker\download_neta_reports.py --login --auth-state "$env:LOCALAPPDATA\iad6_eps_tracker\jc2_auth_state.json"
```

1. 等待脚本弹出浏览器。
2. 如果显示登录页面，选择 **I have an MCDEAN enterprise account**，完成公司账号登录和手机 MFA 验证。
3. 等到 Infralink **设备列表已经显示**。如果浏览器已自动登录，也要等设备列表显示。
4. 回到启动脚本的 PowerShell 窗口，按 **Enter** 保存 session。保存前不要关闭弹出的浏览器。
5. 确认终端显示 `Saved JC2 browser session:`。脚本随后会关闭浏览器。

登录命令只用于保存 session，不会下载 NETA 报告。保存位置为：

```text
%LOCALAPPDATA%\iad6_eps_tracker\jc2_auth_state.json
```

登录完成后，再执行刷新命令：

```powershell
python scripts/etl/build_infralink_equipment_links.py --refresh --auth-state "$env:LOCALAPPDATA\iad6_eps_tracker\jc2_auth_state.json"
```

等待完成后刷新 Dashboard 页面。

## 新增设备后的完整顺序

1. 将包含新设备的最新 SystemElements 导出文件放入 `raw_data/system_elements/`。
2. 按正常流程更新 Dashboard 数据，例如运行：

   ```powershell
   python scripts/etl/run_etl.py
   ```

3. 运行上面的设备链接刷新命令。如果 session 已过期，先按登录步骤保存 session，再重试。
4. 刷新 Dashboard 页面，在新设备详情中检查 **Open in Infralink**。

链接刷新命令使用已导入 Dashboard 的设备清单。如果新设备还没有导入，仅刷新映射不会把它加入 Dashboard。

## 区分浏览器登录和脚本登录

| 使用场景 | 登录方式 |
| --- | --- |
| 在日常 Chrome 中点击设备链接 | 在新标签页显示的 Infralink 登录界面完成公司登录 |
| 运行设备链接刷新命令 | 使用本帮助文档的 `--login --auth-state` 命令保存 session |

脚本保存的 session 不会自动登录日常 Chrome；Chrome 登录成功也不会自动更新脚本的 session 文件。

Data Operations 的个人登录可能保存在单独的个人目录中。本帮助文档的登录和刷新命令显式使用同一个 `jc2_auth_state.json` 文件，确保两步对应。

## 常见问题

| 情况 | 处理方法 |
| --- | --- |
| 登录后刷新命令仍提示 session 过期 | 确认设备列表显示后，已回到 PowerShell 按 Enter，并看到保存成功提示；登录和刷新命令的 `--auth-state` 路径必须相同。 |
| 显示 `Infralink link unavailable` | 确认设备已导入 Dashboard，再刷新映射。查看 `frontend/public/data/infralink_equipment_links.json` 中的 `missing_equipment_ids` 和 `ambiguous_equipment`，检查缺失或重复的设备编号。 |
| 点击后仍是旧的白屏地址 | 刷新 Dashboard 后重新点击。当前入口应为 `https://jc2.mcdean.com/#:DeviceFullPage;viewModelId=...`，不要继续使用旧的内嵌详情页地址。 |
| 登录脚本提示找不到 Chromium | 运行 `python -m playwright install chromium`，安装完成后重新执行登录命令。 |

刷新会更新本地缓存 `runtime/automation/infralink_equipment_ids.json` 和页面使用的 `frontend/public/data/infralink_equipment_links.json`。本地开发和 preview 刷新页面即可；静态部署需要同步更新后的链接数据文件。

`jc2_auth_state.json` 包含登录凭据，请保留在本机，不要提交到 Git 或与帮助文档一起分享。
