export interface DashboardData {
  memberCount: number;
  todayOrders: number;
  todayPerformance: number;
  totalBonus: number;
  pendingTransfers: number;
  pendingDeliveryOrders: number;
  pendingApprovals: number;
  pendingRiskEvents: number;
  rankDistribution: Array<{ level: number; count: number }>;
  recentOrders: DashboardOrder[];
}

export interface DashboardOrder {
  id: string | number;
  orderNo: string;
  amount: number;
  status: number;
  createdAt: string;
  user?: { nickname?: string | null; phone?: string | null };
}

export interface Member {
  id: string;
  phone: string | null;
  nickname: string | null;
  inviteCode: string;
  rankLevel: number;
  packageId: number | null;
  equityStatus: number;
  status: number;
  totalTeamPerformance: number;
  createdAt: string;
  wallet: { balance: number };
  equityAccount: { balance: number };
}

export interface FeatureFlag {
  id: string;
  code: string;
  name: string;
  module: string;
  enabled: boolean;
  platforms: string[];
  minRankLevel: number;
  updatedAt: string;
}

export interface SettleBatch {
  id: string;
  statDate: string;
  step: number;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}
