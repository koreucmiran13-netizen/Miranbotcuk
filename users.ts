/**
 * MiranBot v3 — Müşteri Yönetimi (kiralanabilir yapı)
 * users.json: { [botId]: [ { name, phone, addedAt } ] }
 */
import fs from 'fs';
import path from 'path';

const USERS_PATH = path.join(process.cwd(), 'users.json');

export interface Customer {
  name: string;
  phone: string;
  addedAt: string;
}

export function listCustomers(botId: string): Customer[] {
  try {
    const all = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
    return all[botId] ?? [];
  } catch {
    return [];
  }
}

export function addCustomer(botId: string, name: string, phone: string): boolean {
  try {
    const all: Record<string, Customer[]> = fs.existsSync(USERS_PATH)
      ? JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'))
      : {};
    if (!all[botId]) all[botId] = [];
    if (all[botId].some((c) => c.name === name)) return false;
    all[botId].push({ name, phone, addedAt: new Date().toISOString() });
    fs.writeFileSync(USERS_PATH, JSON.stringify(all, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function removeCustomer(botId: string, name: string): boolean {
  try {
    const all: Record<string, Customer[]> = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
    const list = all[botId];
    if (!list) return false;
    const before = list.length;
    all[botId] = list.filter((c) => c.name !== name);
    fs.writeFileSync(USERS_PATH, JSON.stringify(all, null, 2));
    return all[botId].length < before;
  } catch {
    return false;
  }
}
