# 开发日志 — 星空粒子生成器

## 技术栈

- **语言**: Adobe ExtendScript (ES3)
- **环境**: After Effects 2026 ScriptUI Panel
- **核心依赖**: AE SDK — 表达式引擎、Property Group API

## 架构

```
starry-sky-generator.jsx
├── JSON Polyfill（AE 2026 内置, 实为备胎）
├── 工具函数（属性安全添加、Mask 创建等）
├── 表达式构建函数（位置/缩放/不透明度/颜色/模糊）
├── 粒子生成核心（generateParticles）
├── UI 构建（ScriptUI Palette）
│   ├── 粒子参数面板
│   ├── 发射区域面板
│   ├── 运动控制面板
│   ├── 生命周期面板
│   ├── 高级效果面板
│   ├── 操作按钮
│   ├── 快捷预设
│   └── 槽位预设
└── 启动入口（try/catch 初始化）
```

## 关键问题记录

### 1. ScriptUI 自动布局中文标签截断

**现象**：中文 statictext 标签（如 `" 速度:"`）在无 `preferredSize` 时只显示部分文字。

**原因**：AE 2026 的 ScriptUI 自动布局对短宽度中英文混合文本计算不足。纯中文（5+字符）或纯 ASCII 标签正常，但 `空格+中文+英文` 组合容易被低估宽度。

**解决方案**：
- 单位标签（`%`、`s (秒)`、`px`、`→` 等）：加 `preferredSize` 保证最小宽度
- 内容标签（`色相:`、`数量:` 等）：不加固定宽度，自适应
- 避免标签文字中出现前导空格（影响自动宽度计算）

### 2. AE 属性 Match Name 本地化问题

**现象**：`addProperty` 时使用英文 match name 在中文版 AE 中不匹配。

**解决方案**：使用 `addPropertySafe` 函数，依次尝试多个候选名：
```javascript
addPropertySafe(fx, ["ADBE Fill", "ADBE Fill-0001", "填充"])
```

### 3. Mask 羽化 vs 高斯模糊

**历史**：
- v1: 使用 `ADBE Fast Blur` 效果 → 被 Mask 裁剪，看起来不生效
- v2: 改用 `ADBE Gaussian Blur` → 同样被 Mask 裁剪
- v3: 改为 **Mask Feather**（蒙版羽化）+ **Mask Expansion**（蒙版扩展负值）

**原因**：AE 渲染顺序中 Mask 在 Effect 之后，Mask 裁剪会隐藏模糊效果。而 Mask Feather 直接在蒙版边缘生效。

**当前方案**：
- 圆形/多边形粒子：使用 Mask Feather → `[b, b]` + Mask Expansion → `mask(1).maskFeather` 读取羽化值取负
- 正方形粒子（无 Mask）：使用 `ADBE Gaussian Blur` 效果

**注意**：Mask Expansion 是 1D 属性（单个数值），不可用 `[x, y]` 数组。

### 4. Mask Property 索引

Mask 对象的属性索引：
- `property(1)`: Mask Shape (`ADBE Mask Shape`)
- `property(2)`: Mask Feather (`ADBE Mask Feather`)
- `property(3)`: Mask Opacity (`ADBE Mask Opacity`)
- `property(4)`: Mask Expansion

Match name `ADBE Mask Expansion` 在某些 AE 版本不可靠，推荐用 `mask.property(4)`。

### 5. 启动性能优化

**问题**：面板打开时卡顿 2-3 秒。

**原因**：
1. `updateSlotBtnState()` 在启动时被放在一个外层 `for(4次)` 循环内，导致 `4 × 4 = 16` 次 `app.settings.getSetting()` 磁盘读取
2. `panel.layout.layout(true)` 触发全量重排

**优化**：
- 启动时不检查槽位状态，按钮默认启用，点击时才检查
- `layout(true)` → `layout()`（增量布局），但实测必须先 `layout()` 再 `show()`，否则面板空白
- `show()` 会触发首次布局，但手动 `layout()` + `center()` 必须在 `show()` 之前

### 6. 清理脚本副作用

**现象**：多次使用 Python 脚本批量移除 `preferredSize` / `alignment`，导致：
- 残留碎屑：`btnGroup;, "bottom"];`（部分移除的对齐代码）
- 重复变量名：`countValue countValue.characters = 5;`（移除了 preferredSize 但变量名残留）

**经验**：批量文本处理脚本必须验证完整性（大括号平衡、语法检查），不能仅依赖正则。

### 7. 槽位预设数据格式

槽位使用 `app.settings.saveSetting/getSetting` 存储 JSON 字符串。键值对：
- Key: `StarrySkyGenerator/Slot1` ~ `Slot4`
- Value: `getUIParams()` 返回的 JSON 对象

**注意**：`getUIParams()` 使用英文键名（`count`, `sizeMin`...），而内建预设使用中文键名（`"粒子数量"`, `"最小尺寸"`...）。两者不互通。

### 8. 表达式中的 seedRandom

所有粒子表达式使用 `seedRandom(index + seedVal + 10000, true)` 确保：
- 每个粒子有独立的随机值
- 不同属性（位置/颜色/模糊）使用不同偏移量
- 改变种子值可整体重置随机分布

### 9. 蒙版羽化 + 蒙版扩展同步

**问题**：Mask Feather 和 Mask Expansion 各自的表达式独立 `seedRandom`，随机值不同步。

**解决方案**：扩展表达式直接读取羽化值：
```javascript
// Mask Feather 表达式 → seedRandom → random(0, blurStr) → b → [b, b]
// Mask Expansion 表达式 → mask(1).maskFeather → -f[0]
```
这样扩展恒等于负羽化值，不受执行顺序影响。

**注意**：Mask Feather 是 2D 属性 `[x, y]`，Mask Expansion 是 1D 属性（单个数值）。

### 10. 控制器滑块注释

使用 `effect.comment = "说明文字"` 在 Effect Controls 面板中显示灰色注释。
通过 `addSliderToLayer(layer, name, defaultValue, comment)` 的第 4 个参数传入。

### 11. Controller 滑块审计

28 个滑块全部被表达式引用（通过 `fx()` 函数），**无冗余**。

审计方法：提取 `addSliderToLayer` 的参数名集合，与 `fx('名称')` 调用的名称集合做差集。

## 编码规范

- 所有 UI 相关字符串使用中文
- 内部变量名使用英文 camelCase
- 表达式字符串使用英文（AE 表达式引擎不依赖语言）
- debugLog 用于运行日志，正式版可移除
