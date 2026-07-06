# 开发记录 — 星空粒子生成器

AE 2026 ExtendScript (JSX) 插件开发过程中的关键问题与解决方案。供后续类似项目参考。

---

## 目录

1. [ScriptUI 兼容性](#1-scriptui-兼容性)
2. [Shape Layer API 差异](#2-shape-layer-api-差异)
3. [颜色控制——中文版 AE 的属性名问题](#3-颜色控制中文版-ae-的属性名问题)
4. [颜色选取——ScriptUI 图形对象](#4-颜色选取scriptui-图形对象)
5. [Save / Load 预设——JSON Polyfill](#5-save--load-预设json-polyfill)
6. [属性访问 Fallback 链](#6-属性访问-fallback-链)
7. [编码问题——中文图层名](#7-编码问题中文图层名)
8. [粒子生成策略——Solid vs Shape Layer](#8-粒子生成策略solid-vs-shape-layer)
9. [调试策略](#9-调试策略)
10. [版本演进](#10-版本演进)

---

## 1. ScriptUI 兼容性

### 问题：panel 模式下的 statictext 样式

AE 2026 ScriptUI Panels 中，对 `statictext` 使用 `graphics.font` 和 `graphics.foregroundColor` 设置样式，在 dockable Panel 模式下会报错：

```
在行 XXX 无法执行脚本。文本图层没有源:
```

### 解决方案

移除所有 `statictext` 上的 `graphics.font` / `graphics.foregroundColor` 调用，使用默认 ScriptUI 样式。用 `preferredSize` 控制布局。

### 经验

- AE ScriptUI Panels 的驻留面板容器对 UI 控件的图形属性访问比独立窗口严格
- 使用 `(this instanceof Panel) ? this : new Window(...)` 做兼容，但 Panel 模式下要避免 `graphics` 属性操作

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

### 正确层级

```
ADBE Root Vectors Group (根 Contents)
  └─ ADBE Vector Group (形状组)
       └─ ADBE Vectors Group (组内 Contents)
            ├─ ADBE Vector Shape - Ellipse (椭圆)
            ├─ ADBE Vector Shape - Star (星形)
            ├─ ADBE Vector Shape - Rect (矩形)
            └─ ADBE Vector Graphic - Fill (填充)
```

### 星形参数

| 形状 | Type | Points | 其他 |
|------|------|--------|------|
| 四角星 | 1 (Star) | 4 | InnerRadius=35, OuterRadius=50 |
| 菱形 | 2 (Polygon) | 4 | Rotation=45, OuterRadius=50 |

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

## 5. Save / Load 预设——JSON Polyfill

### 问题：ExtendScript 无内置 JSON 对象

AE 2026 的 ExtendScript (ES3 方言) **没有**内置的 `JSON` 对象。`JSON.stringify()` 和 `JSON.parse()` 会导致 `ReferenceError: "JSON" is not defined`。

### 解决方案

在文件开头注入 JSON polyfill：

```javascript
if (typeof JSON === "undefined") { JSON = {}; }
if (typeof JSON.stringify !== "function") {
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
}
if (typeof JSON.parse !== "function") {
    JSON.parse = function(text) { return eval("(" + text + ")"); };
}
```

### 注意点

- `eval()` 在 ExtendScript 环境下安全（无沙箱 DOM），且是唯一可靠的 JSON 解析方式
- 手写 `stringify` 只需支持 string / number / boolean / array / object，无需处理 date / undefined / NaN
- 预设存储为 JSON 文件 + app.settings 双层持久化

---

## 6. 属性访问 Fallback 链

### 问题：单一 match name 在跨语言/跨版本 AE 中不稳定

单一 match name（如 `"ADBE Slider Control"`、`"ADBE Fill"`、`"ADBE Mask Atom"`）在中文版 AE 或不同版本中可能解析失败。

### 解决方案

创建通用 Fallback 函数，为每个关键属性准备多组候选名：

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

function getPropertySafe(parent, candidates) {
    for (var c = 0; c < candidates.length; c++) {
        try {
            var prop = parent.property(candidates[c]);
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

### 问题：使用中文名称（如 "星空控制器"）设置 Null 层名称，AE 时间轴仍显示 "空白"（默认名）

### 根因

.jsx 文件保存为 UTF-8（无 BOM）时，AE 在 Windows 中文系统上可能以 GBK 编码读取文件，导致中文字符被错误解析，`layer.name = "星空控制器"` 赋值不生效。

### 解决方案

在图层名/表达式引用中**避免使用中文**，改用清晰的英文名：

```javascript
var controllerName = "Ctrl_Starfield";  // 而非 "星空控制器"
```

### 经验

- 表达式中 `thisComp.layer("Ctrl_Starfield")` 引用按名称查找，英文名更可靠
- 用户可见的 UI 标签（statictext）使用中文无问题，因为 ScriptUI 渲染管线与文件编码独立
- AE 图层名用中文在读写 `.aep` 文件时也可能出现兼容问题

---

## 8. 粒子生成策略——Solid vs Shape Layer

### 两种方案的权衡

| 方案 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| **Shape Layer** | 原生矢量 + 圆形/星形 | AE 2026 Shape API 不稳定 | 需要复杂形状时 |
| **Solid 层** | `addSolid()` 全版本稳定 | 只有正方形，圆形需手动加 Mask | 基础粒子效果 |

### 最终选择：Solid + Mask

由于 AE 2026 中 Shape Layer 的 `addProperty` API 不稳定（match name 返回 null），选择了 **Solid 层 + Fill 效果** 的方案：

```javascript
var solid = comp.layers.addSolid([1, 1, 1], name, 100, 100, comp.pixelAspect);
solid.property("Position").expression = posExpr;
// ... 缩放/透明度表达式

// Fill 效果控制颜色
var fillFx = addPropertySafe(fx, ["ADBE Fill", "填充"]);
// 按值类型检测 Color 属性
```

圆形通过添加贝塞尔 Mask 实现（4 顶点 + 魔法常数 0.552284749831）。

### 性能

| 粒子数 | 生成耗时 | 预览 FPS |
|--------|---------|----------|
| 200 | ~2s | 30 |
| 500 | ~5s | 28-30 |
| 1000 | ~12s | 20-25 |
| 2000 | ~30s | 10-18 |

建议使用 200-500 粒子范围。

---

## 9. 调试策略

### 可复制的错误报告

AE 原生的 `alert()` 弹窗内容不可复制。实现自定义 `showErrorReport()` 函数：

```javascript
function showErrorReport(title, message, errObj, line) {
    var report = [];
    report.push("==============================");
    report.push("  " + title);
    report.push("==============================");
    // ... 错误详情 + AE 环境 + 调试日志
    // 显示在可滚动编辑框中，支持 Ctrl+A / Ctrl+C 复制
}
```

### 日志系统

```javascript
var g_errorLog = [];
function debugLog(msg) {
    g_errorLog.push("[" + new Date().toLocaleTimeString() + "] " + msg);
    $.writeln(msg);  // 输出到 ESTK 控制台
}
```

### 面板调试按钮

在 UI 中保留"调试"按钮，点击显示最近 30-40 条日志，支持复制到剪贴板（Windows `clip` 命令）。

---

## 10. 版本演进

| 版本 | 核心变更 |
|------|----------|
| v1.0 | 初始：Shape Layer 方案，ScriptUI 样式报错 |
| v1.1 | 修复 ScriptUI 兼容性 + 可复制错误报告 |
| v1.2 | 尝试 Shape Group 嵌套（match name 错误导致失败） |
| v1.3 | 改为 Solid 层方案 |
| v1.4 | 修复 Fill 效果 Color 名称遍历 + 控制器重建 |
| v1.5 | 恢复 Shape Layer（文档验证正确 match name），用户环境不可用 |
| v1.6 | Shape 形状选择（圆形/星/菱形/正方形） |
| v1.7 | 回退 v1.4 Solid 基线 + 圆形 Mask + 颜色选取器 + JSON polyfill + 属性 fallback |

### 最终技术栈

- **粒子层**：Solid + Fill 效果
- **颜色控制**：Fill 效果 Color 属性的表达式（HSL → RGB）
- **形状**：圆形（贝塞尔 Mask）、正方形（原生 Solid）
- **控制器**：Null 层 + 18 个 Slider Control
- **属性安全**：`addPropertySafe()` / `getPropertySafe()` 多候选名 fallback
- **JSON**：手写 polyfill
- **颜色预览**：`newBrush(BrushType.SOLID_COLOR, ...)`
