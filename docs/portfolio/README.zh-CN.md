# 作品展示与公开演示

**[English](README.md)** | **简体中文**

**[打开免登录 Demo](https://redonkatonkk.github.io/massage-note/)** · **[GitHub 源码](https://github.com/Redonkatonkk/massage-note)**

所有图片均来自原应用页面的英文界面，使用独立数据库生成的虚构店铺、员工和财务数据；拍摄于 2026-10-22。Demo 默认英文，可切换中文。

## 一分钟演示路线

1. 打开今日记工，查看普通、高亮、混合付款与待结账卡片；可打开表单查看流程。
2. 打开月度汇总和经营分析，比较同期指标、均线、星期与服务时段。
3. 查看日结、工资结算、礼物卡和支出，了解记工如何进入核账流程。
4. 查看成员、项目与提成、数据操作；结合源码中的领域计算、事务锁、审计与权限测试说明实现。

## 演示边界

- 这是原 Web 页面的静态只读构建，数据由真实 API 从全新临时数据库计算生成；不会复制开发库或生产库。快照截止 2026-10-22。
- 无需登录；保存、删除、日结确认、导入、真实认证、AI 调用和消息发送均不可执行。语音录制与 CSV 导出在演示构建中关闭。
- 默认页面、经营分析的全部／最近 7 天／最近 30 天／本月快捷范围和三种高光筛选均有快照。记工可查看最近 7 天；其他自定义范围或筛选可能提示超出快照，不会套用不匹配的金额。
- 工资结算支持查看当前月历和默认月初至快照日的全部来源预览；实际确认支付和发送需运行完整应用。机器人绑定、回收站与发送队列可展示真实空状态。
- Demo 说明栏和欢迎入口是作品展示专用内容。截图反映桌面界面；浏览器仅用于生成这些图片，验证使用代码与命令行。

## 页面图集

### 今日记工

**[打开页面](https://redonkatonkk.github.io/massage-note/)** · 员工行、服务卡片、混合付款与高亮记录。

![今日记工](images/work-board.jpg)

### 月度汇总

**[打开页面](https://redonkatonkk.github.io/massage-note/finance/?tab=summary)** · 本月至今指标、同期比较与营业额均线。

![月度汇总](images/monthly-summary.jpg)

### 经营分析

**[打开页面](https://redonkatonkk.github.io/massage-note/finance/?tab=analytics)** · 营业额曲线、日历、星期对比与服务活动。

![经营分析](images/analytics.jpg)

### 日结

**[打开页面](https://redonkatonkk.github.io/massage-note/finance/?tab=closing)** · 日结检查、员工收入与现金交接。

![日结](images/daily-closing.jpg)

### 工资结算

**[打开页面](https://redonkatonkk.github.io/massage-note/finance/?tab=payroll)** · 选择员工、结算日历与工资账本。

![工资结算](images/payroll.jpg)

### 支出

**[打开页面](https://redonkatonkk.github.io/massage-note/finance/?tab=expenses)** · 周期房租／保险与一次性经营支出。

![支出](images/expenses.jpg)

### 礼物卡

**[打开页面](https://redonkatonkk.github.io/massage-note/finance/?tab=giftCards)** · 礼卡销售、付款来源与核销历史。

![礼物卡](images/gift-cards.jpg)

### 成员管理

**[打开页面](https://redonkatonkk.github.io/massage-note/manage/?tab=members)** · 员工名册与个人资料／提成设置。

![成员管理](images/members.jpg)

### 项目与提成

**[打开页面](https://redonkatonkk.github.io/massage-note/manage/?tab=catalog)** · 服务时长／价格档、加项与折扣。

![项目与提成](images/catalog.jpg)

### 店铺设置

**[打开页面](https://redonkatonkk.github.io/massage-note/manage/?tab=store)** · 营业规则、默认提成与集成设置。

![店铺设置](images/settings.jpg)

### 记工机器人

**[打开页面](https://redonkatonkk.github.io/massage-note/manage/?tab=work-bot)** · 别名配置、群绑定与操作历史。

![记工机器人](images/work-bot.jpg)

### 回收站

**[打开页面](https://redonkatonkk.github.io/massage-note/manage/?tab=recovery)** · 分别展示删除的记工与礼卡销售恢复列表。

![回收站](images/recovery.jpg)

### 数据操作

**[打开页面](https://redonkatonkk.github.io/massage-note/manage/?tab=audit)** · 店铺数据导入／导出控件与审计历史。

![数据操作](images/data-operations.jpg)

### AI 助手

**[打开页面](https://redonkatonkk.github.io/massage-note/assistant/)** · 记工／财务对话界面；实时 AI 与确认写入禁用。

![AI 助手](images/assistant.jpg)

### 个人资料

**[打开页面](https://redonkatonkk.github.io/massage-note/profile/)** · 账号资料、店铺成员身份与账号偏好。

![个人资料](images/profile.jpg)

### 使用帮助

**[打开页面](https://redonkatonkk.github.io/massage-note/help/)** · 可展开的操作指引与财务定义。

![使用帮助](images/help.jpg)

### 演示入口

**[打开页面](https://redonkatonkk.github.io/massage-note/login/)** · 禁用认证的演示欢迎状态。

![演示入口](images/welcome.jpg)

## 简历描述参考

开发中英双语全栈门店经营系统，使用 Next.js、NestJS、PostgreSQL 与 TypeScript，完成混合付款、员工提成、日结、工资账本和经营分析，并通过整数美分计算、事务锁、角色权限与审计记录保障财务可追溯性。

## 维护与构建

演示构建、数据重生成与 GitHub Pages 工作流见[开发指南](../engineering/DEVELOPMENT.zh-CN.md#公开作品演示)。更新图片时使用虚构数据，并同步本图集与英文版本。
