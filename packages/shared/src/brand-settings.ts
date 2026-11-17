export interface BrandSettings {
  brandName: string;
  storeName: string;
  tagline: string;
  logoUrl: string;
  footerText: string;
  icpFilingNumber: string;
  icpFilingUrl: string;
  publicSecurityFilingNumber: string;
  publicSecurityFilingUrl: string;
}

export const DEFAULT_BRAND_SETTINGS: BrandSettings = {
  brandName: '太阳线会员',
  storeName: '会员商城',
  tagline: '会员专属好物与权益服务',
  logoUrl: '',
  footerText: '太阳线会员服务 · H5 会员商城',
  icpFilingNumber: '',
  icpFilingUrl: 'https://beian.miit.gov.cn/',
  publicSecurityFilingNumber: '',
  publicSecurityFilingUrl: '',
};
