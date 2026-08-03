# AGENTS.md · 项目规则

> 写给 AI / 未来维护者的项目上下文。只记录代码里看不出的信息。

## 技术栈

- Adobe ExtendScript（**ES3**，无 const/let/模板字符串/箭头函数/JSON），AE 2026 ScriptUI Panel
- 全部粒子动画由 AE **表达式驱动**，生成后通过 `Ctrl_Starfield` 控制器层（Null 层 + 28 个滑块）实时调参，无需重新生成
- 中文 UI / 英文表达式（跨语言兼容策略：属性 matchName 用候选 fallback）

## 关键坑（改代码前必读）

1. **seedRandom offset 管理**（核心规则）：所有粒子随机用 `seedRandom(index + seed + OFFSET, true)`；**不同属性用不同 offset**（1000 生命周期 / 2000 位置 / 3000 颜色 / 5000 目标 / 6000 密度 / 8000 时间偏移 / 9000 缩放 / 10000 模糊），**同一属性跨表达式用相同 offset**（保证同步）；`timeless=true` 防漂移
2. **ES3 限制**：无 JSON 对象（需 polyfill）、无箭头函数/模板字符串；语法检查用 `node --check`
3. **ScriptUI 陷阱**：`visible` 切换不触发父容器重排（用 `layout(true)` 或内嵌同显同隐 Group）；`dropdownlist.removeAll()` 后 `selection` 变 null，增删后必须重设 `selection`；`.preferredSize = [w,h]` 链式赋值会返回数组（分开写）
4. **AE 渲染顺序：Effect → Mask**：对带 Mask 的层加 Gaussian Blur 会被 Mask 裁剪。圆形/多边形粒子用 Mask Feather（2D 属性），正方形粒子用 Gaussian Blur
5. **参数引用用 `fx()` 帮助函数**：生成 `(ctrl.effect("名") ? ctrl.effect("名")(1) : 默认值)` 三元表达式；`ctrl` 由 `thisComp.layer("Ctrl_Starfield")` 声明，表达式必须先声明
6. **预设/参数 key 语言一致性**：UI 层中文 key ↔ 逻辑层英文 key 必须转换（applyPresetToUI → getUIParams → applyUIToController），不要混用

## 约定

- 所有参数走 `Ctrl_Starfield` 控制器层（不硬编码在表达式里）；新增参数必须加进 controller 滑块 + 参数速查表
- 密度变化需重新生成才生效（已生成粒子的表达式不变）
- 大粒子数（>500）建议圆形以优化性能
- 启动顺序：`layout()` → `center()` → `show()` 缺一不可；槽位懒加载

## 常用命令

- 语法检查：`node --check starry-sky-generator.jsx`；开发时用 ExtendScript Toolkit Check Syntax（自动化清洗后必须验证语法）
- 无构建工具；发布 = 打包 zip + onepage 落地页
- 详细开发记录见 DEVELOPMENT.md；版本历史见 CHANGELOG.md
