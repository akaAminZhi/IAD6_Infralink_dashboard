Update CODEX_HANDOFF.md to reflect the work completed in this conversation. Include the current implementation, important decisions, relevant files, known issues, remaining work, and tests actually performed. Remove outdated information, do not copy the chat transcript, and do not modify any other files.

Read AGENTS.md and CODEX_HANDOFF.md first.

Task: 在/equipment 页面添加2个卡片,1.能 filter 出哪些NETA report 有问题 2.哪些NETA report 需要 复核，点击卡片可以直接过滤出来.复核结果 可以直接修改 成PASS或者FAILED。 NETA的初始测试报告 检查结果放在`..\IAD6_EPS_Testing_Tracker\NETA_eport_To_GC\test_reports_result.json`。 然后在设备的详细页面里能一眼看出哪份报告有问题。failed的用红色高亮，复核的用橙色，通过的用绿色

Requirements:
- Add the filter to the Equipment page.
- 添加可以直接修改结果的api
- 设备的详细页面里能一眼看出哪份报告有问题。failed的用红色高亮，复核的用橙色，通过的用绿色

Make only the necessary changes, preserve existing behavior  and run targeted tests. After completion, update CODEX_HANDOFF.md. 最后写一些commite 我自己来提交git。