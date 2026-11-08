# -*- coding: utf-8 -*-
"""测试 reply.py 的「内容 + 时间窗」去重与草稿脱敏（不连真实邮箱）。"""
import datetime as dt
import email
import os
import sys
from email.utils import formatdate

sys.path.insert(0, 'tools/autoreply')
import reply

os.environ.pop('DRY_RUN', None)
os.environ.pop('TEST_TO_OVERRIDE', None)
reply.QQ_USER = 'test@qq.com'          # 只为通过 main() 的凭据检查，不会真连邮箱
reply.QQ_AUTH_CODE = 'fake'
reply.OWNER_EMAIL = 'test@qq.com'


def make_mail(mid, when, body='人人都说《道德经》好，复杂职场里怎么用？', share='愿意', who='小林'):
    raw = (
        'From: FormSubmit <noreply@formsubmit.co>\n'
        'Subject: 【观子喻知】读者来信\n'
        'Content-Type: text/html; charset=utf-8\n'
        '\n'
        '<table>'
        '<tr><td><strong>表单类型</strong></td><td>读者来信</td></tr>'
        f'<tr><td><strong>称呼</strong></td><td>{who}</td></tr>'
        '<tr><td><strong>联系方式</strong></td><td>a@example.com</td></tr>'
        f'<tr><td><strong>留言内容</strong></td><td>{body}</td></tr>'
        f'<tr><td><strong>是否愿意公开</strong></td><td>{share}</td></tr>'
        '</table>'
    )
    msg = email.message_from_bytes(raw.encode('utf-8'))
    msg['Message-ID'] = mid
    msg['Date'] = formatdate(when.timestamp(), localtime=False)
    return msg


class FakeIMAP:
    def __init__(self, mails):
        self.mails = mails
        self.copied = []
        self.uids = b' '.join(str(i + 1).encode() for i in range(len(mails)))

    def select(self, name):
        return 'OK', [b'0']

    def create(self, name):
        return 'OK', [b'']

    def logout(self):
        return 'OK', [b'']

    def uid(self, cmd, *args):
        if cmd == 'SEARCH':
            if args[-1] == 'ALL':
                return 'OK', [b'']
            return 'OK', [self.uids]
        if cmd == 'FETCH':
            idx = int(args[0]) - 1
            return 'OK', [(b'1 (BODY[] {n}', self.mails[idx].as_bytes())]
        if cmd == 'COPY':
            self.copied.append(args[0])
            return 'OK', [b'']
        if cmd == 'STORE':
            return 'OK', [b'']
        return 'OK', [b'']


def run(mails):
    fake = FakeIMAP(mails)
    sent = []
    reply.imap_connect = lambda: fake
    reply.smtp_send = lambda msg: sent.append(msg['To'])
    code = reply.main()
    return code, len(sent), len(fake.copied)


base = dt.datetime(2026, 11, 9, 0, 20, tzinfo=dt.timezone.utc)

# 1. 13 秒内连点两次、内容完全相同：只回一封，两封都写记号
m1 = make_mail('<a@x>', base)
m2 = make_mail('<b@x>', base + dt.timedelta(seconds=13))
code, sent, copied = run([m1, m2])
print('重复提交 → 退出码 %s，回信 %d 封，记号 %d 条' % (code, sent, copied))
assert code == 0 and sent == 1 and copied == 2, '重复来信应只回一封且两封都写记号'

# 2. 内容不同：两封都回
m3 = make_mail('<c@x>', base, body='这次问的是别的事')
code, sent, copied = run([m1, m3])
print('不同内容 → 退出码 %s，回信 %d 封，记号 %d 条' % (code, sent, copied))
assert sent == 2, '不同内容不应被误判成重复'

# 3. 超出时间窗的相同内容：两封都回
m4 = make_mail('<d@x>', base + dt.timedelta(minutes=20))
code, sent, copied = run([m1, m4])
print('超出时间窗 → 退出码 %s，回信 %d 封' % (code, sent))
assert sent == 2, '超出时间窗不应去重'

# 4. 指纹与脱敏
k, f, v, _ = reply.classify(m1)
fp = reply.content_fingerprint(k, f, v)
assert fp == reply.content_fingerprint(k, f, v)
assert 'a@example.com' not in reply.scrub_text('联系我 a@example.com 谢谢')
print('指纹稳定 / 邮箱已抹除：OK')

# 5. 草稿导出：只导出「愿意」的，脱敏、不重复、日志不打正文
import contextlib
import io
import tempfile

d = tempfile.mkdtemp()
fake = FakeIMAP([
    m1,
    make_mail('<e@x>', base, share='不愿意'),
    make_mail('<f@x>', base + dt.timedelta(seconds=30),
              body='另一个问题，也可以联系我 b@test.com'),
])
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    n = reply.export_public_drafts(fake, d, 14)
    n2 = reply.export_public_drafts(fake, d, 14)
files = [os.path.join(d, x) for x in os.listdir(d) if x.endswith('.json')]
print('草稿导出 → 首次 %d 份，重复运行 %d 份，文件 %d 个' % (n, n2, len(files)))
assert n == 2 and n2 == 0 and len(files) == 2, '只应导出两封「愿意」的来信且不重复'
assert os.path.exists(os.path.join(d, '.gitignore')), '草稿目录必须有 .gitignore'
alltext = ''.join(open(p, encoding='utf-8').read() for p in files)
for secret in ('a@example.com', 'b@test.com', '小林'):
    assert secret not in alltext, '草稿里不该出现：' + secret
assert '人人都说《道德经》好' not in buf.getvalue(), '日志不该打印来信正文'
print('草稿脱敏 / 不重复 / 日志不打正文：OK')

print('\n全部通过')
