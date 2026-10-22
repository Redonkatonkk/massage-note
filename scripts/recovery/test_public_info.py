import unittest

from prepare_public_info import render_pages


class PublicInfoTests(unittest.TestCase):
    def test_each_page_contains_matching_sections_in_english_then_chinese(self):
        english = '# Backups\n\n**English** | **[简体中文](BACKUP_PUBLIC_PAGE.zh-CN.md)**\n\nOverview.\n\n## Privacy policy\n\nPrivate data.\n\n## Terms\n\nPersonal use.'
        chinese = '# 备份\n\n**[English](BACKUP_PUBLIC_PAGE.md)** | **简体中文**\n\n备份说明。\n\n## 隐私政策\n\n隐私数据。\n\n## 使用条款\n\n个人使用。'
        pages = render_pages(english, chinese)
        for name, en, zh in [('index.html', 'Overview.', '备份说明。'), ('privacy.html', 'Private data.', '隐私数据。'), ('terms.html', 'Personal use.', '个人使用。')]:
            page = pages[name]
            self.assertIn('<html lang="en">', page)
            self.assertIn('id="english" lang="en"', page)
            self.assertIn('id="chinese" lang="zh-CN"', page)
            self.assertLess(page.index(en), page.index(zh))
            self.assertNotIn('.md)', page)
        self.assertNotIn('Private data.', pages['index.html'])
        self.assertNotIn('Personal use.', pages['privacy.html'])

    def test_escapes_text_and_keeps_policy_links_and_inline_code(self):
        source = '# Backups\n\n<script>bad</script>\n\n## Privacy\n\nUse `drive.file` and [policy](https://example.com/policy).\n\n## Terms\n\nPersonal use.'
        pages = render_pages(source, source)
        self.assertIn('&lt;script&gt;bad&lt;/script&gt;', pages['index.html'])
        self.assertIn('<code>drive.file</code>', pages['privacy.html'])
        self.assertIn('<a href="https://example.com/policy">policy</a>', pages['privacy.html'])

    def test_missing_privacy_or_terms_cannot_generate_incomplete_pages(self):
        with self.assertRaises(ValueError):
            render_pages('# Backups\n\nOverview only.', '# 备份\n\n只有概览。')

    def test_section_routing_uses_meaning_instead_of_document_order(self):
        source = '# Backups\n\nOverview.\n\n## Terms\n\nPersonal use.\n\n## Privacy\n\nPrivate data.'
        pages = render_pages(source, source)
        self.assertIn('Private data.', pages['privacy.html'])
        self.assertNotIn('Personal use.', pages['privacy.html'])
