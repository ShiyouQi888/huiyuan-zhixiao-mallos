export interface ReferralPosterTextLayer {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  color: string;
  align: 'left' | 'center' | 'right';
}

export interface ReferralPosterQrLayer {
  id: string;
  type: 'qrcode';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReferralPosterImageLayer {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  fit: 'contain' | 'cover';
  opacity: number;
}

export type ReferralPosterLayer = ReferralPosterTextLayer | ReferralPosterQrLayer | ReferralPosterImageLayer;

export interface ReferralPosterTemplate {
  version: 1;
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  layers: ReferralPosterLayer[];
}

/** Logical design canvas uses 360 × 640; H5 exports it at 1080 × 1920. */
export const DEFAULT_REFERRAL_POSTER_TEMPLATE: ReferralPosterTemplate = {
  version: 1,
  width: 360,
  height: 640,
  backgroundColor: '#FFF7F2',
  backgroundImageUrl: null,
  layers: [
    {
      id: 'brand-title', type: 'text', x: 26, y: 42, width: 308, height: 48,
      text: '太阳线会员', fontSize: 30, fontWeight: 700, color: '#1D2939', align: 'center',
    },
    {
      id: 'headline', type: 'text', x: 26, y: 94, width: 308, height: 48,
      text: '{nickname} 邀请您加入', fontSize: 17, fontWeight: 500, color: '#475467', align: 'center',
    },
    {
      id: 'invite-qrcode', type: 'qrcode', x: 102, y: 188, width: 156, height: 156,
    },
    {
      id: 'scan-hint', type: 'text', x: 24, y: 362, width: 312, height: 28,
      text: '扫码注册，开启会员专属权益', fontSize: 15, fontWeight: 600, color: '#344054', align: 'center',
    },
    {
      id: 'invite-code', type: 'text', x: 30, y: 412, width: 300, height: 42,
      text: '邀请码  {inviteCode}', fontSize: 20, fontWeight: 700, color: '#C9460C', align: 'center',
    },
    {
      id: 'poster-footer', type: 'text', x: 25, y: 552, width: 310, height: 30,
      text: '长按识别二维码，建立专属推荐关系', fontSize: 12, fontWeight: 400, color: '#667085', align: 'center',
    },
  ],
};
