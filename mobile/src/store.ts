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
