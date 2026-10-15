Update CODEX_HANDOFF.md to reflect the work completed in this conversation. Include the current implementation, important decisions, relevant files and tests actually performed. 

Read AGENTS.md and CODEX_HANDOFF.md first.

# Task
创建一个新的路由用来展示layout的，这个界面以`\raw_data\power_plan\Floor_Layout_Plan.pdf`为参考，里面的rectangle annotation把设备已经标出来了，每个annotation的 comment里有他们的设备ID，这个是和system element的excel文件对应的。
# Context
- Input :`\raw_data\power_plan\Floor_Layout_Plan.pdf` 
- Run from project root.
# Requirements:
- 以`\raw_data\power_plan\Floor_Layout_Plan.pdf`里的annotation坐标 画出svg，里面有个boundary，现在是需要把boundary里的设备都画出来，boundary和fix 不需要画出来。
- 所有的设备都以圆滑矩形画出来，你可以参考Power plan的界面。
- 这是个多层的建筑，目前这个`\raw_data\power_plan\Floor_Layout_Plan.pdf`文件里只有一页，也就是一层，你要为后面继续添加多层留出接口。有个下拉按钮可以选择展示哪一层。文件里有个fix的rectangle，这个用来表示这里面的设备在楼层切换的保持不变，不用切换。
- 所有的设备都是可以手动改变状态，这个改变可以重置，弄一个全局的重置按钮， 可以添加Energize today， 如果设备变成这个状态，设备上方会有个 橘黄色的闪电，这个闪电像呼吸一样可以动的。
- 所有设备的状态如果是Energized的话，上方会有个红色的闪电，也是像呼吸一样可以动的。这个状态是根据system element excel文件里的Energized: Completed这一列有时间来判断是否上电。





