# 开发文档（DEVELOPMENT.md）

> 面向开发者的项目文档：架构说明 + 关键问题与方案（一坑一篇）。
> 每个问题用统一格式：**TL;DR**（一句话结论）→ 问题 / 根因 / 解决 / 预防。

## 项目概览

AE 2026 星空粒子生成器（v3.2），ScriptUI Panel，单文件 `.jsx`。一键生成大量动态星空粒子，全部参数由 AE 表达式驱动，通过 `Ctrl_Starfield` 控制器层（Null + 28 滑块）实时调参。

## 架构说明

```
starry-sky-generator.jsx
├── JSON Polyfill
├── 工具函数（addPropertySafe / getPropertySafe / addSliderToLayer）
├── 形状工具（圆形/多边形 Mask 构建）
├── 核心函数（getActiveComp / ensureComp / getOrCreateController）
├── 表达式构建
│   ├── buildPositionExpression() — 位置（发射区 + 吸引 + 环绕）
│   ├── buildOpacityExpression()   — 透明度（淡入淡出 + 闪烁）
│   ├── buildScaleExpression()     — 缩放
│   ├── buildColorExpression()     — HSL→RGB
│   └── buildBlurExpression()      — 蒙版羽化模糊
├── 粒子生成 generateParticles()
├── UI 构建 buildUI()（ScriptUI Palette + 7 个功能面板）
└── 启动入口（try/catch + 错误报告）
```

**表达式设计核心**：所有参数通过 `fx(name, def)` 从控制器层读取（含 fallback 三元表达式），粒子属性用 `seedRandom(index + seed + OFFSET, true)` 独立随机——改种子整体重置、调滑块即时生效。

## 关键问题与方案

### 1. ScriptUI 可见性切换 → 布局错位

**TL;DR**：Group 的 `visible` 从 false 切 true 后，兄弟元素位置不自动更新（ScriptUI 的 visible 变更不触发父容器重排）。用 `layout(true)` 强制重排，或**把状态文字内嵌到同显同隐的 Group 内部**（推荐）。

- **问题**：选"遮罩范围"后状态文字被新显示的控件覆盖
- **根因**：visible 变更不触发自动布局重算；statictext 初始空文字宽度为 0
- **预防**：不要在可见性可变的 Group 之间放置独立 UI 元素

### 2. 吸引无效 — 排查三部曲

**TL;DR**：吸引失效是三层问题叠加——① 表达式分支因 targetMask 为空字符串被跳过；② 旧公式 `pull = attr * (tLocal/dur)` 数值被大 dur 稀释归零；③ 固定乘数 50 对快慢粒子感受不一致。**改用速度加法 `vx += 方向 * attraction * speed`**（与时长解耦、与粒子自身速度成比例）。

- **第一层**：`targetMask` 为 ""（falsy）→ 吸引分支完全不执行 → 加降级逻辑（空遮罩退化为图层中心）
- **第二层**：`pull = attr * (t/dur)` 当 dur 远大于生命周期时接近 0 → 改为速度加法
- **第三层**：固定乘数 50px/s 支配慢粒子、无关快粒子 → 用粒子自身 `speed`
- **预防**：参数是否进入表达式的链路要全 grep 验证；公式的物理意义要检查量纲（力度应独立于时长）

### 3. 死代码 — 参数传入但表达式未使用

**TL;DR**：`density` 传入 `buildPositionExpression()` 但从未被引用（本意控制遮罩内发射占比，表达式却写死遮罩内）。**每个 function 的参数必须全部 grep 确认被实际使用**。

- **修复**：加入密度判断——每粒子 `seedRandom(index+seed+6000, true)` 随机决定遮罩内/全合成发射

### 4. 预设完全失效 — 中文 Key vs 英文 Key

**TL;DR**：预设用中文 key（`"粒子数量"`），逻辑层读英文 key（`params.count`）→ 28 个滑块全部停在默认值。**数据流统一**：`applyPresetToUI(preset)`（写 UI）→ `getUIParams()`（英文 key 回读）→ `applyUIToController(params)`。

- **预防**：UI 层与逻辑层 key 语言必须明确分离并在边界转换；参数传递链路做一次端到端验证

### 5. ScriptUI 赋值 Bug — `.preferredSize =` 陷阱

**TL;DR**：`var x = ctrl.add(...).preferredSize = [40, 18]` 返回的是**被赋的值（数组）**，x 变成数组而不是控件。赋值分开写。

```javascript
// ❌ var emitDenVal = ee3.add("statictext", undefined, "100%").preferredSize = [40, 18];
// ✅
var emitDenVal = ee3.add("statictext", undefined, "100%");
emitDenVal.preferredSize = [40, 18];
```

### 6. 下拉菜单 selection 状态管理

**TL;DR**：`dropdownlist.removeAll()` 后 `selection` 变 null；**任何 Dropdown 增删后必须重新设置 `selection`**，否则读取 `.selection.text` 返回 null。

### 7. AE 渲染顺序陷阱 — Mask vs Effect

**TL;DR**：AE 渲染顺序 **Effect → Mask**（Effect 先应用，Mask 后裁剪）——对带 Mask 的层加 Gaussian Blur 边缘被裁剪。圆形/多边形粒子用 **Mask Feather**（mask 属性，不受顺序影响），正方形粒子（无 Mask）用 Gaussian Blur。

- **注意**：Mask Expansion 是 **1D 属性**，Mask Feather 是 **2D 属性**
- **预防**：做模糊效果前先想清楚目标层有没有 Mask

### 8. 种子随机系统 — seedRandom offset 管理

**TL;DR**：所有粒子随机用 `seedRandom(index + seed + OFFSET, timeless=true)`。**不同属性用不同 offset（1000 生命周期 / 2000 位置 / 3000 颜色 / 5000 目标 / 6000 密度 / 8000 时间偏移 / 9000 缩放 / 10000 模糊），同一属性跨表达式用相同 offset 保证同步**；`timeless=true` 防每帧漂移；改种子整体重置。

### 9. 表达式构建中的参数引用（fx 帮助函数）

**TL;DR**：`fx(name, def)` 生成 `(ctrl.effect("名") ? ctrl.effect("名")(1) : 默认值)` 含 fallback 的三元表达式。**`ctrl` 变量必须在表达式中先声明**（`thisComp.layer("Ctrl_Starfield")`）。

### 10. 颜色选取器清理

去除双分号、多余空行、前导空格；`alignChildren` 统一左对齐；修复冗余 preferredSize 赋值；预览区固定尺寸占位。

### 11. 清洗脚本副作用

**TL;DR**：Python 正则批量移除 `preferredSize`/`alignment` 产生语法碎片。**自动化文本处理脚本必须做语法验证**（大括号平衡、变量引用完整性），正则无法处理嵌套结构；ExtendScript Toolkit Check Syntax 是必备验证工具。

### 12. 内存/启动性能

**TL;DR**：面板启动卡顿 2-3s 因 `4 槽位 × 4 次 settings 读取 = 16 次` 磁盘 IO。**槽位懒加载**：按钮默认启用，点击时才读取。启动顺序 `layout()` → `center()` → `show()` 缺一不可。

### 13. 跨语言兼容

| 场景 | 方案 |
|---|---|
| 属性 Match Name | `addPropertySafe` 多候选 fallback |
| Mask Expansion | `property(4)` 数字索引替代 match name |
| 效果名 | 同时提供英文/中文候选 |
| UI 字符串 | 全部使用中文 |
| 表达式 | 全部使用英文 |

## 参数速查（28 个 controller 滑块）

表达式用到的所有滑块（名称 → 默认值 → 用途），完整表见源码/`Ctrl_Starfield` 层。核心分组：粒子（数量/尺寸/缩放）、颜色（HSL + 色相扩散）、运动（方向/速度/吸引）、生命周期（时长/淡入淡出）、高级（闪烁/模糊/种子/发射偏移/密度）。

## AE ExtendScript 快速参考

| 功能 | 代码 |
|---|---|
| 获取活动合成 | `app.project.activeItem` |
| 创建 Null 层 | `comp.layers.addNull()` |
| 创建 Solid 层 | `comp.layers.addSolid([r,g,b], name, w, h, 1)` |
| 添加效果 | `layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control")` |
| 设置表达式 | `layer.property("Position").expression = exprStr` |
| 保存/读取设置 | `app.settings.saveSetting("S","K",json)` / `getSetting` |
| ScriptUI 面板 | `new Window("palette", title)` |
| 强制布局 | `parent.layout.layout(true)` |
| 表达式读滑块 | `thisComp.layer("Name").effect("效果名")(1)` |

## 开发环境

- AE 2026 + ExtendScript（ES3）；语法检查 `node --check` / ExtendScript Toolkit
- 无构建工具；发布 = zip + onepage 落地页
