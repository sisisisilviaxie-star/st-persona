// ============================================================================
// File: ui.js
// Description: 视图渲染层 (纯净 DOM 操作、HTML 模板、Diff 界面渲染)
// ============================================================================

import { CURRENT_VERSION, extensionName } from "./constants.js";
import { parseYamlToBlocks, findMatchingKey } from "./api.js";

// ============================================================================
// 1. 弹窗 HTML 模板引擎
// ============================================================================
export function getCreatorPopupHtml(params) {
    const { 
        headerTitle, currentName, activeData, config, 
        presetOptionsHtml, initialHint, updateUiHtml, 
        chipsIcon, chipsDisplay, isNpc 
    } = params;

    return `
<div class="pw-wrapper">
    <div class="pw-header">
        <div class="pw-top-bar"><div class="pw-title">${headerTitle}</div></div>
        <div class="pw-tabs">
            <div class="pw-tab active" data-tab="editor">人设</div>
            <div class="pw-tab" data-tab="context">参考</div> 
            <div class="pw-tab" data-tab="api">API</div>
            <div class="pw-tab" data-tab="system">系统</div>
            <div class="pw-tab" data-tab="history">记录</div>
        </div>
    </div>

    <!-- Editor View -->
    <div id="pw-view-editor" class="pw-view active">
        <div class="pw-scroll-area">
            <!-- Mode Switcher -->
            <div class="pw-info-display mode-switcher">
                <div class="pw-mode-toggle-group">
                    <div class="pw-mode-item ${!isNpc ? 'active' : ''}" data-mode="user" title="User 模式">
                        <i class="fa-solid fa-user"></i> ${currentName}
                    </div>
                    <div class="pw-mode-item ${isNpc ? 'active' : ''}" data-mode="npc" title="NPC 模式">
                        <i class="fa-solid fa-user-secret"></i> NPC
                    </div>
                </div>
                <div class="pw-load-btn" id="pw-btn-load-current" style="${isNpc ? 'visibility:hidden;' : ''}">载入当前人设</div>
            </div>

            <div>
                <div class="pw-tags-header">
                    <span class="pw-tags-label" id="pw-template-block-header" style="cursor:pointer; user-select:none;">
                        模版块 (点击填入) 
                        <i class="fa-solid ${chipsIcon}" style="margin-left:5px;" title="折叠/展开"></i>
                    </span>
                    <div class="pw-tags-actions">
                        <span class="pw-tags-edit-toggle" id="pw-load-main-template" style="${isNpc ? '' : 'display:none;'} margin-right:10px;">使用User模版</span>
                        <span class="pw-tags-edit-toggle" id="pw-toggle-edit-template">编辑模版</span>
                    </div>
                </div>
                <div class="pw-tags-container" id="pw-template-chips" style="display:${chipsDisplay};"></div>
                
                <div class="pw-template-editor-area" id="pw-template-editor">
                    <div class="pw-template-toolbar">
                        <div class="pw-shortcut-bar">
                            <div class="pw-shortcut-btn" data-key="  "><span>缩进</span><span class="code">Tab</span></div>
                            <div class="pw-shortcut-btn" data-key=": "><span>冒号</span><span class="code">:</span></div>
                            <div class="pw-shortcut-btn" data-key="- "><span>列表</span><span class="code">-</span></div>
                            <div class="pw-shortcut-btn" data-key="\n"><span>换行</span><span class="code">Enter</span></div>
                        </div>
                        <div class="pw-mini-btn" id="pw-reset-template-small" title="恢复为该模式的默认模版" style="margin-left:auto; padding:2px 8px; font-size:0.8em; border:none; background:transparent; opacity:0.6;"><i class="fa-solid fa-rotate-left"></i></div>
                    </div>
                    <textarea id="pw-template-text" class="pw-template-textarea">${activeData.template}</textarea>
                    <div class="pw-template-footer">
                        <button class="pw-mini-btn" id="pw-gen-template-smart" title="根据当前世界书和设定，生成定制化模版">生成模板</button>
                        <button class="pw-mini-btn" id="pw-save-template">保存模版</button>
                    </div>
                </div>
            </div>

            <textarea id="pw-request" class="pw-textarea pw-auto-height" placeholder="在此输入要求，或点击上方模版块插入参考结构（无需全部填满）...">${activeData.request}</textarea>
            <button id="pw-btn-gen" class="pw-btn gen">${isNpc ? '生成 NPC 设定' : '生成 User 设定'}</button>

            <div id="pw-result-area" style="display:${activeData.hasResult ? 'block' : 'none'}; margin-top:15px;">
                <div class="pw-relative-container">
                    <textarea id="pw-result-text" class="pw-result-textarea pw-auto-height" placeholder="生成的结果将显示在这里..." style="min-height: 200px;">${activeData.result}</textarea>
                </div>
                
                <div class="pw-refine-toolbar">
                    <textarea id="pw-refine-input" class="pw-refine-input" placeholder="输入意见，或选中上方文字后点击浮窗快速修改..."></textarea>
                    <div class="pw-refine-btn-vertical" id="pw-btn-refine" title="执行润色">
                        <span class="pw-refine-btn-text">润色</span>
                        <i class="fa-solid fa-magic"></i>
                    </div>
                </div>
            </div>
        </div>

        <div class="pw-footer">
            <div class="pw-footer-group">
                <div class="pw-compact-btn danger" id="pw-clear" title="清空"><i class="fa-solid fa-eraser"></i></div>
                <div class="pw-compact-btn" id="pw-copy-persona" title="复制内容"><i class="fa-solid fa-copy"></i></div>
                <div class="pw-compact-btn" id="pw-snapshot" title="保存至记录"><i class="fa-solid fa-save"></i></div>
            </div>
            <div class="pw-footer-group" style="flex:1; justify-content:flex-end; gap: 8px;">
                <button class="pw-btn wi" id="pw-btn-save-wi">保存至世界书</button>
                <button class="pw-btn save" id="pw-btn-apply" style="${isNpc ? 'display:none;' : ''}">覆盖当前人设</button>
            </div>
        </div>
    </div>

    <!-- Diff Overlay -->
    <div id="pw-diff-overlay" class="pw-diff-container" style="display:none;">
        <div class="pw-diff-tabs-bar">
            <div class="pw-diff-tab active" data-view="diff">
                <div>智能对比</div><div class="pw-tab-sub">选择编辑</div>
            </div>
            <div class="pw-diff-tab" data-view="raw">
                <div>新版原文</div><div class="pw-tab-sub">查看/编辑</div>
            </div>
            <div class="pw-diff-tab" data-view="old-raw">
                <div>原版原文</div><div class="pw-tab-sub">查看/编辑</div>
            </div>
        </div>
        
        <div class="pw-diff-content-area">
            <div id="pw-diff-list-view" class="pw-diff-list-view">
                <div id="pw-diff-list" style="display:flex; flex-direction:column; gap:10px;"></div>
            </div>
            <div id="pw-diff-raw-view" class="pw-diff-raw-view">
                <textarea id="pw-diff-raw-textarea" class="pw-diff-raw-textarea" spellcheck="false"></textarea>
            </div>
            <div id="pw-diff-old-raw-view" class="pw-diff-raw-view" style="display:none;">
                <textarea id="pw-diff-old-raw-textarea" class="pw-diff-raw-textarea" spellcheck="false"></textarea>
            </div>
        </div>

        <div class="pw-diff-actions">
            <button class="pw-btn danger" id="pw-diff-cancel">放弃修改</button>
            <button class="pw-btn primary" id="pw-diff-reroll" title="使用相同的提示词重新生成"><i class="fa-solid fa-rotate-right"></i> 重新生成</button>
            <button class="pw-btn save" id="pw-diff-confirm">保存并应用</button>
        </div>
    </div>

    <div id="pw-float-quote-btn" class="pw-float-quote-btn"><i class="fa-solid fa-pen-to-square"></i> 修改此段</div>

    <!-- Context View -->
    <div id="pw-view-context" class="pw-view">
        <div class="pw-scroll-area">
            
            <div class="pw-card-section">
                <div class="pw-row">
                    <label class="pw-section-label">生成使用的预设 (System Prompt)</label>
                    <select id="pw-preset-select" class="pw-input" style="flex:1; width:100%;">
                        ${presetOptionsHtml}
                    </select>
                </div>
                <div id="pw-preset-hint" style="font-size:0.8em; opacity:0.7; margin-top:4px; margin-left: 5px; color: var(--SmartThemeBodyColor);">
                    ${initialHint}
                </div>
            </div>

            <div class="pw-card-section">
                <div class="pw-row">
                    <label class="pw-section-label pw-label-gold">角色开场白</label>
                    <select id="pw-greetings-select" class="pw-input" style="flex:1; width:100%;">
                        <option value="">(不使用开场白)</option>
                    </select>
                </div>
                <div id="pw-greetings-toggle-bar" class="pw-preview-toggle-bar" style="display:none;">
                    <i class="fa-solid fa-angle-up"></i> 收起预览
                </div>
                <textarea id="pw-greetings-preview" style="display:none; min-height: 300px; margin-top:5px;"></textarea>
            </div>

            <div class="pw-card-section">
                <div class="pw-row" style="margin-bottom:5px;">
                    <label class="pw-section-label pw-label-blue">世界书</label>
                </div>
                <div id="pw-wi-body" style="display:block; padding-top:5px;">
                    <div class="pw-wi-controls" style="margin-bottom:8px;">
                        <select id="pw-wi-select" class="pw-input pw-wi-select"><option value="">正在加载...</option></select>
                        <button id="pw-wi-add" class="pw-btn primary pw-wi-add-btn"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div id="pw-wi-container"></div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- API View -->
    <div id="pw-view-api" class="pw-view">
        <div class="pw-scroll-area">
            <div class="pw-card-section">
                <div class="pw-row"><label>API 来源</label><select id="pw-api-source" class="pw-input" style="flex:1;"><option value="main" ${config.apiSource === 'main' ? 'selected' : ''}>主 API</option><option value="independent" ${config.apiSource === 'independent' ? 'selected' : ''}>独立 API</option></select></div>
                <div id="pw-indep-settings" style="display:${config.apiSource === 'independent' ? 'flex' : 'none'}; flex-direction:column; gap:15px;">
                    <div class="pw-row"><label>URL</label><input type="text" id="pw-api-url" class="pw-input" value="${config.indepApiUrl}" style="flex:1;" placeholder="http://.../v1"></div>
                    <div class="pw-row"><label>Key</label><input type="password" id="pw-api-key" class="pw-input" value="${config.indepApiKey}" style="flex:1;"></div>
                    <div class="pw-row"><label>Model</label>
                        <div style="flex:1; display:flex; gap:5px; width:100%; min-width: 0;">
                            <select id="pw-api-model-select" class="pw-select" style="flex:1;"><option value="${config.indepApiModel}">${config.indepApiModel}</option></select>
                            <button id="pw-api-fetch" class="pw-btn primary pw-api-fetch-btn" title="刷新模型列表" style="width:auto;"><i class="fa-solid fa-sync"></i></button>
                            <button id="pw-api-test" class="pw-btn primary" style="width:auto;" title="测试连接"><i class="fa-solid fa-plug"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- System View -->
    <div id="pw-view-system" class="pw-view">
        <div class="pw-scroll-area">
            
            <div class="pw-card-section">
                <div class="pw-row" style="margin-bottom:8px; border-bottom:1px solid var(--SmartThemeBorderColor); padding-bottom:5px;">
                    <label style="color: var(--SmartThemeQuoteColor);"><i class="fa-solid fa-circle-info"></i> 插件版本</label>
                    <span style="opacity:0.8; font-family:monospace;">当前: v${CURRENT_VERSION}</span>
                </div>
                ${updateUiHtml}
            </div>

            <div class="pw-card-section">
                <div class="pw-row">
                    <label style="color: var(--SmartThemeQuoteColor); font-weight:bold;">界面主题</label>
                    <div style="flex:1; display:flex; gap:5px;">
                        <select id="pw-theme-select" class="pw-input" style="flex:1;">
                            <option value="style.css" selected>默认 (Native)</option>
                        </select>
                        <button class="pw-btn danger" id="pw-btn-delete-theme" title="删除当前主题" style="padding:6px 10px; display:none;"><i class="fa-solid fa-trash"></i></button>
                        <input type="file" id="pw-theme-import" accept=".css" style="display:none;">
                        <button class="pw-btn primary" id="pw-btn-import-theme" title="导入本地 .css 文件" style="padding:6px 10px;"><i class="fa-solid fa-file-import"></i></button>
                        <button class="pw-btn primary" id="pw-btn-download-template" title="下载主题模版" style="padding:6px 10px;"><i class="fa-solid fa-download"></i></button>
                    </div>
                </div>
            </div>

            <div class="pw-card-section">
                <div class="pw-context-header" id="pw-prompt-header">
                    <span><i class="fa-solid fa-terminal"></i> Prompt 查看与编辑 (User Prompt)</span>
                    <i class="fa-solid fa-chevron-down arrow"></i>
                </div>
                <div id="pw-prompt-container" style="display:none; padding-top:10px;">
                    <div class="pw-row" style="margin-bottom:8px;">
                        <label>编辑目标</label>
                        <select id="pw-prompt-type" class="pw-input" style="flex:1;">
                            <option value="personaGen">User人设生成/润色指令</option>
                            <option value="npcGen">NPC人设生成/润色指令</option>
                            <option value="templateGen">User模版生成指令</option>
                            <option value="npcTemplateGen">NPC模版生成指令</option>
                        </select>
                    </div>
                    <div class="pw-var-btns">
                        <div class="pw-var-btn" data-ins="{{user}}"><span>User名</span><span class="code">{{user}}</span></div>
                        <div class="pw-var-btn" data-ins="{{char}}"><span>Char名</span><span class="code">{{char}}</span></div>
                        <div class="pw-var-btn" data-ins="{{charInfo}}"><span>角色设定</span><span class="code">{{charInfo}}</span></div>
                        <div class="pw-var-btn" data-ins="{{greetings}}"><span>开场白</span><span class="code">{{greetings}}</span></div>
                        <div class="pw-var-btn" data-ins="{{template}}"><span>模版内容</span><span class="code">{{template}}</span></div>
                        <div class="pw-var-btn" data-ins="{{input}}"><span>用户要求</span><span class="code">{{input}}</span></div>
                        <!-- NPC Specific -->
                        <div class="pw-var-btn" data-ins="{{userPersona}}"><span>User设定</span><span class="code">{{userPersona}}</span></div>
                        <div class="pw-var-btn" data-ins="{{chatHistory}}"><span>聊天记录</span><span class="code">{{chatHistory}}</span></div>
                    </div>
                    <textarea id="pw-prompt-editor" class="pw-textarea pw-auto-height" style="min-height:150px; font-size:0.85em;"></textarea>
                    
                    <div style="text-align:right; margin-top:10px; display:flex; gap:10px; justify-content:flex-end; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 10px;">
                        <div id="pw-toggle-debug-btn" class="pw-toggle-switch" style="margin-right:auto;"><i class="fa-solid fa-bug"></i> Debug</div>
                        
                        <button class="pw-mini-btn" id="pw-reset-prompt" style="font-size:0.8em;">恢复默认</button>
                        <button id="pw-api-save" class="pw-btn primary" style="width:auto; padding: 5px 20px;">保存 Prompt</button>
                    </div>
                </div>
            </div>

            <div id="pw-debug-wrapper" class="pw-card-section" style="display:none; margin-top: 10px; border-top: 1px solid var(--SmartThemeBorderColor); padding-top: 10px;">
                <div style="margin-bottom: 5px;">
                    <label style="color: var(--SmartThemeQuoteColor); font-weight:bold;"><i class="fa-solid fa-bug"></i> 实时发送内容预览 (Debug)</label>
                </div>
                <div style="font-size: 0.8em; opacity: 0.7; margin-bottom: 5px;">点击“生成设定”后，下方将显示实际发给 AI 的完整内容。</div>
                <textarea id="pw-debug-preview" class="pw-textarea" readonly style="
                    min-height: 250px; 
                    font-family: 'Consolas', 'Monaco', monospace; 
                    font-size: 12px; 
                    white-space: pre-wrap; 
                    background: var(--SmartThemeInputBg); 
                    color: var(--SmartThemeBodyColor); 
                    border: 1px solid var(--SmartThemeBorderColor);
                    width: 100%;
                " placeholder="等待生成..."></textarea>
            </div>

        </div>
    </div>

    <!-- History View with Pagination -->
    <div id="pw-view-history" class="pw-view">
        <div class="pw-scroll-area">
            <div class="pw-history-filters" style="display:flex; gap:5px; margin-bottom:8px;">
                <select id="pw-hist-filter-type" class="pw-input" style="flex:1;">
                    <option value="all">所有类型</option>
                    <option value="user_persona">User人设</option>
                    <option value="npc_persona">NPC人设</option>
                    <option value="user_template">User模板</option>
                    <option value="npc_template">NPC模板</option>
                </select>
                <select id="pw-hist-filter-char" class="pw-input" style="flex:1;">
                    <option value="all">所有角色</option>
                </select>
            </div>

            <div class="pw-search-box">
                <i class="fa-solid fa-search pw-search-icon"></i>
                <input type="text" id="pw-history-search" class="pw-input pw-search-input" placeholder="搜索历史...">
                <i class="fa-solid fa-times pw-search-clear" id="pw-history-search-clear" title="清空搜索"></i>
            </div>
            
            <div id="pw-history-list" style="display:flex; flex-direction:column;"></div>
            
            <div class="pw-pagination">
                <button class="pw-page-btn" id="pw-hist-prev"><i class="fa-solid fa-chevron-left"></i></button>
                <span class="pw-page-info" id="pw-hist-page-info">1 / 1</span>
                <button class="pw-page-btn" id="pw-hist-next"><i class="fa-solid fa-chevron-right"></i></button>
            </div>

            <button id="pw-history-clear-all" class="pw-btn" style="margin-top:15px;">清空所有记录</button>
        </div>
    </div>
</div>
`;
}

// ============================================================================
// 2. 纯净渲染函数 (DOM 操作)
// ============================================================================

export function renderDiffComparison(oldText, newText) {
    $('#pw-diff-raw-textarea').val(newText);
    $('#pw-diff-old-raw-textarea').val(oldText);

    const oldMap = parseYamlToBlocks(oldText);
    const newMap = parseYamlToBlocks(newText);
    const allKeys = [...new Set([...oldMap.keys(), ...newMap.keys()])];

    const $list = $('#pw-diff-list').empty();
    let changeCount = 0;

    allKeys.forEach(key => {
        const matchedKeyInOld = findMatchingKey(key, oldMap) || key;
        const matchedKeyInNew = findMatchingKey(key, newMap) || key;
        const valOld = oldMap.get(matchedKeyInOld) || "";
        const valNew = newMap.get(matchedKeyInNew) || "";

        const isChanged = valOld.trim() !== valNew.trim();
        if (isChanged) changeCount++;
        if (!valOld && !valNew) return;

        let cardsHtml = '';
        if (!isChanged) {
            cardsHtml = `
            <div class="pw-diff-card new selected single-view" data-val="${encodeURIComponent(valNew)}">
                <div class="pw-diff-label">无变更</div>
                <textarea class="pw-diff-textarea">${valNew}</textarea>
            </div>`;
        } else {
            cardsHtml = `
            <div class="pw-diff-card old" data-val="${encodeURIComponent(valOld)}">
                <div class="pw-diff-label">原版本</div>
                <textarea class="pw-diff-textarea" readonly>${valOld || "(无)"}</textarea>
            </div>
            <div class="pw-diff-card new selected" data-val="${encodeURIComponent(valNew)}">
                <div class="pw-diff-label">新版本</div>
                <textarea class="pw-diff-textarea">${valNew || "(删除)"}</textarea>
            </div>`;
        }

        const rowHtml = `
        <div class="pw-diff-row" data-key="${key}">
            <div class="pw-diff-attr-name">${key}</div>
            <div class="pw-diff-cards">
                ${cardsHtml}
            </div>
        </div>`;
        $list.append(rowHtml);
    });

    if (changeCount === 0 && !newText) {
        toastr.warning("返回内容为空，请切换到“直接编辑”查看");
    } else if (changeCount === 0) {
        toastr.info("没有检测到内容变化");
    }
}

export function loadThemeCSS(fileName) {
    $('#pw-custom-style').remove();
    const versionQuery = `?v=${CURRENT_VERSION}`; 
    const href = `scripts/extensions/third-party/${extensionName}/${fileName}${versionQuery}`;

    if ($('#pw-style-link').length) {
        $('#pw-style-link').attr('href', href);
    } else {
        $('<link>')
            .attr('rel', 'stylesheet')
            .attr('type', 'text/css')
            .attr('href', href)
            .attr('id', 'pw-style-link')
            .appendTo('head');
    }
}

export function applyCustomTheme(cssContent) {
    $('#pw-style-link').remove(); 
    if ($('#pw-custom-style').length) $('#pw-custom-style').remove();
    $('<style id="pw-custom-style">').text(cssContent).appendTo('head');
}

export function renderThemeOptions(customThemes) {
    const $select = $('#pw-theme-select').empty();
    $select.append('<option value="style.css">默认 (Native)</option>');
    $select.append('<option value="Cozy_Fox.css">小狐狸</option>');
    
    Object.keys(customThemes).forEach(name => {
        if (name !== 'style.css' && name !== 'Cozy_Fox.css') {
            $select.append(`<option value="${name}">${name}</option>`);
        }
    });
}

export function renderTemplateChips(templateText) {
    const $container = $('#pw-template-chips').empty();
    const blocks = parseYamlToBlocks(templateText);
    blocks.forEach((content, key) => {
        const $chip = $(`<div class="pw-tag-chip"><i class="fa-solid fa-cube" style="opacity:0.5; margin-right:4px;"></i><span>${key}</span></div>`);
        $chip.on('click', () => {
            const $text = $('#pw-request');
            const cur = $text.val();
            const prefix = (cur && !cur.endsWith('\n') && cur.length > 0) ? '\n\n' : '';
            let insertText = key + ":";
            if (content && content.trim()) {
                if (content.includes('\n') || content.startsWith(' ')) insertText += "\n" + content;
                else insertText += " " + content;
            } else insertText += " ";
            $text.val(cur + prefix + insertText).focus();
            $text.scrollTop($text[0].scrollHeight);
        });
        $container.append($chip);
    });
}

export function renderGreetingsList(list) {
    const $select = $('#pw-greetings-select').empty();
    $select.append('<option value="">(不使用开场白)</option>');
    list.forEach((item, idx) => {
        $select.append(`<option value="${idx}">${item.label}</option>`);
    });
}

export function autoBindGreetings(currentGreetingsList) {
    if (window.TavernHelper && window.TavernHelper.getChatMessages) {
        try {
            const msgs = window.TavernHelper.getChatMessages(0, { include_swipes: true });
            if (msgs && msgs.length > 0) {
                const swipeId = msgs[0].swipe_id; 
                if (swipeId !== undefined && swipeId !== null) {
                    if ($(`#pw-greetings-select option[value="${swipeId}"]`).length > 0) {
                        $('#pw-greetings-select').val(swipeId);
                        
                        if (currentGreetingsList[swipeId]) {
                            $('#pw-greetings-preview').val(currentGreetingsList[swipeId].content).hide();
                            $('#pw-greetings-toggle-bar').show().html('<i class="fa-solid fa-angle-down"></i> 展开预览');
                        }
                    }
                }
            }
        } catch (e) { console.warn("[PW] Auto-bind greetings failed:", e); }
    }
}