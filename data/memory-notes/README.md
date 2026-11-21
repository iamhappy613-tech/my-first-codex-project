# 构词与记忆提示

这些简短中文提示由本项目编写，用于配合现有释义与例句记忆，不作为所有单词的历史词源字典。

- `affix`：现代英语中可解释的词基/词根与词缀，必要时说明拼写变化。
- `compound`：由可辨认词基组成的合成词。
- `family`：明确标注的同词族联记，不把相关词直接说成当前词的词根。
- `root`：历史词根分析，仅在直接核对主词典后使用，必须提供 `source_url`。
- `whole_words`：当前采用整体记忆；界面提示结合已有例句巩固，不猜测字母拆分。

三个分片对应 `data/catalog.json` 的半开区间：core为[0,334)，expansion-a为[334,667)，expansion-b为[667,1000)。每个ID必须恰好出现一次。`scripts/memory-data.mjs` 在构建时检查覆盖、范围、字段和来源格式。

每份JSON列出实际使用的通用构词参考与具体词条参考。通用参考包括 [Cambridge构词规则](https://dictionary.cambridge.org/grammar/british-grammar/word-formation_2)、[后缀和拼写变化](https://dictionary.cambridge.org/grammar/british-grammar/suffixes)。通用规则不代表每个词都经过逐词历史词源考证，也不应据此强拆不透明词。

修改说明后运行 `node scripts/embed.mjs`，本地版和云端预览会同步更新。说明表独立于云端词库行，不需要新增数据库字段或调用模型API。
