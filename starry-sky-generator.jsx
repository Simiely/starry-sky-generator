/* ============================================================
   星空粒子生成器  v2.0
   Starry Sky Particle Generator for Adobe After Effects 2026

   基于 v1.4 Solid 方案，新增形状选择
   - 正方形: Solid 层（v1.4 原始方案）
   - 圆形: Solid + 椭圆 Mask

   安装：放入 AE 2026 的 ScriptUI Panels 目录
   路径：C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Scripts\ScriptUI Panels
   使用：窗口 > 星空粒子生成器
   ============================================================ */

{
    // ==================== JSON Polyfill（ExtendScript 无内置 JSON） ====================
    // 参考: AE-Lyrics-Animator DEVELOPMENT.md
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

    // ==================== 属性安全工具（参考 AE-Lyrics-Animator 的 Fallback 模式） ====================

    /**
     * 安全添加属性，支持多候选名 fallback
     * @param {PropertyGroup} parent - 父属性组
     * @param {Array} candidates - 候选 matchName 列表
     * @return {Property|null}
     */
    function addPropertySafe(parent, candidates) {
        for (var c = 0; c < candidates.length; c++) {
            try {
                var prop = parent.addProperty(candidates[c]);
                if (prop) return prop;
            } catch (e) {}
        }
        return null;
    }

    /**
     * 安全获取子属性，支持多候选名 fallback
     */
    function getPropertySafe(parent, candidates) {
        for (var c = 0; c < candidates.length; c++) {
            try {
                var prop = parent.property(candidates[c]);
                if (prop) return prop;
            } catch (e) {}
        }
        return null;
    }

    // ==================== 全局错误处理 & 调试工具 ====================

    var DEBUG = true;
    var g_errorLog = [];

    function debugLog(msg) {
        if (!DEBUG) return;
        var ts = new Date().toLocaleTimeString();
        var entry = "[" + ts + "] " + msg;
        g_errorLog.push(entry);
        $.writeln(entry);
    }

    function showErrorReport(title, message, errObj, line) {
        var report = [];
        report.push("==============================");
        report.push("  星空粒子生成器 错误报告");
        report.push("==============================");
        report.push("");
        report.push("错误: " + title);
        report.push("信息: " + message);
        if (line) report.push("行号: " + line);
        report.push("");
        report.push("--- 错误详情 ---");
        if (errObj) {
            report.push(errObj.toString());
            if (errObj.line) report.push("出错行: " + errObj.line);
            if (errObj.fileName) report.push("文件: " + errObj.fileName);
        }
        report.push("");
        report.push("--- AE 环境 ---");
        report.push("AE 版本: " + app.version);
        report.push("项目文件: " + (app.project.file ? app.project.file.fsName : "(未保存)"));
        try {
            var tmpComp = app.project.activeItem;
            if (tmpComp && tmpComp instanceof CompItem) {
                report.push("活动合成: " + tmpComp.name +
                    " (" + tmpComp.width + "x" + tmpComp.height + ", " +
                    tmpComp.frameRate + "fps, " + tmpComp.duration + "s)");
                report.push("图层数: " + tmpComp.numLayers);
            } else {
                report.push("活动合成: 无");
            }
        } catch (e) {
            report.push("活动合成: (获取失败)");
        }
        report.push("");
        report.push("--- 调试日志 (最近 20 条) ---");
        for (var li = Math.max(0, g_errorLog.length - 20); li < g_errorLog.length; li++) {
            report.push(g_errorLog[li]);
        }
        report.push("");
        report.push("==============================");
        report.push("请复制以上内容用于调试");
        report.push("==============================");

        var reportStr = report.join("\n");
        $.writeln(reportStr);

        var dlg = new Window("dialog", "错误报告 - 星空粒子生成器");
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.spacing = 8;
        dlg.margins = [12, 12, 12, 12];
        dlg.add("statictext", undefined, title).preferredSize = [420, 20];

        var detailScroll = dlg.add("edittext", undefined, reportStr,
            { multiline: true, readonly: true, scrolling: true });
        detailScroll.preferredSize = [420, 300];

        var btnGroup = dlg.add("group");
        btnGroup.orientation = "row";
        btnGroup.alignment = ["center", "bottom"];
        btnGroup.spacing = 10;

        var copyBtn = btnGroup.add("button", undefined, "复制错误信息到剪贴板");
        copyBtn.preferredSize = [180, 28];
        var closeBtn = btnGroup.add("button", undefined, "关闭");
        closeBtn.preferredSize = [80, 28];

        copyBtn.onClick = function() {
            try {
                var clipFile = new File(Folder.temp.fsName + "/ae_starry_error.txt");
                clipFile.encoding = "UTF-8";
                clipFile.open("w");
                clipFile.write(reportStr);
                clipFile.close();
                system.callSystem('cmd.exe /c clip < "' +
                    Folder.temp.fsName.replace(/\\/g, "\\\\") + '\\\\ae_starry_error.txt"');
                alert("错误信息已复制到剪贴板！");
                clipFile.remove();
            } catch (e2) {
                try {
                    var deskFile = new File(Folder.desktop.fsName + "/AE_星空粒子_错误报告.txt");
                    deskFile.encoding = "UTF-8";
                    deskFile.open("w");
                    deskFile.write(reportStr);
                    deskFile.close();
                    alert("已保存到桌面: AE_星空粒子_错误报告.txt");
                } catch (e3) {
                    alert("自动复制失败，请手动选中文本复制。");
                }
            }
        };
        closeBtn.onClick = function() { dlg.close(); };
        dlg.show();
    }

    function safeExecute(actionName, fn) {
        try { return fn(); } catch (e) {
            debugLog("ERROR in " + actionName + ": " + e.toString());
            showErrorReport("操作失败: " + actionName, e.toString(), e, e.line);
            return null;
        }
    }

    // ==================== 形状工具 ====================

    /**
     * 在 Solid 上创建圆形 mask
     * @param {AVLayer} solid - 100x100 的 solid 层
     */
    function addCircleMask(solid) {
        try {
            var maskGroup = solid.property("ADBE Mask Parade");
            if (!maskGroup) {
                debugLog("  addCircleMask: no Mask Parade");
                return false;
            }
            var mask = addPropertySafe(maskGroup,
                ["ADBE Mask Atom", "ADBE Mask Atom-0001", "Mask"]);
            if (!mask) {
                debugLog("  addCircleMask: could not add mask atom");
                return false;
            }
            mask.name = "Circle";

            var k = 0.552284749831 * 50;
            var maskShape = new Shape();
            maskShape.vertices = [[50, 0], [100, 50], [50, 100], [0, 50]];
            maskShape.inTangents = [[-k, 0], [0, -k], [k, 0], [0, k]];
            maskShape.outTangents = [[k, 0], [0, k], [-k, 0], [0, -k]];
            maskShape.closed = true;

            var shapeProp = getPropertySafe(mask,
                ["ADBE Mask Shape", "Mask Shape", "蒙版路径"]);
            if (!shapeProp) {
                debugLog("  addCircleMask: no mask shape property");
                return false;
            }
            shapeProp.setValue(maskShape);
            return true;
        } catch (e) {
            debugLog("  addCircleMask failed: " + e.toString());
            return false;
        }
    }

    function addPolygonMask(solid, sides) {
        try {
            var maskGroup = solid.property("ADBE Mask Parade");
            if (!maskGroup) { return false; }
            var mask = addPropertySafe(maskGroup,
                ["ADBE Mask Atom", "ADBE Mask Atom-0001", "Mask"]);
            if (!mask) { return false; }
            mask.name = "Polygon_" + sides;

            var cx = 50, cy = 50, r = 45;
            var verts = [];
            for (var vi = 0; vi < sides; vi++) {
                var a = -Math.PI / 2 + (2 * Math.PI * vi / sides);
                verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
            }

            var maskShape = new Shape();
            maskShape.vertices = verts;
            maskShape.closed = true;

            var shapeProp = getPropertySafe(mask,
                ["ADBE Mask Shape", "Mask Shape", "蒙版路径"]);
            if (!shapeProp) { return false; }
            shapeProp.setValue(maskShape);
            return true;
        } catch (e) {
            debugLog("  addPolygonMask failed (sides=" + sides + "): " + e.toString());
            return false;
        }
    }

    // ==================== 核心函数 ====================

    function getActiveComp() {
        try {
            var item = app.project.activeItem;
            if (item && item instanceof CompItem) return item;
            return null;
        } catch (e) { return null; }
    }

    function ensureComp() {
        var comp = getActiveComp();
        if (comp) return comp;
        debugLog("ensureComp: auto-creating comp...");
        var compName = "星空粒子";
        var baseName = compName;
        var idx = 1;
        while (true) {
            var exists = false;
            for (var ci = 1; ci <= app.project.items.length; ci++) {
                if (app.project.items[ci] instanceof CompItem &&
                    app.project.items[ci].name === compName) {
                    exists = true;
                    break;
                }
            }
            if (!exists) break;
            idx++;
            compName = baseName + " " + idx;
        }
        comp = app.project.items.addComp(compName, 1920, 1080, 1, 8, 30);
        comp.openInViewer();
        var bg = comp.layers.addSolid([0, 0, 0], "Background", comp.width, comp.height, 1);
        bg.moveToBeginning();
        return comp;
    }

    function getOrCreateController(comp) {
        debugLog("getOrCreateController()");
        var controllerName = "Ctrl_Starfield";
        for (var i = comp.numLayers; i >= 1; i--) {
            try {
                var ln = comp.layer(i).name;
                if (ln === controllerName || ln === "Starfield_Controller") {
                    comp.layer(i).remove();
                }
            } catch (e) {}
        }

        var nullLayer = comp.layers.addNull();
        nullLayer.name = controllerName;
        nullLayer.label = 9; // 绿色标签，方便在时间轴中识别

        addSliderToLayer(nullLayer, "粒子数量", 50);
        addSliderToLayer(nullLayer, "最小尺寸", 3);
        addSliderToLayer(nullLayer, "最大尺寸", 15);
        addSliderToLayer(nullLayer, "初始大小(%)", 80);
        addSliderToLayer(nullLayer, "最终大小(%)", 100);
        addSliderToLayer(nullLayer, "色相(0-360)", 210);
        addSliderToLayer(nullLayer, "色相随机范围", 30);
        addSliderToLayer(nullLayer, "饱和度", 80);
        addSliderToLayer(nullLayer, "亮度", 50);
        addSliderToLayer(nullLayer, "运动方向(度)", 270);
        addSliderToLayer(nullLayer, "方向随机范围", 180);
        addSliderToLayer(nullLayer, "最小速度", 30);
        addSliderToLayer(nullLayer, "最大速度", 100);
        addSliderToLayer(nullLayer, "最小生命周期(秒)", 2);
        addSliderToLayer(nullLayer, "最大生命周期(秒)", 6);
        addSliderToLayer(nullLayer, "淡入时长(秒)", 0.3);
        addSliderToLayer(nullLayer, "淡出时长(秒)", 0.8);
        addSliderToLayer(nullLayer, "闪烁强度", 50);
        addSliderToLayer(nullLayer, "闪烁速度", 2);
        addSliderToLayer(nullLayer, "随机种子", 42);
        // === v2.0 发射区域 + 目标吸引 ===
        addSliderToLayer(nullLayer, "吸引力", 0);
        addSliderToLayer(nullLayer, "吸引时长", 2);
        addSliderToLayer(nullLayer, "发射密度", 100);
        addSliderToLayer(nullLayer, "发射随机偏移", 0);
        return nullLayer;
    }

    function addSliderToLayer(layer, name, defaultValue) {
        var fxGroup = layer.property("ADBE Effect Parade");
        var effect = addPropertySafe(fxGroup,
            ["ADBE Slider Control", "ADBE Slider Control-0001", "滑块控制"]);
        if (!effect) throw new Error("无法添加滑块控制器: " + name);
        effect.name = name;
        var sliderProp = getPropertySafe(effect,
            ["ADBE Slider Control-0001", "滑块", "Slider"]);
        sliderProp.setValue(defaultValue);
    }

    function getControllerSliderValue(controller, sliderName) {
        try {
            var effects = controller.property("ADBE Effect Parade");
            for (var i = 1; i <= effects.numProperties; i++) {
                if (effects.property(i).name === sliderName) {
                    var sp = getPropertySafe(effects.property(i),
                        ["ADBE Slider Control-0001", "滑块", "Slider"]);
                    return sp ? sp.value : null;
                }
            }
        } catch (e) {}
        return null;
    }

    function updateControllerSlider(controller, sliderName, value) {
        if (value === undefined || value === null) return;
        try {
            var effects = controller.property("ADBE Effect Parade");
            for (var i = 1; i <= effects.numProperties; i++) {
                if (effects.property(i).name === sliderName) {
                    var sp = getPropertySafe(effects.property(i),
                        ["ADBE Slider Control-0001", "滑块", "Slider"]);
                    if (sp) sp.setValue(value);
                    return;
                }
            }
        } catch (e) {
            debugLog("  slider error '" + sliderName + "': " + e.toString());
        }
    }

    // ==================== 表达式生成 ====================

    function buildPositionExpression(emitMode, emitLayer, emitMask, targetMode, targetLayer, targetMask, density, attractDur, wrapAround) {
        if (density === undefined) density = 100;
        var p = []; // short alias

        function fx(name, def) { return '(ctrl.effect("' + name + '") ? ctrl.effect("' + name + '")(1) : ' + def + ')'; }

        p.push('seedRandom(index, true);');
        p.push('');
        p.push('var ctrl = thisComp.layer("Ctrl_Starfield");');
        p.push('');

        // ===== 发射区域 =====
        if (emitMode === 1 && emitLayer && emitMask) {
            p.push('var eLayer = thisComp.layer("' + emitLayer + '");');
            p.push('var ePts = [];');
            p.push('if (eLayer) {');
            p.push('    var eMask = eLayer.mask("' + emitMask + '");');
            p.push('    if (eMask) {');
            p.push('        var ePath = eMask.maskPath;');
            p.push('        if (ePath) { ePts = ePath.points(); }');
            p.push('    }');
            p.push('}');
            p.push('var eL = 99999, eR = -99999, eT = 99999, eB = -99999;');
            p.push('for (var vi = 0; vi < ePts.length; vi++) {');
            p.push('    var vx = ePts[vi][0], vy = ePts[vi][1];');
            p.push('    if (vx < eL) eL = vx; if (vx > eR) eR = vx;');
            p.push('    if (vy < eT) eT = vy; if (vy > eB) eB = vy;');
            p.push('}');
            p.push('if (ePts.length === 0) { eL = 0; eR = thisComp.width; eT = 0; eB = thisComp.height; }');
            p.push('var eLifeMin = ' + fx('最小生命周期(秒)', 2) + ';');
            p.push('var eLifeMax = ' + fx('最大生命周期(秒)', 6) + ';');
            p.push('seedRandom(index + ' + fx('随机种子', 42) + ' + 1000, true);');
            p.push('var eLifeDur = random(eLifeMin, eLifeMax);');
            p.push('var eCycle = Math.floor(time / eLifeDur);');
            p.push('seedRandom(index + eCycle + ' + fx('随机种子', 42) + ' + 2000, true);');
            // 点阵内发射：在边界框内随机取点，判断是否在多边形内部（无 function 关键字，内联实现）
            // 最多尝试 10 次，避免表达式超时
            p.push('var foundPt = false;');
            p.push('for (var att = 0; att < 10; att++) {');
            p.push('    var tryX = random(eL, eR);');
            p.push('    var tryY = random(eT, eB);');
            p.push('    var inside = false;');
            p.push('    for (var i = 0, j = ePts.length - 1; i < ePts.length; j = i++) {');
            p.push('        var xi = ePts[i][0], yi = ePts[i][1];');
            p.push('        var xj = ePts[j][0], yj = ePts[j][1];');
            p.push('        if ((yi > tryY) != (yj > tryY) && tryX < (xj - xi) * (tryY - yi) / (yj - yi) + xi) inside = !inside;');
            p.push('    }');
            p.push('    if (inside) {');
            p.push('        var rPt = eLayer.toComp([tryX, tryY]);');
            p.push('        var startX = rPt[0]; var startY = rPt[1]; foundPt = true; break;');
            p.push('    }');
            p.push('}');
            p.push('if (!foundPt) {');
            p.push('    var rPt = eLayer.toComp([random(eL, eR), random(eT, eB)]);');
            p.push('    var startX = rPt[0]; var startY = rPt[1];');
            p.push('}');
        } else {
            p.push('var eLifeMin = ' + fx('最小生命周期(秒)', 2) + ';');
            p.push('var eLifeMax = ' + fx('最大生命周期(秒)', 6) + ';');
            p.push('seedRandom(index + ' + fx('随机种子', 42) + ' + 1000, true);');
            p.push('var eLifeDur = random(eLifeMin, eLifeMax);');
            p.push('var eCycle = Math.floor(time / eLifeDur);');
            p.push('seedRandom(index + eCycle + ' + fx('随机种子', 42) + ' + 2000, true);');
            p.push('var startX = random(0, thisComp.width);');
            p.push('var startY = random(0, thisComp.height);');
        }

        // ===== 运动控制 =====
        p.push('');
        p.push('var dirBase = ' + fx('运动方向(度)', 270) + ';');
        p.push('var dirSpread = ' + fx('方向随机范围', 180) + ';');
        p.push('var speedMin = ' + fx('最小速度', 30) + ';');
        p.push('var speedMax = ' + fx('最大速度', 100) + ';');

        // ===== 目标吸引 =====
        if (targetMode === 1 && targetLayer) {
            p.push('');
            p.push('var tPos = thisComp.layer("' + targetLayer + '").transform.position;');
            p.push('var tX = tPos[0], tY = tPos[1];');
            p.push('var attraction = ' + fx('吸引力', 0) + ' / 100;');
        } else if (targetMode === 2 && targetLayer && targetMask) {
            p.push('');
            p.push('var tLayer = thisComp.layer("' + targetLayer + '");');
            p.push('var tPts = [];');
            p.push('if (tLayer) {');
            p.push('    var tMask = tLayer.mask("' + targetMask + '");');
            p.push('    if (tMask) {');
            p.push('        var tPath = tMask.maskPath;');
            p.push('        if (tPath) { tPts = tPath.points(); }');
            p.push('    }');
            p.push('}');
            p.push('var tL = 99999, tR = -99999, tT = 99999, tB = -99999;');
            p.push('for (var tvi = 0; tvi < tPts.length; tvi++) {');
            p.push('    var tvx = tPts[tvi][0], tvy = tPts[tvi][1];');
            p.push('    if (tvx < tL) tL = tvx; if (tvx > tR) tR = tvx;');
            p.push('    if (tvy < tT) tT = tvy; if (tvy > tB) tB = tvy;');
            p.push('}');
            p.push('if (tPts.length === 0) { tL = 0; tR = 100; tT = 0; tB = 100; }');
            p.push('seedRandom(index + ' + fx('随机种子', 42) + ' + 5000, true);');
            p.push('var tPt = tPts.length > 0 ? tLayer.toComp([random(tL, tR), random(tT, tB)]) : [random(tL, tR), random(tT, tB)];');
            p.push('var tX = tPt[0];');
            p.push('var tY = tPt[1];');
            p.push('var attraction = ' + fx('吸引力', 0) + ' / 100;');
        } else {
            p.push('');
            p.push('var tX = thisComp.width / 2, tY = thisComp.height / 2;');
            p.push('var attraction = 0;');
        }

        // ===== 运动与 Wrap =====
        p.push('');
        p.push('seedRandom(index + ' + fx('随机种子', 42) + ', true);');
        p.push('var angle = degreesToRadians(dirBase - dirSpread/2 + random(0, dirSpread));');
        p.push('var speed = random(speedMin, speedMax);');
        // 发射随机偏移：每粒子独立时间偏移，错开出生
        p.push('var emitOff = ctrl.effect("发射随机偏移") ? ctrl.effect("发射随机偏移")(1) : 0;');
        p.push('seedRandom(index + ' + fx('随机种子', 42) + ' + 8000, true);');
        p.push('var timeShift = emitOff > 0 ? random(0, emitOff) : 0;');
        p.push('var adjTime = time + timeShift;');
        p.push('var tLocal = adjTime % eLifeDur;');
        p.push('var driftX = Math.cos(angle) * speed * tLocal;');
        p.push('var driftY = Math.sin(angle) * speed * tLocal;');
        p.push('var attractDur = ' + fx('吸引时长', 2) + ';');
        p.push('var vx = Math.cos(angle) * speed;');
        p.push('var vy = Math.sin(angle) * speed;');
        p.push('if (tLocal < attractDur && attraction > 0) {');
        p.push('    var curX = startX + driftX;');
        p.push('    var curY = startY + driftY;');
        p.push('    var toX = tX - curX;');
        p.push('    var toY = tY - curY;');
        p.push('    var toD = Math.sqrt(toX*toX + toY*toY);');
        p.push('    if (toD > 1) { vx += (toX / toD) * (attraction / 100) * speed; vy += (toY / toD) * (attraction / 100) * speed; }');
        p.push('}');
        p.push('var rawX = startX + vx * tLocal;');
        p.push('var rawY = startY + vy * tLocal;');
        if (wrapAround) {
            p.push('var wrapX = rawX % thisComp.width;');
            p.push('var wrapY = rawY % thisComp.height;');
            p.push('if (wrapX < 0) wrapX += thisComp.width;');
            p.push('if (wrapY < 0) wrapY += thisComp.height;');
            p.push('[wrapX, wrapY];');
        } else {
            p.push('[rawX, rawY];');
        }
        return p.join('\n');
    }

    function buildOpacityExpression() {
        return [
            'seedRandom(index, true);',
            '',
            'var ctrl = thisComp.layer("Ctrl_Starfield");',
            'var lifeMin = ctrl.effect("最小生命周期(秒)") ? ctrl.effect("最小生命周期(秒)")(1) : 2;',
            'var lifeMax = ctrl.effect("最大生命周期(秒)") ? ctrl.effect("最大生命周期(秒)")(1) : 6;',
            'var fadeIn = ctrl.effect("淡入时长(秒)") ? ctrl.effect("淡入时长(秒)")(1) : 0.3;',
            'var fadeOut = ctrl.effect("淡出时长(秒)") ? ctrl.effect("淡出时长(秒)")(1) : 0.8;',
            'var twinkleStrength = ctrl.effect("闪烁强度") ? ctrl.effect("闪烁强度")(1) : 50;',
            'var twinkleSpeed = ctrl.effect("闪烁速度") ? ctrl.effect("闪烁速度")(1) : 2;',
            'var seedVal = ctrl.effect("随机种子") ? ctrl.effect("随机种子")(1) : 42;',
            '',
            'seedRandom(index + seedVal + 1000, true);',
            'var lifeDuration = random(lifeMin, lifeMax);',
            'seedRandom(index + seedVal + 8000, true);',
            'var emitOff = ctrl.effect("发射随机偏移") ? ctrl.effect("发射随机偏移")(1) : 0;',
            'var offTime = emitOff > 0 ? random(0, emitOff) : 0;',
            'var cycleTime = (time + offTime) % lifeDuration;',
            '',
            'var baseOpacity = 100;',
            'if (cycleTime < fadeIn) {',
            '    baseOpacity = linear(cycleTime, 0, fadeIn, 0, 100);',
            '} else if (cycleTime > lifeDuration - fadeOut) {',
            '    baseOpacity = linear(cycleTime, lifeDuration - fadeOut, lifeDuration, 100, 0);',
            '}',
            '',
            'var twinkle = 0;',
            'if (twinkleStrength > 0) {',
            '    twinkle = noise(time * twinkleSpeed + index) * twinkleStrength * 2;',
            '}',
            'Math.max(0, Math.min(100, baseOpacity + twinkle));'
        ].join('\n');
    }

    function buildScaleExpression() {
        return [
            'seedRandom(index, true);',
            'var ctrl = thisComp.layer("Ctrl_Starfield");',
            'var sizeMin = ctrl.effect("最小尺寸") ? ctrl.effect("最小尺寸")(1) : 3;',
            'var sizeMax = ctrl.effect("最大尺寸") ? ctrl.effect("最大尺寸")(1) : 15;',
            'var initPct = ctrl.effect("初始大小(%)") ? ctrl.effect("初始大小(%)")(1) : 80;',
            'var finlPct = ctrl.effect("最终大小(%)") ? ctrl.effect("最终大小(%)")(1) : 100;',
            'var lifeMin = ctrl.effect("最小生命周期(秒)") ? ctrl.effect("最小生命周期(秒)")(1) : 2;',
            'var lifeMax = ctrl.effect("最大生命周期(秒)") ? ctrl.effect("最大生命周期(秒)")(1) : 6;',
            'var seedVal = ctrl.effect("随机种子") ? ctrl.effect("随机种子")(1) : 42;',
            'seedRandom(index + seedVal + 2000, true);',
            'var s = random(sizeMin, sizeMax);',
            'var dur = random(lifeMin, lifeMax);',
            'seedRandom(index + seedVal + 8000, true);',
            'var emitOff = ctrl.effect("发射随机偏移") ? ctrl.effect("发射随机偏移")(1) : 0;',
            'var timeShift = emitOff > 0 ? random(0, emitOff) : 0;',
            'var tLocal = (time + timeShift) % dur;',
            'var pct = initPct / 100 + (finlPct - initPct) / 100 * (tLocal / dur);',
            '[s * pct, s * pct];'
        ].join('\n');
    }

    function buildColorExpression() {
        return [
            'seedRandom(index, true);',
            'var ctrl = thisComp.layer("Ctrl_Starfield");',
            'var hueBase = ctrl.effect("色相(0-360)") ? ctrl.effect("色相(0-360)")(1) : 210;',
            'var hueVar = ctrl.effect("色相随机范围") ? ctrl.effect("色相随机范围")(1) : 30;',
            'var sat = ctrl.effect("饱和度") ? ctrl.effect("饱和度")(1) : 80;',
            'var light = ctrl.effect("亮度") ? ctrl.effect("亮度")(1) : 50;',
            'var seedVal = ctrl.effect("随机种子") ? ctrl.effect("随机种子")(1) : 42;',
            '',
            'seedRandom(index + seedVal + 3000, true);',
            'var h = hueBase + random(-hueVar/2, hueVar/2);',
            'h = h % 360; if (h < 0) h += 360;',
            'var s = sat / 100; var l = light / 100;',
            'var c = (1 - Math.abs(2 * l - 1)) * s;',
            'var x = c * (1 - Math.abs(((h / 60) % 2) - 1));',
            'var m = l - c / 2;',
            'var r, g, b;',
            'if (h < 60) { r = c; g = x; b = 0; }',
            'else if (h < 120) { r = x; g = c; b = 0; }',
            'else if (h < 180) { r = 0; g = c; b = x; }',
            'else if (h < 240) { r = 0; g = x; b = c; }',
            'else if (h < 300) { r = x; g = 0; b = c; }',
            'else { r = c; g = 0; b = x; }',
            '[r + m, g + m, b + m, 1];'
        ].join('\n');
    }

    // ==================== 粒子生成与清除 ====================

    function generateParticles(comp, controller, count, shapeIdx, emitMode, emitLayer, emitMask, targetMode, targetLayer, targetMask, emitDen, attractDur, wrapAround) {
        debugLog("generateParticles() count=" + count + " shape=" + shapeIdx);
        if (shapeIdx === undefined) shapeIdx = 0;

        app.beginUndoGroup("生成星空粒子");
        try {
            controller.moveToEnd();

            // 删除旧粒子
            for (var i = comp.numLayers; i >= 1; i--) {
                try {
                    if (comp.layer(i).name.indexOf("Star_Particle_") === 0) {
                        comp.layer(i).remove();
                    }
                } catch (e) {}
            }

            var actualCount = Math.max(1, Math.min(2000, Math.round(count)));
            debugLog("  creating " + actualCount + " particles...");

            var posExpr = buildPositionExpression(emitMode, emitLayer, emitMask, targetMode, targetLayer, targetMask, emitDen, attractDur, wrapAround);
            var opacityExpr = buildOpacityExpression();
            var scaleExpr = buildScaleExpression();
            var colorExpr = buildColorExpression();

            for (var p = 1; p <= actualCount; p++) {
                var particleName = "Star_Particle_" + padNumber(p, 4);

                // === Solid 层（v1.4 验证稳定） ===
                var solid = comp.layers.addSolid([1, 1, 1], particleName, 100, 100, comp.pixelAspect);

                // Transform 表达式
                solid.property("Position").expression = posExpr;
                solid.property("Scale").expression = scaleExpr;
                solid.property("Opacity").expression = opacityExpr;

                // Fill 效果控制颜色
                var fx = solid.property("ADBE Effect Parade");
                var fillFx = addPropertySafe(fx,
                    ["ADBE Fill", "ADBE Fill-0001", "填充"]);
                if (fillFx) {
                    for (var fi = 1; fi <= fillFx.numProperties; fi++) {
                        var fprop = fillFx.property(fi);
                        try {
                            var pv = fprop.value;
                            // 按值类型检测：Color 属性返回 4 元素 RGBA 数组（不依赖语言）
                            if (pv instanceof Array && pv.length === 4) {
                                fprop.expression = colorExpr;
                            }
                            // 不透明度：名为 Opacity 或 不透明度
                            else if (fprop.name === "Opacity" || fprop.name.indexOf("不透明") >= 0) {
                                fprop.setValue(1);
                            }
                        } catch (eName) {}
                    }
                }

                // === 形状 ===
                if (shapeIdx === 0) {
                    // 圆形：添加椭圆 mask
                    addCircleMask(solid);
                } else if (shapeIdx === 2) {
                    // 五边形
                    addPolygonMask(solid, 5);
                } else if (shapeIdx === 3) {
                    // 六边形
                    addPolygonMask(solid, 6);
                }
                // shapeIdx === 1: 正方形（原生 Solid，不做任何处理）

                if (p % 100 === 0) {
                    debugLog("    " + p + "/" + actualCount + " created");
                }
            }

            updateControllerSlider(controller, "粒子数量", actualCount);
            debugLog("  DONE: " + actualCount + " particles");
            alert("已生成 " + actualCount + " 个星空粒子！\n\n可通过「Ctrl_Starfield」层调整所有参数。");

        } catch (e) {
            debugLog("  FAILED: " + e.toString());
            showErrorReport("生成粒子失败",
                "在生成第 " + (typeof p !== "undefined" ? p : "?") + " 个粒子时出错", e, e.line);
            throw e;
        } finally {
            app.endUndoGroup();
        }
    }

    function clearParticles(comp) {
        app.beginUndoGroup("清除星空粒子");
        try {
            var removed = 0;
            for (var i = comp.numLayers; i >= 1; i--) {
                try {
                    if (comp.layer(i).name.indexOf("Star_Particle_") === 0) {
                        comp.layer(i).remove();
                        removed++;
                    }
                } catch (e) {}
            }
            alert("已清除 " + removed + " 个粒子层。");
        } catch (e) {
            showErrorReport("清除粒子失败", e.toString(), e, e.line);
        } finally {
            app.endUndoGroup();
        }
    }

    function clearAll(comp) {
        app.beginUndoGroup("清除全部星空元素");
        try {
            var removed = 0;
            for (var i = comp.numLayers; i >= 1; i--) {
                try {
                    var name = comp.layer(i).name;
                    if (name.indexOf("Star_Particle_") === 0 ||
                        name === "Ctrl_Starfield" || name === "Starfield_Controller") {
                        comp.layer(i).remove();
                        removed++;
                    }
                } catch (e) {}
            }
            alert("已清除全部星空元素（共 " + removed + " 层）。");
        } catch (e) {
            showErrorReport("清除全部失败", e.toString(), e, e.line);
        } finally {
            app.endUndoGroup();
        }
    }

    function padNumber(num, width) {
        var s = num.toString();
        while (s.length < width) s = "0" + s;
        return s;
    }

    // ==================== 预设系统 ====================

    function getPresetFromController(controller) {
        var preset = {};
        var names = [
            "粒子数量", "最小尺寸", "最大尺寸",
            "色相(0-360)", "色相随机范围", "饱和度", "亮度",
            "运动方向(度)", "方向随机范围", "最小速度", "最大速度",
            "最小生命周期(秒)", "最大生命周期(秒)", "淡入时长(秒)", "淡出时长(秒)",
            "闪烁强度", "闪烁速度", "随机种子"
        ];
        for (var i = 0; i < names.length; i++) {
            preset[names[i]] = getControllerSliderValue(controller, names[i]);
        }
        return preset;
    }

    function applyPresetToController(controller, preset) {
        for (var key in preset) {
            if (preset.hasOwnProperty(key)) {
                updateControllerSlider(controller, key, preset[key]);
            }
        }
    }

    function savePreset(controller) {
        try {
            var preset = getPresetFromController(controller);
            var jsonStr = JSON.stringify(preset, null, 2);
            var file = File.saveDialog("保存星空预设", "*.json");
            if (file) {
                file.encoding = "UTF-8";
                file.open("w");
                file.write(jsonStr);
                file.close();
                alert("预设已保存！");
            }
        } catch (e) {
            showErrorReport("保存预设失败", e.toString(), e, e.line);
        }
    }

    function loadPreset(controller, comp) {
        try {
            var file = File.openDialog("加载星空预设", "*.json");
            if (!file) return;
            file.encoding = "UTF-8";
            file.open("r");
            var jsonStr = file.read();
            file.close();
            var preset = JSON.parse(jsonStr);
            applyPresetToController(controller, preset);
            if (confirm("预设已加载。是否重新生成粒子？")) {
                generateParticles(comp, controller, Math.round(getControllerSliderValue(controller, "粒子数量")), 0, 0, "", "", 0, "", "", 100, 2, true);
            }
        } catch (e) {
            showErrorReport("加载预设失败", e.toString(), e, e.line);
        }
    }

    var builtInPresets = {
        "经典星空": {
            "粒子数量": 300, "最小尺寸": 2, "最大尺寸": 10,
            "形状": 0,
            "色相(0-360)": 210, "色相随机范围": 20, "饱和度": 30, "亮度": 95,
            "运动方向(度)": 270, "方向随机范围": 30, "最小速度": 10, "最大速度": 40,
            "最小生命周期(秒)": 3, "最大生命周期(秒)": 8,
            "淡入时长(秒)": 0.3, "淡出时长(秒)": 0.5,
            "闪烁强度": 25, "闪烁速度": 1.5, "随机种子": 42,
            "发射模式": 0, "发射图层": "", "发射遮罩": "",
            "目标模式": 0, "目标图层": "", "目标遮罩": "", "吸引力": 0,
            "吸引时长": 2,
            "初始大小%": 80, "最终大小%": 100,
            "发射密度": 100, "发射随机偏移": 0
        },
        "彩色星云": {
            "粒子数量": 500, "最小尺寸": 3, "最大尺寸": 20,
            "形状": 0,
            "色相(0-360)": 0, "色相随机范围": 360, "饱和度": 80, "亮度": 85,
            "运动方向(度)": 0, "方向随机范围": 360, "最小速度": 5, "最大速度": 30,
            "最小生命周期(秒)": 1, "最大生命周期(秒)": 5,
            "淡入时长(秒)": 0.2, "淡出时长(秒)": 1,
            "闪烁强度": 40, "闪烁速度": 3, "随机种子": 123,
            "发射模式": 0, "发射图层": "", "发射遮罩": "",
            "目标模式": 0, "目标图层": "", "目标遮罩": "", "吸引力": 0,
            "吸引时长": 2,
            "初始大小%": 50, "最终大小%": 100,
            "发射密度": 100, "发射随机偏移": 0
        },
        "极光飘动": {
            "粒子数量": 400, "最小尺寸": 4, "最大尺寸": 25,
            "形状": 0,
            "色相(0-360)": 160, "色相随机范围": 60, "饱和度": 70, "亮度": 80,
            "运动方向(度)": 90, "方向随机范围": 20, "最小速度": 20, "最大速度": 80,
            "最小生命周期(秒)": 2, "最大生命周期(秒)": 4,
            "淡入时长(秒)": 0.5, "淡出时长(秒)": 1.5,
            "闪烁强度": 15, "闪烁速度": 2, "随机种子": 777,
            "发射模式": 0, "发射图层": "", "发射遮罩": "",
            "目标模式": 0, "目标图层": "", "目标遮罩": "", "吸引力": 0,
            "吸引时长": 2,
            "初始大小%": 80, "最终大小%": 100,
            "发射密度": 100, "发射随机偏移": 0
        },
        "金色粒子雨": {
            "粒子数量": 250, "最小尺寸": 2, "最大尺寸": 8,
            "形状": 1,
            "色相(0-360)": 45, "色相随机范围": 15, "饱和度": 90, "亮度": 75,
            "运动方向(度)": 180, "方向随机范围": 15, "最小速度": 80, "最大速度": 200,
            "最小生命周期(秒)": 1.5, "最大生命周期(秒)": 3,
            "淡入时长(秒)": 0.1, "淡出时长(秒)": 0.3,
            "闪烁强度": 10, "闪烁速度": 4, "随机种子": 256,
            "发射模式": 0, "发射图层": "", "发射遮罩": "",
            "目标模式": 0, "目标图层": "", "目标遮罩": "", "吸引力": 0,
            "吸引时长": 2,
            "初始大小%": 30, "最终大小%": 80,
            "发射密度": 100, "发射随机偏移": 0
        }
    };

    // ==================== UI 构建 ====================

    function buildUI(thisObj) {
        debugLog("buildUI() starting...");

        var panel = (thisObj instanceof Panel) ? thisObj :
            new Window("palette", "星空粒子生成器 v2.0", undefined, {resizeable: true});

        panel.orientation = "column";
        panel.alignChildren = ["fill", "top"];
        panel.spacing = 3;
        panel.margins = [6, 6, 6, 6];

        // ===== 标题 =====
        var titleRow = panel.add("group");
        titleRow.orientation = "row";
        titleRow.alignment = ["fill", "top"];
        titleRow.alignChildren = ["left", "center"];
        titleRow.add("statictext", undefined, "★  星空粒子生成器  v2.0").preferredSize = [300, 24];

        var line1 = panel.add("panel");
        line1.preferredSize = [-1, 2];

        // ===== 状态栏 =====
        var statusRow = panel.add("group");
        statusRow.orientation = "row";
        statusRow.alignment = ["fill", "top"];
        statusRow.alignChildren = ["left", "center"];
        statusRow.add("statictext", undefined, "状态: ").preferredSize = [40, 18];
        var statusText = statusRow.add("edittext", undefined, "就绪");
        statusText.preferredSize = [200, 18];
        statusText.active = false;
        function setStatus(msg) { statusText.text = msg; }

        statusRow.add("statictext", undefined, "  AE " + app.version).preferredSize = [80, 18];

        var line2 = panel.add("panel");
        line2.preferredSize = [-1, 2];

        // ==============================
        //  粒子参数
        // ==============================
        var paramGroup = panel.add("panel");
        paramGroup.text = " 粒子参数 ";
        paramGroup.orientation = "column";
        paramGroup.alignChildren = ["fill", "top"];
        paramGroup.spacing = 2;
        paramGroup.margins = [4, 10, 4, 4];

        var r1 = paramGroup.add("group");
        r1.orientation = "row"; r1.alignment = ["fill", "center"];
        r1.add("statictext", undefined, "数量:").preferredSize = [50, 18];
        var countSlider = r1.add("slider", undefined, 50, 10, 2000);
        countSlider.preferredSize = [100, 20];
        var countValue = r1.add("edittext", undefined, "50");
        countValue.preferredSize = [55, 20]; countValue.characters = 5;
        countSlider.onChanging = function() { countValue.text = Math.round(countSlider.value).toString(); };
        countValue.onChange = function() {
            var v = parseInt(countValue.text);
            if (!isNaN(v)) countSlider.value = Math.max(10, Math.min(2000, v));
        };

        var r1b = paramGroup.add("group");
        r1b.orientation = "row"; r1b.alignment = ["fill", "center"];
        r1b.add("statictext", undefined, "尺寸:").preferredSize = [50, 18];
        var sizeMinInput = r1b.add("edittext", undefined, "3");
        sizeMinInput.preferredSize = [55, 20]; sizeMinInput.characters = 5;
        r1b.add("statictext", undefined, " ~ ").preferredSize = [20, 18];
        var sizeMaxInput = r1b.add("edittext", undefined, "15");
        sizeMaxInput.preferredSize = [55, 20]; sizeMaxInput.characters = 5;
        r1b.add("statictext", undefined, " px").preferredSize = [25, 18];

        var r1d = paramGroup.add("group");
        r1d.orientation = "row"; r1d.alignment = ["fill", "center"];
        r1d.add("statictext", undefined, "缩放:").preferredSize = [50, 18];
        var sizeInitInput = r1d.add("edittext", undefined, "80");
        sizeInitInput.preferredSize = [55, 20]; sizeInitInput.characters = 5;
        r1d.add("statictext", undefined, "% ~").preferredSize = [28, 18];
        var sizeFinalInput = r1d.add("edittext", undefined, "100");
        sizeFinalInput.preferredSize = [55, 20]; sizeFinalInput.characters = 5;
        r1d.add("statictext", undefined, " %").preferredSize = [20, 18];

        var r1c = paramGroup.add("group");
        r1c.orientation = "row"; r1c.alignment = ["fill", "center"];
        r1c.add("statictext", undefined, "形状:").preferredSize = [50, 18];
        var shapeDropdown = r1c.add("dropdownlist", undefined, ["圆形", "正方形", "五边形", "六边形"]);
        shapeDropdown.selection = 0;
        shapeDropdown.preferredSize = [120, 20];

        var r2 = paramGroup.add("group");
        r2.orientation = "row"; r2.alignment = ["fill", "center"];
        r2.add("statictext", undefined, "色相:").preferredSize = [50, 18];
        var hueSlider = r2.add("slider", undefined, 210, 0, 360);
        hueSlider.preferredSize = [80, 20];
        var hueValue = r2.add("edittext", undefined, "210");
        hueValue.preferredSize = [50, 20]; hueValue.characters = 5;
        r2.add("statictext", undefined, "deg").preferredSize = [24, 18];

        // 颜色预览方块 + 选取按钮
        var colorSwatch = r2.add("panel");
        colorSwatch.preferredSize = [18, 18];
        colorSwatch.alignment = ["center", "center"];
        // 用 background color 渲染颜色（通过 updateColorSwatch 更新）
        function updateColorSwatch() {
            try {
                var h = hueSlider.value;
                var s = satSlider.value / 100;
                var l = lightSlider.value / 100;
                var rColor = 0, gColor = 0, bColor = 0;
                // HSL → RGB
                var c = (1 - Math.abs(2 * l - 1)) * s;
                var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
                var m = l - c / 2;
                if (h < 60) { rColor = c + m; gColor = x + m; bColor = m; }
                else if (h < 120) { rColor = x + m; gColor = c + m; bColor = m; }
                else if (h < 180) { rColor = m; gColor = c + m; bColor = x + m; }
                else if (h < 240) { rColor = m; gColor = x + m; bColor = c + m; }
                else if (h < 300) { rColor = x + m; gColor = m; bColor = c + m; }
                else { rColor = c + m; gColor = m; bColor = x + m; }
                try {
                    var gfx = colorSwatch.graphics;
                    if (!gfx || !gfx.newBrush) throw "no brush support";
                    var brushType = (gfx.BrushType && gfx.BrushType.SOLID_COLOR) || 0;
                    var brush = gfx.newBrush(brushType, [rColor, gColor, bColor]);
                    if (brush) {
                        colorSwatch.graphics.backgroundColor = brush;
                        colorSwatch.graphics.disabledBackgroundColor = brush;
                    }
                } catch (e) {}
            } catch (e) {}
        }
        // 初始颜色
        updateColorSwatch();

        var pickBtn = r2.add("button", undefined, "\u2026");
        pickBtn.preferredSize = [22, 20];
        pickBtn.helpTip = "打开颜色选取器";
        pickBtn.onClick = function() {
            openColorPicker(hueSlider, satSlider, lightSlider, satValue, lightValue, updateColorSwatch);
        };

        // 更新 hueSlider 回调，同步颜色方块
        var origHueChanging = hueSlider.onChanging;
        hueSlider.onChanging = function() {
            hueValue.text = Math.round(hueSlider.value).toString();
            updateColorSwatch();
        };
        var origHueChange = hueValue.onChange;
        hueValue.onChange = function() {
            var v = parseInt(hueValue.text);
            if (!isNaN(v)) { hueSlider.value = Math.max(0, Math.min(360, v)); updateColorSwatch(); }
        };

        var r3 = paramGroup.add("group");
        r3.orientation = "row"; r3.alignment = ["fill", "center"];
        r3.add("statictext", undefined, "色相扩散:").preferredSize = [50, 18];
        var hueVarSlider = r3.add("slider", undefined, 30, 0, 360);
        hueVarSlider.preferredSize = [100, 20];
        var hueVarValue = r3.add("edittext", undefined, "30");
        hueVarValue.preferredSize = [50, 20]; hueVarValue.characters = 5;
        r3.add("statictext", undefined, " +/- deg").preferredSize = [55, 18];
        hueVarSlider.onChanging = function() { hueVarValue.text = Math.round(hueVarSlider.value).toString(); };
        hueVarValue.onChange = function() {
            var v = parseInt(hueVarValue.text);
            if (!isNaN(v)) hueVarSlider.value = Math.max(0, Math.min(360, v));
        };

        var r4 = paramGroup.add("group");
        r4.orientation = "row"; r4.alignment = ["fill", "center"];
        r4.add("statictext", undefined, "饱和度:").preferredSize = [50, 18];
        var satSlider = r4.add("slider", undefined, 80, 0, 100);
        satSlider.preferredSize = [50, 20];
        var satValue = r4.add("statictext", undefined, "80%");
        satValue.preferredSize = [30, 18];
        r4.add("statictext", undefined, "  亮度:").preferredSize = [40, 18];
        var lightSlider = r4.add("slider", undefined, 50, 0, 100);
        lightSlider.preferredSize = [50, 20];
        var lightValue = r4.add("statictext", undefined, "50%");
        lightValue.preferredSize = [30, 18];
        satSlider.onChanging = function() {
            satValue.text = Math.round(satSlider.value) + "%";
            try { updateColorSwatch(); } catch (e) {}
        };
        lightSlider.onChanging = function() {
            lightValue.text = Math.round(lightSlider.value) + "%";
            try { updateColorSwatch(); } catch (e) {}
        };

        // ==============================
        //  发射区域（模式 + 遮罩选取）
        // ==============================
        var emitGroup = paramGroup.add("panel");
        emitGroup.text = " 发射区域 (Emit Zone)";
        emitGroup.orientation = "column";
        emitGroup.alignChildren = ["fill", "top"];
        emitGroup.spacing = 2;
        emitGroup.margins = [4, 10, 4, 4];

        var ee1 = emitGroup.add("group");
        ee1.orientation = "row"; ee1.alignment = ["fill", "center"];
        ee1.add("statictext", undefined, "模式:").preferredSize = [40, 18];
        var emitModeDrop = ee1.add("dropdownlist", undefined, ["全合成", "遮罩范围"]);
        emitModeDrop.selection = 0;
        emitModeDrop.preferredSize = [90, 20];

        // 遮罩选层行（初始隐藏，mode=1 时显示）
        var ee2 = emitGroup.add("group");
        ee2.orientation = "row"; ee2.alignment = ["fill", "center"];
        var emitRefLabel = ee2.add("statictext", undefined, "图层:");
        emitRefLabel.preferredSize = [40, 18];
        var emitLayerDrop = ee2.add("dropdownlist", undefined, ["(刷新)"]);
        emitLayerDrop.preferredSize = [-1, 20];
        var emitMaskLabel = ee2.add("statictext", undefined, "遮罩:");
        emitMaskLabel.preferredSize = [40, 18];
        var emitMaskDrop = ee2.add("dropdownlist", undefined, ["-"]);
        emitMaskDrop.preferredSize = [-1, 20];
        var emitRefreshBtn = ee2.add("button", undefined, "R");
        emitRefreshBtn.preferredSize = [22, 20];
        ee2.visible = false;
        // 初始颜色灰化
        ee2.enabled = true;

        // mode 切换显示遮罩行
        emitModeDrop.onChange = function() {
            var isMask = (emitModeDrop.selection && emitModeDrop.selection.index === 1);
            ee2.visible = isMask;
            ee3.visible = isMask;
            if (isMask) { autoRefreshEmit(); }
            updateEmitStatus();
        };

        // 刷新逻辑（按钮和自动刷新共用，静默）
        function autoRefreshEmit() {
            try {
                var c = app.project.activeItem;
                if (!c || !(c instanceof CompItem)) return;
                emitLayerDrop.removeAll();
                for (var li = 1; li <= c.numLayers; li++) { emitLayerDrop.add("item", c.layer(li).name); }
                emitLayerDrop.selection = 0;
                populateEmitMask(c);
            } catch (e) {}
        }

        // 刷新按钮
        emitRefreshBtn.onClick = function() {
            var c = app.project.activeItem;
            if (!c || !(c instanceof CompItem)) { alert("无活动合成"); return; }
            autoRefreshEmit();
            updateEmitStatus();
        };

        // 选图层时更新遮罩
        emitLayerDrop.onChange = function() {
            try {
                var c = app.project.activeItem;
                if (c && c instanceof CompItem) populateEmitMask(c);
                updateEmitStatus();
            } catch (e) {}
        };

        // 状态提示
        var emitStatus = emitGroup.add("statictext", undefined, "");
        emitStatus.preferredSize = [-1, 16];

        function updateEmitStatus() {
            try {
                if (!emitModeDrop.selection || emitModeDrop.selection.index !== 1) {
                    emitStatus.text = "";
                    return;
                }
                var lName = emitLayerDrop.selection ? emitLayerDrop.selection.text : "-";
                var mName = emitMaskDrop.selection ? emitMaskDrop.selection.text : "-";
                emitStatus.text = "\u2713 \u5df2\u9009: " + lName + " \u2192 " + mName;
            } catch (e) {}
        }

        // 遮罩下拉选中也更新状态
        emitMaskDrop.onChange = function() { updateEmitStatus(); };

        // 刷新时也更新状态
        var origRefresh = emitRefreshBtn.onClick;
        emitRefreshBtn.onClick = function() {
            origRefresh();
            updateEmitStatus();
        };

        // 密度行
        var ee3 = emitGroup.add("group");
        ee3.orientation = "row"; ee3.alignment = ["fill", "center"];
        ee3.add("statictext", undefined, "密度 (%):").preferredSize = [50, 18];
        var emitDenSlider = ee3.add("slider", undefined, 100, 0, 100);
        emitDenSlider.preferredSize = [100, 20];
        var emitDenVal = ee3.add("statictext", undefined, "100%");
        emitDenVal.preferredSize = [32, 18];
        emitDenSlider.onChanging = function() { emitDenVal.text = Math.round(emitDenSlider.value) + "%"; };
        ee3.visible = false;

        function populateEmitMask(comp) {
            emitMaskDrop.removeAll();
            try {
                var sel = emitLayerDrop.selection;
                if (!sel) { emitMaskDrop.add("item", "-"); return; }
                var layer = comp.layer(sel.index + 1);
                var maskParade = layer.property("ADBE Mask Parade");
                if (!maskParade || maskParade.numProperties === 0) {
                    emitMaskDrop.add("item", "(无遮罩)");
                    return;
                }
                for (var mi = 1; mi <= maskParade.numProperties; mi++) {
                    emitMaskDrop.add("item", maskParade.property(mi).name);
                }
            } catch (e) {
                emitMaskDrop.add("item", "(错误)");
            }
        }

        // ==============================
        //  运动控制
        // ==============================
        var motionGroup = panel.add("panel");
        motionGroup.text = " 运动控制 ";
        motionGroup.orientation = "column";
        motionGroup.alignChildren = ["fill", "top"];
        motionGroup.spacing = 2;
        motionGroup.margins = [4, 10, 4, 4];

        var m1 = motionGroup.add("group");
        m1.orientation = "row"; m1.alignment = ["fill", "center"];
        m1.add("statictext", undefined, "主方向:").preferredSize = [50, 18];
        var dirSlider = m1.add("slider", undefined, 270, 0, 360);
        dirSlider.preferredSize = [100, 20];
        var dirValue = m1.add("edittext", undefined, "270");
        dirValue.preferredSize = [50, 20]; dirValue.characters = 5;
        m1.add("statictext", undefined, " deg").preferredSize = [30, 18];
        dirSlider.onChanging = function() { dirValue.text = Math.round(dirSlider.value).toString(); };
        dirValue.onChange = function() {
            var v = parseInt(dirValue.text);
            if (!isNaN(v)) dirSlider.value = Math.max(0, Math.min(360, v));
        };

        var m2 = motionGroup.add("group");
        m2.orientation = "row"; m2.alignment = ["fill", "center"];
        m2.add("statictext", undefined, "方向扩散:").preferredSize = [50, 18];
        var spreadSlider = m2.add("slider", undefined, 180, 0, 360);
        spreadSlider.preferredSize = [100, 20];
        var spreadValue = m2.add("edittext", undefined, "180");
        spreadValue.preferredSize = [50, 20]; spreadValue.characters = 5;
        m2.add("statictext", undefined, " +/- deg").preferredSize = [55, 18];
        spreadSlider.onChanging = function() { spreadValue.text = Math.round(spreadSlider.value).toString(); };
        spreadValue.onChange = function() {
            var v = parseInt(spreadValue.text);
            if (!isNaN(v)) spreadSlider.value = Math.max(0, Math.min(360, v));
        };

        var m3 = motionGroup.add("group");
        m3.orientation = "row"; m3.alignment = ["fill", "center"];
        m3.add("statictext", undefined, "速度:").preferredSize = [50, 18];
        var speedMinInput = m3.add("edittext", undefined, "30");
        speedMinInput.preferredSize = [55, 20]; speedMinInput.characters = 5;
        m3.add("statictext", undefined, " ~ ").preferredSize = [20, 18];
        var speedMaxInput = m3.add("edittext", undefined, "100");
        speedMaxInput.preferredSize = [55, 20]; speedMaxInput.characters = 5;
        m3.add("statictext", undefined, " px/s").preferredSize = [35, 18];

        // 目标吸引（v2.0: Null层选取）
        var m4 = motionGroup.add("group");
        m4.orientation = "row"; m4.alignment = ["fill", "center"];
        m4.add("statictext", undefined, "目标:").preferredSize = [40, 18];
        var targetModeDrop = m4.add("dropdownlist", undefined, ["无", "Null点", "遮罩范围"]);
        targetModeDrop.selection = 0;
        targetModeDrop.preferredSize = [70, 20];

        var m4b = motionGroup.add("group");
        m4b.orientation = "row"; m4b.alignment = ["fill", "center"];
        var tgtLabel = m4b.add("statictext", undefined, "图层:");
        tgtLabel.preferredSize = [40, 18];
        var targetLayerDrop = m4b.add("dropdownlist", undefined, ["(刷新)"]);
        targetLayerDrop.preferredSize = [-1, 20];
        var tgtRefreshBtn = m4b.add("button", undefined, "R");
        tgtRefreshBtn.preferredSize = [22, 20];
        m4b.visible = false;

        // 目标遮罩选取行
        var m4c = motionGroup.add("group");
        m4c.orientation = "row"; m4c.alignment = ["fill", "center"];
        var tgtMaskLabel = m4c.add("statictext", undefined, "遮罩:");
        tgtMaskLabel.preferredSize = [40, 18];
        var targetMaskDrop = m4c.add("dropdownlist", undefined, ["-"]);
        targetMaskDrop.preferredSize = [-1, 20];
        var tgtMaskRefreshBtn = m4c.add("button", undefined, "R");
        tgtMaskRefreshBtn.preferredSize = [22, 20];
        m4c.visible = false;

        targetModeDrop.onChange = function() {
            var idx = targetModeDrop.selection ? targetModeDrop.selection.index : 0;
            m4b.visible = (idx === 1 || idx === 2);
            m4c.visible = (idx === 2);
            if (idx >= 1) { autoRefreshTarget(); }
            updateTargetStatus();
        };
        function autoRefreshTarget() {
            try {
                var c = app.project.activeItem;
                if (!c || !(c instanceof CompItem)) return;
                targetLayerDrop.removeAll();
                for (var li = 1; li <= c.numLayers; li++) { targetLayerDrop.add("item", c.layer(li).name); }
                targetLayerDrop.selection = 0;
                populateTargetMask(c);
            } catch (e) {}
        }

        tgtRefreshBtn.onClick = function() {
            var c = app.project.activeItem;
            if (!c || !(c instanceof CompItem)) { alert("无活动合成"); return; }
            autoRefreshTarget();
            updateTargetStatus();
        };

        tgtMaskRefreshBtn.onClick = function() {
            try {
                var c = app.project.activeItem;
                if (c && c instanceof CompItem) populateTargetMask(c);
            } catch (e) {}
        };

        targetLayerDrop.onChange = function() {
            try {
                var c = app.project.activeItem;
                if (c && c instanceof CompItem) populateTargetMask(c);
                updateTargetStatus();
            } catch (e) {}
        };
        targetMaskDrop.onChange = function() { updateTargetStatus(); };

        function populateTargetMask(comp) {
            targetMaskDrop.removeAll();
            try {
                var sel = targetLayerDrop.selection;
                if (!sel) { targetMaskDrop.add("item", "-"); return; }
                var layer = comp.layer(sel.index + 1);
                var mp = layer.property("ADBE Mask Parade");
                if (!mp || mp.numProperties === 0) { targetMaskDrop.add("item", "(无遮罩)"); return; }
                for (var mi = 1; mi <= mp.numProperties; mi++) {
                    targetMaskDrop.add("item", mp.property(mi).name);
                }
            } catch (e) { targetMaskDrop.add("item", "(错误)"); }
        }

        var tgtStatus = motionGroup.add("statictext", undefined, "");
        tgtStatus.preferredSize = [-1, 16];
        function updateTargetStatus() {
            try {
                var idx = targetModeDrop.selection ? targetModeDrop.selection.index : 0;
                if (idx === 0) { tgtStatus.text = ""; return; }
                var n = "-";
                if (idx === 1) n = targetLayerDrop.selection ? targetLayerDrop.selection.text : "-";
                else if (idx === 2) {
                    var l = targetLayerDrop.selection ? targetLayerDrop.selection.text : "-";
                    var m = targetMaskDrop.selection ? targetMaskDrop.selection.text : "-";
                    n = l + " \u2192 " + m;
                }
                tgtStatus.text = "\u2713 \u76ee\u6807: " + n;
            } catch (e) {}
        }

        var m5 = motionGroup.add("group");
        m5.orientation = "row"; m5.alignment = ["fill", "center"];
        m5.add("statictext", undefined, "吸引力:").preferredSize = [60, 18];
        var attractSlider = m5.add("slider", undefined, 0, 0, 100);
        attractSlider.preferredSize = [80, 20];
        var attractValue = m5.add("statictext", undefined, "0%");
        attractValue.preferredSize = [30, 18];
        var attractReset = m5.add("button", undefined, "0");
        attractReset.preferredSize = [30, 20];
        attractSlider.onChanging = function() { attractValue.text = Math.round(attractSlider.value) + "%"; };
        attractReset.onClick = function() { attractSlider.value = 0; attractValue.text = "0%"; };

        m5.add("statictext", undefined, "时长:").preferredSize = [40, 18];
        var attractDurSlider = m5.add("slider", undefined, 2, -1, 999);
        attractDurSlider.preferredSize = [60, 20];
        var attractDurInput = m5.add("edittext", undefined, "2");
        attractDurInput.preferredSize = [50, 20]; attractDurInput.characters = 5;
        attractDurSlider.onChanging = function() {
            attractDurInput.text = Math.round(attractDurSlider.value * 10) / 10;
        };
        attractDurInput.onChange = function() {
            var v = parseFloat(attractDurInput.text);
            if (!isNaN(v)) {
                v = Math.max(0.1, v);
                attractDurSlider.value = Math.min(999, v);
                attractDurInput.text = Math.round(v * 10) / 10;
            }
        };

        // ==============================
        //  生命周期
        // ==============================
        var lifeGroup = panel.add("panel");
        lifeGroup.text = " 生命周期 ";
        lifeGroup.orientation = "column";
        lifeGroup.alignChildren = ["fill", "top"];
        lifeGroup.spacing = 2;
        lifeGroup.margins = [4, 10, 4, 4];

        var l1 = lifeGroup.add("group");
        l1.orientation = "row"; l1.alignment = ["fill", "center"];
        l1.add("statictext", undefined, "时长:").preferredSize = [50, 18];
        var lifeMinInput = l1.add("edittext", undefined, "2");
        lifeMinInput.preferredSize = [50, 20]; lifeMinInput.characters = 5;
        l1.add("statictext", undefined, " ~ ").preferredSize = [20, 18];
        var lifeMaxInput = l1.add("edittext", undefined, "6");
        lifeMaxInput.preferredSize = [50, 20]; lifeMaxInput.characters = 5;
        l1.add("statictext", undefined, " 秒").preferredSize = [25, 18];

        var l2 = lifeGroup.add("group");
        l2.orientation = "row"; l2.alignment = ["fill", "center"];
        l2.add("statictext", undefined, "淡入:").preferredSize = [50, 18];
        var fadeInInput = l2.add("edittext", undefined, "0.3");
        fadeInInput.preferredSize = [55, 20]; fadeInInput.characters = 5;
        l2.add("statictext", undefined, " s  淡出:").preferredSize = [60, 18];
        var fadeOutInput = l2.add("edittext", undefined, "0.8");
        fadeOutInput.preferredSize = [55, 20]; fadeOutInput.characters = 5;
        l2.add("statictext", undefined, " s").preferredSize = [15, 18];

        // ==============================
        //  高级效果
        // ==============================
        var fxGroup = panel.add("panel");
        fxGroup.text = " 高级效果 ";
        fxGroup.orientation = "column";
        fxGroup.alignChildren = ["fill", "top"];
        fxGroup.spacing = 2;
        fxGroup.margins = [4, 10, 4, 4];

        var f1 = fxGroup.add("group");
        f1.orientation = "row"; f1.alignment = ["fill", "center"];
        var twinkleCheck = f1.add("checkbox", undefined, "闪烁效果");
        twinkleCheck.value = true;
        f1.add("statictext", undefined, "闪烁幅度:").preferredSize = [60, 18];
        var twinkleStrSlider = f1.add("slider", undefined, 50, 0, 100);
        twinkleStrSlider.preferredSize = [50, 20];
        var twinkleStrValue = f1.add("statictext", undefined, "50%");
        twinkleStrValue.preferredSize = [30, 18];
        f1.add("statictext", undefined, " 速度:").preferredSize = [40, 18];
        var twinkleSpdSlider = f1.add("slider", undefined, 2, 0.1, 10);
        twinkleSpdSlider.preferredSize = [50, 20];
        var twinkleSpdValue = f1.add("edittext", undefined, "2");
        twinkleSpdValue.preferredSize = [35, 20]; twinkleSpdValue.characters = 4;
        twinkleStrSlider.onChanging = function() { twinkleStrValue.text = Math.round(twinkleStrSlider.value) + "%"; };
        twinkleSpdSlider.onChanging = function() { twinkleSpdValue.text = Math.round(twinkleSpdSlider.value * 10) / 10; };
        twinkleSpdValue.onChange = function() {
            var v = parseFloat(twinkleSpdValue.text);
            if (!isNaN(v)) { twinkleSpdSlider.value = Math.max(0.1, Math.min(10, v)); }
        };

        var f2 = fxGroup.add("group");
        f2.orientation = "row"; f2.alignment = ["fill", "center"];
        f2.add("statictext", undefined, "随机种子:").preferredSize = [60, 18];
        var seedSlider = f2.add("slider", undefined, 42, 0, 9999);
        seedSlider.preferredSize = [100, 20];
        var seedValue = f2.add("edittext", undefined, "42");
        seedValue.preferredSize = [50, 20]; seedValue.characters = 5;
        var randomSeedBtn = f2.add("button", undefined, "随机");
        randomSeedBtn.preferredSize = [45, 22];
        seedSlider.onChanging = function() { seedValue.text = Math.round(seedSlider.value).toString(); };
        seedValue.onChange = function() {
            var v = parseInt(seedValue.text);
            if (!isNaN(v)) seedSlider.value = Math.max(0, Math.min(9999, v));
        };
        randomSeedBtn.onClick = function() {
            var r = Math.floor(Math.random() * 10000);
            seedSlider.value = r;
            seedValue.text = r.toString();
        };

        // 环绕开关
        var f3 = fxGroup.add("group");
        f3.orientation = "row"; f3.alignment = ["fill", "center"];
        var wrapCheck = f3.add("checkbox", undefined, "环绕 (Wrap) - 出屏幕边界后绕回对面");
        wrapCheck.value = true;

        var f4 = fxGroup.add("group");
        f4.orientation = "row"; f4.alignment = ["fill", "center"];
        f4.add("statictext", undefined, "随机偏移:").preferredSize = [65, 18];
        var emitOffSlider = f4.add("slider", undefined, 0, 0, 6);
        emitOffSlider.preferredSize = [80, 20];
        var emitOffValue = f4.add("edittext", undefined, "0");
        emitOffValue.preferredSize = [35, 20]; emitOffValue.characters = 4;
        f4.add("statictext", undefined, "s").preferredSize = [15, 18];
        emitOffSlider.onChanging = function() { emitOffValue.text = (Math.round(emitOffSlider.value * 10) / 10).toString(); };
        emitOffValue.onChange = function() {
            var v = parseFloat(emitOffValue.text);
            if (!isNaN(v)) { emitOffSlider.value = Math.max(0, Math.min(6, v)); }
        };

        // ==============================
        //  操作按钮
        // ==============================
        var btnPanel = panel.add("panel");
        btnPanel.text = " 操作 ";
        btnPanel.orientation = "column";
        btnPanel.alignChildren = ["fill", "top"];
        btnPanel.spacing = 6;
        btnPanel.margins = [4, 10, 4, 6];

        var generateBtn = btnPanel.add("button", undefined, "▶  生成粒子");
        generateBtn.preferredSize = [-1, 32];

        var secBtnRow = btnPanel.add("group");
        secBtnRow.orientation = "row"; secBtnRow.alignment = ["fill", "top"];
        secBtnRow.alignChildren = ["fill", "center"]; secBtnRow.spacing = 4;
        var clearAllBtn = secBtnRow.add("button", undefined, "清除全部");
        clearAllBtn.preferredSize = [-1, 26];

        var ioBtnRow = btnPanel.add("group");
        ioBtnRow.orientation = "row"; ioBtnRow.alignment = ["fill", "top"];
        ioBtnRow.alignChildren = ["fill", "center"]; ioBtnRow.spacing = 4;
        var saveBtn = ioBtnRow.add("button", undefined, "保存预设");
        saveBtn.preferredSize = [-1, 26];
        var loadBtn = ioBtnRow.add("button", undefined, "加载预设");
        loadBtn.preferredSize = [-1, 26];

        // ==============================
        //  快捷预设
        // ==============================
        var presetPanel = panel.add("panel");
        presetPanel.text = " 快捷预设 ";
        presetPanel.orientation = "column";
        presetPanel.alignChildren = ["fill", "top"];
        presetPanel.spacing = 2;
        presetPanel.margins = [4, 10, 4, 6];

        var presetRow1 = presetPanel.add("group");
        presetRow1.orientation = "row"; presetRow1.alignment = ["fill", "center"];
        presetRow1.alignChildren = ["fill", "center"]; presetRow1.spacing = 3;
        var preset1Btn = presetRow1.add("button", undefined, "经典星空");
        preset1Btn.preferredSize = [-1, 24];
        var preset2Btn = presetRow1.add("button", undefined, "彩色星云");
        preset2Btn.preferredSize = [-1, 24];

        var presetRow2 = presetPanel.add("group");
        presetRow2.orientation = "row"; presetRow2.alignment = ["fill", "center"];
        presetRow2.alignChildren = ["fill", "center"]; presetRow2.spacing = 3;
        var preset3Btn = presetRow2.add("button", undefined, "极光飘动");
        preset3Btn.preferredSize = [-1, 24];
        var preset4Btn = presetRow2.add("button", undefined, "金色粒子雨");
        preset4Btn.preferredSize = [-1, 24];

        // 预设粒子数量（独立滑块）
        var presetCountRow = presetPanel.add("group");
        presetCountRow.orientation = "row"; presetCountRow.alignment = ["fill", "center"];
        presetCountRow.add("statictext", undefined, "预设数量:").preferredSize = [65, 18];
        var presetCountSlider = presetCountRow.add("slider", undefined, 200, 10, 2000);
        presetCountSlider.preferredSize = [100, 20];
        var presetCountValue = presetCountRow.add("edittext", undefined, "200");
        presetCountValue.preferredSize = [50, 20]; presetCountValue.characters = 5;
        presetCountSlider.onChanging = function() {
            presetCountValue.text = Math.round(presetCountSlider.value).toString();
        };
        presetCountValue.onChange = function() {
            var v = parseInt(presetCountValue.text);
            if (!isNaN(v)) presetCountSlider.value = Math.max(10, Math.min(2000, v));
        };

        // ==============================
        //  槽位预设 (存储于 app.settings)
        // ==============================
        var slotPanel = panel.add("panel");
        slotPanel.text = " 槽位预设 (Slot Preset) ";
        slotPanel.orientation = "column";
        slotPanel.alignChildren = ["fill", "top"];
        slotPanel.spacing = 2;
        slotPanel.margins = [4, 10, 4, 4];

        // 4 行存储/读取按钮对
        var SLOT_KEYS = ["Slot1", "Slot2", "Slot3", "Slot4"];
        var slotRows = [];
        var slotStatus = [];

        for (var si = 0; si < 4; si++) {
            var row = slotPanel.add("group");
            row.orientation = "row"; row.alignment = ["fill", "center"]; row.spacing = 3;

            var slotSaveBtn = row.add("button", undefined, "存储 " + (si + 1));
            slotSaveBtn.preferredSize = [-1, 22];

            var slotLoadBtn = row.add("button", undefined, "使用 " + (si + 1));
            slotLoadBtn.preferredSize = [-1, 22];

            var status = row.add("statictext", undefined, "(空)");
            status.preferredSize = [45, 16];

            slotRows.push({ save: slotSaveBtn, load: slotLoadBtn, status: status, idx: si });
        }

        // 槽位管理按钮
        var slotBtnRow = slotPanel.add("group");
        slotBtnRow.orientation = "row"; slotBtnRow.alignment = ["fill", "center"]; slotBtnRow.spacing = 4;
        var clearAllSlotBtn = slotBtnRow.add("button", undefined, "清空所有槽位");
        clearAllSlotBtn.preferredSize = [-1, 22];

        // 保存槽位
        function saveSlot(idx) {
            try {
                var params = getUIParams();
                var jsonStr = JSON.stringify(params, null, 2);
                app.settings.saveSetting("StarrySkyGenerator", SLOT_KEYS[idx], jsonStr);
                slotRows[idx].status.text = "\u2713";
            } catch (e) {
                debugLog("saveSlot error: " + e.toString());
            }
        }

        // 加载槽位
        function loadSlot(idx) {
            try {
                var jsonStr = app.settings.getSetting("StarrySkyGenerator", SLOT_KEYS[idx]);
                if (!jsonStr || jsonStr === "") {
                    alert("槽位 " + (idx + 1) + " 为空。");
                    return;
                }
                var p = JSON.parse(jsonStr);
                // slot 预设的键名来自 getUIParams()，与 applyPresetToUI（中文键名）完全不同
                // 所以需要直接逐个控件恢复
                if (p.count !== undefined)      { countSlider.value = p.count; countValue.text = Math.round(p.count).toString(); }
                if (p.sizeMin !== undefined)    sizeMinInput.text = p.sizeMin.toString();
                if (p.sizeMax !== undefined)    sizeMaxInput.text = p.sizeMax.toString();
                if (p.sizeInit !== undefined)   sizeInitInput.text = p.sizeInit.toString();
                if (p.sizeFinal !== undefined)  sizeFinalInput.text = p.sizeFinal.toString();
                if (p.shape !== undefined)      shapeDropdown.selection = p.shape;
                if (p.hue !== undefined)        { hueSlider.value = p.hue; hueValue.text = Math.round(p.hue).toString(); }
                if (p.hueVar !== undefined)     { hueVarSlider.value = p.hueVar; hueVarValue.text = Math.round(p.hueVar).toString(); }
                if (p.sat !== undefined)        { satSlider.value = p.sat; satValue.text = Math.round(p.sat) + "%"; }
                if (p.light !== undefined)      { lightSlider.value = p.light; lightValue.text = Math.round(p.light) + "%"; }
                if (p.direction !== undefined)  { dirSlider.value = p.direction; dirValue.text = Math.round(p.direction).toString(); }
                if (p.dirSpread !== undefined)  { spreadSlider.value = p.dirSpread; spreadValue.text = Math.round(p.dirSpread).toString(); }
                if (p.speedMin !== undefined)   speedMinInput.text = p.speedMin.toString();
                if (p.speedMax !== undefined)   speedMaxInput.text = p.speedMax.toString();
                if (p.lifeMin !== undefined)    lifeMinInput.text = p.lifeMin.toString();
                if (p.lifeMax !== undefined)    lifeMaxInput.text = p.lifeMax.toString();
                if (p.fadeIn !== undefined)     fadeInInput.text = p.fadeIn.toString();
                if (p.fadeOut !== undefined)    fadeOutInput.text = p.fadeOut.toString();
                if (p.twinkleEnabled !== undefined) twinkleCheck.value = p.twinkleEnabled;
                if (p.twinkleStrength !== undefined) { twinkleStrSlider.value = p.twinkleStrength; twinkleStrValue.text = Math.round(p.twinkleStrength) + "%"; }
                if (p.twinkleSpeed !== undefined)   { twinkleSpdSlider.value = p.twinkleSpeed; twinkleSpdValue.text = Math.round(p.twinkleSpeed * 10) / 10; }
                if (p.seed !== undefined)       { seedSlider.value = p.seed; seedValue.text = Math.round(p.seed).toString(); }
                if (p.emitMode !== undefined)   emitModeDrop.selection = p.emitMode;
                // 发射图层/遮罩: 下拉框可能有变化（合成不同），只恢复状态文字
                if (p.emitDen !== undefined)    emitDenSlider.value = p.emitDen;
                if (p.targetMode !== undefined) targetModeDrop.selection = p.targetMode;
                if (p.attractDur !== undefined) { attractDurSlider.value = p.attractDur; attractDurInput.text = (Math.round(p.attractDur * 10) / 10).toString(); }
                if (p.attraction !== undefined) { attractSlider.value = p.attraction; attractValue.text = Math.round(p.attraction) + "%"; }
                if (p.wrapAround !== undefined) wrapCheck.value = p.wrapAround;
                if (p.emitOff !== undefined) { emitOffSlider.value = p.emitOff; emitOffValue.text = Math.round(p.emitOff * 10) / 10 + "s"; }
                try { updateColorSwatch(); } catch (e) {}
                setStatus("已加载槽位 " + (idx + 1));
            } catch (e) {
                debugLog("loadSlot error: " + e.toString());
                alert("加载槽位失败：" + e.toString());
            }
        }

        // 更新槽位状态显示
        function updateSlotStatus() {
            for (var si = 0; si < 4; si++) {
                try {
                    var jsonStr = app.settings.getSetting("StarrySkyGenerator", SLOT_KEYS[si]);
                    slotRows[si].status.text = (jsonStr && jsonStr !== "") ? "\u2713" : "(空)";
                } catch (e) {
                    slotRows[si].status.text = "?";
                }
            }
        }

        // 清空所有槽位
        clearAllSlotBtn.onClick = function() {
            if (!confirm("确定清空所有 4 个槽位预设？")) return;
            for (var si = 0; si < 4; si++) {
                try { app.settings.saveSetting("StarrySkyGenerator", SLOT_KEYS[si], ""); } catch (e) {}
            }
            updateSlotStatus();
            setStatus("所有槽位已清空");
        };

        // 绑定存储/使用按钮
        for (var si = 0; si < 4; si++) {
            (function(slotIdx) {
                slotRows[slotIdx].save.onClick = function() { saveSlot(slotIdx); updateSlotStatus(); setStatus("已存储槽位 " + (slotIdx + 1)); };
                slotRows[slotIdx].load.onClick = function() { loadSlot(slotIdx); };
            })(si);
        }

        // 初始化状态
        updateSlotStatus();

        function getUIParams() {
            return {
                count: Math.round(countSlider.value),
                sizeMin: parseFloat(sizeMinInput.text) || 3,
                sizeMax: parseFloat(sizeMaxInput.text) || 15,
                sizeInit: parseFloat(sizeInitInput.text) || 80,
                sizeFinal: parseFloat(sizeFinalInput.text) || 100,
                shape: shapeDropdown.selection ? shapeDropdown.selection.index : 0,
                hue: Math.round(hueSlider.value),
                hueVar: Math.round(hueVarSlider.value),
                sat: Math.round(satSlider.value),
                light: Math.round(lightSlider.value),
                direction: Math.round(dirSlider.value),
                dirSpread: Math.round(spreadSlider.value),
                speedMin: parseFloat(speedMinInput.text) || 30,
                speedMax: parseFloat(speedMaxInput.text) || 100,
                lifeMin: parseFloat(lifeMinInput.text) || 2,
                lifeMax: parseFloat(lifeMaxInput.text) || 6,
                fadeIn: parseFloat(fadeInInput.text) || 0.3,
                fadeOut: parseFloat(fadeOutInput.text) || 0.8,
                twinkleEnabled: twinkleCheck.value,
                twinkleStrength: twinkleCheck.value ? Math.round(twinkleStrSlider.value) : 0,
                twinkleSpeed: twinkleCheck.value ? twinkleSpdSlider.value : 0,
                seed: Math.round(seedSlider.value),
                // v2.0 发射模式 + 目标选取
                emitMode: emitModeDrop.selection ? emitModeDrop.selection.index : 0,
                emitLayer: (emitModeDrop.selection && emitModeDrop.selection.index === 1 && emitLayerDrop.selection && emitLayerDrop.selection.text.indexOf("(") !== 0) ? emitLayerDrop.selection.text : "",
                emitMask: (emitModeDrop.selection && emitModeDrop.selection.index === 1 && emitMaskDrop.selection && emitMaskDrop.selection.text.indexOf("(") !== 0) ? emitMaskDrop.selection.text : "",
                emitDen: Math.round(emitDenSlider.value),
                targetMode: targetModeDrop.selection ? targetModeDrop.selection.index : 0,
                targetLayer: (targetLayerDrop.selection && targetLayerDrop.selection.text.indexOf("(") !== 0) ? targetLayerDrop.selection.text : "",
                targetMask: (targetModeDrop.selection && targetModeDrop.selection.index === 2 && targetMaskDrop.selection && targetMaskDrop.selection.text.indexOf("(") !== 0) ? targetMaskDrop.selection.text : "",
                attractDur: parseFloat(attractDurInput.text) || 2,
                attraction: Math.round(attractSlider.value),
                wrapAround: wrapCheck.value,
                emitOff: parseFloat(emitOffValue.text) || 0
            };
        }

        function applyUIToController(controller, params) {
            updateControllerSlider(controller, "粒子数量", params.count);
            updateControllerSlider(controller, "最小尺寸", params.sizeMin);
            updateControllerSlider(controller, "最大尺寸", params.sizeMax);
            updateControllerSlider(controller, "色相(0-360)", params.hue);
            updateControllerSlider(controller, "色相随机范围", params.hueVar);
            updateControllerSlider(controller, "饱和度", params.sat);
            updateControllerSlider(controller, "亮度", params.light);
            updateControllerSlider(controller, "运动方向(度)", params.direction);
            updateControllerSlider(controller, "方向随机范围", params.dirSpread);
            updateControllerSlider(controller, "最小速度", params.speedMin);
            updateControllerSlider(controller, "最大速度", params.speedMax);
            updateControllerSlider(controller, "最小生命周期(秒)", params.lifeMin);
            updateControllerSlider(controller, "最大生命周期(秒)", params.lifeMax);
            updateControllerSlider(controller, "淡入时长(秒)", params.fadeIn);
            updateControllerSlider(controller, "淡出时长(秒)", params.fadeOut);
            updateControllerSlider(controller, "闪烁强度", params.twinkleStrength);
            updateControllerSlider(controller, "闪烁速度", params.twinkleSpeed);
            updateControllerSlider(controller, "随机种子", params.seed);
            // v2.0 目标吸引 + 密度
            updateControllerSlider(controller, "吸引力", params.attraction);
            updateControllerSlider(controller, "吸引时长", params.attractDur);
            updateControllerSlider(controller, "发射密度", params.emitDen);
            updateControllerSlider(controller, "初始大小(%)", params.sizeInit);
            updateControllerSlider(controller, "最终大小(%)", params.sizeFinal);
            updateControllerSlider(controller, "发射随机偏移", params.emitOff);
        }

            function applyPresetToUI(preset) {
            sizeMinInput.text = (preset["最小尺寸"] || 3).toString();
            sizeMaxInput.text = (preset["最大尺寸"] || 15).toString();
            sizeInitInput.text = (preset["初始大小%"] || 80).toString();
            sizeFinalInput.text = (preset["最终大小%"] || 100).toString();
            var sv = preset["形状"];
            if (sv !== undefined) shapeDropdown.selection = sv;
            hueSlider.value = preset["色相(0-360)"] || 210;
            hueValue.text = Math.round(hueSlider.value).toString();
            hueVarSlider.value = preset["色相随机范围"] || 30;
            hueVarValue.text = Math.round(hueVarSlider.value).toString();
            satSlider.value = preset["饱和度"] || 80;
            satValue.text = Math.round(satSlider.value) + "%";
            lightSlider.value = preset["亮度"] || 50;
            lightValue.text = Math.round(lightSlider.value) + "%";
            dirSlider.value = preset["运动方向(度)"] || 270;
            dirValue.text = Math.round(dirSlider.value).toString();
            spreadSlider.value = preset["方向随机范围"] || 180;
            spreadValue.text = Math.round(spreadSlider.value).toString();
            speedMinInput.text = (preset["最小速度"] || 30).toString();
            speedMaxInput.text = (preset["最大速度"] || 100).toString();
            lifeMinInput.text = (preset["最小生命周期(秒)"] || 2).toString();
            lifeMaxInput.text = (preset["最大生命周期(秒)"] || 6).toString();
            fadeInInput.text = (preset["淡入时长(秒)"] || 0.3).toString();
            fadeOutInput.text = (preset["淡出时长(秒)"] || 0.8).toString();
            twinkleStrSlider.value = preset["闪烁强度"] || 50;
            twinkleStrValue.text = Math.round(twinkleStrSlider.value) + "%";
            twinkleCheck.value = (preset["闪烁强度"] || 0) > 0;
            twinkleSpdSlider.value = preset["闪烁速度"] || 2;
            twinkleSpdValue.text = Math.round(twinkleSpdSlider.value * 10) / 10;
            seedSlider.value = preset["随机种子"] || 42;
            seedValue.text = Math.round(seedSlider.value).toString();
            // v2.0 发射模式 + 目标选取（预设恢复）
            emitModeDrop.selection = preset["发射模式"] || 0;
            if (emitModeDrop.selection && emitModeDrop.selection.index === 1) {
                // 遮罩模式 — 需用户点击刷新
            }
            emitDenSlider.value = preset["发射密度"] !== undefined ? preset["发射密度"] : 100;
            emitDenVal.text = Math.round(emitDenSlider.value) + "%";
            targetModeDrop.selection = preset["目标模式"] || 0;
            attractSlider.value = preset["吸引力"] || 0;
            attractValue.text = Math.round(attractSlider.value) + "%";
            attractDurSlider.value = preset["吸引时长"] || 2;
            attractDurInput.text = Math.round(attractDurSlider.value * 10) / 10;
            try { updateColorSwatch(); } catch (e) {}
        }

        // ==============================
        //  颜色选取器（RGB 调色板对话框）
        // ==============================

        /**
         * 打开颜色选取对话框，通过 RGB 滑块直观选色
         * 确认后自动更新 HSL 滑块
         */
        function openColorPicker(hueSliderRef, satSliderRef, lightSliderRef, satValRef, lightValRef, updateSwatchFn) {
            // 当前值
            var curH = hueSliderRef.value;
            var curS = satSliderRef.value;
            var curL = lightSliderRef.value;

            // HSL → RGB (0-255)
            function hslToRgbInt(h, s, l) {
                h = h % 360; if (h < 0) h += 360;
                s = Math.max(0, Math.min(100, s)) / 100;
                l = Math.max(0, Math.min(100, l)) / 100;
                var c = (1 - Math.abs(2 * l - 1)) * s;
                var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
                var m = l - c / 2;
                var r = 0, g = 0, b = 0;
                if (h < 60) { r = c + m; g = x + m; b = m; }
                else if (h < 120) { r = x + m; g = c + m; b = m; }
                else if (h < 180) { r = m; g = c + m; b = x + m; }
                else if (h < 240) { r = m; g = x + m; b = c + m; }
                else if (h < 300) { r = x + m; g = m; b = c + m; }
                else { r = c + m; g = m; b = x + m; }
                return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
            }

            // RGB (0-255) → HSL
            function rgbToHslInt(rR, gG, bB) {
                var rr = rR / 255, gg = gG / 255, bb = bB / 255;
                var mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
                var dh = 0, ds = 0, dl = (mx + mn) / 2;
                if (mx !== mn) {
                    var dd = mx - mn;
                    ds = dl > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
                    if (mx === rr) dh = ((gg - bb) / dd + (gg < bb ? 6 : 0)) * 60;
                    else if (mx === gg) dh = ((bb - rr) / dd + 2) * 60;
                    else dh = ((rr - gg) / dd + 4) * 60;
                }
                return [Math.round(dh), Math.round(ds * 100), Math.round(dl * 100)];
            }

            // HSL 色彩选取器
            var dlg = new Window("dialog", "颜色选取器 (HSL)");
            dlg.orientation = "column";
            dlg.alignChildren = ["fill", "top"];
            dlg.spacing = 6;
            dlg.margins = [12, 12, 12, 12];

            // 预览区
            var previewPane = dlg.add("panel");
            previewPane.preferredSize = [200, 40];
            previewPane.alignment = ["center", "top"];

            function updatePreview(h, s, l) {
                try {
                    var rgb = hslToRgbInt(Math.round(h), Math.round(s), Math.round(l));
                    var pgfx = previewPane.graphics;
                    if (!pgfx || !pgfx.newBrush) return;
                    var bType = (pgfx.BrushType && pgfx.BrushType.SOLID_COLOR) || 0;
                    var pBrush = pgfx.newBrush(bType, [rgb[0]/255, rgb[1]/255, rgb[2]/255]);
                    if (pBrush) {
                        pgfx.backgroundColor = pBrush;
                        pgfx.disabledBackgroundColor = pBrush;
                    }
                } catch (e) {}
            }
            updatePreview(curH, curS, curL);

            // H
            var hGrp = dlg.add("group");
            hGrp.orientation = "row"; hGrp.alignment = ["fill", "center"];
            hGrp.add("statictext", undefined, "H").preferredSize = [18, 18];
            var hSl = hGrp.add("slider", undefined, curH, 0, 360);
            hSl.preferredSize = [120, 20];
            var hIn = hGrp.add("edittext", undefined, curH.toString());
            hIn.preferredSize = [55, 20]; hIn.characters = 5;
            hGrp.add("statictext", undefined, "°").preferredSize = [15, 18];
            hSl.onChanging = function() {
                hIn.text = Math.round(hSl.value).toString();
                updatePreview(hSl.value, sSl.value, lSl.value);
            };
            hIn.onChange = function() {
                var vv = parseInt(hIn.text);
                if (!isNaN(vv)) hSl.value = Math.max(0, Math.min(360, vv));
            };

            // S
            var sGrp = dlg.add("group");
            sGrp.orientation = "row"; sGrp.alignment = ["fill", "center"];
            sGrp.add("statictext", undefined, "S").preferredSize = [18, 18];
            var sSl = sGrp.add("slider", undefined, curS, 0, 100);
            sSl.preferredSize = [120, 20];
            var sIn = sGrp.add("edittext", undefined, curS.toString());
            sIn.preferredSize = [55, 20]; sIn.characters = 5;
            sGrp.add("statictext", undefined, "%").preferredSize = [15, 18];
            sSl.onChanging = function() {
                sIn.text = Math.round(sSl.value).toString();
                updatePreview(hSl.value, sSl.value, lSl.value);
            };
            sIn.onChange = function() {
                var vv = parseInt(sIn.text);
                if (!isNaN(vv)) sSl.value = Math.max(0, Math.min(100, vv));
            };

            // L
            var lGrp = dlg.add("group");
            lGrp.orientation = "row"; lGrp.alignment = ["fill", "center"];
            lGrp.add("statictext", undefined, "L").preferredSize = [18, 18];
            var lSl = lGrp.add("slider", undefined, curL, 0, 100);
            lSl.preferredSize = [120, 20];
            var lIn = lGrp.add("edittext", undefined, curL.toString());
            lIn.preferredSize = [55, 20]; lIn.characters = 5;
            lGrp.add("statictext", undefined, "%").preferredSize = [15, 18];
            lSl.onChanging = function() {
                lIn.text = Math.round(lSl.value).toString();
                updatePreview(hSl.value, sSl.value, lSl.value);
            };
            lIn.onChange = function() {
                var vv = parseInt(lIn.text);
                if (!isNaN(vv)) lSl.value = Math.max(0, Math.min(100, vv));
            };

            // 按钮
            var btnGrp = dlg.add("group");
            btnGrp.orientation = "row"; btnGrp.alignment = ["center", "bottom"];
            btnGrp.spacing = 10;

            var okBtn = btnGrp.add("button", undefined, "确定 (OK)");
            okBtn.preferredSize = [80, 26];
            okBtn.onClick = function() {
                // HSL 直接设置（不需要转换）
                hueSliderRef.value = hSl.value;
                satSliderRef.value = sSl.value;
                lightSliderRef.value = lSl.value;
                // 更新显示文本
                hueValue.text = Math.round(hSl.value).toString();
                satValRef.text = Math.round(sSl.value) + "%";
                lightValRef.text = Math.round(lSl.value) + "%";
                // 更新颜色方块
                try { updateSwatchFn(); } catch (e) {}
                dlg.close();
            };

            var cancelBtn = btnGrp.add("button", undefined, "取消 (Cancel)");
            cancelBtn.preferredSize = [80, 26];
            cancelBtn.onClick = function() { dlg.close(); };

            dlg.show();
        }

        // ==============================
        //  按钮事件
        // ==============================

        function doGenerate() {
            setStatus("正在生成...");
            var comp = ensureComp();
            var params = getUIParams();
            debugLog("Generate: count=" + params.count + " shape=" + params.shape);
            var controller = getOrCreateController(comp);
            applyUIToController(controller, params);
            generateParticles(comp, controller, params.count, params.shape, params.emitMode, params.emitLayer, params.emitMask, params.targetMode, params.targetLayer, params.targetMask || "", params.emitDen, params.attractDur, params.wrapAround);
            setStatus(params.count + " 粒子 (形状=" + params.shape + ")");
        }

        function applyBuiltInPreset(presetName) {
            setStatus("加载: " + presetName);
            var comp = ensureComp();
            var preset = builtInPresets[presetName];
            if (!preset) return;
            applyPresetToUI(preset);
            var controller = getOrCreateController(comp);
            applyUIToController(controller, preset);
            generateParticles(comp, controller, Math.round(presetCountSlider.value), preset["形状"] || 0, preset["发射模式"] || 0, preset["发射图层"] || "", preset["发射遮罩"] || "", preset["目标模式"] || 0, preset["目标图层"] || "", preset["目标遮罩"] || "", preset["发射密度"] || 100, preset["吸引时长"] || 2, true);
            setStatus(presetName + " 已应用");
        }

        generateBtn.onClick = function() { safeExecute("生成粒子", doGenerate); };

        clearAllBtn.onClick = function() {
            safeExecute("清除全部", function() {
                var comp = getActiveComp();
                if (!comp) { alert("请先打开一个合成！"); return; }
                if (confirm("确定清除所有星空元素？不可撤销。")) {
                    clearAll(comp);
                    setStatus("全部已清除");
                }
            });
        };

        // 槽位选取对话框（保存/加载共用）
        function showSlotPicker(mode) {
            var title = (mode === "save") ? "保存到槽位" : "从槽位加载";
            var dlg = new Window("dialog", title);
            dlg.orientation = "column";
            dlg.alignChildren = ["fill", "top"];
            dlg.spacing = 6;
            dlg.margins = [10, 10, 10, 10];

            // 两行，每行两个按钮
            for (var r = 0; r < 2; r++) {
                var row = dlg.add("group");
                row.orientation = "row"; row.alignment = ["fill", "center"]; row.spacing = 6;
                for (var c = 0; c < 2; c++) {
                    var slotIdx = r * 2 + c;
                    var btn = row.add("button", undefined, "槽位 " + (slotIdx + 1));
                    btn.preferredSize = [80, 26];
                    // 显示状态
                    try {
                        var js = app.settings.getSetting("StarrySkyGenerator", SLOT_KEYS[slotIdx]);
                        if (js && js !== "") btn.text = "\u2713 槽位 " + (slotIdx + 1);
                    } catch (e) {}
                    (function(idx) {
                        btn.onClick = function() {
                            dlg.close();
                            if (mode === "save") {
                                saveSlot(idx);
                                updateSlotStatus();
                                setStatus("已保存到槽位 " + (idx + 1));
                            } else {
                                loadSlot(idx);
                            }
                        };
                    })(slotIdx);
                }
            }

            var cancelBtn = dlg.add("button", undefined, "取消");
            cancelBtn.alignment = ["center", "top"];
            cancelBtn.preferredSize = [60, 24];
            cancelBtn.onClick = function() { dlg.close(); };
            dlg.show();
        }

        saveBtn.onClick = function() {
            safeExecute("保存预设", function() {
                try {
                    var defaultName = "starfield_presets.json";
                    var saveFile = File.saveDialog("保存预设文件到", "JSON:*.json", defaultName);
                    if (!saveFile) return;
                    var fileData = { version: "2.0", slots: {} };
                    for (var si = 0; si < 4; si++) {
                        try {
                            var js = app.settings.getSetting("StarrySkyGenerator", SLOT_KEYS[si]);
                            fileData.slots[SLOT_KEYS[si]] = js || "";
                        } catch (e) {
                            fileData.slots[SLOT_KEYS[si]] = ""; // 空槽位
                        }
                    }
                    saveFile.encoding = "UTF-8";
                    saveFile.open("w");
                    saveFile.write(JSON.stringify(fileData, null, 2));
                    saveFile.close();
                    alert("已保存 4 个槽位到:\n" + saveFile.fsName);
                    setStatus("已保存预设文件");
                } catch (e) {
                    alert("保存失败: " + e.toString());
                }
            });
        };

        loadBtn.onClick = function() {
            safeExecute("加载预设", function() {
                try {
                    var loadFile = File.openDialog("选择预设文件", "JSON:*.json");
                    if (!loadFile) return;
                    loadFile.encoding = "UTF-8";
                    loadFile.open("r");
                    var jsonStr = loadFile.read();
                    loadFile.close();
                    var fileData = JSON.parse(jsonStr);
                    if (!fileData.slots) { alert("无效的预设文件"); return; }
                    var loaded = 0;
                    for (var si = 0; si < 4; si++) {
                        var key = SLOT_KEYS[si];
                        if (fileData.slots[key]) {
                            app.settings.saveSetting("StarrySkyGenerator", key, fileData.slots[key]);
                            loaded++;
                        }
                    }
                    updateSlotStatus();
                    alert("已加载 " + loaded + " 个槽位预设。");
                    setStatus("已加载预设文件");
                } catch (e) {
                    alert("加载失败: " + e.toString());
                }
            });
        };

        preset1Btn.onClick = function() { safeExecute("经典星空", function() { applyBuiltInPreset("经典星空"); }); };
        preset2Btn.onClick = function() { safeExecute("彩色星云", function() { applyBuiltInPreset("彩色星云"); }); };
        preset3Btn.onClick = function() { safeExecute("极光飘动", function() { applyBuiltInPreset("极光飘动"); }); };
        preset4Btn.onClick = function() { safeExecute("金色粒子雨", function() { applyBuiltInPreset("金色粒子雨"); }); };

        // ==============================
        //  布局
        // ==============================
        panel.layout.layout(true);
        panel.layout.resize();
        panel.onResizing = panel.onResize = function() { this.layout.resize(); };

        setStatus("就绪");
        debugLog("buildUI() done");
        return panel;
    }

    // ==================== 启动 ====================

    debugLog("=== 星空粒子生成器 v1.7 启动 ===");
    debugLog("AE version: " + app.version);

    try {
        var panel = buildUI(this);
        if (panel instanceof Window) {
            panel.center();
            panel.show();
        }
    } catch (e) {
        debugLog("CRITICAL: " + e.toString());
        showErrorReport("插件初始化失败", "buildUI() 报错", e, e.line);
    }
}
