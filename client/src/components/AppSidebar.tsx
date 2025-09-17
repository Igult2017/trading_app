import { Activity, BarChart3, Calendar, History, Home, Settings, Target, TrendingUp } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const menuItems = [
  {
    title: 'Dashboard',
    url: '/',
    icon: Home,
  },
  {
    title: 'Market Overview',
    url: '/markets',
    icon: Activity,
  },
  {
    title: 'Trading Signals',
    url: '/signals',
    icon: Target,
  },
  {
    title: 'Economic Calendar',
    url: '/calendar',
    icon: Calendar,
  },
  {
    title: 'Trade History',
    url: '/history',
    icon: History,
  },
  {
    title: 'Analytics',
    url: '/analytics',
    icon: BarChart3,
  },
];

const strategyItems = [
  {
    title: 'Scalping',
    url: '/strategies/scalping',
    icon: TrendingUp,
  },
  {
    title: 'Day Trading',
    url: '/strategies/day',
    icon: TrendingUp,
  },
  {
    title: 'Swing Trading',
    url: '/strategies/swing',
    icon: TrendingUp,
  },
  {
    title: 'ORB Strategy',
    url: '/strategies/orb',
    icon: TrendingUp,
  },
];

export default function AppSidebar() {
  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url} data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Trading Strategies</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {strategyItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url} data-testid={`link-strategy-${item.title.toLowerCase().replace(' ', '-')}`}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="/settings" data-testid="link-settings">
                    <Settings />
                    <span>Settings</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}