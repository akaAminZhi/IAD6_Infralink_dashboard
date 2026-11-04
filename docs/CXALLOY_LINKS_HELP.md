# CxAlloy 设备链接与刷新

Equipment、PDM（包括 Overview/KPR 下钻）、Power Plan、MV 和 Layout 的设备详情，
现在会在 Infralink 链接旁显示 **Open in CxAlloy**。Layout 电缆详情也使用电缆自己的完整编号。
链接在新标签页打开 CxAlloy 对应设备；没有唯一匹配时显示 **CxAlloy link unavailable**。

## 登录

打开链接使用当前浏览器自己的 CxAlloy 登录。未登录时会进入 CxAlloy 登录页。
Data Operations 或 Tracker 保存的自动化会话不会传给设备链接。

需要刷新设备清单时，可以使用 Data Operations 中自己保存的 CxAlloy 会话文件，
通过下方 `--auth-state` 显式提供实际路径。远程用户的个人会话位于仓库外的
`%LOCALAPPDATA%\iad6_eps_tracker\users\<用户哈希>\cxalloy_auth_state.json`；
不要改用其他用户的会话。脚本不会自动查找或回退到共享会话。

如果使用本机 Tracker CLI 的独立会话，可在 Tracker 目录执行：

```powershell
python upload_cxalloy_reports.py --login
```

该命令只打开登录窗口并保存本机 Tracker 会话，不上传报告。
按 Tracker 的提示登录并返回终端确认。其默认状态文件位于
`%LOCALAPPDATA%\iad6_eps_tracker\cxalloy_auth_state.json`。

## 刷新设备身份（只读）

在 Dashboard 仓库根目录执行；替换为本人实际使用的会话路径：

```powershell
python scripts/etl/build_cxalloy_equipment_links.py --refresh --auth-state "C:\path\to\your\cxalloy_auth_state.json"
```

使用 conda base 时也可以直接调用 `C:\anaconda3\python.exe`。
脚本逐页读取项目设备名称和 ID，核对总数、项目归属、重复 ID 和末页状态。
登录过期、读取失败或分页不完整时会报错，保留原快照和已发布链接。
刷新后重新加载 Dashboard；此命令不执行完整 ETL，也不上传或修改 CxAlloy 数据。

项目配置沿用 Tracker 的 `DEFAULT_PROJECT_URL`，目前为项目 `49402`。
`IAD6_EPS_TRACKER_ROOT` 可指定 Tracker 目录；`CXALLOY_PROJECT_URL` 可覆盖项目设备列表 URL。
CLI 也支持 `--tracker-root` 和 `--project-url`。只接受 `https://tq.cxalloy.com/project/<ID>/equipment`
设备列表地址，原有列表筛选会被清除以读取完整项目。项目变化时必须重新采集，不能复用其他项目快照。

## 离线生成与匹配规则

普通 ETL 只读取本地快照，不联系 CxAlloy。也可以单独执行：

```powershell
python scripts/etl/build_cxalloy_equipment_links.py
```

完整设备名称优先，忽略大小写和首尾空格。未找到完整名称时，允许去掉开头的
`IAD06-`，并沿用 Tracker 的 `UTILITY6-01` 至 `UTILITY6-08` 去前导零别名。
其他前缀、相别、电路后缀和电缆端点都不会推测或合并。
同名不同设备 ID 判为歧义，即使别名能找到设备也不会覆盖歧义。

本地快照：`runtime/automation/cxalloy_equipment_ids.json`。
前端数据：`frontend/public/data/cxalloy_equipment_links.json`，包括唯一匹配、未匹配和歧义诊断。
它们只包含设备身份，不包含 cookies、密码或 tokens，且均不提交 Git。
没有本地快照时可复用已发布链接；新增设备需要再次在线刷新。

部署到其他机器时需携带生成的链接数据，重新构建并启动前端。
现有 dev/preview 服务能读取刷新后的 live JSON，刷新页面即可加载；
独立静态部署需要重新发布数据文件。此功能不改变 NETA、EPS、上传状态或报告上传确认流程。
