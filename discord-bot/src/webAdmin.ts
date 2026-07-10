import crypto from 'node:crypto';
import http from 'node:http';
import { URLSearchParams } from 'node:url';
import { request } from 'undici';
import { ChannelType, Client, PermissionFlagsBits, TextChannel } from 'discord.js';
import { config } from './config/env.js';
import { DetectionRepository } from './repositories/detectionRepository.js';
import { GuildSettingsRepository } from './repositories/guildSettingsRepository.js';
import { logger } from './utils/logger.js';

const detections = new DetectionRepository();
const guildSettings = new GuildSettingsRepository();
const sessions = new Map<string, { user: DiscordUser; guilds: DiscordGuild[] }>();

type DiscordUser = { id: string; username: string; global_name?: string | null };
type DiscordGuild = { id: string; name: string; icon?: string | null; permissions: string };

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const hasPermission = (guild: DiscordGuild, permission: bigint) => (BigInt(guild.permissions) & permission) === permission;
const canManageGuild = (guild: DiscordGuild) => hasPermission(guild, PermissionFlagsBits.ManageGuild) || hasPermission(guild, PermissionFlagsBits.ManageMessages) || hasPermission(guild, PermissionFlagsBits.Administrator);
const requiredLogChannelPermissions: Array<[bigint, string]> = [
  [PermissionFlagsBits.ViewChannel, 'チャンネルを見る'],
  [PermissionFlagsBits.SendMessages, 'メッセージを送信'],
  [PermissionFlagsBits.EmbedLinks, '埋め込みリンク'],
  [PermissionFlagsBits.AttachFiles, 'ファイルを添付'],
  [PermissionFlagsBits.ReadMessageHistory, 'メッセージ履歴を読む']
];
const cookieValue = (req: http.IncomingMessage, name: string) => req.headers.cookie?.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1);
const cookieSecure = config.webBaseUrl.startsWith('https://') ? '; secure' : '';
const sessionCookie = (req: http.IncomingMessage) => cookieValue(req, 'sid');
const currentSession = (req: http.IncomingMessage) => {
  const sid = sessionCookie(req);
  return sid ? sessions.get(sid) : undefined;
};
const requireLogin = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const session = currentSession(req);
  if (!session) {
    redirect(res, '/login');
    return null;
  }
  return session;
};
const requireOwner = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const session = requireLogin(req, res);
  if (!session) return null;
  if (!config.botOwnerUserIds.includes(session.user.id)) {
    send(res, 403, html('権限なし', '<h1>403</h1><p>BOT運営者として許可されていません。</p>', session));
    return null;
  }
  return session;
};
const manageableGuilds = (client: Client, session: { guilds: DiscordGuild[] }) => session.guilds.filter((guild) => client.guilds.cache.has(guild.id) && canManageGuild(guild));
const canManageTargetGuild = (client: Client, session: { guilds: DiscordGuild[] }, guildId: string) => manageableGuilds(client, session).some((guild) => guild.id === guildId);
const validateLogChannel = async (client: Client, guildId: string, channelId: string): Promise<string | null> => {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== guildId) {
    return '指定されたチャンネルがこのサーバーのテキストチャンネルとして見つかりません。';
  }
  const botUser = client.user;
  if (!botUser) return 'Bot ユーザー情報を取得できないため、権限を確認できません。';
  const permissions = channel.permissionsFor(botUser);
  if (!permissions) return 'Bot のチャンネル権限を確認できません。';
  const missingPermissions = requiredLogChannelPermissions.filter(([permission]) => !permissions.has(permission)).map(([, label]) => label);
  return missingPermissions.length > 0 ? `Bot に必要な権限が不足しているため設定できません。不足権限: ${missingPermissions.join(', ')}` : null;
};

const html = (title: string, body: string, session?: { user: DiscordUser }) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
:root{color-scheme:light;--bg:#f6f8fb;--fg:#111827;--muted:#64748b;--card:rgba(255,255,255,.9);--card-strong:#fff;--line:#e5e7eb;--primary:#4f46e5;--primary-2:#06b6d4;--danger:#dc2626;--success:#16a34a;--shadow:0 20px 45px rgba(15,23,42,.10)}body.dark{color-scheme:dark;--bg:#0f172a;--fg:#f8fafc;--muted:#94a3b8;--card:rgba(30,41,59,.86);--card-strong:#111827;--line:#334155;--primary:#818cf8;--primary-2:#22d3ee;--danger:#f87171;--success:#4ade80;--shadow:0 20px 45px rgba(0,0,0,.35)}*{box-sizing:border-box}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;min-height:100vh;background:radial-gradient(circle at top left,rgba(79,70,229,.18),transparent 32rem),radial-gradient(circle at top right,rgba(6,182,212,.16),transparent 28rem),var(--bg);color:var(--fg);padding:32px}body>nav,main>h1,main>table,main>form,main>p{max-width:1180px}nav{position:sticky;top:16px;z-index:5;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 auto 28px;padding:14px 16px;border:1px solid var(--line);border-radius:20px;background:var(--card);box-shadow:var(--shadow);backdrop-filter:blur(16px)}nav a,a{color:var(--primary);font-weight:700;text-decoration:none}nav a{padding:8px 12px;border-radius:999px;background:rgba(79,70,229,.10)}nav span{margin-left:auto;color:var(--muted);font-size:.92rem}h1{margin:0 auto 18px;font-size:clamp(1.7rem,3vw,2.5rem);letter-spacing:-.04em}p{margin-left:auto;margin-right:auto;color:var(--muted)}table{border-collapse:separate;border-spacing:0;width:100%;margin:14px auto 32px;overflow:hidden;border:1px solid var(--line);border-radius:22px;background:var(--card);box-shadow:var(--shadow)}td,th{border-bottom:1px solid var(--line);padding:14px;vertical-align:top;text-align:left}tr:last-child td{border-bottom:0}th{background:linear-gradient(135deg,rgba(79,70,229,.14),rgba(6,182,212,.10));font-size:.82rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}tr:hover td{background:rgba(79,70,229,.05)}img{width:52px;height:52px;border-radius:16px;object-fit:cover;box-shadow:0 10px 24px rgba(15,23,42,.18)}textarea,input{width:100%;max-width:560px;border:1px solid var(--line);border-radius:14px;background:var(--card-strong);color:var(--fg);padding:10px 12px;outline:none}textarea{height:96px;resize:vertical}input:focus,textarea:focus{border-color:var(--primary);box-shadow:0 0 0 4px rgba(79,70,229,.16)}button{border:0;border-radius:999px;padding:9px 14px;font-weight:800;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--primary),var(--primary-2));box-shadow:0 12px 24px rgba(79,70,229,.24)}button[type=reset]{background:transparent;color:var(--muted);border:1px solid var(--line);box-shadow:none}code{padding:3px 7px;border-radius:8px;background:rgba(100,116,139,.14);word-break:break-all}@media(max-width:760px){body{padding:18px}table{display:block;overflow-x:auto}nav span{margin-left:0;width:100%}}</style><script>function toggleTheme(){document.body.classList.toggle('dark');localStorage.setItem('theme',document.body.classList.contains('dark')?'dark':'light')}addEventListener('DOMContentLoaded',()=>{if(localStorage.getItem('theme')==='dark')document.body.classList.add('dark')})</script></head><body><nav><button onclick="toggleTheme()">ライト/ダーク切替</button><a href="/dashboard/guilds">導入サーバー管理</a><a href="/admin/guilds">BOT運営管理</a>${session ? ` <span>login: ${escapeHtml(session.user.global_name ?? session.user.username)} (${escapeHtml(session.user.id)})</span> <a href="/logout">logout</a>` : ' <a href="/login">login</a>'}</nav><main>${body}</main></body></html>`;
const readBody = (req: http.IncomingMessage) => new Promise<URLSearchParams>((resolve) => { const chunks: Buffer[] = []; req.on('data', (chunk) => chunks.push(Buffer.from(chunk))); req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))); });
const send = (res: http.ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8') => { res.writeHead(status, { 'content-type': type }); res.end(body); };
const redirect = (res: http.ServerResponse, location: string, headers: Record<string, string | string[]> = {}) => { res.writeHead(303, { location, ...headers }); res.end(); };
const guildIcon = (guild: { id: string; icon?: string | null; iconURL?: (options: { size: number }) => string | null }) => 'iconURL' in guild ? guild.iconURL?.({ size: 64 }) ?? '' : guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : '';

const loginUrl = (state: string) => {
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.webBaseUrl}/auth/callback`, response_type: 'code', scope: 'identify guilds', state });
  return `https://discord.com/api/oauth2/authorize?${params}`;
};
const exchangeCode = async (code: string) => {
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.discordClientSecret, grant_type: 'authorization_code', code, redirect_uri: `${config.webBaseUrl}/auth/callback` });
  const tokenRes = await request('https://discord.com/api/oauth2/token', { method: 'POST', body: body.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  if (tokenRes.statusCode >= 400) throw new Error(`oauth token failed ${tokenRes.statusCode}`);
  const token = await tokenRes.body.json() as { access_token: string };
  const headers = { authorization: `Bearer ${token.access_token}` };
  const userRes = await request('https://discord.com/api/users/@me', { headers });
  const guildsRes = await request('https://discord.com/api/users/@me/guilds', { headers });
  if (userRes.statusCode >= 400 || guildsRes.statusCode >= 400) throw new Error('oauth user fetch failed');
  return { user: await userRes.body.json() as DiscordUser, guilds: await guildsRes.body.json() as DiscordGuild[] };
};

const guildsPage = (client: Client, session: { user: DiscordUser; guilds: DiscordGuild[] }) => {
  const rows = client.guilds.cache.map((guild) => {
    const icon = guildIcon(guild);
    const settings = guildSettings.get(guild.id);
    return `<tr><td>${icon ? `<img src="${escapeHtml(icon)}" alt="">` : ''}</td><td>${escapeHtml(guild.name)}</td><td><code>${escapeHtml(guild.id)}</code></td><td>${settings.log_channel_id ? escapeHtml(settings.log_channel_id) : '未設定'}</td><td><a href="/admin/guilds/${escapeHtml(guild.id)}/leave">退会</a></td><td><form method="post" action="/admin/guilds/${escapeHtml(guild.id)}/notify"><textarea name="text" placeholder="通知内容"></textarea><br><button type="submit">送信</button><button type="reset">キャンセル</button></form></td></tr>`;
  }).join('') || '<tr><td colspan="6">参加サーバーはありません。</td></tr>';
  return html('BOT運営: 参加サーバー', `<h1>BOT運営: 参加サーバー</h1><table><thead><tr><th>アイコン</th><th>サーバー名</th><th>サーバーID</th><th>ログ通知先</th><th>退会</th><th>通知</th></tr></thead><tbody>${rows}</tbody></table>`, session);
};
const dashboardGuildsPage = (client: Client, session: { user: DiscordUser; guilds: DiscordGuild[] }) => {
  const rows = manageableGuilds(client, session).map((guild) => {
    const botGuild = client.guilds.cache.get(guild.id);
    const icon = guildIcon(guild);
    const settings = guildSettings.get(guild.id);
    return `<tr><td>${icon ? `<img src="${escapeHtml(icon)}" alt="">` : ''}</td><td>${escapeHtml(botGuild?.name ?? guild.name)}</td><td><code>${escapeHtml(guild.id)}</code></td><td>${settings.log_channel_id ? escapeHtml(settings.log_channel_id) : '未設定'}</td><td><a href="/dashboard/guilds/${guild.id}/settings">設定</a> <a href="/dashboard/guilds/${guild.id}/detection-events">検知履歴</a> <a href="/dashboard/guilds/${guild.id}/false-positive-reports">誤検知</a></td></tr>`;
  }).join('') || '<tr><td colspan="5">管理できる導入済みサーバーはありません。</td></tr>';
  return html('導入サーバー管理', `<h1>導入サーバー管理</h1><table><thead><tr><th>アイコン</th><th>サーバー名</th><th>サーバーID</th><th>ログ通知先</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`, session);
};
const eventRows = (rows: Array<Record<string, unknown>>) => rows.map((row) => `<tr>${['id','guild_id','channel_id','message_id','user_id','decision_method','confidence_level','final_decision','auto_deleted','matched_spam_image_id','created_at'].map((key) => `<td>${escapeHtml(row[key])}</td>`).join('')}</tr>`).join('');
const eventsPage = (session: { user: DiscordUser }, guildId?: string) => html('検知イベント履歴', `<h1>検知イベント履歴</h1><table><thead><tr><th>ID</th><th>Guild</th><th>Channel</th><th>Message</th><th>User</th><th>Method</th><th>Confidence</th><th>Decision</th><th>Auto Deleted</th><th>Match</th><th>Created</th></tr></thead><tbody>${eventRows(guildId ? detections.findRecentByGuild(guildId) : detections.findRecent())}</tbody></table>`, session);
const reportRows = (rows: Array<Record<string, unknown>>) => rows.map((row) => `<tr>${['id','detection_event_id','guild_id','sha256','actor_user_id','created_at','channel_id','message_id','final_decision'].map((key) => `<td>${escapeHtml(row[key])}</td>`).join('')}</tr>`).join('');
const reportsPage = (session: { user: DiscordUser }, guildId?: string) => html('誤検知レポート', `<h1>誤検知レポート</h1><table><thead><tr><th>ID</th><th>Detection</th><th>Guild</th><th>SHA</th><th>Actor</th><th>Reported</th><th>Channel</th><th>Message</th><th>Decision</th></tr></thead><tbody>${reportRows(guildId ? detections.findFalsePositiveReportsByGuild(guildId) : detections.findFalsePositiveReports())}</tbody></table>`, session);
const dashboardSettingsPage = (client: Client, session: { user: DiscordUser; guilds: DiscordGuild[] }, guildId: string, message?: { type: 'error' | 'success'; text: string }) => {
  const guild = client.guilds.cache.get(guildId);
  const settings = guildSettings.get(guildId);
  const notice = message ? `<p style="padding:8px;border-radius:8px;background:${message.type === 'error' ? '#fee2e2;color:#991b1b' : '#dcfce7;color:#166534'}">${escapeHtml(message.text)}</p>` : '';
  return html('サーバー設定', `<h1>${escapeHtml(guild?.name ?? guildId)} 設定</h1>${notice}<form method="post"><label>ログ通知チャンネルID <input name="log_channel_id" value="${escapeHtml(settings.log_channel_id ?? '')}"></label><button type="submit">保存</button></form>`, session);
};

export const startWebAdmin = (client: Client) => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/login') {
        const state = crypto.randomUUID();
        return redirect(res, loginUrl(state), { 'set-cookie': `oauth_state=${state}; path=/; max-age=600; httponly; samesite=lax${cookieSecure}` });
      }
      if (req.method === 'GET' && url.pathname === '/logout') return redirect(res, '/login', { 'set-cookie': `sid=; path=/; max-age=0; httponly; samesite=lax${cookieSecure}` });
      if (req.method === 'GET' && url.pathname === '/auth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const expectedState = cookieValue(req, 'oauth_state');
        if (!code) return send(res, 400, 'missing code', 'text/plain; charset=utf-8');
        if (!state || !expectedState || state !== expectedState) return send(res, 400, 'invalid oauth state', 'text/plain; charset=utf-8');
        const session = await exchangeCode(code);
        const sid = crypto.randomUUID();
        sessions.set(sid, session);
        return redirect(res, '/dashboard/guilds', { 'set-cookie': [`sid=${sid}; path=/; httponly; samesite=lax${cookieSecure}`, `oauth_state=; path=/; max-age=0; httponly; samesite=lax${cookieSecure}`] });
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard' || url.pathname === '/dashboard/guilds')) {
        const session = requireLogin(req, res); if (!session) return;
        return send(res, 200, dashboardGuildsPage(client, session));
      }
      const dashboardMatch = url.pathname.match(/^\/dashboard\/guilds\/(\d+)\/(settings|detection-events|false-positive-reports)$/);
      if (dashboardMatch) {
        const session = requireLogin(req, res); if (!session) return;
        if (!canManageTargetGuild(client, session, dashboardMatch[1])) return send(res, 403, html('権限なし', '<h1>403</h1>', session));
        if (dashboardMatch[2] === 'settings' && req.method === 'GET') return send(res, 200, dashboardSettingsPage(client, session, dashboardMatch[1]));
        if (dashboardMatch[2] === 'settings' && req.method === 'POST') {
          const body = await readBody(req);
          const logChannelId = String(body.get('log_channel_id') ?? '').trim();
          if (logChannelId) {
            const validationError = await validateLogChannel(client, dashboardMatch[1], logChannelId);
            if (validationError) return send(res, 400, dashboardSettingsPage(client, session, dashboardMatch[1], { type: 'error', text: validationError }));
          }
          guildSettings.setLogChannel(dashboardMatch[1], logChannelId || null);
          return send(res, 200, dashboardSettingsPage(client, session, dashboardMatch[1], { type: 'success', text: logChannelId ? 'ログ通知チャンネルを保存しました。' : 'ログ通知チャンネル設定を解除しました。' }));
        }
        if (dashboardMatch[2] === 'detection-events') return send(res, 200, eventsPage(session, dashboardMatch[1]));
        if (dashboardMatch[2] === 'false-positive-reports') return send(res, 200, reportsPage(session, dashboardMatch[1]));
      }
      const owner = url.pathname.startsWith('/admin') ? requireOwner(req, res) : undefined;
      if (url.pathname.startsWith('/admin') && !owner) return;
      if (owner && req.method === 'GET' && url.pathname === '/admin/guilds') return send(res, 200, guildsPage(client, owner));
      if (owner && req.method === 'GET' && url.pathname === '/admin/detection-events') return send(res, 200, eventsPage(owner));
      if (owner && req.method === 'GET' && url.pathname === '/admin/false-positive-reports') return send(res, 200, reportsPage(owner));
      const leaveMatch = url.pathname.match(/^\/admin\/guilds\/(\d+)\/leave$/);
      if (owner && leaveMatch && req.method === 'GET') return send(res, 200, html('退会確認', `<h1>退会確認</h1><p>${escapeHtml(leaveMatch[1])} から退会しますか？</p><form method="post"><button name="confirm" value="yes">はい</button><a href="/admin/guilds">キャンセル</a></form>`, owner));
      if (owner && leaveMatch && req.method === 'POST') { const guild = client.guilds.cache.get(leaveMatch[1]); if (guild) await guild.leave(); return redirect(res, '/admin/guilds'); }
      const notifyMatch = url.pathname.match(/^\/admin\/guilds\/(\d+)\/notify$/);
      if (owner && notifyMatch && req.method === 'POST') { const body = await readBody(req); const text = String(body.get('text') ?? '').trim(); if (text) { const settings = guildSettings.get(notifyMatch[1]); const channel = settings.log_channel_id ? await client.channels.fetch(settings.log_channel_id).catch(() => null) : null; if (channel?.type === ChannelType.GuildText) await (channel as TextChannel).send(`BOT管理者から以下の通知が来ています\n${text}`); } return redirect(res, '/admin/guilds'); }
      return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    } catch (error) {
      logger.error({ error }, 'web admin request failed');
      return send(res, 500, 'internal server error', 'text/plain; charset=utf-8');
    }
  });
  server.listen(config.adminWebPort, () => logger.info({ port: config.adminWebPort }, 'web admin ready'));
};
