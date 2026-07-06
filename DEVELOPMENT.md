# 开发记录 — 星空粒子生成器

AE 2026 ExtendScript (JSX) 插件开发过程中的关键问题与解决方案。供后续类似项目参考。

---

## 目录

1. [ScriptUI 兼容性](#1-scriptui-兼容性)
2. [Shape Layer API 差异](#2-shape-layer-api-差异)
3. [颜色控制——中文版 AE 的属性名问题](#3-颜色控制中文版-ae-的属性名问题)
4. [颜色选取——ScriptUI 图形对象](#4-颜色选取scriptui-图形对象)
5. [JSON Polyfill——ExtendScript 无内置 JSON](#5-json-polyfillextendscript-无内置-json)
6. [属性访问 Fallback 链](#6-属性访问-fallback-链)
7. [编码问题——中文图层名](#7-编码问题中文图层名)
8. [粒子生成策略——Solid vs Shape Layer](#8-粒子生成策略solid-vs-shape-layer)
9. [表达式跨语言兼容——不要用显示名访问属性](#9-表达式跨语言兼容不要用显示名访问属性)
10. [变量作用域陷阱——ExtendScript 的 var 提升](#10-变量作用域陷阱extendscript-的-var-提升)
11. [坐标空间——遮罩顶点到合成坐标](#11-坐标空间遮罩顶点到合成坐标)
12. [点阵内判定——表达式中的 Point-in-Polygon](#12-点阵内判定表达式中的-point-in-polygon)
13. [关键踩坑清单](#13-关键踩坑清单)
14. [版本演进](#14-版本演进)

---

## 1. ScriptUI 兼容性

### 问题：panel 模式下的 statictext 样式

AE 2026 ScriptUI Panels 中，对 `statictext` 使用 `graphics.font` 和 `graphics.foregroundColor` 设置样式，在 dockable Panel 模式下会报错：

```
在行 XXX 无法执行脚本。文本图层没有源:
```

### 解决方案

移除所有 `statictext` 上的 `graphics.font` / `graphics.foregroundColor` 调用，使用默认 ScriptUI 样式。用 `preferredSize` 控制布局。

### scrollpanel 不可用

AE 2026 ScriptUI **不支持** `scrollpanel` 容器类型：

```
Error: UI element type 'scrollpanel' is unknown or invalid in this context
```

改用 `panel.autoscroll = true`（Panel 原生属性，不受支持时静默忽略）。

### 经验

- AE ScriptUI Panels 的驻留面板容器对 UI 控件的图形属性访问比独立窗口严格
- `scrollpanel` 在 Adobe ExtendScript Toolkit 中存在，但在 AE 中不可用
- `.add("scrollpanel")` 会直接报错，不是静默失败

---

## 2. Shape Layer API 差异

### 问题：`addProperty` 返回 null

使用 Shape Layer 创建粒子时，在根 `Contents` 上直接添加椭圆会失败：

```javascript
var contents = shapeLayer.property("ADBE Root Vectors Group");
var ellipse = contents.addProperty("ADBE Vector Shape - Ellipse");
// → 返回 null！
```

### 根因：match name 错误

AE 2026 Shape Layer 需要严格的嵌套结构。关键区别：

| 组件 | ❌ 错误 match name | ✅ 正确 match name |
|------|--------------------|--------------------|
| 形状组 | `ADBE Vector Shape - Group`（这是 Path 元素！） | `ADBE Vector Group` |
| 组内 Contents | `("Contents")` 或 `"ADBE Root Vectors Group"` | `"ADBE Vectors Group"`（注意没有 `Root` 字样） |

知乎专栏关键陈述：_"最顶层 Contents 的 matchName 是 ADBE Root Vectors Group，剩下的全部都是 ADBE Vectors Group，少了一个 Root。"_

### 最终选择：Solid + Mask

尽管文档验证了正确的 match name，但 AE 2026 的 Shape Layer ExtendScript API 在用户环境中仍然不可靠。最终使用 **Solid 层 + Fill 效果**：

```javascript
var solid = comp.layers.addSolid([1, 1, 1], name, 100, 100, comp.pixelAspect);
```

形状通过 Mask 实现（正多边形顶点公式，不依赖 Shape Layer API）。

---

## 3. 颜色控制——中文版 AE 的属性名问题

### 问题：粒子显示红色，色相控制无效

在 **中文版 AE 2026** 中，Fill 效果的颜色属性显示名为 "颜色"，而非英文版的 "Color"。代码使用 `fprop.name === "Color"` 永远匹配不上，颜色表达式从未被设置，粒子显示 Fill 默认红色。

### 解决方案

不按名称匹配，改为按值类型检测：

```javascript
var pv = fprop.value;
if (pv instanceof Array && pv.length === 4) {
    // 这正是 Color 属性——任意语言都返回 [r, g, b, a]
    fprop.expression = colorExpr;
}
```

### 经验

- Fill 效果的 Color 属性始终返回 4 元素 RGBA 数组，这是语言无关的信号
- 类似的，Opacity 属性回退为检查 `fprop.name === "Opacity" || fprop.name.indexOf("不透明") >= 0`

---

## 4. 颜色选取——ScriptUI 图形对象

### 问题：颜色预览方块显示灰色而非实际颜色

在 ScriptUI 中，直接设置 `graphics.backgroundColor = [r, g, b, a]` 不会生效。

### 官方正确写法

参考 Adobe 官方 [ColorPicker.jsx](https://github.com/Adobe-CEP/CEP-Resources/blob/master/ExtendScript-Toolkit/Samples/javascript/ColorPicker.jsx) 示例，必须使用 `newBrush()` 创建 `ScriptUIBrush` 对象：

```javascript
// ❌ 错误
colorSwatch.graphics.backgroundColor = [r, g, b, 1];

// ✅ 正确
var gfx = colorSwatch.graphics;
var brush = gfx.newBrush(gfx.BrushType.SOLID_COLOR, [r, g, b]);
gfx.backgroundColor = brush;
gfx.disabledBackgroundColor = brush;
```

### 注意点

- 颜色数组为 **3 元素** `[r, g, b]`，范围 0.0–1.0（无 alpha，与 CSS 不同）
- 必须同时设置 `disabledBackgroundColor`，否则切换窗口焦点时颜色丢失
- `BrushType.SOLID_COLOR` 通过 `gfx.BrushType.SOLID_COLOR` 实例访问（而非全局 `ScriptUIGraphics.BrushType`），在中文版 AE 上更稳定
- 回退值 `0`：`SOLID_COLOR` 的枚举值为 0

---

## 5. JSON Polyfill——ExtendScript 无内置 JSON

### 问题：ExtendScript 无内置 JSON 对象

AE 2026 的 ExtendScript (ES3 方言) **没有**内置的 `JSON` 对象。`JSON.stringify()` 和 `JSON.parse()` 会导致 `ReferenceError: "JSON" is not defined`。

### 解决方案

手写实现，`parse` 使用 `eval()`：

```javascript
JSON.stringify = function(obj) {
    var t = typeof obj;
    if (t === "string") return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    if (t === "number" || t === "boolean") return String(obj);
    if (obj === null) return "null";
    if (obj instanceof Array) {
        var a = [];
        for (var i = 0; i < obj.length; i++) a.push(JSON.stringify(obj[i]));
        return "[" + a.join(",") + "]";
    }
    if (t === "object") {
        var keys = [];
        for (var k in obj) { if (obj.hasOwnProperty(k)) keys.push(k); }
        var pairs = [];
        for (var j = 0; j < keys.length; j++) {
            pairs.push(JSON.stringify(keys[j]) + ":" + JSON.stringify(obj[keys[j]]));
        }
        return "{" + pairs.join(",") + "}";
    }
    return "null";
};
JSON.parse = function(text) { return eval("(" + text + ")"); };
```

### 注意点

- `eval()` 在 ExtendScript 环境下安全（无沙箱 DOM），且是唯一可靠的 JSON 解析方式
- 手写 `stringify` 只需支持 string / number / boolean / array / object，无需处理 date / undefined / NaN
- 预设存储采用 `app.settings.saveSetting()` 持久化（键值对形式，跨会话保存，不依赖文件系统）

---

## 6. 属性访问 Fallback 链

### 问题：单一 match name 在跨语言/跨版本 AE 中不稳定

单一 match name（如 `"ADBE Slider Control"`、`"ADBE Fill"`、`"ADBE Mask Atom"`）在中文版 AE 或不同版本中可能解析失败。

### 解决方案

```javascript
function addPropertySafe(parent, candidates) {
    for (var c = 0; c < candidates.length; c++) {
        try {
            var prop = parent.addProperty(candidates[c]);
            if (prop) return prop;
        } catch (e) {}
    }
    return null;
}
```

### 应用范围

| 属性 | Fallback 列表 |
|------|---------------|
| Slider Control | `["ADBE Slider Control", "滑块控制"]` |
| Slider 值 | `["ADBE Slider Control-0001", "滑块", "Slider"]` |
| Fill 效果 | `["ADBE Fill", "填充"]` |
| Mask | `["ADBE Mask Atom", "Mask", "ADBE Mask Atom-0001"]` |
| Mask Shape | `["ADBE Mask Shape", "Mask Shape", "蒙版路径"]` |

---

## 7. 编码问题——中文图层名

### 问题：使用中文名称设置 Null 层名称，AE 时间轴仍显示 "空白"（默认名）

### 根因

.jsx 文件保存为 UTF-8（无 BOM）时，AE 在 Windows 中文系统上可能以 GBK 编码读取文件，导致中文字符被错误解析。

### 解决方案

图层名/表达式引用中**避免使用中文**，改用清晰的英文名：`"Ctrl_Starfield"`。

### 经验

- 表达式中 `thisComp.layer("Ctrl_Starfield")` 引用按名称查找，英文名更可靠
- 用户可见的 UI 标签（statictext）使用中文无问题，因为 ScriptUI 渲染管线与文件编码独立

---

## 8. 粒子生成策略——Solid vs Shape Layer

### 最终选择：Solid + Mask

由于 AE 2026 中 Shape Layer 的 `addProperty` API 不稳定，选择了 **Solid 层 + Fill 效果** 的方案：

```javascript
var solid = comp.layers.addSolid([1, 1, 1], name, 100, 100, comp.pixelAspect);
```

形状通过 Mask 路径实现：
- **圆形**：4 顶点贝塞尔曲线 Mask（`k = 0.552284749831 × 50`）
- **五边形、六边形**：三角函数计算正多边形顶点
- **正方形**：Solid 原生形状（无 Mask）

### 性能

| 粒子数 | 生成耗时 | 预览 FPS |
|--------|---------|----------|
| 200 | ~2s | 30 |
| 500 | ~5s | 28-30 |
| 1000 | ~12s | 20-25 |
| 2000 | ~30s | 10-18 |

建议使用 200-500 粒子范围。

---

## 9. 表达式跨语言兼容——不要用显示名访问属性

### 问题：表达式里的 `("滑块")` 在英文版 AE 失效

在表达式中使用 `ctrl.effect("运动方向(度)")("滑块")` 访问滑块数值属性的**显示名**，这在中文 AE 中工作，但英文版 AE 中该属性名为 `"Slider"`，导致表达式崩溃。

### 解决方案

使用索引 `(1)` 替代显示名 `("滑块")`：

```
❌ ctrl.effect("运动方向(度)")("滑块")
✅ ctrl.effect("运动方向(度)")(1)
```

Slider Control 的数值属性永远是属性索引 `(1)`，不依赖语言。

### 重要：null 安全访问

即使使用索引，也需要判空：

```
❌ ctrl.effect("运动方向(度)")(1)    ← 效果不存在时返回 undefined → undefined(1) 报错
✅ (ctrl.effect("运动方向(度)") ? ctrl.effect("运动方向(度)")(1) : 270)  ← 安全
```

使用工具函数简化：

```javascript
function fx(name, def) {
    return '(ctrl.effect("' + name + '") ? ctrl.effect("' + name + '")(1) : ' + def + ')';
}
```

生成：`var dir = (ctrl.effect("运动方向(度)") ? ctrl.effect("运动方向(度)")(1) : 270);`

---

## 10. 变量作用域陷阱——ExtendScript 的 var 提升

### 问题：按钮点击无反应

「保存预设」和「加载预设」按钮点击无反应，因为它们被后续的变量声明覆盖了。

### 根因

ExtendScript (ES3) **没有块级作用域**。`for` 循环里的 `var` 声明会 leak 到函数作用域：

```javascript
var saveBtn = ioBtnRow.add("button", "保存预设");  // ← 正确引用
var loadBtn = ioBtnRow.add("button", "加载预设");  // ← 正确引用

for (var si = 0; si < 4; si++) {
    var saveBtn = row.add("button", "存储 " + (si + 1));  // ← 覆盖了上面的！
    var loadBtn = row.add("button", "使用 " + (si + 1));  // ← 覆盖了上面的！
}

saveBtn.onClick = ...  // 现在 saveBtn 指向「存储 4」，不是「保存预设」
```

### 解决方案

循环中使用不同的变量名：

```javascript
for (var si = 0; si < 4; si++) {
    var slotSaveBtn = row.add("button", "存储 " + (si + 1));  // ✓ 不冲突
    var slotLoadBtn = row.add("button", "使用 " + (si + 1));
}
```

### 经验

- ExtendScript 中 `var` 的作用域是整个函数，不是 `for` 循环块
- 避免在循环中声明外层已有的同名变量
- 遇到"按钮无反应"之类的问题，先检查变量引用是否被覆盖

---

## 11. 坐标空间——遮罩顶点到合成坐标

### 问题：粒子从遮罩发射但位置不对

使用遮罩发射时，粒子从错误的位置出现。原因是**坐标空间不匹配**：

```
遮罩顶点坐标 = 图层本地空间（相对于图层的左上角）
粒子 Position  = 合成空间（相对于合成的左上角）
```

### 解决方案：使用 `toComp()`

官方 API `layer.toComp(point)` 将图层本地坐标转换为合成坐标，自动处理位置、锚点、缩放、旋转、父子级所有变换：

```javascript
// ❌ 手算偏移（不全面）
var eOffX = eLayer.transform.position[0] - eLayer.transform.anchorPoint[0];
var startX = eOffX + random(eL, eR);

// ✅ 官方 API（自动处理全部变换）
var rPt = eLayer.toComp([random(eL, eR), random(eT, eB)]);
var startX = rPt[0]; var startY = rPt[1];
```

### 注意点

- `toComp()` 是**表达式侧**的 API，在表达式中使用
- `ExtendScript` 侧只能用 `property("Position").value` 手算，但无法处理旋转/缩放/父子级
- 如果遮罩读取失败（顶点为空），直接 fallback 到 `[random(0, compWidth), random(0, compHeight)]`，**不再加 toComp**

---

## 12. 点阵内判定——表达式中的 Point-in-Polygon

### 问题：粒子只在遮罩的矩形边界内发射，而非实际形状

### 实现方案

使用射线法（Ray Casting）在表达式侧做点阵内判定。关键注意点：

1. **不用 `function` 关键字**：AE 表达式引擎不支持用户自定义函数，直接内联循环
2. **最多尝试 10 次**：避免表达式超时
3. **失败时退化为边界框随机**：不会报错

```javascript
// 内联 Point-in-Polygon（无 function 关键字）
for (var att = 0; att < 10; att++) {
    var tryX = random(eL, eR);
    var tryY = random(eT, eB);
    var inside = false;
    for (var i = 0, j = ePts.length - 1; i < ePts.length; j = i++) {
        var xi = ePts[i][0], yi = ePts[i][1];
        var xj = ePts[j][0], yj = ePts[j][1];
        if ((yi > tryY) != (yj > tryY) && tryX < (xj - xi) * (tryY - yi) / (yj - yi) + xi)
            inside = !inside;
    }
    if (inside) {
        var rPt = eLayer.toComp([tryX, tryY]);
        startX = rPt[0]; startY = rPt[1]; found = true; break;
    }
}
```

### 密度控制

结合密度滑块（0~100%），只有 `random(0, 100) < emitDen` 时才接受该点，实现稀疏填充。

### 经验

- AE 表达式中 `function` 关键字不被支持，会触发 `className` 错误
- 尝试 10 次对圆形遮罩（矩形利用率约 78%）命中概率接近 98%
- 对复杂星形遮罩也足够

---

## 13. 关键踩坑清单

| # | 问题 | 症状 | 根因 | 修复 |
|---|------|------|------|------|
| 1 | ScriptUI 报 "文本图层没有源" | 面板无法打开 | `statictext.graphics.font` 在 docked panel 中不可用 | 移除 graphics 调用 |
| 2 | AE 不识别 `scrollpanel` | 面板初始化报错 | AE ScriptUI 未实现该容器 | 回退到普通 Panel |
| 3 | Shape 层 `addProperty` 返回 null | 无法创建粒子 | match name 拼写错误 | 改用 Solid + Mask |
| 4 | 粒子显示红色 | 色相控制无效 | 中文版 AE 属性名为 "颜色" 不是 "Color" | 按值类型检测 |
| 5 | 颜色方块显示灰色 | 颜色预览不工作 | `backgroundColor` 需要 `newBrush()` | 使用官方 API |
| 6 | 按钮无反应 | 点击无效果 | `var` 变量在 for 循环中被覆盖 | 使用不同变量名 |
| 7 | 表达式报 "滑块" 不存在 | 表达式被禁用 | 显示名依赖语言 | 改用索引 `(1)` |
| 8 | 表达式 `effect("XXX")(1)` 报错 | `className` 错误 | 效果不存在时返回 `undefined` | 三元操作符判空 |
| 9 | 遮罩发射位置偏移 | 粒子不在遮罩内 | 坐标空间不匹配（本地 vs 合成） | 使用 `toComp()` 转换 |
| 10 | 粒子从矩形而非遮罩形状发射 | 遮罩外也有粒子 | 只在边界框内随机 | 内联 Point-in-Polygon |
| 11 | 粒子同时出生 | 所有粒子同相 | `time % lifeDuration` 无偏移 | 发射随机偏移滑块 |
| 12 | 闪烁不明显 | 几乎看不出来 | `noise() * 20` 仅 ±10 | 默认 50 + ×2 增益 |
| 13 | Spread 用法混淆 | 方向控制不直观 | 文档缺失 | 解释扇形角度含义 |

---

## 14. 版本演进

| 版本 | 核心变更 |
|------|----------|
| v1.0 | 初始：Shape Layer 方案，ScriptUI 样式报错 |
| v1.1 | 修复 ScriptUI 兼容性 + 可复制错误报告 |
| v1.2 | 尝试 Shape Group 嵌套（match name 错误导致失败） |
| v1.3 | 改为 Solid 层方案（Shape Layer 彻底放弃） |
| v1.4 | ✅ 验证通过的稳定基线：Solid + Fill + 控制器重建 |
| v1.5 | 恢复 Shape Layer（文档验证正确 match name，用户环境仍不可用） |
| v1.6 | Shape 形状选择（圆形/星/菱形/正方形） |
| v1.7 | 回退 v1.4 Solid 基线 + 圆形 Mask + 颜色选取器 + JSON polyfill + 属性 fallback |
| v1.8 | 发射区域（百分比滑块）+ 目标吸引（坐标点） |
| v1.9 | 遮罩发射 + Null 目标选取（下拉框 + 自动刷新） |
| v2.0 | Point-in-Polygon 精确遮罩发射 + 密度控制 + `toComp()` 坐标转换 |
| v2.x+ | 环绕开关、槽位预设、形状扩展（五/六边形）、初始/最终大小缩放、发射随机偏移、闪烁增强、UI 清理 |

### 最终技术栈

- **粒子层**：Solid + Fill 效果
- **颜色控制**：Fill 效果 Color 属性的表达式（HSL → RGB），按值类型检测
- **形状**：Mask 路径（圆形贝塞尔 / 正多边形 / Solid 原生）
- **发射区域**：全合成 / 遮罩 Point-in-Polygon 精确判定
- **目标吸引**：Null 点 / 遮罩范围 / 无
- **控制器**：Null 层 + 20+ 个 Slider Control
- **表达式安全**：三元操作符 null 保护 + 索引 `(1)` 访问
- **属性安全**：`addPropertySafe()` / `getPropertySafe()` 多候选名 fallback
- **JSON**：手写 polyfill（`eval` 解析）
- **颜色预览**：`newBrush(BrushType.SOLID_COLOR, ...)`
- **槽位预设**：`app.settings.saveSetting()` 持久化
- **错误处理**：全局 `safeExecute()` 包装 + 可复制错误报告
