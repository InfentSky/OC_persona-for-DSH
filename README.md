# OC Persona Studio / 角色人设工坊

OC Persona 是面向 DeepSeek Harness 的原创角色插件。它将用户提供的角色描述整理为持久化角色卡，并依据当前会话的模式，把角色设定注入系统提示词。角色卡覆盖语言风格、行为习惯、神态与微表情、心理结构和知识边界；模式与场景状态按会话隔离。

当前版本：0.0.3。变更见 [CHANGELOG.md](CHANGELOG.md)。

## 功能

插件的中心是角色卡，而非单轮提示。`persona_save` 将用户文本中的既定事实与模型补全的空白合并为结构化记录，字段直接作为顶层参数传入，默认只更新显式提供的字段并追加列表项，整卡重写需使用 `replace: true`；`persona_note` 用于追加单条既定事实；`persona_activate` 将角色绑定到当前会话并指定模式；`persona_state` 记录场景、情绪、目标及与用户角色的关系等临时状态；`persona_read` 与 `persona_list` 用于查阅；`persona_delete` 删除角色并清理相关会话绑定。

角色卡保存在 profile 存储中，可跨会话复用。绑定关系属于会话，同一角色可以在不同会话中以不同模式使用。

## 模式

`roleplay` 模式下，模型以角色第一人称回应，依据角色卡控制措辞、称呼、口癖、停顿、神态与身体反应，并通过潜台词和动作表现心理，而非直接标注情绪。该模式要求模型不替用户角色做决定，不越过角色的知识边界。

`assist` 模式下，模型退到角色之外，以编剧或导演的身份分析人设、修改台词、补充动机、检查连贯性，并在需要时试写角色片段；试写内容会明确标注为草稿。该模式默认一次只讨论一个点，回复控制在数个短段落内；需要展开时由用户明确要求。

`off` 模式保留角色卡，但不注入角色设定，DSH 恢复为普通助手。扮演过程中，用户可以用 `OOC:`、`//` 或明确指令跳出角色，模型应先简短回应元指令，再恢复扮演。

## 使用

用户可以直接描述角色，并说明希望进入的模式。模型会提取确定事实、补全可演细节，依次调用 `persona_save` 与 `persona_activate`。也可以先用命令建立空卡，再逐步补充：

```text
/oc new 林默
/oc use 林默 roleplay
/oc mode assist
/oc prompt
```

## 指令

`/oc` 是主命令，`/persona` 为兼容别名。指令在输入框中以 `/` 开头执行，不经过模型生成；角色参数支持 id、正式名与别名，大小写不敏感。

| 指令 | 用法 | 作用 |
|---|---|---|
| `/oc` | `/oc` | 显示当前会话的角色、模式与存储状态。 |
| `/oc list` | `/oc list` | 列出角色库中的角色。 |
| `/oc show` | `/oc show [角色]` | 查看完整角色卡；省略角色时查看当前角色。 |
| `/oc new` | `/oc new <名称>` | 新建角色卡，并进入 `assist` 模式。 |
| `/oc use` | `/oc use <角色> [roleplay\|assist]` | 将角色绑定到当前会话并切换模式；省略模式时，若仍是同一角色且模式非 `off`，沿用当前模式，否则使用 `defaultMode`。 |
| `/oc mode` | `/oc mode <roleplay\|assist\|off>` | 只切换当前会话模式，不更换角色。 |
| `/oc prompt` | `/oc prompt` | 预览当前实际注入的系统提示词。 |
| `/oc delete` | `/oc delete <角色> confirm` | 永久删除角色卡，并清理相关会话绑定。 |
| `/oc help` | `/oc help` | 显示命令帮助。 |

## 角色卡

角色卡由四类信息构成。身份与叙述包括名称、别名、一句话定位、身份、背景、外貌和性格；语言包括语域、节奏、句长、称呼习惯、口癖与台词样本；身体包括微表情、习惯动作和情绪触发后的反应；心理包括核心信念、欲望、恐惧、防御机制、依恋风格与内在矛盾。关系、知识范围、认知边界以及 `canon` 中的既定事实另行记录，用于维持长程一致性。

`persona_state` 维护的是会话级临时状态，包括场景、情绪、当前目标、对用户角色的关系与连续性备注。它不写入角色卡；切换到不同角色时，旧场景状态会被清空。

## 提示词

插件注册一个动态 `systemPrompt.section`，其 `order` 为 10250，`interpolate` 为 `false`。每次装配提示词时，插件按当前会话的角色、模式与场景状态生成文本，内容包括基础行为约束、角色卡、场景状态和模式指令。角色卡受 `promptBudget` 限制，超出部分会被截断并明确标注。模式与场景变更在下一步生效；关闭模式或没有绑定角色时，仅保留基础行为说明。

## 持久化

角色卡和会话绑定存放在 profile 的 `storageDomain` 中，域名为 `oc_persona`，版本为 1。使用 storage-json 后端时，数据位于 `<DSH_HOME>/storages/oc_persona.json`。若 profile 没有可用的存储后端，插件退化为进程内内存存储，状态中会显示 `storage: memory`，重启后数据丢失。

角色卡不作为独立事件写入会话日志；但注入后的系统提示词会随会话消息持久化，与普通系统提示词一致。角色卡会随正常模型请求发送给模型提供方，且其文本具有系统提示词级别的指令效力，应只使用可信来源的角色卡，并避免写入密码、身份证号等敏感信息。

## 安装

本目录即 bundle 根目录，无需构建。将 `OC_persona` 目录作为本地 bundle 安装后，插件页应显示“角色人设工坊 / OC Persona Studio”及配套图标，`/oc help` 可用，模型可在需要时调用 `persona_*` 工具。

```text
OC_persona/
├─ package.json
├─ cordis.patch.yml
├─ index.js
├─ icon.svg
├─ LICENSE
├─ README.md
├─ CHANGELOG.md
├─ lib/
│  ├─ persona.js
│  ├─ store.js
│  ├─ prompt.js
│  ├─ tools.js
│  └─ commands.js
├─ locale/
│  ├─ en.json
│  └─ zh.json
└─ test/
   ├─ persona.test.js
   ├─ prompt.test.js
   └─ integration.test.js
```

`index.js` 负责注册与生命周期，`lib/` 分别承担角色模型、存储、提示词、工具和命令，`locale/` 提供显示元数据，`test/` 覆盖对应行为。本目录采用本地链接安装，`package.json` 的 `files` 字段用于后续打包发布。

## 配置

插件提供两个配置项：`promptBudget` 控制角色提示词的字符上限，取值范围为 3000 至 40000，默认 8000；`defaultMode` 控制 `/oc use` 未指定模式时的默认值，可取 `roleplay` 或 `assist`，默认 `roleplay`。

```yaml
- insert:
    - id: oc-persona
      name: '@local/dsh-oc-persona'
      config:
        promptBudget: 8000
        defaultMode: roleplay
```

修改后需重启 Harness，或在插件管理中重新应用该配置行。

## 测试

测试使用 Node 内置的 `node:test`，运行时无第三方依赖。在项目根目录执行：

```powershell
cd .\OC_persona
node --test .\test\persona.test.js `
            .\test\prompt.test.js `
            .\test\integration.test.js
```

现有 17 项测试覆盖角色卡的创建、合并、重写与别名解析，场景状态合并，三种提示词分支与预算截断，工具、命令和提示词 section 的注册，会话隔离，以及删除角色后的绑定清理。

## 限制

插件只处理角色层，不替代 DSH 的通用工具、记忆或工作流。角色一致性依赖提示词约束，模型仍可能偏离设定；自然语言是否触发建卡或切换模式由模型判断，不保证每次调用。当前实现为 Host-only，没有独立的图形角色编辑器，管理入口是命令与模型工具。场景状态不跨会话继承。

角色卡是创作资料，不是安全策略。模型仍受 Harness 的权限、沙箱、审批和模型安全策略约束；扮演模式中“不替用户角色做决定”同样属于提示词层约束，而非硬性拦截。

## 许可

本项目采用 MIT License，全文见 [LICENSE](LICENSE)。在保留版权声明和许可声明的前提下，可以自由使用、复制、修改、合并、发布、分发、再许可和销售本软件；软件按“原样”提供，不附带任何明示或默示担保。

插件代码、文档与 [icon.svg](icon.svg) 均为本项目原创，均按上述许可授权。
