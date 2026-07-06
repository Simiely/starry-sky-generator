# 星空粒子生成器 (Starry Sky Generator)

适用于 **Adobe After Effects 2026** (中文版/英文版) 的 ExtendScript 插件，在合成中生成可控的星空粒子效果。

## 功能

- **粒子系统**：全合成范围随机发射，Wrap-around 循环运动
- **表达式驱动**：位置 / 缩放 / 透明度 / 颜色 (HSL) 均由表达式控制
- **实时调节**：通过 `Ctrl_Starfield` 控制层的 18 个滑块参数实时调整
- **颜色控制**：色相 / 饱和度 / 亮度 + 色相随机扩散 + RGB 颜色选取器
- **粒子形状**：圆形 (Solid + Mask) / 正方形 (原生 Solid)
- **生命周期**：每粒子独立生命时长 + 淡入淡出
- **闪烁效果**：Perlin 噪声驱动的随机闪烁
- **运动控制**：主方向 + 方向扩散 + 速度范围
- **4 个内置预设**：经典星空 / 彩色星云 / 极光飘动 / 金色粒子雨
- **预设保存 / 加载**：JSON 格式，支持文件读写
- **自动创建合成**：无活动合成时自动创建 (1920×1080, 30fps, 8s)
- **完整错误报告**：可复制的错误对话框，含 AE 环境信息

## 安装

1. 将 `starry-sky-generator.jsx` 复制到 AE ScriptUI Panels 目录：
   ```
   C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Scripts\ScriptUI Panels\
   ```
2. 重启 After Effects
3. 菜单：**窗口 > 星空粒子生成器**

## 使用方法

1. 打开或创建一个合成（如无则自动创建）
2. 在面板中调节粒子参数（数量 / 尺寸 / 颜色 / 运动 / 生命周期 / 闪烁）
3. 点击「生成粒子」
4. 在时间轴中找到 **Ctrl_Starfield** 层（绿色标签），展开效果面板调节滑块实时调整
5. 预设按钮可一键切换不同风格

## 文件

| 文件 | 说明 |
|------|------|
| `starry-sky-generator.jsx` | 主脚本，放入 ScriptUI Panels 目录 |
| `DEVELOPMENT.md` | 开发记录 & 踩坑指南 |

## 兼容性

- Adobe After Effects 2026 (中文版 & 英文版)
- 理论上兼容 AE CC 及以上版本
