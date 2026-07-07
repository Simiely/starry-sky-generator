# 开发笔记 — 星空粒子生成器

> 记录 AE ExtendScript 插件开发中遇到的关键问题和解决方案，供后续项目参考。

---

## 技术栈

- **语言**: Adobe ExtendScript (ES3, 近似 JavaScript 1.5)
- **环境**: After Effects 2026 ScriptUI Panel
- **核心依赖**: AE SDK — 表达式引擎、Property Group API、app.settings

---

## 项目架构

```
starry-sky-generator.jsx
├── JSON Polyfill（ExtendScript 无原生 JSON，需自行实现）
├── 工具函数
│   ├── addPropertySafe()      — 跨语言属性安全添加
│   ├── getPropertySafe()      — 跨语言属性安全获取
│   ├── addCircleMask()        — 圆形 Mask 创建
│   └── addPolygonMask()       — 正多边形 Mask 创建
├── 表达式构建函数
│   ├── buildPositionExpression() — 位置（含发射区域/目标吸引/环绕）
│   ├── buildOpacityExpression()  — 透明度（含淡入淡出/闪烁）
│   ├── buildScaleExpression()    — 缩放
│   ├── buildColorExpression()    — HSL → RGB 颜色
│   └── buildBlurExpression()     — Mask 羽化模糊
├── 粒子生成核心 generateParticles()
├── UI 构建 buildUI()
│   ├── 粒子参数面板
│   ├── 发射区域面板（含 28 个控制器滑块）
│   ├── 运动控制面板
│   ├── 生命周期面板
│   ├── 高级效果面板
│   ├── 操作按钮行
│   ├── 快捷预设（4 内建）
│   └── 槽位预设（4 用户槽）
└── 启动入口（try/catch 初始化 + 错误报告）
```

---

## 关键问题记录

### 1. ScriptUI 自动布局中文标签截断

**现象**：中文 statictext 标签（如 `" 速度:"`）在无 `preferredSize` 时只显示部分文字。

**原因**：AE 2026 的 ScriptUI 自动布局对短宽度中英文混合文本计算不足。纯中文（5+字符）或纯 ASCII 标签正常，但 `空格+中文+英文` 组合容易被低估宽度。

**解决方案**：
- 单位标签（`%`、`s (秒)`、`px`、`→` 等）：加 `preferredSize` 保证最小宽度
- 内容标签（`色相:`、`数量:` 等）：不加固定宽度，自适应
- 避免标签文字中出现前导空格（影响自动宽度计算）

---

### 2. AE 属性 Match Name 本地化问题

**现象**：`addProperty` 时使用英文 match name 在中文版 AE 中不匹配。

**解决方案**：使用 `addPropertySafe` 函数，依次尝试多个候选名：

```javascript
addPropertySafe(fx, ["ADBE Fill", "ADBE Fill-0001", "填充"])
```

**可参考的属性候选名列表**：

| 用途 | 候选名 |
|------|--------|
| 填充 | `ADBE Fill`, `ADBE Fill-0001`, `填充` |
| 快速模糊 | `ADBE Fast Blur`, `ADBE Fast Blur-0001` |
| 高斯模糊 | `ADBE Gaussian Blur`, `ADBE Gaussian Blur-0001` |
| Mask 羽化 | `ADBE Mask Feather` |
| Mask 形状 | `ADBE Mask Shape` |
| Mask 透明度 | `ADBE Mask Opacity` |
| Mask 扩展 | `property(4)`（match name 不可靠） |

---

### 3. Mask 羽化 vs 高斯模糊 — 渲染顺序陷阱

**背景**：AE 渲染顺序中 Mask 在 Effect **之后**生效，这意味着：
1. Effect 模糊了一个带 Mask 的层
2. Mask 裁剪了模糊后的边缘
3. 模糊效果看起来被"切掉"了

**历史演进**：
- v1：`ADBE Fast Blur` → 被 Mask 裁剪
- v2：`ADBE Gaussian Blur` → 同样被 Mask 裁剪
- v3：`Mask Feather`（蒙版羽化）+ `Mask Expansion`（蒙版扩展负值）

**当前方案**：
- 圆形/多边形粒子：使用 Mask Feather + 表达式 `[random(b), random(b)]`，Mask Expansion 表达式读取羽化值取负 `mask(1).maskFeather → -f[0]`
- 正方形粒子（无 Mask）：使用 `ADBE Gaussian Blur` 效果

**关键注意点**：
- Mask Expansion 是 **1D 属性**（单个数值），不可用 `[x, y]` 数组！
- Mask Feather 是 2D 属性 `[x, y]`
- 扩展表达式直接读取羽化值，保证两者同步

---

### 4. Mask Property 索引顺序

Mask 对象的属性索引（按 `property(n)` 访问）：

| 索引 | 属性 | Match Name |
|------|------|------------|
| 1 | Mask Shape | `ADBE Mask Shape` |
| 2 | Mask Feather | `ADBE Mask Feather` |
| 3 | Mask Opacity | `ADBE Mask Opacity` |
| 4 | Mask Expansion | 不稳定，推荐 `property(4)` |

> **经验教训**：`ADBE Mask Expansion` 的 match name 在某些 AE 版本中不可靠，使用数字索引更安全。

---

### 5. 启动性能优化

**问题**：面板打开时卡顿 2-3 秒。

**原因**：
1. `updateSlotBtnState()` 在启动时被放在外层 `for(4次)` 循环内，导致 `4 × 4 = 16` 次 `app.settings.getSetting()` 磁盘读取
2. `panel.layout.layout(true)` 触发全量重排

**优化方案**：
- 启动时不检查槽位状态，按钮默认启用，点击时才检查
- `layout(true)` → `layout()`（增量布局）
- 但实测必须先 `layout()` 再 `show()`，否则面板空白
- `show()` 会触发首次布局，但手动 `layout()` + `center()` 必须在 `show()` 之前

**启动顺序模板**：

```javascript
panel.layout.layout();    // 先布局
panel.center();           // 再居中
panel.show();             // 再显示
```

---

### 6. ScriptUI 可见性切换导致布局错位

> 本文档记录的最具参考价值的问题。

**现象**：子 Group 的 `visible` 从 `false` 切为 `true` 后，后续兄弟元素不重新定位，导致文字被覆盖或重叠。

**布局结构示例**：

```
emitGroup (column)
├── ee1 (模式下拉行)          ← 始终可见
├── ee2 (图层/遮罩选择行)     ← 初始 visible=false
├── emitStatus (状态文字)     ← 夹在中间，位置受影响
└── ee3 (密度控制行)          ← 初始 visible=false
```

**原因**：ScriptUI 的 `visible` 属性变更**不会触发父容器的自动布局重算**。子元素保持初始布局时的 Y 坐标。

**根因分类**：
1. **位置偏移** — `ee2` 从 0 高度变为实际高度，`emitStatus` 没有下移，被 `ee2` 覆盖
2. **宽度为零** — `statictext` 初始空文字，计算宽度为 0，即使后续设置文本也不自动扩展宽度
3. **父容器不重排** — 设置 `layout(true)` 可强制重排，但需要在 `visible` 变更后手动调用

**修复方案**：

```javascript
// 方法 A：visible 变更后强制父容器重布局（推荐）
ee2.visible = true;
ee3.visible = true;
parentGroup.layout.layout(true);

// 方法 B：将状态文字内嵌到可见性受控的 Group 内部（更彻底）
var ee2 = parentGroup.add("group");
ee2.add("statictext", ...);  // 图层标签
ee2.add("dropdownlist", ...); // 图层下拉
ee2.add("statictext", ...);   // 遮罩标签
ee2.add("dropdownlist", ...); // 遮罩下拉
ee2.add("statictext", ...);   // 状态文字 ← 内嵌，与 ee2 同显同隐
ee2.visible = false;
// 这时状态文字随 ee2 一起显示/隐藏，不存在布局偏移问题
```

**教训**：不要在可见性可变的 Group 之间放置独立的 UI 元素，它们的布局不会自动跟随 Group 的显隐变化。要么合并到同一个 Group，要么在 `visible` 变更后手动 `layout(true)`。

---

### 7. Dropdown 的 selection 状态管理

**现象**：`dropdownlist.removeAll()` 后 `selection` 变为 `null`，添加新 item 后需手动设置 `selection = 0`。

**常见遗漏点**：

```javascript
function populateMaskDropdown(comp) {
    maskDropdown.removeAll();
    for (var mi = 1; mi <= maskParade.numProperties; mi++) {
        maskDropdown.add("item", maskParade.property(mi).name);
    }
    // 遗漏：maskDropdown.selection = 0;  ← 没有这行，selection 为 null
}
```

**后果**：读取 `maskDropdown.selection.text` 时返回 `null`，三元表达式走 `"-"`，状态显示永远为 `-`。

**原则**：**任何对 Dropdown 的增删操作后，都必须重新设置 `selection`**。

---

### 8. 清理脚本的副作用

**现象**：使用 Python 脚本批量正则替换 `preferredSize` / `alignment` 后，产生编译错误。

**发现的问题**：
- 残留碎屑：`btnGroup;, "bottom"];`（部分移除的对齐代码）
- 重复变量名：`countValue countValue.characters = 5;`（移除了 preferredSize 但变量名残留）

**经验教训**：批量文本处理脚本必须验证完整性：
- 大括号平衡检查
- 语法合法性验证（AE 的 ExtendScript Toolkit 的 Check Syntax 功能）
- 不能仅依赖正则，正则无法处理嵌套结构

---

### 9. 槽位预设数据格式不一致

**现状**：
- 槽位使用 `app.settings.saveSetting/getSetting` 存储 JSON 字符串
- Key：`StarrySkyGenerator/Slot1` ~ `Slot4`
- Value：`getUIParams()` 返回的 JSON 对象

**坑**：`getUIParams()` 使用**英文键名**（`count`, `sizeMin`...），而内建预设使用**中文键名**（`"粒子数量"`, `"最小尺寸"`...）。两者**不互通**，不可混用。

---

### 10. 表达式中的 seedRandom 规范

所有粒子表达式使用 `seedRandom(index + seedVal + offset, true)` 确保：

```javascript
seedRandom(index + seedVal + 10000, true); // 位置用偏移 10000
seedRandom(index + seedVal + 20000, true); // 颜色用偏移 20000
seedRandom(index + seedVal + 30000, true); // 模糊用偏移 30000
```

**规则**：
- 每个粒子有独立的随机值（通过 `index` 区分）
- 不同属性使用不同偏移量（保证属性间不相关）
- 改变 `seedVal` 可整体重置所有随机分布
- 第二个参数 `true` 表示不随时间变化

---

### 11. 蒙版羽化 + 蒙版扩展同步

**问题**：Mask Feather 和 Mask Expansion 各自的表达式独立 `seedRandom`，随机值不同步，导致模糊边缘形状不匹配。

**解决方案**：扩展表达式**直接读取羽化值**，而非各自独立随机：

```javascript
// Mask Feather 表达式
b = random(0, blurStr);  // 随机羽化强度
[b, b];                  // 羽化是 2D 属性

// Mask Expansion 表达式（直接读取羽化值取负）
f = mask(1).maskFeather;  // 读取羽化值
-f[0];                    // 扩展取负，保证模糊边缘自然
```

这样扩展恒等于负羽化值，不受执行顺序影响。且 Mask Expansion 是 **1D**，取 `f[0]` 即可。

---

### 12. 控制器滑块注释

使用 `effect.comment = "说明文字"` 在 Effect Controls 面板中显示灰色注释提示。

```javascript
function addSlider(layer, name, defaultValue, min, max, comment) {
    var fx = layer.property("ADBE Effect Parade");
    var slider = fx.addProperty("ADBE Slider Control");
    slider.property("ADBE Slider Control-0001").setValue(defaultValue);
    slider.name = name;
    if (comment) slider.comment = comment;  // 灰色提示文字
}
```

通过 `addSliderToLayer(layer, name, defaultValue, comment)` 的第 4 个参数传入。

---

### 13. 颜色拾取器实现要点

- 使用 `ScriptUI` 的 `graphics.newBrush()` 绘制颜色方块
- 颜色对话框是独立的 `new Window("dialog", ...)`，含 HSL 滑块实时预览
- AE 中没有直接的颜色选择对话框 API，需自建

**Brush 创建注意事项**：
```javascript
var gfx = colorSwatch.graphics;
var bType = gfx.BrushType.SOLID_COLOR || 0;
var brush = gfx.newBrush(bType, [r, g, b]);
colorSwatch.graphics.backgroundColor = brush;
```

`BrushType` 在某些 AE 版本中可能不存在，需提供默认值 `0`。

---

### 14. Controller 滑块审计

28 个滑块全部被表达式引用（通过 `fx('名称')` 函数），**无冗余**。

**审计方法**：提取 `addSliderToLayer` 的参数名集合，与 `fx('名称')` 调用的名称集合做差集。

---

## 编码规范

### 命名约定

| 类型 | 格式 | 示例 |
|------|------|------|
| UI 字符串 | 中文 | `"数量:"`, `"颜色:"` |
| 内部变量 | 英文 camelCase | `emitModeDrop`, `colorSwatch` |
| 表达式字符串 | 英文 | AE 表达式引擎不依赖语言 |
| 函数名 | 英文 camelCase | `generateParticles`, `buildUI` |
| 事件回调 | `onChange` / `onClick` 前缀 | `emitLayerDrop.onChange` |

### 调试工具

- `debugLog(msg)` — 写入 `$.writeln` 日志
- `showErrorReport()` — 弹窗错误报告，含行号和环境信息
- `safeExecute(func)` — 带 try/catch 的安全执行包装

### 错误处理策略

1. 所有 UI 回调用 `try/catch` 包裹（避免一个回调挂掉整个面板）
2. 关键错误弹窗 `showErrorReport()`（包含最近 20 条 debugLog）
3. 非关键错误静默处理（`catch (e) {}`）

### 跨版本兼容

- 使用 `addPropertySafe` 处理多语言 match name
- 添加 fallback 值（如 `BrushType.SOLID_COLOR || 0`）
- Mask Expansion 使用数字索引而非 match name

---

## AE ExtendScript 快速参考

| 功能 | 代码 |
|------|------|
| 获取活动合成 | `app.project.activeItem` |
| 创建 Null 层 | `comp.layers.addNull()` |
| 创建 Solid 层 | `comp.layers.addSolid([r,g,b], name, w, h, 1)` |
| 添加效果 | `layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control")` |
| 设置表达式 | `layer.property("位置").expression = "value + 10;"` |
| 保存设置 | `app.settings.saveSetting("Section", "Key", jsonStr)` |
| 读取设置 | `app.settings.getSetting("Section", "Key")` |
| ScriptUI 面板 | `new Window("palette", title)` 或作为 Panel 嵌入 |
