<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, money, resolveAssetUrl } from '../api';
import { useUserStore } from '../stores/user';
import { share, platform } from '../adapter';
import { Toast } from './_toast';
import PageHeading from '../components/PageHeading.vue';
import SectionHeading from '../components/SectionHeading.vue';
import EmptyState from '../components/EmptyState.vue';
import { BadgePercent, Clock3, Copy, Download, LoaderCircle, QrCode, Share2, UsersRound, X } from 'lucide-vue-next';
import type { ReferralPosterLayer, ReferralPosterTemplate } from '../../../../packages/shared/src/referral-poster';

const store = useUserStore();
const info = ref<any>(null);
const invites = ref<any[]>([]);
const stats = ref<any>(null);
const showPoster = ref(false);
const posterLoading = ref(false);
const posterImage = ref('');
const posterError = ref('');
const inviteCode = computed(() => info.value?.inviteCode ?? store.profile?.inviteCode ?? '');

onMounted(async () => {
  await store.loadProfile().catch(() => {});
  const [referral, team, bonus] = await Promise.all([
    store.has('referral.center') ? api<any>('/referral/qrcode').catch(() => null) : Promise.resolve(null),
    store.has('team.view') ? api<any[]>('/me/team').catch(() => []) : Promise.resolve([]),
    store.has('bonus.detail') ? api<any>('/me/bonus').catch(() => null) : Promise.resolve(null),
  ]);
  info.value = referral;
  invites.value = team;
  stats.value = bonus;
});

async function copyLink() {
  try {
    if (!info.value?.url) throw new Error('推广链接暂不可用');
    await share('加入太阳线会员', info.value.url);
    Toast(platform === 'h5' ? '推广链接已复制' : '已打开系统分享', 'success');
  } catch (e: any) { Toast(e.message ?? '复制失败，请稍后重试', 'danger'); }
}

async function copyInviteCode() {
  try {
    if (!inviteCode.value) throw new Error('邀请码暂不可用');
    await share('太阳线会员邀请码', inviteCode.value);
    Toast(platform === 'h5' ? '邀请码已复制' : '请通过系统分享', 'success');
  } catch (e: any) { Toast(e.message ?? '复制失败，请稍后重试', 'danger'); }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('海报背景图片加载失败，请检查文件管理中的图片'));
    image.src = src;
  });
}

function wrapText(context: CanvasRenderingContext2D, content: string, maxWidth: number): string[] {
  return content.split('\n').flatMap((paragraph) => {
    const lines: string[] = [];
    let line = '';
    for (const character of Array.from(paragraph)) {
      const next = line + character;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = character;
      } else line = next;
    }
    lines.push(line);
    return lines;
  });
}

async function renderPoster(): Promise<string> {
  const template = info.value?.poster as ReferralPosterTemplate | undefined;
  const qrCode = String(info.value?.qrCode ?? '');
  if (!template || !qrCode) throw new Error('邀请海报数据暂不可用，请刷新后重试');
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = template.width * scale;
  canvas.height = template.height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法生成海报图片');
  context.fillStyle = template.backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (template.backgroundImageUrl) {
    const background = await loadImage(resolveAssetUrl(template.backgroundImageUrl));
    const ratio = Math.max(canvas.width / background.width, canvas.height / background.height);
    const width = background.width * ratio;
    const height = background.height * ratio;
    context.drawImage(background, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }

  const qrImage = await loadImage(qrCode);
  const posterImages = new Map<string, HTMLImageElement>();
  const textValues = {
    nickname: String(store.profile?.nickname ?? '会员朋友'),
    inviteCode: inviteCode.value,
    url: String(info.value?.url ?? ''),
  };
  for (const layer of template.layers as ReferralPosterLayer[]) {
    const x = layer.x * scale;
    const y = layer.y * scale;
    const width = layer.width * scale;
    const height = layer.height * scale;
    if (layer.type === 'qrcode') {
      const size = Math.min(width, height);
      const qrX = x + (width - size) / 2;
      const qrY = y + (height - size) / 2;
      const padding = Math.max(6, size * 0.055);
      context.fillStyle = '#FFFFFF';
      context.fillRect(qrX, qrY, size, size);
      context.drawImage(qrImage, qrX + padding, qrY + padding, size - padding * 2, size - padding * 2);
      continue;
    }

    if (layer.type === 'image') {
      let image = posterImages.get(layer.src);
      if (!image) {
        image = await loadImage(resolveAssetUrl(layer.src));
        posterImages.set(layer.src, image);
      }
      const ratio = layer.fit === 'cover'
        ? Math.max(width / image.width, height / image.height)
        : Math.min(width / image.width, height / image.height);
      const drawWidth = image.width * ratio;
      const drawHeight = image.height * ratio;
      context.save();
      context.globalAlpha = layer.opacity;
      if (layer.fit === 'cover') {
        context.beginPath();
        context.rect(x, y, width, height);
        context.clip();
      }
      context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
      context.restore();
      continue;
    }

    const content = layer.text.replace(/\{(nickname|inviteCode|url)\}/g, (_, key: keyof typeof textValues) => textValues[key]);
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.fillStyle = layer.color;
    context.font = `${layer.fontWeight} ${layer.fontSize * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.textAlign = layer.align;
    context.textBaseline = 'middle';
    const lines = wrapText(context, content, Math.max(4, width - 12 * scale));
    const lineHeight = layer.fontSize * scale * 1.35;
    const centerY = y + height / 2;
    const textX = layer.align === 'left' ? x + 6 * scale : layer.align === 'right' ? x + width - 6 * scale : x + width / 2;
    lines.forEach((line, index) => context.fillText(line, textX, centerY + (index - (lines.length - 1) / 2) * lineHeight, width - 12 * scale));
    context.restore();
  }
  return canvas.toDataURL('image/png');
}

async function openPoster() {
  showPoster.value = true;
  posterLoading.value = true;
  posterError.value = '';
  posterImage.value = '';
  try { posterImage.value = await renderPoster(); }
  catch (error: any) { posterError.value = error.message ?? '海报生成失败'; }
  finally { posterLoading.value = false; }
}

async function savePoster() {
  try {
    if (!posterImage.value) throw new Error('海报尚未生成');
    const blob = await (await fetch(posterImage.value)).blob();
    const file = new File([blob], `太阳线邀请海报-${inviteCode.value || '会员'}.png`, { type: 'image/png' });
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '太阳线会员邀请海报' });
      Toast('邀请海报已打开系统分享', 'success');
      return;
    }
    const link = document.createElement('a');
    link.href = posterImage.value;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    Toast('海报已保存', 'success');
  } catch (error: any) {
    if (error?.name !== 'AbortError') Toast(error.message ?? '海报保存失败，请重试', 'danger');
  }
}
</script>

<template>
  <main class="page">
    <PageHeading eyebrow="邀请中心" title="邀请好友" subtitle="分享专属链接，好友注册后可与您建立推荐关系" />

    <!-- 邀请卡 -->
    <div class="invite-card">
      <div class="invite-card-head"><span class="invite-icon"><Share2 :size="19" aria-hidden="true" /></span><span>专属邀请</span></div>
      <div class="invite-label">我的邀请码</div>
      <div class="invite-code">{{ inviteCode || '加载中' }}</div>
      <button type="button" class="invite-copy-code" :disabled="!inviteCode" @click="copyInviteCode"><Copy :size="14" aria-hidden="true" />复制邀请码</button>
      <div class="invite-url">{{ info?.url || '推广链接加载中…' }}</div>
      <button type="button" class="invite-share-button" :disabled="!info?.url" @click="copyLink">复制推广链接</button>
      <button type="button" class="invite-poster-button" :disabled="!info?.qrCode" @click="openPoster"><QrCode :size="15" aria-hidden="true" />生成邀请海报</button>
    </div>

    <!-- 数据 -->
    <div class="share-stats">
      <div class="share-stat">
        <UsersRound :size="17" aria-hidden="true" />
        <div><strong>{{ invites.length }}</strong><span>已邀请会员</span></div>
      </div>
      <div class="share-stat share-stat--green">
        <BadgePercent :size="17" aria-hidden="true" />
        <div><strong>¥{{ money(stats?.byType?.find((b:any)=>b.type===1)?.amount) }}</strong><span>直推累计</span></div>
      </div>
      <div class="share-stat share-stat--amber">
        <Clock3 :size="17" aria-hidden="true" />
        <div><strong>分期释放</strong><span>奖励结算周期</span></div>
      </div>
    </div>

    <!-- 邀请记录 -->
    <SectionHeading title="邀请记录" subtitle="已绑定到您名下的会员" />
    <div v-if="invites.length" class="invite-list">
      <div v-for="m in invites" :key="m.id" class="list-row row between">
        <div class="row gap-8">
          <div class="invite-avatar">{{ String(m.nickname ?? '会员').slice(0, 1) }}</div>
          <div>
            <div style="font-size:12px">{{ m.nickname ?? '会员' }}</div>
            <div class="subtitle" style="font-size:10px;margin-top:2px">{{ new Date(m.createdAt).toLocaleDateString('zh-CN') }}</div>
          </div>
        </div>
        <div class="green" style="font-size:12px">已绑定</div>
      </div>
    </div>
    <EmptyState v-else title="还没有邀请记录" description="分享您的专属链接，好友注册后会显示在这里" />

    <div v-if="showPoster" class="poster-overlay" role="dialog" aria-modal="true" aria-label="邀请海报预览" @click.self="showPoster = false">
      <section class="poster-sheet">
        <header class="poster-sheet-head">
          <div><strong>专属邀请海报</strong><span>扫码注册并绑定推荐关系</span></div>
          <button type="button" class="poster-close" aria-label="关闭海报预览" @click="showPoster = false"><X :size="18" aria-hidden="true" /></button>
        </header>
        <div class="poster-preview">
          <div v-if="posterLoading" class="poster-loading"><LoaderCircle :size="22" class="spin" />正在生成海报…</div>
          <div v-else-if="posterError" class="poster-error">{{ posterError }}<button type="button" @click="openPoster">重新生成</button></div>
          <img v-else-if="posterImage" :src="posterImage" alt="太阳线会员邀请海报" />
        </div>
        <div class="poster-actions">
          <button type="button" class="poster-save-button" :disabled="posterLoading || !posterImage" @click="savePoster"><Download :size="16" aria-hidden="true" />保存海报</button>
          <p>海报含您的专属二维码，分享时请勿裁切二维码区域</p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.invite-card {
  position: relative;
  overflow: hidden;
  padding: 20px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 96% -16%, rgba(255, 255, 255, 0.26), transparent 46%),
    linear-gradient(120deg, #ff8a4c 0%, #f45a1f 54%, #e3410c 100%);
  color: #fff;
  text-align: center;
  box-shadow: 0 12px 28px rgba(224, 66, 12, 0.22);
}
.invite-card::after {
  position: absolute;
  right: -36px;
  bottom: -78px;
  width: 150px;
  height: 150px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  content: '';
  pointer-events: none;
}
.invite-card-head { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 8px; color: rgba(255, 255, 255, .82); font-size: 10.5px; font-weight: 650; }
.invite-icon { display: inline-flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 11px; background: rgba(255, 255, 255, .18); color: #fff; }
.invite-label { position: relative; z-index: 1; margin-top: 17px; color: rgba(255, 255, 255, .74); font-size: 10px; }
.invite-code { position: relative; z-index: 1; margin-top: 5px; color: #fff; font-family: var(--font-num); font-size: 28px; font-weight: 800; letter-spacing: .14em; }
.invite-copy-code { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; padding: 5px 9px; border: 1px solid rgba(255, 255, 255, .22); border-radius: 999px; background: rgba(255, 255, 255, .14); color: #fff; font: inherit; font-size: 9.5px; cursor: pointer; }
.invite-copy-code:disabled { opacity: .55; cursor: default; }
.invite-url { position: relative; z-index: 1; overflow: hidden; margin-top: 15px; padding: 11px; border: 1px solid rgba(255, 255, 255, .18); border-radius: 10px; background: rgba(255, 255, 255, .12); color: rgba(255, 255, 255, .8); font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
.invite-share-button { position: relative; z-index: 1; display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: center; margin-top: 12px; border: 0; border-radius: 12px; background: #fff; color: #e8460d; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: transform .14s ease, opacity .14s ease; }
.invite-share-button:active { transform: scale(.985); }
.invite-share-button:disabled { opacity: .55; cursor: not-allowed; }
.invite-poster-button { position: relative; z-index: 1; display: flex; width: 100%; min-height: 42px; align-items: center; justify-content: center; gap: 7px; margin-top: 8px; border: 1px solid rgba(255, 255, 255, .38); border-radius: 11px; background: rgba(255, 255, 255, .14); color: #fff; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.invite-poster-button:disabled { opacity: .55; cursor: not-allowed; }
.poster-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-end; justify-content: center; padding: 16px 12px calc(12px + env(safe-area-inset-bottom)); background: rgba(14, 18, 27, .74); backdrop-filter: blur(8px); }
.poster-sheet { display: flex; width: min(100%, 440px); max-height: 94dvh; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 22px 22px 16px 16px; background: var(--surface); box-shadow: 0 22px 72px rgba(0, 0, 0, .32); }
.poster-sheet-head { display: flex; min-height: 62px; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.poster-sheet-head > div { display: flex; flex-direction: column; gap: 3px; }
.poster-sheet-head strong { color: var(--text); font-size: 14px; }
.poster-sheet-head span { color: var(--muted); font-size: 10px; }
.poster-close { display: flex; width: 34px; height: 34px; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); color: var(--muted); }
.poster-preview { display: grid; min-height: 220px; max-height: 66dvh; flex: 1; place-items: center; overflow: auto; padding: 14px; background: var(--surface-2); }
.poster-preview img { display: block; width: auto; max-width: 100%; max-height: 62dvh; border-radius: 10px; box-shadow: 0 8px 28px rgba(0, 0, 0, .18); }
.poster-loading { display: flex; min-height: 220px; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--muted); font-size: 12px; }
.poster-error { display: flex; min-height: 220px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--danger); font-size: 12px; }
.poster-error button { padding: 7px 13px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--brand); font: inherit; }
.poster-actions { padding: 13px 16px 14px; text-align: center; }
.poster-save-button { display: flex; width: 100%; min-height: 46px; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 12px; background: var(--brand); color: #fff; font: inherit; font-size: 13px; font-weight: 700; }
.poster-save-button:disabled { opacity: .55; }
.poster-actions p { margin-top: 8px; color: var(--muted); font-size: 10px; }
.spin { animation: poster-spin 1s linear infinite; }
@keyframes poster-spin { to { transform: rotate(360deg); } }
.share-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 13px; }
.share-stat { display: flex; min-width: 0; align-items: center; gap: 7px; padding: 12px 9px; border: 1px solid var(--line); border-radius: 13px; background: var(--surface); color: var(--brand); box-shadow: var(--shadow-card); }
.share-stat--green { color: var(--green); }
.share-stat--amber { color: var(--amber); }
.share-stat > div { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.share-stat strong { overflow: hidden; color: var(--text); font-family: var(--font-num); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.share-stat span { color: var(--muted); font-size: 10px; white-space: nowrap; }
.invite-list { padding: 2px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); box-shadow: var(--shadow-card); }
.invite-avatar { display: flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 11px; background: var(--brand-soft); color: var(--brand); font-size: 12px; font-weight: 700; }
@media (max-width: 360px) { .share-stat { flex-direction: column; align-items: flex-start; } }
</style>
