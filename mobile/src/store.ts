// Простое хранилище заявок в памяти. Заменяется на вызовы API без изменения экранов.
import { useSyncExternalStore } from 'react';

export type Booking = {
  id: string; courtId: string; courtName: string;
  hour: number; hours: number; price: number;
  status: 'wait' | 'confirmed' | 'cancelled';
  createdAt: number;
};

let bookings: Booking[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }
export function getBookings() { return bookings }

export function useBookings() {
  return useSyncExternalStore(subscribe, getBookings, getBookings);
}

export function addBooking(b: Omit<Booking, 'id' | 'status' | 'createdAt'>) {
  const rec: Booking = { ...b, id: 'b' + Date.now(), status: 'wait', createdAt: Date.now() };
  bookings = [rec, ...bookings];
  emit();
  // Заглушка: менеджер подтверждает через 6 секунд. На бэкенде это придёт пушем.
  setTimeout(() => {
    bookings = bookings.map(x => x.id === rec.id && x.status === 'wait'
      ? { ...x, status: 'confirmed' as const } : x);
    emit();
  }, 6000);
  return rec;
}

export function cancelBooking(id: string) {
  bookings = bookings.filter(b => b.id !== id);
  emit();
}

/* ── Записи на турнир ──────────────────────────────────────────────────────
   Заказчику нужен минимум: записался, видит что записан и когда играть.
   Всё остальное — сетка, результаты — происходит вживую.                    */

export type Entry = { tournamentId: string; createdAt: number };

let entries: Entry[] = [];
const eListeners = new Set<() => void>();
const eEmit = () => eListeners.forEach(l => l());

function eSubscribe(l: () => void) { eListeners.add(l); return () => { eListeners.delete(l) } }
function getEntries() { return entries }

export function useEntries() {
  return useSyncExternalStore(eSubscribe, getEntries, getEntries);
}

export function isEntered(tournamentId: string) {
  return entries.some(e => e.tournamentId === tournamentId);
}

export function enterTournament(tournamentId: string) {
  if (isEntered(tournamentId)) return;
  entries = [{ tournamentId, createdAt: Date.now() }, ...entries];
  eEmit();
}

export function leaveTournament(tournamentId: string) {
  entries = entries.filter(e => e.tournamentId !== tournamentId);
  eEmit();
}
