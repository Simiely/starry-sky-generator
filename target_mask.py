import re

with open('D:/workbuddy/2026-07-06-12-50-28/starry-sky-generator.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# === 1. Update target mode dropdown options ===
old = 'var targetModeDrop = m4.add("dropdownlist", undefined, ["无", "Null点"]);'
new = 'var targetModeDrop = m4.add("dropdownlist", undefined, ["无", "Null点", "遮罩范围"]);'
assert old in content, '1. targetModeDrop not found'
content = content.replace(old, new)
print('1. Target mode: added 遮罩范围')

# === 2. Add target mask selection UI after tgtRefreshBtn ===
old = '''        var tgtStatus = motionGroup.add("statictext", undefined, "");
        tgtStatus.preferredSize = [-1, 16];
        targetLayerDrop.onChange = function() { updateTargetStatus(); };
        function updateTargetStatus() {
            try {
                if (!targetModeDrop.selection || targetModeDrop.selection.index !== 1) {
                    tgtStatus.text = "";
                    return;
                }
                var n = targetLayerDrop.selection ? targetLayerDrop.selection.text : "-";
                tgtStatus.text = "\u2713 \u76ee\u6807: " + n;
            } catch (e) {}
        }'''

new = '''        // 目标遮罩选取行
        var m4c = motionGroup.add("group");
        m4c.orientation = "row"; m4c.alignment = ["fill", "center"];
        var tgtMaskLabel = m4c.add("statictext", undefined, "遮罩:");
        tgtMaskLabel.preferredSize = [40, 18];
        var targetMaskDrop = m4c.add("dropdownlist", undefined, ["-"]);
        targetMaskDrop.preferredSize = [-1, 20];
        var tgtMaskRefreshBtn = m4c.add("button", undefined, "R");
        tgtMaskRefreshBtn.preferredSize = [22, 20];
        m4c.visible = false;

        // 目标模式切换
        targetModeDrop.onChange = function() {
            var idx = targetModeDrop.selection ? targetModeDrop.selection.index : 0;
            m4b.visible = (idx === 1);
            m4c.visible = (idx === 2);
            updateTargetStatus();
        };

        // 目标刷新
        tgtRefreshBtn.onClick = function() {
            try {
                var c = app.project.activeItem;
                if (!c || !(c instanceof CompItem)) { alert("无活动合成"); return; }
                targetLayerDrop.removeAll();
                for (var li = 1; li <= c.numLayers; li++) {
                    targetLayerDrop.add("item", c.layer(li).name);
                }
                targetLayerDrop.selection = 0;
                populateTargetMask(c);
                updateTargetStatus();
            } catch (e) {}
        };

        // 目标遮罩刷新
        tgtMaskRefreshBtn.onClick = function() {
            try {
                var c = app.project.activeItem;
                if (c && c instanceof CompItem) populateTargetMask(c);
            } catch (e) {}
        };

        // 目标选层时更新遮罩
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
                else if (idx === 2) n = (targetLayerDrop.selection ? targetLayerDrop.selection.text : "-") + " \u2192 " + (targetMaskDrop.selection ? targetMaskDrop.selection.text : "-");
                tgtStatus.text = "\u2713 \u76ee\u6807: " + n;
            } catch (e) {}
        }'''

assert old in content, '2. target status section not found'
content = content.replace(old, new)
print('2. Replaced target section with mask support')

# === 3. Update buildPositionExpression for target mask ===
# Find the target section in the expression
old_tgt_expr = '''        if (targetMode === 1 && targetLayer) {
            parts.push('');
            parts.push('var tPos = thisComp.layer("' + targetLayer + '").transform.position;');
            parts.push('var tX = tPos[0], tY = tPos[1];');
            parts.push('var attraction = ctrl.effect("吸引力")(1) / 100;');
        } else {
            parts.push('');
            parts.push('var tX = thisComp.width / 2, tY = thisComp.height / 2;');
            parts.push('var attraction = 0;');
        }'''

parts = content.split(old_tgt_expr)
if len(parts) != 2:
    print(f'ERROR: target expr split into {len(parts)} parts')
else:
    content = parts[0] + '''        if (targetMode === 1 && targetLayer) {
            parts.push('');
            parts.push('var tPos = thisComp.layer("' + targetLayer + '").transform.position;');
            parts.push('var tX = tPos[0], tY = tPos[1];');
            parts.push('var attraction = ctrl.effect("吸引力")(1) / 100;');
        } else if (targetMode === 2 && targetLayer && targetMask) {
            // 目标为遮罩区域：随机选点
            parts.push('');
            parts.push('var tLayer = thisComp.layer("' + targetLayer + '");');
            parts.push('var tMPts = [];');
            parts.push('if (tLayer) {');
            parts.push('    var tMMask = tLayer.mask("' + targetMask + '");');
            parts.push('    if (tMMask) {');
            parts.push('        var tMPath = tMMask.maskPath;');
            parts.push('        if (tMPath && tMPath.vertices) tMPts = tMPath.vertices;');
            parts.push('    }');
            parts.push('}');
            parts.push('var tOffX = 0, tOffY = 0;');
            parts.push('if (tLayer) {');
            parts.push('    tOffX = tLayer.transform.position[0] - tLayer.transform.anchorPoint[0];');
            parts.push('    tOffY = tLayer.transform.position[1] - tLayer.transform.anchorPoint[1];');
            parts.push('}');
            parts.push('var tML = 99999, tMR = -99999, tMT = 99999, tMB = -99999;');
            parts.push('for (var tvi = 0; tvi < tMPts.length; tvi++) {');
            parts.push('    var tvx = tMPts[tvi][0], tvy = tMPts[tvi][1];');
            parts.push('    if (tvx < tML) tML = tvx; if (tvx > tMR) tMR = tvx;');
            parts.push('    if (tvy < tMT) tMT = tvy; if (tvy > tMB) tMB = tvy;');
            parts.push('}');
            parts.push('if (tMPts.length === 0) { tML = 0; tMR = 100; tMT = 0; tMB = 100; }');
            parts.push('seedRandom(index + seedVal + 5000, true);');
            parts.push('var tX = tOffX + random(tML, tMR);');
            parts.push('var tY = tOffY + random(tMT, tMB);');
            parts.push('var attraction = ctrl.effect("吸引力")(1) / 100;');
        } else {
            parts.push('');
            parts.push('var tX = thisComp.width / 2, tY = thisComp.height / 2;');
            parts.push('var attraction = 0;');
        }''' + parts[1]
    print('3. Updated target expression for mask support')

# === 4. Update getUIParams ===
old = '''                targetMode: targetModeDrop.selection ? targetModeDrop.selection.index : 0,
                targetLayer: (targetModeDrop.selection && targetModeDrop.selection.index === 1 && targetLayerDrop.selection) ? targetLayerDrop.selection.text : "",'''
new = '''                targetMode: targetModeDrop.selection ? targetModeDrop.selection.index : 0,
                targetLayer: (targetLayerDrop.selection) ? targetLayerDrop.selection.text : "",
                targetMask: (targetModeDrop.selection && targetModeDrop.selection.index === 2 && targetMaskDrop.selection) ? targetMaskDrop.selection.text : "",'''
assert old in content, '4. getUIParams target not found'
content = content.replace(old, new)
print('4. Updated getUIParams')

# === 5. Update applyBuiltInPreset call ===
old = 'generateParticles(comp, controller, Math.round(presetCountSlider.value), preset["形状"] || 0, preset["发射模式"] || 0, preset["发射图层"] || "", preset["发射遮罩"] || "", preset["目标模式"] || 0, preset["目标图层"] || "", preset["发射密度"] || 100);'
new = 'generateParticles(comp, controller, Math.round(presetCountSlider.value), preset["形状"] || 0, preset["发射模式"] || 0, preset["发射图层"] || "", preset["发射遮罩"] || "", preset["目标模式"] || 0, preset["目标图层"] || "", preset["目标遮罩"] || "", preset["发射密度"] || 100);'
assert old in content, '5. preset call not found'
content = content.replace(old, new)
print('5. Updated preset call')

# === 6. Update doGenerate call ===
old = 'generateParticles(comp, controller, params.count, params.shape, params.emitMode, params.emitLayer, params.emitMask, params.targetMode, params.targetLayer, params.emitDen);'
new = 'generateParticles(comp, controller, params.count, params.shape, params.emitMode, params.emitLayer, params.emitMask, params.targetMode, params.targetLayer, params.targetMask || "", params.emitDen);'
assert old in content, '6. doGenerate call not found'
content = content.replace(old, new)
print('6. Updated doGenerate call')

# === 7. Update generateParticles signature ===
old = 'function generateParticles(comp, controller, count, shapeIdx, emitMode, emitLayer, emitMask, targetMode, targetLayer, emitDen) {'
new = 'function generateParticles(comp, controller, count, shapeIdx, emitMode, emitLayer, emitMask, targetMode, targetLayer, targetMask, emitDen) {'
assert old in content, '7. generateParticles sig not found'
content = content.replace(old, new)
print('7. Updated generateParticles sig')

# === 8. Update buildPositionExpression call ===
old = 'var posExpr = buildPositionExpression(emitMode, emitLayer, emitMask, targetMode, targetLayer, emitDen);'
new = 'var posExpr = buildPositionExpression(emitMode, emitLayer, emitMask, targetMode, targetLayer, targetMask, emitDen);'
assert old in content, '8. buildPosExpr call not found'
content = content.replace(old, new)
print('8. Updated buildPositionExpression call')

# === 9. Update buildPositionExpression signature ===
old = 'function buildPositionExpression(emitMode, emitLayer, emitMask, targetMode, targetLayer, density) {'
new = 'function buildPositionExpression(emitMode, emitLayer, emitMask, targetMode, targetLayer, targetMask, density) {'
assert old in content, '9. buildPosExpr sig not found'
content = content.replace(old, new)
print('9. Updated buildPositionExpression sig')

# === 10. Update loadPreset call ===
old = 'generateParticles(comp, controller, Math.round(getControllerSliderValue(controller, "粒子数量")), 0, 0, "", "", 0, "", 100);'
new = 'generateParticles(comp, controller, Math.round(getControllerSliderValue(controller, "粒子数量")), 0, 0, "", "", 0, "", "", 100);'
assert old in content, '10. loadPreset call not found'
content = content.replace(old, new)
print('10. Updated loadPreset call')

# === 11. Update applyPresetToUI ===
old = '''            targetModeDrop.selection = preset["目标模式"] || 0;'''
new = '''            targetModeDrop.selection = preset["目标模式"] || 0;'''

# Already OK, but need to remove the old single-line targetMode replacement
# Let me check if target模式 handling is already updated
# The preset restore for targetMode/targetLayer is in applyPresetToUI

with open('D:/workbuddy/2026-07-06-12-50-28/starry-sky-generator.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('ALL DONE')
