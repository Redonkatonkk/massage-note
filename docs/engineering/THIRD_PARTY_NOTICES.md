# 第三方代码声明

## shadcn/ui

成员工具栏 [`members-toolbar.tsx`](../../apps/web/app/manage/members-toolbar.tsx) 基于 [shadcn/ui 的 DataTableToolbar](https://github.com/shadcn-ui/ui/blob/main/apps/v4/app/%28app%29/examples/tasks/components/data-table-toolbar.tsx) 改写，保留搜索、状态/角色筛选和重置的组合结构，适配本项目原生表单和 CSS。新增与状态确认表单参考 [Sheet](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/sheet.tsx) 的头部、内容及底部操作分区，采用原生 dialog 实现；日常编辑现位于选中员工详情。未引入上游组件依赖。保留原因：改写仍有上游版权归属，MIT 要求随代码保留许可声明。

全站布局还研究了 Radix Themes、Cal 和 Twenty 的公开源码，仅借鉴层级与组织原则；具体文件与版本见 [UI 设计](UI_DESIGN.md)。

来源核对日期：2026-10-02。上游 [MIT 许可证](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) 全文如下：

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
