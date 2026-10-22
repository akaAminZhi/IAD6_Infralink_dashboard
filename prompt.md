Read AGENTS.md and CODEX_HANDOFF.md first. 添加一个新的feature，就是给设备的详细页面添加一个url，这个url是infralink上面对应的页面，比如在equipment里
IAD06-PDU6-01E-2的详细页面，最上面可以有个链接可以直接direct 到infralink对应设备的页面，你可以参考`./IAD6_EPS_Testing_Tracker`里的相关脚本，怎么把这个url给弄出来。

# Task
给设备的详细页面添加一个url，这个url是infralink上面对应的页面，比如在equipment里IAD06-PDU6-01E-2的详细页面，最上面可以有个链接可以直接direct 到infralink对应设备的页面，你可以参考`./IAD6_EPS_Testing_Tracker`里的相关脚本，比如下载neta report逻辑，你看看怎么把这个url给弄出来。
# Context
- Input :`./IAD6_EPS_Testing_Tracker`
- Run from project root.
# Requirements:
- 参考`./IAD6_EPS_Testing_Tracker`里的相关脚本
- 所有的页面的详细页面都要有这个链接，比如power plan, mv equipment, layout
- 点击这个链接可以正确跳转到对应的infralink页面






