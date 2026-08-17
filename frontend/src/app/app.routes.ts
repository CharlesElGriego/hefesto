import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'chat' },
  {
    path: 'chat',
    loadComponent: () => import('./features/chat/chat.page').then((m) => m.ChatPage),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'vehicle/:id',
    loadComponent: () =>
      import('./features/vehicle/vehicle-detail.page').then((m) => m.VehicleDetailPage),
  },
  {
    path: 'vehicle',
    loadComponent: () => import('./features/vehicle/vehicle.page').then((m) => m.VehiclePage),
  },
  {
    path: 'connect',
    loadComponent: () => import('./features/connect/connect.page').then((m) => m.ConnectPage),
  },
  { path: '**', redirectTo: 'chat' },
];
