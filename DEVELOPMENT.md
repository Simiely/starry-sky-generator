# 开发笔记 — 星空粒子生成器

> 记录 AE ExtendScript 插件开发中的关键问题和解决方案。涵盖 ScriptUI 布局陷阱、表达式逻辑错误、参数传递问题、性能优化等多方面经验，供后续 AE 插件开发参考。

---

## 技术栈

- **语言**: Adobe ExtendScript (ES3)
- **环境**: After Effects 2026 ScriptUI Panel
- **核心依赖**: AE SDK — 表达式引擎、Property Group API、app.settings

---

## 架构

```
starry-sky-generator.jsx
├── JSON Polyfill
├── 工具函数（addPropertySafe, getPropertySafe, addSliderToLayer）
├── 形状工具（圆形/多边形 Mask 构建）
├── 核心函数（getActiveComp, ensureComp, getOrCreateController）
├── 表达式构建
│   ├── buildPositionExpression() — 位置（发射区+吸引+环绕）
│   ├── buildOpacityExpression()   — 透明度（淡入淡出+闪烁）
│   ├── buildScaleExpression()     — 缩放
│   ├── buildColorExpression()     — HSL→RGB
│   └── buildBlurExpression()      — 蒙版羽化模糊
├── 粒子生成 generateParticles()
├── UI 构建 buildUI()（ScriptUI Palette + 7 个功能面板）
└── 启动入口（try/catch + 错误报告）
```

---

## 关键问题记录

### 1. ScriptUI 可见性切换 → 布局错位

**触发条件**: Group 的 `visible` 从 `false` 切 `true` 后，后续兄弟元素位置不自动更新。

**现象**: 选择"遮罩范围"后，状态文字 `emitStatus` 被新显示的图层/遮罩下拉行覆盖。

**根因**:
1. ScriptUI 的 `visible` 变更 **不触发父容器自动布局重算**
2. statictext 初始空文字 → 计算宽度为 0 → 即使设置 text 也不自动扩展

**解决方案**:
- **方案 A**：`visible=true` 后手动调用 `parentGroup.layout.layout(true)` 强制重排
- **方案 B**（推荐）：将状态文字**内嵌到同显同隐的 Group 内部**，避免 z-order 问题

**教训**: 不要在可见性可变的 Group 之间放置独立 UI 元素。

---

### 2. 吸引无效 — 排查三部曲

这是本次开发中最复杂的调试案例，涉及三层问题。

#### 第一层：表达式代码根本未被生成

**根因**: `getUIParams()` 对 `targetMask` 的判断过于严格：
```javascript
targetMask: (targetMode === 2 && targetMaskDrop.selection && !startWith("("))
    ? targetMaskDrop.selection.text : "";
```
当图层无遮罩时，`targetMaskDrop.selection` 为 null → `targetMask = ""`。而 `buildPositionExpression()` 的条件：
```javascript
if (targetMode === 2 && targetLayer && targetMask)  // "" is falsy → 跳过
```
**导致吸引分支完全不执行，`attraction` 始终为 0。**

**修复**: 增加降级逻辑 — `targetMask` 为空或图层无遮罩时，退化为图层中心位置作为吸引目标。

#### 第二层：公式使数值归零

**根因**: 旧公式 `pull = attraction * (tLocal / attractDur)`。用户设 `attractDur=234.5s`，粒子生命周期 2~6s。最大 `pull = 10 × 6/234.5 = 0.25`，即只移动 25% 距离，肉眼不可见。

**修复**: 改用速度加法公式 `vx += 方向 * attraction * speed`，力度与 `attractDur` 无关。

#### 第三层：固定乘数 50 不合理

**根因**: `vx += 方向 * attraction * 50`，用固定 50px/s 做乘数。快粒子(100px/s)几乎不受影响，慢粒子(10px/s)被完全支配。

**修复**: 改用粒子自身的 `speed`: `vx += 方向 * attraction * speed`，快慢粒子感受一致。

---

### 3. 死代码 — 参数传入但表达式未使用

**密度参数**: `density` 传入 `buildPositionExpression()` 但从未在任何 `p.push()` 中引用。本意是控制"遮罩内发射的粒子占比"，但表达式全写死为遮罩内发射。

**修复**: 加入密度判断逻辑 — 每粒子用 `seedRandom` 随机决定从遮罩内还是全合成发射：
```javascript
seedRandom(index + seed + 6000, true);
if (random(0, 100) < emitDensity) { /* 遮罩内 */ } else { /* 全合成 */ }
```

**通用教训**: 每个 function 的参数必须全部 grep 确认被实际使用。

---

### 4. 预设完全失效 — 中文 Key vs 英文 Key

**根因**: `applyBuiltInPreset` 调用 `applyUIToController(controller, preset)`，preet 用中文 key（`"粒子数量"`, `"色相(0-360)"`），而 `applyUIToController` 读英文 key（`params.count`, `params.hue`）。所有 `updateControllerSlider` 命中 `value === undefined` 直接 return，28 个滑块全部停留在默认值。

**影响**: 预设的粒子颜色、运动方向、吸引参数等全部无效。只有粒子数量正确（因为有独立逻辑）。

**修复**: 先 `applyPresetToUI(preset)`（设 UI），再 `getUIParams()`（用英文 key 回读），再 `applyUIToController(controller, params)`。

---

### 5. ScriptUI 赋值 Bug — `.preferredSize =` 陷阱

**问题代码**:
```javascript
var emitDenVal = ee3.add("statictext", undefined, "100%").preferredSize = [40, 18];
```

**根因**: 赋值表达式返回**被赋的值** `[40, 18]`（数组），不是静态文本控件。`emitDenVal` 变成一个数组，后续 `.text = ` 赋值无效果。

**正确写法**:
```javascript
var emitDenVal = ee3.add("statictext", undefined, "100%");
emitDenVal.preferredSize = [40, 18];
```

---

### 6. 下拉菜单 selection 状态管理

**经典陷阱**: `dropdownlist.removeAll()` 后 `selection` 变为 `null`。手动添加 item 后需显式 `selection = 0`。

**遗漏时的表现**: 读取 `dropdown.selection.text` 返回 null，状态文字显示 `"-"` 而非实际选取内容。

**出现位置**: `populateEmitMask()` 和 `populateTargetMask()` 两个函数均缺失 `selection = 0`。

**规则**: 任何 Dropdown 的增删操作后必须重新设置 `selection`。

---

### 7. AE 渲染顺序陷阱 — Mask vs Effect

**问题**: 对带 Mask 的层添加 Gaussian Blur 效果 → 模糊边缘被 Mask 裁剪。

**原因**: AE 渲染顺序：Effect → Mask。Effect 先应用，然后 Mask 裁剪结果。

**解决方案**:
- 圆形/多边形粒子：Mask Feather（mask 自身属性，不受渲染顺序影响）
- 正方形粒子（无 Mask）：Gaussian Blur 效果

**注意**: Mask Expansion 是 **1D 属性**，Mask Feather 是 **2D 属性**。

---

### 8. 种子随机系统 — seedRandom offset 管理

所有粒子表达式依赖 `seedRandom` 确保每粒子独立且可重置的随机值。关键规则：

1. 使用 `seedRandom(index + seedValue + OFFSET, timeless=true)` 确保稳定性
2. **不同属性使用不同 offset**（1000=生命周期，2000=起始位置，3000=颜色，5000=目标，6000=密度判断，8000=时间偏移，9000=缩放变化，10000=模糊）
3. **同一属性跨表达式使用相同 offset** 以保证同步（如 Position 和 Opacity 共用 offset 1000 读生命周期）
4. `timeless=true` 使值不随时间漂移（每个粒子每帧得到相同随机值）
5. 改变种子值可整体重置所有分布

---

### 9. 表达式构建中的参数引用

**`fx()` 帮助函数**将 UI 中文参数名转为表达式字符串：
```javascript
function fx(name, def) {
    return '(ctrl.effect("' + name + '") ? ctrl.effect("' + name + '")(1) : ' + def + ')';
}
```
生成 `(ctrl.effect("吸引力") ? ctrl.effect("吸引力")(1) : 0)` — 含 fallback 的三元表达式。

**注意**: `ctrl` 变量由 `thisComp.layer("Ctrl_Starfield")` 定义，必须在表达式中先声明。

---

### 10. 颜色选取器清理

- 去除了所有 `;;` 双分号、多余空行、前导空格
- 添加 `alignChildren` 实现统一左对齐
- 修复了 S 行的冗余 `preferredSize` 赋值
- 预览区添加了固定尺寸占位

---

### 11. 清洗脚本副作用

**前因**: Python 正则批量移除 `preferredSize`/`alignment` 导致了语法碎片。

**教训**: 自动化文本处理脚本必须做语法验证（大括号平衡、变量引用完整性），正则无法处理嵌套结构。AE ExtendScript Toolkit 的 Check Syntax 是必备验证工具。

---

### 12. 内存/启动性能

**问题**: 面板启动卡顿 2-3s。`4个槽位 × 4次 settings 读取 = 16次` 磁盘 IO。

**优化**: 启动时懒加载槽位状态，按钮默认启用，点击时才读取。

**启动顺序**: `layout()` → `center()` → `show()`，三个步骤缺一不可。

---

### 13. 跨语言兼容

| 场景 | 方案 |
|------|------|
| 属性 Match Name | `addPropertySafe` 多候选 fallback |
| Mask Expansion | `property(4)` 数字索引替代 match name |
| 效果名 | 同时提供英文/中文候选 |
| UI 字符串 | 全部使用中文 |
| 表达式 | 全部使用英文 |

---

## 参数速查表

### 表达式用到的所有 controller 滑块（28个）

| 名称 | 默认值 | 用途 |
|------|--------|------|
| 粒子数量 | 50 | 显示用 |
| 最小尺寸 | 3 | Scale 表达式 |
| 最大尺寸 | 15 | Scale 表达式 |
| 初始大小(%) | 80 | Scale 表达式 |
| 最终大小(%) | 100 | Scale 表达式 |
| 缩放最小变化(%) | 80 | Scale 表达式 |
| 缩放最大变化(%) | 120 | Scale 表达式 |
| 色相(0-360) | 210 | Color 表达式 |
| 色相随机范围 | 30 | Color 表达式 |
| 饱和度 | 80 | Color 表达式 |
| 亮度 | 50 | Color 表达式 |
| 运动方向(度) | 270 | Position 表达式 |
| 方向随机范围 | 180 | Position 表达式 |
| 最小速度 | 30 | Position 表达式 |
| 最大速度 | 100 | Position 表达式 |
| 最小生命周期(秒) | 2 | Position+Opacity+Scale |
| 最大生命周期(秒) | 6 | Position+Opacity+Scale |
| 淡入时长(秒) | 0.3 | Opacity 表达式 |
| 淡出时长(秒) | 0.8 | Opacity 表达式 |
| 闪烁强度 | 50 | Opacity 表达式 |
| 闪烁速度 | 2 | Opacity 表达式 |
| 随机种子 | 42 | 所有表达式 |
| 模糊强度 | 0 | Blur 表达式 |
| 模糊比例(%) | 100 | Blur 表达式 |
| 吸引力 | 0 | Position 表达式 |
| 吸引时长 | 2 | Position 表达式 |
| 发射密度 | 100 | Position 表达式 |
| 发射随机偏移 | 0 | Position+Opacity+Scale |

---

## AE ExtendScript 快速参考

| 功能 | 代码 |
|------|------|
| 获取活动合成 | `app.project.activeItem` |
| 创建 Null 层 | `comp.layers.addNull()` |
| 创建 Solid 层 | `comp.layers.addSolid([r,g,b], name, w, h, 1)` |
| 添加效果 | `layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control")` |
| 设置表达式 | `layer.property("Position").expression = exprStr` |
| 保存设置 | `app.settings.saveSetting("Section", "Key", jsonStr)` |
| 读取设置 | `app.settings.getSetting("Section", "Key")` |
| ScriptUI 面板 | `new Window("palette", title)` |
| 强制布局 | `parent.layout.layout(true)` |
| 表达式读滑块 | `thisComp.layer("Name").effect("效果名")(1)` |
