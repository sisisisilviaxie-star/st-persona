// ============================================================================
// File: index.js
// Description: 主控制器 (状态缓存、事件绑定、组件胶水层)
// ============================================================================

import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, callPopup, getRequestHeaders } from "../../../../script.js";

import * as CONSTANTS from './constants.js';
import * as API from './api.js';
import * as UI from './ui.js';

// 解构常量，保持与原代码变量名一致，避免修改事件绑定里的逻辑
const {
    extensionName, CURRENT_VERSION, BUTTON_ID, HISTORY_PER_PAGE,
    STORAGE_KEY_HISTORY, STORAGE_KEY_STATE, STORAGE_KEY_TEMPLATE, STORAGE_KEY_PROMPTS,
    STORAGE_KEY_WI_STATE, STORAGE_KEY_UI_STATE, STORAGE_KEY_THEMES, STORAGE_KEY_DATA_USER, STORAGE_KEY_DATA_NPC,
    defaultYamlTemplate, defaultNpcTemplate,
    defaultTemplateGenPrompt, defaultNpcTemplateGenPrompt, defaultPersonaGenPrompt, defaultNpcGenPrompt, fallbackSystemPrompt,
    TEXT, defaultSettings
} = CONSTANTS;

// ============================================================================
// 全局状态缓存
// ============================================================================
let historyCache =[];
let promptsCache = { 
    templateGen: defaultTemplateGenPrompt, npcTemplateGen: defaultNpcTemplateGenPrompt,
    personaGen: defaultPersonaGenPrompt, npcGen: defaultNpcGenPrompt, initial: fallbackSystemPrompt 
};
let availableWorldBooks =[];
let isEditingTemplate = false;
let lastRawResponse = "";
let isProcessing = false;
let currentGreetingsList =[]; 
let wiSelectionCache = {};
let uiStateCache = { templateExpanded: true, theme: 'style.css', generationMode: 'user', generationPreset: 'current' }; 
let hasNewVersion = false;
let customThemes = {}; 
let historyPage = 1; 
let lastRefineRequest = ""; 

let userContext = { template: defaultYamlTemplate, request: "", result: "", hasResult: false };
let npcContext = { template: defaultNpcTemplate, request: "", result: "", hasResult: false };

const getCurrentTemplate = () => uiStateCache.generationMode === 'npc' ? npcContext.template : userContext.template;

// 供 api.js 生成时读取当前状态
const getGenerationContextState = () => ({
    promptsCache,
    isNpcMode: uiStateCache.generationMode === 'npc',
    currentTemplate: getCurrentTemplate(),
    generationPreset: uiStateCache.generationPreset
});

// ============================================================================
// 存储系统
// ============================================================================
function safeLocalStorageSet(key, value) {
    try { localStorage.setItem(key, value); } 
    catch (e) { if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') toastr.error(TEXT.TOAST_QUOTA_ERROR); }
}

function loadData() {
    try { historyCache = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || []; } catch { historyCache =[]; }
    try {
        const p = JSON.parse(localStorage.getItem(STORAGE_KEY_PROMPTS));
        if(p) promptsCache = { ...promptsCache, ...p };
    } catch {}
    try { wiSelectionCache = JSON.parse(localStorage.getItem(STORAGE_KEY_WI_STATE)) || {}; } catch { wiSelectionCache = {}; }
    try { uiStateCache = JSON.parse(localStorage.getItem(STORAGE_KEY_UI_STATE)) || { templateExpanded: true, theme: 'style.css', generationMode: 'user', generationPreset: 'current' }; } catch {}
    try { customThemes = JSON.parse(localStorage.getItem(STORAGE_KEY_THEMES)) || {}; } catch {}
    
    try {
        const u = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA_USER));
        userContext = u || { template: defaultYamlTemplate, request: "", result: "", hasResult: false };
        if(!u) { const oldT = localStorage.getItem(STORAGE_KEY_TEMPLATE); if(oldT && oldT.length > 50) userContext.template = oldT; }
    } catch { userContext = { template: defaultYamlTemplate, request: "", result: "", hasResult: false }; }

    try { npcContext = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA_NPC)) || { template: defaultNpcTemplate, request: "", result: "", hasResult: false }; } catch {}
}

function saveData() {
    safeLocalStorageSet(STORAGE_KEY_HISTORY, JSON.stringify(historyCache));
    safeLocalStorageSet(STORAGE_KEY_PROMPTS, JSON.stringify(promptsCache));
    safeLocalStorageSet(STORAGE_KEY_UI_STATE, JSON.stringify(uiStateCache));
    safeLocalStorageSet(STORAGE_KEY_THEMES, JSON.stringify(customThemes));
    safeLocalStorageSet(STORAGE_KEY_DATA_USER, JSON.stringify(userContext));
    safeLocalStorageSet(STORAGE_KEY_DATA_NPC, JSON.stringify(npcContext));
}

function saveHistory(item) {
    const limit = 1000; 
    const mode = uiStateCache.generationMode;
    if (!item.title || item.title === "未命名") {
        const context = getContext();
        const userName = $('.persona_name').first().text().trim() || "User";
        const charName = context.characters[context.characterId]?.name || "Char";
        if (item.data && item.data.type === 'template') {
            item.title = mode === 'npc' ? `NPC模版 (${charName})` : `User模版 (${charName})`;
        } else {
            if (mode === 'npc') {
                const nameMatch = item.data.resultText.match(/姓名:\s*(.*?)(\n|$)/);
                item.title = `NPC：${nameMatch ? nameMatch[1].trim() : "Unknown"} @ ${charName}`;
            } else { item.title = `${userName} & ${charName}`; }
        }
    }
    if (!item.data.genType) {
        item.data.genType = item.data.type === 'template' ? (mode === 'npc' ? 'npc_template' : 'user_template') : (mode === 'npc' ? 'npc_persona' : 'user_persona');
    }
    historyCache.unshift(item);
    if (historyCache.length > limit) historyCache = historyCache.slice(0, limit);
    saveData();
}

function getWiCacheKey() { return getContext().characterId || 'global_no_char'; }
function loadWiSelection(bookName) { const charKey = getWiCacheKey(); return (wiSelectionCache[charKey] && wiSelectionCache[charKey][bookName]) ? wiSelectionCache[charKey][bookName] : null; }
function saveWiSelection(bookName, uids) {
    const charKey = getWiCacheKey();
    if (!wiSelectionCache[charKey]) wiSelectionCache[charKey] = {};
    wiSelectionCache[charKey][bookName] = uids;
    safeLocalStorageSet(STORAGE_KEY_WI_STATE, JSON.stringify(wiSelectionCache));
}

function saveState(data) { safeLocalStorageSet(STORAGE_KEY_STATE, JSON.stringify(data)); }
function loadState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY_STATE)) || {}; } catch { return {}; } }

async function collectContextData() {
    let wiContent =[];
    let greetingsContent = "";
    try {
        const boundBooks = await API.getContextWorldBooks();
        const manualBooks = window.pwExtraBooks || [];
        const allBooks = [...new Set([...boundBooks, ...manualBooks])];
        if (allBooks.length > 20) allBooks.length = 20;

        for (const bookName of allBooks) {
            await API.yieldToBrowser();
            const $list = $('#pw-wi-container .pw-wi-list[data-book="' + bookName + '"]');
            
            if ($list.length > 0 && $list.data('loaded')) {
                $list.find('.pw-wi-check:checked').each(function() {
                    wiContent.push(`[DB:${bookName}] ${decodeURIComponent($(this).data('content'))}`);
                });
            } else {
                try {
                    const savedSelection = loadWiSelection(bookName);
                    const entries = await API.getWorldBookEntries(bookName);
                    let enabledEntries = (savedSelection && savedSelection.length > 0) ? entries.filter(e => savedSelection.includes(String(e.uid))) : entries.filter(e => e.enabled);
                    enabledEntries.forEach(entry => wiContent.push(`[DB:${bookName}] ${entry.content}`));
                } catch(err) { console.warn(`[PW] Failed to auto-fetch book ${bookName}`, err); }
            }
        }
    } catch (e) { console.warn(e); }

    const selectedIdx = $('#pw-greetings-select').val();
    if (selectedIdx !== "" && selectedIdx !== null && currentGreetingsList[selectedIdx]) {
        greetingsContent = currentGreetingsList[selectedIdx].content;
    }
    return { wi: wiContent.join('\n\n'), greetings: greetingsContent };
}

// ============================================================================
// UI 初始化入口
// ============================================================================
async function openCreatorPopup() {
    const context = getContext();
    loadData();
    hasNewVersion = false; 
    let updatePromise = API.checkForUpdates(); 

    const savedState = loadState();
    const config = { ...defaultSettings, ...extension_settings[extensionName], ...savedState.localConfig };

    let currentName = $('.persona_name').first().text().trim() || $('h5#your_name').text().trim() || context.powerUserSettings?.persona_selected || "User";

    const isNpc = uiStateCache.generationMode === 'npc';
    const activeData = isNpc ? npcContext : userContext;
    const charName = getContext().characters[getContext().characterId]?.name || "None";
    
    const newBadge = `<span id="pw-new-badge" title="点击查看更新" style="display:none; cursor:pointer; color:#ff4444; font-size:0.6em; font-weight:bold; vertical-align: super; margin-left: 2px;">NEW</span>`;
    const headerTitle = `${TEXT.PANEL_TITLE}${newBadge}<span class="pw-header-subtitle">User: ${currentName} & Char: ${charName}</span>`;

    let presetOptionsHtml = `
        <option value="current" ${uiStateCache.generationPreset === 'current' ? 'selected' : ''}>跟随酒馆预设 (Default)</option>
        <option value="pure" ${uiStateCache.generationPreset === 'pure' ? 'selected' : ''}>✨ 纯净模式 (Pure Mode)</option>
    `;
    if (window.TavernHelper && typeof window.TavernHelper.getPresetNames === 'function') {
        window.TavernHelper.getPresetNames().sort().forEach(p => {
            if (p !== 'in_use') presetOptionsHtml += `<option value="${p}" ${uiStateCache.generationPreset === p ? 'selected' : ''}>[预设] ${p}</option>`;
        });
    }

    const html = UI.getCreatorPopupHtml({
        headerTitle, currentName, activeData, config, presetOptionsHtml,
        initialHint: API.getPresetHintText(uiStateCache.generationPreset),
        updateUiHtml: `<div id="pw-update-container"><div style="margin-top:10px; opacity:0.6; font-size:0.9em;"><i class="fas fa-spinner fa-spin"></i> 正在检查更新...</div></div>`,
        chipsIcon: uiStateCache.templateExpanded ? 'fa-angle-up' : 'fa-angle-down',
        chipsDisplay: uiStateCache.templateExpanded ? 'flex' : 'none',
        isNpc
    });

    callPopup(html, 'text', '', { wide: true, large: true, okButton: "Close" });

    updatePromise.then(updateInfo => {
        hasNewVersion = !!updateInfo;
        const $container = $('#pw-update-container');
        if (hasNewVersion) {
            $('#pw-new-badge').show(); 
            $container.html(`
                <div id="pw-new-version-box" style="margin-top:10px; padding:15px; background:rgba(0,0,0,0.2); border: 1px solid var(--SmartThemeQuoteColor); border-radius: 6px;">
                    <div style="font-weight:bold; color:var(--SmartThemeQuoteColor); margin-bottom:8px;"><i class="fa-solid fa-cloud-arrow-down"></i> 发现新版本: v${updateInfo.version}</div>
                    <div id="pw-update-notes" style="font-size:0.9em; margin-bottom:10px; white-space: pre-wrap; color: var(--SmartThemeBodyColor); opacity: 0.9;">${updateInfo.notes || "无更新说明"}</div>
                    <button id="pw-btn-update" class="pw-btn primary" style="width:100%;">立即更新</button>
                </div>`);
        } else {
            $container.html(`<div style="margin-top:10px; opacity:0.6; font-size:0.9em;"><i class="fa-solid fa-check"></i> 当前已是最新版本</div>`);
        }
    });

    $('#pw-prompt-editor').val(promptsCache.personaGen);
    UI.renderTemplateChips(getCurrentTemplate());
    
    API.fetchAvailableWorldBooks().then(books => {
        availableWorldBooks = books;
        renderWiBooks();
        const options = availableWorldBooks.length > 0 ? availableWorldBooks.map(b => `<option value="${b}">${b}</option>`).join('') : `<option disabled>未找到世界书</option>`;
        $('#pw-wi-select').html(`<option value="">-- 添加参考/目标世界书 --</option>${options}`);
    });
    
    currentGreetingsList = API.getCharacterGreetingsList();
    UI.renderGreetingsList(currentGreetingsList);
    UI.autoBindGreetings(currentGreetingsList); 
    UI.renderThemeOptions(customThemes); 
    
    const savedTheme = uiStateCache.theme || 'style.css';
    if (savedTheme === 'style.css' || savedTheme === 'Cozy_Fox.css') {
        UI.loadThemeCSS(savedTheme); $('#pw-theme-select').val(savedTheme); $('#pw-btn-delete-theme').hide();
    } else if (customThemes[savedTheme]) {
        UI.applyCustomTheme(customThemes[savedTheme]); $('#pw-theme-select').val(savedTheme); $('#pw-btn-delete-theme').show();
    }

    $('.pw-auto-height').each(function() { this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; });
    if (activeData.hasResult) $('#pw-request').addClass('minimized');
}

// ============================================================================
// 事件分发器 (Events Binding)
// ============================================================================
function bindEvents() {
    if (window.stPersonaWeaverBound) return;
    window.stPersonaWeaverBound = true;
    
    const context = getContext();
    if (context && context.eventSource) {
        context.eventSource.on(context.eventTypes.APP_READY, addPersonaButton);
        context.eventSource.on(context.eventTypes.MOVABLE_PANELS_RESET, addPersonaButton);
    }
    window.openPersonaWeaver = openCreatorPopup;

    $(document).on('click.pw', '.pw-mode-item', function() {
        const mode = $(this).data('mode');
        if (mode === uiStateCache.generationMode) return;
        
        const curReq = $('#pw-request').val();
        const curRes = $('#pw-result-text').val();
        const curTmpl = $('#pw-template-text').val();
        const hasRes = $('#pw-result-area').is(':visible');

        if (uiStateCache.generationMode === 'npc') npcContext = { template: curTmpl, request: curReq, result: curRes, hasResult: hasRes };
        else userContext = { template: curTmpl, request: curReq, result: curRes, hasResult: hasRes };
        
        $('.pw-mode-item').removeClass('active'); $(this).addClass('active');
        uiStateCache.generationMode = mode;
        saveData();

        const targetData = mode === 'npc' ? npcContext : userContext;
        $('#pw-request').val(targetData.request); $('#pw-result-text').val(targetData.result); $('#pw-template-text').val(targetData.template);
        
        if (targetData.hasResult) { $('#pw-result-area').show(); $('#pw-request').addClass('minimized'); } 
        else { $('#pw-result-area').hide(); $('#pw-request').removeClass('minimized'); }

        UI.renderTemplateChips(getCurrentTemplate());

        if (mode === 'npc') {
            $('#pw-btn-gen').text("生成 NPC 设定"); $('#pw-btn-apply').hide(); $('#pw-btn-load-current').css('visibility', 'hidden'); $('#pw-load-main-template').show(); toastr.info("已切换至 NPC 模式");
        } else {
            $('#pw-btn-gen').text("生成 User 设定"); $('#pw-btn-apply').show(); $('#pw-btn-load-current').css('visibility', 'visible'); $('#pw-load-main-template').hide(); toastr.info("已切换至 User 模式");
        }
    });

    $(document).on('click.pw', '#pw-prompt-header', function() {
        const $body = $('#pw-prompt-container'), $arrow = $(this).find('.arrow');
        if ($body.is(':visible')) { $body.slideUp(); $arrow.removeClass('fa-flip-vertical'); } else { $body.slideDown(); $arrow.addClass('fa-flip-vertical'); }
    });

    $(document).on('click.pw', '#pw-toggle-debug-btn', function() {
        const $wrapper = $('#pw-debug-wrapper'), $btn = $(this);
        $wrapper.slideToggle(200, () => $wrapper.is(':visible') ? $btn.addClass('active') : $btn.removeClass('active'));
    });

    $(document).on('click.pw', '#pw-new-badge', () => $('.pw-tab[data-tab="system"]').click());
    $(document).on('change.pw', '#pw-preset-select', function() { uiStateCache.generationPreset = $(this).val(); saveData(); $('#pw-preset-hint').text(API.getPresetHintText($(this).val())); });
    
    $(document).on('change.pw', '#pw-prompt-type', function() {
        const type = $(this).val();
        if (type === 'templateGen') $('#pw-prompt-editor').val(promptsCache.templateGen);
        else if (type === 'npcTemplateGen') $('#pw-prompt-editor').val(promptsCache.npcTemplateGen);
        else if (type === 'npcGen') $('#pw-prompt-editor').val(promptsCache.npcGen);
        else $('#pw-prompt-editor').val(promptsCache.personaGen);
    });

    $(document).on('click.pw', '#pw-btn-update', function() {
        if (!window.TavernHelper || !window.TavernHelper.updateExtension) return toastr.error("TavernHelper 未加载，无法自动更新。");
        toastr.info("正在更新...");
        window.TavernHelper.updateExtension(extensionName).then(res => {
            if (res.ok) { toastr.success("更新成功！刷新页面..."); setTimeout(() => window.location.reload(), 1500); } else { toastr.error("更新失败"); }
        });
    });

    $(document).on('click.pw', '#pw-btn-import-theme', () => $('#pw-theme-import').click());
    $(document).on('change.pw', '#pw-theme-import', function(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            customThemes[file.name] = e.target.result; saveData(); UI.renderThemeOptions(customThemes); $('#pw-theme-select').val(file.name).trigger('change'); toastr.success(`导入主题: ${file.name}`);
        };
        reader.readAsText(file); $(this).val('');
    });

    $(document).on('click.pw', '#pw-btn-delete-theme', function() {
        const current = $('#pw-theme-select').val();
        if (current === 'style.css') return; 
        if (confirm(`删除主题 "${current}" 吗？`)) {
            delete customThemes[current]; uiStateCache.theme = 'style.css'; saveData(); UI.loadThemeCSS('style.css'); UI.renderThemeOptions(customThemes); $('#pw-theme-select').val('style.css'); toastr.success("已删除");
        }
    });

    $(document).on('click.pw', '#pw-btn-download-template', async function() {
        const name = $('#pw-theme-select').val();
        let css = name === 'style.css' ? `/* Native Style v${CURRENT_VERSION} */\n.pw-wrapper { ... }` : customThemes[name];
        if (name === 'style.css') try { css = await (await fetch(`scripts/extensions/third-party/${extensionName}/${name}?v=${CURRENT_VERSION}`)).text(); } catch {}
        if (!css) return toastr.error("无法获取");
        const url = URL.createObjectURL(new Blob([css], { type: "text/css" }));
        const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    $(document).on('change.pw', '#pw-theme-select', function() {
        const theme = $(this).val(); uiStateCache.theme = theme; saveData();
        if (theme === 'style.css' || theme === 'Cozy_Fox.css') { UI.loadThemeCSS(theme); $('#pw-btn-delete-theme').hide(); } 
        else if (customThemes[theme]) { UI.applyCustomTheme(customThemes[theme]); $('#pw-btn-delete-theme').show(); }
    });

    $(document).on('click.pw', '#pw-hist-prev', () => { if (historyPage > 1) { historyPage--; renderHistoryList(); } });
    $(document).on('click.pw', '#pw-hist-next', () => { historyPage++; renderHistoryList(); });
    $(document).on('change.pw', '#pw-hist-filter-type, #pw-hist-filter-char', () => { historyPage = 1; renderHistoryList(); });

    $(document).on('change.pw', '#pw-greetings-select', function() {
        const idx = $(this).val(), $preview = $('#pw-greetings-preview'), $toggleBtn = $('#pw-greetings-toggle-bar');
        if (idx === "") { $preview.slideUp(200); $toggleBtn.hide(); } 
        else if (currentGreetingsList[idx]) { $preview.val(currentGreetingsList[idx].content).slideDown(200); $toggleBtn.show().html('<i class="fa-solid fa-angle-up"></i> 收起预览'); }
    });
    $(document).on('click.pw', '#pw-greetings-toggle-bar', function() {
        const $preview = $('#pw-greetings-preview');
        if ($preview.is(':visible')) { $preview.slideUp(200); $(this).html('<i class="fa-solid fa-angle-down"></i> 展开预览'); } else { $preview.slideDown(200); $(this).html('<i class="fa-solid fa-angle-up"></i> 收起预览'); }
    });

    $(document).on('click.pw', '#pw-copy-persona', () => { navigator.clipboard.writeText($('#pw-result-text').val() || ""); toastr.success("已复制"); });
    $(document).on('click.pw', '.pw-tab', function () {
        $('.pw-tab').removeClass('active'); $(this).addClass('active'); $('.pw-view').removeClass('active'); $(`#pw-view-${$(this).data('tab')}`).addClass('active');
        if ($(this).data('tab') === 'history') { historyPage = 1; renderHistoryList(); }
    });

    $(document).on('click.pw', '#pw-toggle-edit-template', () => {
        isEditingTemplate = !isEditingTemplate;
        if (isEditingTemplate) {
            $('#pw-template-text').val(getCurrentTemplate()); $('#pw-template-chips').hide(); $('#pw-template-editor').css('display', 'flex'); $('#pw-toggle-edit-template').text("取消编辑").addClass('editing'); $('#pw-template-block-header i').hide(); 
        } else {
            $('#pw-template-editor').hide(); $('#pw-template-chips').css('display', 'flex'); $('#pw-toggle-edit-template').text("编辑模版").removeClass('editing'); $('#pw-template-block-header i').show();
        }
    });

    $(document).on('click.pw', '#pw-template-block-header', function() {
        if (isEditingTemplate) return; 
        const $chips = $('#pw-template-chips'), $icon = $(this).find('i');
        if ($chips.is(':visible')) { $chips.slideUp(); $icon.removeClass('fa-angle-up').addClass('fa-angle-down'); uiStateCache.templateExpanded = false; } 
        else { $chips.slideDown().css('display', 'flex'); $icon.removeClass('fa-angle-down').addClass('fa-angle-up'); uiStateCache.templateExpanded = true; }
        saveData(); 
    });

    $(document).on('click.pw', '#pw-load-main-template', () => {
        if(confirm("确定要使用默认的 User 主模版吗？这将覆盖当前编辑器内容。")) {
            $('#pw-template-text').val(defaultYamlTemplate);
            if (uiStateCache.generationMode === 'npc') npcContext.template = defaultYamlTemplate; else userContext.template = defaultYamlTemplate;
            saveData(); if(!isEditingTemplate) UI.renderTemplateChips(getCurrentTemplate()); toastr.success("已载入 User 主模版");
        }
    });

    $(document).on('click.pw', '#pw-reset-template-small', () => {
        const isNpc = uiStateCache.generationMode === 'npc';
        if(confirm(`确定要恢复为默认的 ${isNpc ? "NPC" : "User"} 模版吗？`)) {
            const fallbackT = isNpc ? defaultNpcTemplate : defaultYamlTemplate;
            $('#pw-template-text').val(fallbackT);
            if (isNpc) npcContext.template = fallbackT; else userContext.template = fallbackT;
            saveData(); if(!isEditingTemplate) UI.renderTemplateChips(getCurrentTemplate()); toastr.success("已恢复");
        }
    });

    $(document).on('click.pw', '#pw-gen-template-smart', async function() {
        if (isProcessing) return; isProcessing = true;
        const $btn = $(this), originalText = $btn.html(); $btn.html('<i class="fas fa-spinner fa-spin"></i> 生成中...');
        try {
            const ctx = await collectContextData(), info = API.getCharacterInfoText();
            if (!(info && info.length > 50) && !(ctx.wi && ctx.wi.length > 10) && !confirm("未检测到关联信息。是否生成通用模版？")) return;
            
            const config = { wiText: ctx.wi, apiSource: $('#pw-api-source').val(), indepApiUrl: $('#pw-api-url').val(), indepApiKey: $('#pw-api-key').val(), indepApiModel: $('#pw-api-source').val() === 'independent' ? $('#pw-api-model-select').val() : null };
            const genT = await API.runGeneration(config, config, true, getGenerationContextState());
            
            if (genT) {
                $('#pw-template-text').val(genT);
                if (uiStateCache.generationMode === 'npc') npcContext.template = genT; else userContext.template = genT;
                saveData(); UI.renderTemplateChips(getCurrentTemplate()); if (!isEditingTemplate) $('#pw-toggle-edit-template').click(); toastr.success("模版已生成");
            }
        } catch (e) { toastr.error(e.message); } finally { $btn.html(originalText); isProcessing = false; }
    });

    $(document).on('click.pw', '#pw-save-template', () => {
        const val = $('#pw-template-text').val();
        if (uiStateCache.generationMode === 'npc') npcContext.template = val; else userContext.template = val;
        saveData(); saveHistory({ request: "模版手动保存", timestamp: new Date().toLocaleString(), title: "", data: { resultText: val, type: 'template' } });
        UI.renderTemplateChips(getCurrentTemplate()); isEditingTemplate = false;
        $('#pw-template-editor').hide(); $('#pw-template-chips').css('display', 'flex'); $('#pw-toggle-edit-template').text("编辑模版").removeClass('editing'); $('#pw-template-block-header i').show(); toastr.success("保存成功");
    });

    $(document).on('click.pw', '.pw-shortcut-btn, .pw-var-btn', function () {
        const key = $(this).data('key') || $(this).data('ins');
        const $text = $(this).hasClass('pw-shortcut-btn') ? $('#pw-template-text') : $(this).parent().next('textarea');
        if ($text.length) {
            const el = $text[0], start = el.selectionStart, end = el.selectionEnd, val = el.value, ins = key === '\n' ? '\n' : key;
            el.value = val.substring(0, start) + ins + val.substring(end); el.selectionStart = el.selectionEnd = start + ins.length; el.focus();
        }
    });

    let selT;
    $(document).on('touchend mouseup keyup', '#pw-result-text', () => {
        clearTimeout(selT); selT = setTimeout(() => {
            const el = document.activeElement, $btn = $('#pw-float-quote-btn');
            if (!el || !el.id.startsWith('pw-result-text')) return;
            (el.selectionStart !== el.selectionEnd) ? (!$btn.is(':visible') && $btn.fadeIn(200).css('display', 'flex')) : $btn.fadeOut(200);
        }, 100);
    });

    $(document).on('mousedown.pw', '#pw-float-quote-btn', function (e) {
        e.preventDefault(); e.stopPropagation();
        const el = document.activeElement; if (!el) return;
        const txt = el.value.substring(el.selectionStart, el.selectionEnd).trim();
        if (txt && $('#pw-refine-input').length) {
            const $in = $('#pw-refine-input'), cur = $in.val();
            $in.val(cur ? `${cur}\n对 "${txt}" 的修改意见为：` : `对 "${txt}" 的修改意见为：`).focus();
            el.setSelectionRange(el.selectionEnd, el.selectionEnd); $(this).fadeOut(100);
        }
    });

    $(document).on('input.pw', '.pw-auto-height, #pw-refine-input', function () { requestAnimationFrame(() => { this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; }); });

    let saveT;
    const saveCurrentState = () => {
        clearTimeout(saveT); saveT = setTimeout(() => {
            if ($('#pw-request').length === 0) return;
            const curReq = $('#pw-request').val(), curRes = $('#pw-result-text').val(), hasRes = $('#pw-result-area').is(':visible');
            if (uiStateCache.generationMode === 'npc') { npcContext.request = curReq; npcContext.result = curRes; npcContext.hasResult = hasRes; } 
            else { userContext.request = curReq; userContext.result = curRes; userContext.hasResult = hasRes; }
            saveData(); 
            if ($('#pw-api-url').length > 0) saveState({ localConfig: { apiSource: $('#pw-api-source').val(), indepApiUrl: $('#pw-api-url').val(), indepApiKey: $('#pw-api-key').val(), indepApiModel: $('#pw-api-model-select').val() || $('#pw-api-model').val(), extraBooks: window.pwExtraBooks ||[] } });
        }, 500);
    };
    $(document).on('input.pw change.pw', '#pw-request, #pw-result-text, #pw-wi-toggle, .pw-input, .pw-select', saveCurrentState);

    $(document).on('click.pw', '.pw-diff-tab', function () {
        $('.pw-diff-tab').removeClass('active'); $(this).addClass('active');
        const v = $(this).data('view');
        $('#pw-diff-list-view, #pw-diff-raw-view, #pw-diff-old-raw-view').hide();
        if (v === 'diff') $('#pw-diff-list-view').show(); else if (v === 'raw') $('#pw-diff-raw-view').show(); else $('#pw-diff-old-raw-view').show();
    });

    $(document).on('click.pw', '#pw-btn-refine', async function (e) {
        e.preventDefault(); if (isProcessing) return; isProcessing = true;
        const req = $('#pw-refine-input').val(); if (!req) { toastr.warning("请输入意见"); isProcessing = false; return; }
        lastRefineRequest = req; if(!promptsCache.personaGen) loadData();
        const oldText = $('#pw-result-text').val(), $btn = $(this).find('i').removeClass('fa-magic').addClass('fa-spinner fa-spin'); await API.forcePaint();

        try {
            const ctx = await collectContextData();
            const config = { mode: 'refine', request: req, currentText: oldText, wiText: ctx.wi, greetingsText: ctx.greetings, apiSource: $('#pw-api-source').val(), indepApiUrl: $('#pw-api-url').val(), indepApiKey: $('#pw-api-key').val(), indepApiModel: $('#pw-api-source').val() === 'independent' ? $('#pw-api-model-select').val() : null };
            const res = await API.runGeneration(config, config, false, getGenerationContextState());
            UI.renderDiffComparison(oldText, res);
            $('.pw-diff-tab[data-view="diff"]').click(); $('#pw-diff-overlay').fadeIn(); $('#pw-refine-input').val('');
        } catch (e) { toastr.error(e.message); } finally { $btn.removeClass('fa-spinner fa-spin').addClass('fa-magic'); isProcessing = false; }
    });

    $(document).on('click.pw', '#pw-diff-reroll', async function (e) {
        e.preventDefault(); if (isProcessing) return; if (!lastRefineRequest) return toastr.warning("未找到要求");
        isProcessing = true; const $btn = $(this), ogHtml = $btn.html(), oldText = $('#pw-result-text').val(); $btn.html('<i class="fa-solid fa-spinner fa-spin"></i> 生成中...');
        try {
            const ctx = await collectContextData();
            const config = { mode: 'refine', request: lastRefineRequest, currentText: oldText, wiText: ctx.wi, greetingsText: ctx.greetings, apiSource: $('#pw-api-source').val(), indepApiUrl: $('#pw-api-url').val(), indepApiKey: $('#pw-api-key').val(), indepApiModel: $('#pw-api-source').val() === 'independent' ? $('#pw-api-model-select').val() : null };
            UI.renderDiffComparison(oldText, await API.runGeneration(config, config, false, getGenerationContextState()));
            $('.pw-diff-tab[data-view="diff"]').click(); toastr.success("重新生成成功");
        } catch (e) { toastr.error(e.message); } finally { $btn.html(ogHtml); isProcessing = false; }
    });

    $(document).on('click.pw', '.pw-diff-card', function () {
        if ($(this).hasClass('single-view')) return;
        const $row = $(this).closest('.pw-diff-row'); $row.find('.pw-diff-card').removeClass('selected'); $(this).addClass('selected');
        $row.find('.pw-diff-textarea').prop('readonly', true); $(this).find('.pw-diff-textarea').prop('readonly', false).focus();
    });

    $(document).on('click.pw', '#pw-diff-confirm', function () {
        const tab = $('.pw-diff-tab.active').data('view'); let res = "";
        if (tab === 'raw') res = $('#pw-diff-raw-textarea').val();
        else if (tab === 'old-raw') res = $('#pw-diff-old-raw-textarea').val();
        else {
            let lines =[];
            $('.pw-diff-row').each(function () {
                const k = $(this).data('key'), v = $(this).find('.pw-diff-card.selected .pw-diff-textarea').val().trimEnd();
                if (v && v !== "(删除)" && v !== "(无)") lines.push((v.includes('\n') || v.startsWith('  ')) ? `${k}:\n${v}` : `${k}: ${v.trim()}`);
            });
            res = lines.join('\n\n');
        }
        $('#pw-result-text').val(res).trigger('input'); $('#pw-diff-overlay').fadeOut(); saveCurrentState(); toastr.success("应用成功");
    });
    $(document).on('click.pw', '#pw-diff-cancel', () => $('#pw-diff-overlay').fadeOut());

    $(document).on('click.pw', '#pw-btn-gen', async function (e) {
        e.preventDefault(); if (isProcessing) return; isProcessing = true;
        const req = $('#pw-request').val(); if (!req) { toastr.warning("请输入要求"); isProcessing = false; return; }
        const $btn = $(this); $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> 生成中...'); await API.forcePaint();
        $('#pw-refine-input').val(''); $('#pw-result-text').val('');
        try {
            const ctx = await collectContextData();
            const config = { mode: 'initial', request: req, wiText: ctx.wi, greetingsText: ctx.greetings, apiSource: $('#pw-api-source').val(), indepApiUrl: $('#pw-api-url').val(), indepApiKey: $('#pw-api-key').val(), indepApiModel: $('#pw-api-source').val() === 'independent' ? $('#pw-api-model-select').val() : null };
            const txt = await API.runGeneration(config, config, false, getGenerationContextState());
            $('#pw-result-text').val(txt); $('#pw-result-area').fadeIn(); $('#pw-request').addClass('minimized'); saveCurrentState(); $('#pw-result-text').trigger('input');
        } catch (e) { toastr.error(e.message); } finally { $btn.prop('disabled', false).html(uiStateCache.generationMode === 'npc' ? '生成 NPC 设定' : '生成 User 设定'); isProcessing = false; }
    });

    $(document).on('click.pw', '#pw-btn-load-current', () => {
        const c = API.getActivePersonaDescription();
        if (c) { if ($('#pw-result-text').val() && !confirm("覆盖当前内容？")) return; $('#pw-result-text').val(c); $('#pw-result-area').fadeIn(); $('#pw-request').addClass('minimized'); saveCurrentState(); toastr.success(TEXT.TOAST_LOAD_CURRENT); } else toastr.warning("无数据");
    });
    $(document).on('click.pw', '#pw-btn-save-wi', async () => await API.syncToWorldInfoViaHelper($('.persona_name').first().text().trim() || $('h5#your_name').text().trim() || "User", $('#pw-result-text').val(), uiStateCache.generationMode === 'npc'));
    $(document).on('click.pw', '#pw-btn-apply', async () => { const n = $('.persona_name').first().text().trim() || "User"; await API.forceSavePersona(n, $('#pw-result-text').val()); toastr.success(TEXT.TOAST_SAVE_SUCCESS(n)); $('.popup_close').click(); });
    $(document).on('click.pw', '#pw-clear', () => { if (confirm("清空？")) { $('#pw-request').val('').removeClass('minimized'); $('#pw-result-area').hide(); $('#pw-result-text').val(''); saveCurrentState(); } });
    $(document).on('click.pw', '#pw-snapshot', () => { const t = $('#pw-result-text').val(), r = $('#pw-request').val(); if(!t&&!r) return; saveHistory({ request: r||"无", timestamp: new Date().toLocaleString(), title: "", data: { name: "Persona", resultText: t||"(无)", type: 'persona' } }); toastr.success(TEXT.TOAST_SNAPSHOT); });

    $(document).on('click.pw', '.pw-hist-action-btn.edit', function (e) {
        e.stopPropagation(); const $h = $(this).closest('.pw-hist-header'), $d = $h.find('.pw-hist-title-display'), $i = $h.find('.pw-hist-title-input');
        $d.hide(); $i.show().focus();
        const save = (ev) => { if(ev)ev.stopPropagation(); $d.text($i.val()).show(); $i.hide(); const idx = $h.closest('.pw-history-item').find('.pw-hist-action-btn.del').data('index'); if (historyCache[idx]) { historyCache[idx].title = $i.val(); saveData(); } $(document).off('click.pw-hist-blur'); };
        $i.on('click', ev => ev.stopPropagation()).one('blur keyup', ev => { if(ev.type==='keyup'&&ev.key!=='Enter') return; save(ev); });
    });

    $(document).on('change.pw', '#pw-api-source', function () { $('#pw-indep-settings').toggle($(this).val() === 'independent'); });
    $(document).on('click.pw', '#pw-api-fetch', async function (e) {
        e.preventDefault(); const u = $('#pw-api-url').val().replace(/\/$/, ''), k = $('#pw-api-key').val(), $b = $(this).find('i').addClass('fa-spin');
        try { let d = null; for (const ep of[u.includes('v1')?`${u}/models`:`${u}/v1/models`, `${u}/models`]) { try { const r = await fetch(ep, { headers: { 'Authorization': `Bearer ${k}` } }); if (r.ok) { d = await r.json(); break; } } catch {} }
            if (!d) throw new Error("失败"); const ms = (d.data||d).map(m=>m.id).sort(), $s = $('#pw-api-model-select').empty(); ms.forEach(m => $s.append(`<option value="${m}">${m}</option>`)); if(ms.length) $s.val(ms[0]); toastr.success("成功");
        } catch(e) { toastr.error(e.message); } finally { $b.removeClass('fa-spin'); }
    });
    $(document).on('click.pw', '#pw-api-test', async function (e) {
        e.preventDefault(); const u = $('#pw-api-url').val().replace(/\/$/, ''), k = $('#pw-api-key').val(), m = $('#pw-api-model-select').val(), $b = $(this).html('<i class="fas fa-spinner fa-spin"></i>');
        try { const r = await fetch(u.includes('v1')?`${u}/chat/completions`:`${u}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${k}` }, body: JSON.stringify({ model: m, messages:[{role:'user',content:'Hi'}], max_tokens:5 }) });
            if(r.ok) toastr.success("成功"); else toastr.error("失败"); } catch { toastr.error("失败"); } finally { $b.html('<i class="fa-solid fa-plug"></i>'); }
    });
    $(document).on('click.pw', '#pw-api-save', () => { const t = $('#pw-prompt-type').val(); promptsCache[t] = $('#pw-prompt-editor').val(); saveData(); toastr.success("已保存"); });
    $(document).on('click.pw', '#pw-reset-prompt', () => { if(confirm("恢复？")) $('#pw-prompt-editor').val(promptsCache[$('#pw-prompt-type').val()] = CONSTANTS[`default${$('#pw-prompt-type').val().replace('G','G')}`] || fallbackSystemPrompt); });
    $(document).on('click.pw', '#pw-wi-add', () => { const v = $('#pw-wi-select').val(); if (v && !window.pwExtraBooks.includes(v)) { window.pwExtraBooks.push(v); renderWiBooks(); } });
    $(document).on('input.pw', '#pw-history-search', () => { historyPage = 1; renderHistoryList(); });
    $(document).on('click.pw', '#pw-history-search-clear', () => $('#pw-history-search').val('').trigger('input'));
    $(document).on('click.pw', '#pw-history-clear-all', () => { if (confirm("清空?")) { historyCache =[]; saveData(); renderHistoryList(); } });
}

// ============================================================================
// 复杂列表渲染器 (保持对上下文及 jQuery 的重度依赖)
// ============================================================================
const renderHistoryList = () => {
    loadData(); const $list = $('#pw-history-list').empty(), $fC = $('#pw-hist-filter-char'), cFilter = $fC.val(), chars = new Set();
    historyCache.forEach(i => { const t = i.title||""; let c=""; if (t.includes(' @ ')) c=t.split(' @ ')[1]?.trim(); else if(t.includes(' (')) c=t.split(' (').pop().replace(')','').trim(); else if(t.includes('&')) c=t.split('&')[1]?.trim(); if(c) chars.add(c); });
    if ($fC.children().length <= 1) { Array.from(chars).sort().forEach(c => $fC.append(`<option value="${c}">${c}</option>`)); $fC.val(cFilter||'all'); }

    const fT = $('#pw-hist-filter-type').val(), fCh = $('#pw-hist-filter-char').val(), s = $('#pw-history-search').val().toLowerCase();
    let filtered = historyCache.filter(i => {
        if(i.data?.type === 'opening') return false; const t = i.data?.genType || i.data?.type;
        if(fT!=='all'&&!((fT==='user_persona'&&(t==='user_persona'||t==='persona'))||(fT==='npc_persona'&&(t==='npc_persona'||t==='npc'))||(fT==='user_template'&&(t==='user_template'||t==='template'))||(fT==='npc_template'&&t==='npc_template'))) return false;
        if(fCh!=='all'&&!(i.title||"").includes(fCh)) return false;
        return !s || (i.title||"").toLowerCase().includes(s) || (i.data?.resultText||"").toLowerCase().includes(s);
    });
    
    const maxP = Math.ceil(filtered.length / HISTORY_PER_PAGE) || 1; historyPage = Math.min(historyPage, maxP);
    $('#pw-hist-page-info').text(`${historyPage} / ${maxP}`); $('#pw-hist-prev').prop('disabled', historyPage<=1); $('#pw-hist-next').prop('disabled', historyPage>=maxP);
    
    const pag = filtered.slice((historyPage-1)*HISTORY_PER_PAGE, historyPage*HISTORY_PER_PAGE);
    if (!pag.length) return $list.html('<div style="text-align:center; opacity:0.6; padding:20px;">暂无记录</div>');

    pag.forEach((item, idx) => {
        const txt = item.data?.resultText||'无', title = item.title||"User & Char", t = item.data?.genType || item.data?.type;
        const bHtml = t==='npc_template' ? '<span class="pw-badge template" style="background:rgba(255,165,0,0.2); color:#ffbc42;">模版(N)</span>' : (t==='user_template'||t==='template' ? '<span class="pw-badge template">模版(U)</span>' : (t==='npc_persona'||t==='npc' ? '<span class="pw-badge npc" style="background:rgba(155,89,182,0.2); color:#a569bd; border:1px solid rgba(155,89,182,0.4);">NPC</span>' : '<span class="pw-badge persona">User</span>'));
        const $el = $(`<div class="pw-history-item"><div class="pw-hist-main"><div class="pw-hist-header"><span class="pw-hist-title-display">${bHtml} ${title}</span><input type="text" class="pw-hist-title-input" value="${title}" style="display:none;"><div style="display:flex; gap:5px;"><i class="fa-solid fa-pen pw-hist-action-btn edit"></i><i class="fa-solid fa-trash pw-hist-action-btn del" data-index="${idx}"></i></div></div><div class="pw-hist-meta"><span>${item.timestamp||''}</span></div><div class="pw-hist-desc">${txt}</div></div></div>`);
        $el.on('click', e => {
            if($(e.target).closest('.pw-hist-action-btn, .pw-hist-title-input').length) return;
            const tM = t.includes('npc') ? 'npc' : 'user'; if(!$(`.pw-mode-item[data-mode="${tM}"]`).hasClass('active')) $(`.pw-mode-item[data-mode="${tM}"]`).click();
            if(t.includes('template')){ $('#pw-template-text').val(txt); if(tM==='npc') npcContext.template=txt; else userContext.template=txt; saveData(); UI.renderTemplateChips(getCurrentTemplate()); $('.pw-tab[data-tab="editor"]').click(); if(!isEditingTemplate) $('#pw-toggle-edit-template').click(); toastr.success("已加载"); }
            else { $('#pw-request').val(item.request); $('#pw-result-text').val(txt); $('#pw-result-area').show(); $('#pw-request').addClass('minimized'); $('.pw-tab[data-tab="editor"]').click(); }
        });
        $el.find('.pw-hist-action-btn.del').on('click', e => { e.stopPropagation(); if(confirm("删除?")){ historyCache.splice((historyPage-1)*HISTORY_PER_PAGE+idx, 1); saveData(); renderHistoryList(); }});
        $list.append($el);
    });
};

window.pwExtraBooks =[];
const getPosAbbr = p => p===0||p==='before_character_definition'?'PreChar':p===1||p==='after_character_definition'?'PostChar':p===2||p==='before_example_messages'?'PreEx':p===3||p==='after_example_messages'?'PostEx':p===4||p==='before_author_note'?'PreAN':p===5||p==='after_author_note'?'PostAN':String(p).includes('at_depth')?'@Depth':'?';

const renderWiBooks = async () => {
    const $c = $('#pw-wi-container').empty(), bB = await API.getContextWorldBooks(), aB =[...new Set([...bB, ...(window.pwExtraBooks||[])])];
    if (!aB.length) return $c.html('<div style="opacity:0.6; padding:10px; text-align:center;">此角色未绑定世界书，请在“世界书”标签页手动添加或在酒馆主界面绑定。</div>');
    for (const b of aB) {
        const isB = bB.includes(b), $el = $(`<div class="pw-wi-book"><div class="pw-wi-header"><input type="checkbox" class="pw-wi-header-checkbox pw-wi-select-all"><span class="pw-wi-book-title">${b} ${isB?'<span class="pw-bound-status">(已绑定)</span>':''}</span><div class="pw-wi-header-actions"><div class="pw-wi-filter-toggle"><i class="fa-solid fa-filter"></i></div>${!isB?'<i class="fa-solid fa-times remove-book pw-remove-book-icon"></i>':''}<i class="fa-solid fa-chevron-down arrow"></i></div></div><div class="pw-wi-list" data-book="${b}"></div></div>`);
        $el.find('.pw-wi-select-all').on('click', function(e) { e.stopPropagation(); const c = $(this).prop('checked'), $l = $el.find('.pw-wi-list'); const d = () => { $l.find('.pw-wi-item:visible .pw-wi-check').prop('checked', c); const u=[]; $l.find('.pw-wi-check:checked').each(function(){u.push($(this).val());}); saveWiSelection(b,u); }; if(!$l.is(':visible')&&!$l.data('loaded')) { $el.find('.pw-wi-header').click(); setTimeout(d, 150); } else d(); });
        $el.find('.remove-book').on('click', e => { e.stopPropagation(); window.pwExtraBooks = window.pwExtraBooks.filter(x => x!==b); renderWiBooks(); });
        $el.find('.pw-wi-filter-toggle').on('click', e => { e.stopPropagation(); const $l = $el.find('.pw-wi-list'); if(!$l.is(':visible')) $el.find('.pw-wi-header').click(); setTimeout(() => $l.find('.pw-wi-depth-tools').slideToggle(), 50); });
        $el.find('.pw-wi-header').on('click', async function (e) {
            if ($(e.target).closest('.pw-wi-header-checkbox, .pw-wi-filter-toggle, .pw-remove-book-icon').length) return;
            const $l = $el.find('.pw-wi-list'), $a = $(this).find('.arrow');
            if ($l.is(':visible')) { $l.slideUp(); $a.removeClass('fa-flip-vertical'); } else {
                $l.slideDown(); $a.addClass('fa-flip-vertical');
                if (!$l.data('loaded')) {
                    $l.html('<div style="padding:10px;text-align:center;"><i class="fas fa-spinner fa-spin"></i></div>');
                    const es = await API.getWorldBookEntries(b); $l.empty();
                    if (!es.length) { $l.html('<div style="padding:10px;opacity:0.5;">无条目</div>'); } else {
                        const $t = $(`<div class="pw-wi-depth-tools"><div class="pw-wi-filter-row"><input type="text" class="pw-keyword-input" id="keyword" placeholder="查找..."></div><div class="pw-wi-filter-row"><select id="p-select" class="pw-pos-select"><option value="unknown">全部位置</option><option value="before_character_definition">角色前</option><option value="after_character_definition">角色后</option><option value="before_author_note">AN前</option><option value="after_author_note">AN后</option><option value="before_example_messages">样例前</option><option value="after_example_messages">样例后</option><option value="at_depth_as_system">@深度(系)</option><option value="at_depth_as_assistant">@深度(助)</option><option value="at_depth_as_user">@深度(用)</option></select><input type="number" class="pw-depth-input" id="d-min" placeholder="0"><span>-</span><input type="number" class="pw-depth-input" id="d-max" placeholder="Max"></div><div class="pw-wi-filter-row"><button class="pw-depth-btn" id="d-filter-toggle">筛选</button><button class="pw-depth-btn" id="d-clear-search">清空</button><button class="pw-depth-btn" id="d-reset">重置</button></div></div>`);
                        let isF = false; const aF = () => { if(!isF){ $l.find('.pw-wi-item').show(); $t.find('#d-filter-toggle').removeClass('active').text('筛选'); return; } $t.find('#d-filter-toggle').addClass('active').text('取消'); const k=$t.find('#keyword').val().toLowerCase(), p=$t.find('#p-select').val(), d1=parseInt($t.find('#d-min').val())||0, d2=$t.find('#d-max').val()===""?99999:parseInt($t.find('#d-max').val()); $l.find('.pw-wi-item').each(function(){ const $r=$(this), d=$r.data('depth'), c=$r.data('code'), txt=(decodeURIComponent($r.find('.pw-wi-check').data('content'))+$r.find('.pw-wi-title-text').text()).toLowerCase(); if((k&&!txt.includes(k)) || (p!=='unknown'&&c!==p) || (d<d1||d>d2)) $r.hide(); else $r.show(); }); };
                        $t.find('#d-filter-toggle').on('click', () => { isF=!isF; aF(); }); $t.find('#keyword').on('keyup', e => { if(e.key==='Enter') { isF=true; aF(); }}); $t.find('#d-clear-search').on('click', () => { $t.find('#keyword').val(''); if(isF) aF(); }); $t.find('#d-reset').on('click', () => { $l.find('.pw-wi-item').each(function(){ $(this).find('.pw-wi-check').prop('checked', $(this).data('original-enabled')).trigger('change'); }); toastr.info("已重置"); });
                        $l.append($t); const sSel = loadWiSelection(b);
                        es.forEach(e => {
                            const $i = $(`<div class="pw-wi-item" data-depth="${e.depth}" data-code="${e.filterCode}" data-original-enabled="${e.enabled}"><div class="pw-wi-item-row"><input type="checkbox" class="pw-wi-check" value="${e.uid}" ${(sSel?sSel.includes(String(e.uid)):e.enabled)?'checked':''} data-content="${encodeURIComponent(e.content)}"><div class="pw-wi-title-text"><span class="pw-wi-info-badge">[${getPosAbbr(e.position)}:${e.depth}]</span> ${e.displayName}</div><i class="fa-solid fa-eye pw-wi-toggle-icon"></i></div><div class="pw-wi-desc">${e.content}<div class="pw-wi-close-bar"><i class="fa-solid fa-angle-up"></i> 收起</div></div></div>`);
                            $i.find('.pw-wi-check').on('change', () => { const u=[]; $l.find('.pw-wi-check:checked').each(function(){u.push($(this).val());}); saveWiSelection(b,u); });
                            $i.find('.pw-wi-toggle-icon').on('click', function(ev){ ev.stopPropagation(); const $d = $(this).closest('.pw-wi-item').find('.pw-wi-desc'); if($d.is(':visible')){ $d.slideUp(); $(this).removeClass('active'); } else { $d.slideDown(); $(this).addClass('active'); }});
                            $i.find('.pw-wi-close-bar').on('click', function(){ $(this).parent().slideUp(); $i.find('.pw-wi-toggle-icon').removeClass('active'); });
                            $l.append($i);
                        });
                    }
                    $l.data('loaded', true);
                }
            }
        });
        $c.append($el);
    }
};

function addPersonaButton() {
    const container = $('.persona_controls_buttons_block');
    if (container.length === 0 || $(`#${BUTTON_ID}`).length > 0) return;
    const newButton = $(`<div id="${BUTTON_ID}" class="menu_button fa-solid fa-wand-magic-sparkles interactable" title="${TEXT.BTN_TITLE}" tabindex="0" role="button"></div>`);
    newButton.on('click', openCreatorPopup);
    container.prepend(newButton);
}

jQuery(async () => {
    addPersonaButton(); 
    bindEvents(); 
    UI.loadThemeCSS('style.css');
    console.log(`[PW] Persona Weaver Loaded (v${CURRENT_VERSION} - Refactored)`);
});
