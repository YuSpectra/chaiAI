# -*- coding: utf-8 -*-
# 测试 reply.py 的「是否愿意公开」分支（中文内容必须走文件，heredoc 会把中文转义成 \uXXXX）
import sys, email
sys.path.insert(0, 'tools/autoreply')
import reply


def make(share):
    extra = f'<tr><td><strong>是否愿意公开</strong></td><td>{share}</td></tr>' if share else ''
    raw = (
        'From: FormSubmit <noreply@formsubmit.co>\n'
        'Subject: 【观子喻知】读者来信\n'
        'Message-ID: <s1@x>\n'
        'Content-Type: text/html; charset=utf-8\n'
        '\n'
        '<table><tr><td><strong>表单类型</strong></td><td>读者来信</td></tr>\n'
        '<tr><td><strong>称呼</strong></td><td>小林</td></tr>\n'
        '<tr><td><strong>联系方式</strong></td><td>a@example.com</td></tr>\n'
        '<tr><td><strong>留言内容</strong></td><td>最近在读心学，有点焦虑。</td></tr>\n'
        + extra + '</table>'
    )
    m = email.message_from_bytes(raw.encode('utf-8'))
    kind, fields, visitor, subj = reply.classify(m)
    has_msg = '留言内容' in fields
    has_share = '是否愿意公开' in fields
    share_val = fields.get('是否愿意公开', '<无>')
    print('kind=%s visitor=%s share=%s' % (kind, visitor, share_val))
    r = reply.build_reply(visitor, kind, fields, m, subj, '小林')
    return r.get_body(preferencelist=('plain',)).get_content()


for label, share in [('选了愿意', '愿意'), ('选了不愿意', '不愿意'), ('没选', '')]:
    t = make(share)
    print(f'=== {label} ===')
    print(t)
    print()
