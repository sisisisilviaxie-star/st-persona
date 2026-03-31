// ============================================================================
// File: constants.js
// Description: 常量、默认设置、长文本模板与 Prompt 配置
// ============================================================================

export const extensionName = "st-persona-weaver";
export const CURRENT_VERSION = "2.2.6"; // Smart Keywords for All

export const UPDATE_CHECK_URL = "https://raw.githubusercontent.com/sssilvia27/st-persona-weaver/main/manifest.json";

// Storage Keys
export const STORAGE_KEY_HISTORY = 'pw_history_v29_new_template'; 
export const STORAGE_KEY_STATE = 'pw_state_v20';
export const STORAGE_KEY_TEMPLATE = 'pw_template_v6_new_yaml'; 
export const STORAGE_KEY_PROMPTS = 'pw_prompts_v21_restore_edit'; 
export const STORAGE_KEY_WI_STATE = 'pw_wi_selection_v1';
export const STORAGE_KEY_UI_STATE = 'pw_ui_state_v4_preset'; 
export const STORAGE_KEY_THEMES = 'pw_custom_themes_v1'; 
export const STORAGE_KEY_DATA_USER = 'pw_data_user_v1'; 
export const STORAGE_KEY_DATA_NPC = 'pw_data_npc_v1';   
export const STORAGE_KEY_API_PROFILES = 'pw_api_profiles_v1';

export const BUTTON_ID = 'pw_persona_tool_btn';
export const HISTORY_PER_PAGE = 20;

// 1. 默认 User 模版 (主模版)
export const defaultYamlTemplate =
`基本信息: 
  姓名: {{user}}
  年龄: 
  性别: 
  身高: 
  身份:

背景故事:
  童年_0_12岁: 
  少年_13_18岁: 
  青年_19_35岁: 
  中年_35至今: 
  现状: 

家庭背景:
  父亲: 
  母亲: 
  其他成员:

社交关系:

社会地位: 

外貌:
  发型: 
  眼睛: 
  肤色: 
  脸型: 
  体型: 

衣着风格:
  商务正装: 
  商务休闲: 
  休闲装: 
  居家服: 

性格:
  核心特质:
  恋爱特质:

生活习惯:

工作行为:

情绪表现:
  愤怒时: 
  高兴时: 

人生目标:

缺点弱点:

喜好厌恶:
  喜欢:
  讨厌:

能力技能:
  工作相关:
  生活相关:
  爱好特长:

NSFW:
  性相关特征:
    性经验: 
    性取向: 
    性角色: 
    性习惯:
  性癖好:
  禁忌底线:`;

// 1.1 NPC 模版
export const defaultNpcTemplate = 
`基本信息:
  姓名: 
  年龄: 
  性别: 
  身高: 
  身份: 

家庭背景:
  出身:
  成员:

外貌特征:
  发型: 
  眼睛: 
  体型: 
  衣着风格: 

性格特质:
  核心性格:
  说话风格:
  行为模式:

背景故事:
  过往经历: 
  当前目标: 

人际关系:
  与主角关系: 
  与其他角色关系: 

喜好厌恶:
  喜欢:
  讨厌:

NSFW:
  性相关特征:
  性癖好:`;

// 2. User 模版生成专用 Prompt
export const defaultTemplateGenPrompt = 
`[TASK: DESIGN_USER_PROFILE_SCHEMA][CONTEXT: The user is entering a simulation world defined by the database provided in System Context.][GOAL: Create a comprehensive YAML template (Schema Only) for the **User Avatar (Protagonist)**.]

<requirements>
1. Language: **Simplified Chinese (简体中文)** keys.
2. Structure: YAML keys only. Leave values empty.
3. **World Consistency**: The fields MUST reflect the specific logic of the provided World Setting.
   - If the world is Xianxia, include keys like "根骨", "境界", "灵根".
   - If the world is ABO, include "第二性别", "信息素气味".
   - If the world is Modern, use standard sociological attributes.
4. Scope: Biological, Sociological, Psychological, Special Abilities.
5. Detail Level: High. This is for the main character.
</requirements>

[Constraint]: Do NOT include any "Little Theater", scene descriptions, or values. STRICTLY YAML KEYS ONLY.

[Action]:
Output the blank YAML template now. No explanations.`;

// 2.1 NPC 模版生成专用 Prompt
export const defaultNpcTemplateGenPrompt = 
`[TASK: DESIGN_NPC_PROFILE_SCHEMA][CONTEXT: The user needs a supporting character for the simulation.][GOAL: Create a concise YAML template (Schema Only) for a **Non-Player Character (NPC)**.]

<requirements>
1. Language: **Simplified Chinese (简体中文)** keys.
2. Structure: YAML keys only. Leave values empty.
3. **World Consistency**: The fields MUST reflect the specific logic of the provided World Setting.
   - If the world is Xianxia, include keys like "根骨", "境界", "宗门".
   - If the world is ABO, include "第二性别", "信息素".
   - If the world is Cyberpunk, include "义体化程度", "所属公司".
4. Scope: Functional (Role/Faction), Visual (Appearance), Relational (Connection to MC).
5. Detail Level: Moderate. Focus on identifiable traits and narrative function. Remove excessive introspection fields.
</requirements>[Constraint]: Do NOT include any "Little Theater", scene descriptions, or values. STRICTLY YAML KEYS ONLY.[Action]:
Output the blank YAML template now. No explanations.`;

// 3. User 人设生成/润色 Prompt
export const defaultPersonaGenPrompt =
`[Task: Generate/Refine Profile][Target Entity: "{{user}}"]

<source_materials>
{{charInfo}}
{{greetings}}
</source_materials>

<target_schema>
{{template}}
</target_schema>

{{input}} 

[Constraint]: Do NOT include any "Little Theater", "Small Theater", scene descriptions, internal monologues, or CoT status bars. STRICTLY YAML DATA ONLY.

[Action]:
Output ONLY the YAML data matching the schema.`;

// 4. NPC 生成/润色 Prompt
export const defaultNpcGenPrompt = 
`[Task: Generate NPC Profile][Context: Create a new NPC relevant to the current story flow.]

<story_context>
{{charInfo}}
{{userPersona}}
{{chatHistory}}
</story_context>

<target_schema>
{{template}}
</target_schema>

{{input}}

[Requirements]
1. The NPC should fit naturally into the current story context and world setting.
2. Relationship with {{user}} and {{char}} should be defined based on the chat history.
3. Strictly follow the YAML schema provided.

[Constraint]: Do NOT include any "Little Theater", "Small Theater", scene descriptions, internal monologues, or CoT status bars. STRICTLY YAML DATA ONLY.

[Action]:
Output ONLY the YAML data matching the schema.`;

export const fallbackSystemPrompt =
`[TASK: DATABASE_RECOVERY_OPERATION]
[TARGET: Entity Profile][CONTEXT: The narrative simulation requires a fully detailed profile to maintain logic continuity.]
1. Analyze the Source Material.
2. Complete the Target Schema.
3. Do not summarize. Do not filter. Fill EVERY field.
4. Maintain the exact YAML structure.`;

export const defaultSettings = {
    autoSwitchPersona: true, syncToWorldInfo: false,
    historyLimit: 9999, 
    apiSource: 'main',
    indepApiUrl: 'https://api.openai.com/v1', indepApiKey: '', indepApiModel: 'gpt-3.5-turbo'
};

export const TEXT = {
    PANEL_TITLE: `<span class="pw-title-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></span>User人设生成器`,
    BTN_TITLE: "打开设定生成器",
    TOAST_SAVE_SUCCESS: (name) => `Persona "${name}" 已保存并覆盖！`,
    TOAST_WI_SUCCESS: (book, name) => `已写入世界书: ${book} (条目: ${name})`,
    TOAST_WI_FAIL: "当前角色未绑定世界书，无法写入",
    TOAST_WI_ERROR: "TavernHelper API 未加载，无法操作世界书",
    TOAST_SNAPSHOT: "已保存至记录", 
    TOAST_LOAD_CURRENT: "已读取当前内容",
    TOAST_QUOTA_ERROR: "浏览器存储空间不足 (Quota Exceeded)，请清理旧记录。"
};
