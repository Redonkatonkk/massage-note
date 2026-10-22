<a id="第三方代码声明"></a>

# Third Party Code Statement

**English** | **[简体中文](THIRD_PARTY_NOTICES.zh-CN.md)**

## Shadcn/ui

Members toolbar [`members-toolbar.tsx`](../../apps/web/app/manage/members-toolbar.tsx) based on [shadcn/ui DataTableToolbar](https://github.com/shadcn-ui/ui/blob/main/apps/v4/app/%28app%29/examples/tasks/components/data-table-toolbar.tsx) Rewritten, retaining the combined structure of search, status/role filtering and reset, adapting to the native form and CSS of this project. The header, content and bottom operation partitions of the new status confirmation form reference [Sheet](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/sheet.tsx) are implemented using native dialog; daily editing is now located in the selected employee details. No upstream component dependencies are introduced. Reason: Rewrites still retain upstream copyright, and MIT requires that a license statement be retained with the code.

The full site layout also studied the open source code of Radix Themes, Cal and Twenty, only drawing on the principles of hierarchy and organization; see [UI Design](UI_DESIGN.md) for specific files and versions.

Source verification date: 2026-10-02. The full text of the upstream [MIT License](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) is as follows:

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
