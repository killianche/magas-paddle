// Уведомления клуба.
//
// Пока это ящик внутри приложения, а не пуш на экран телефона: пушам нужен
// сертификат APNs и согласие человека. Место, куда приходят сообщения, нужно
// уже сейчас — иначе подтверждение брони человек узнаёт, только заглянув
// в «Мои записи». Когда пуши подключат, сюда же будет вести нажатие на пуш.
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { C, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY } from '../src/theme';
import { api } from '../src/api';
import { useApi } from '../src/useApi';
import { useProfile } from '../src/profile';
import { Eyebrow } from '../src/components/velocity';
import { Loading, Failed } from '../src/components/status';

/** «сегодня, 14:05» — человеку важнее «когда», чем точная дата. */
function whenText(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `сегодня, ${time}`;
  const yesterday = new Date(now.getTime() - 864e5);
  if (d.toDateString() === yesterday.toDateString()) return `вчера, ${time}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + `, ${time}`;
}

export default function Notifications() {
  const { profile, ready } = useProfile();
  const phone = profile?.phone ?? '';

  const q = useApi(
    () => phone ? api.notifications(phone) : Promise.resolve({ items: [], unread: 0 }),
    [phone], phone ? `notes.${phone}` : undefined);

  // Открыл экран — значит прочитал. Отметку ставим один раз за заход.
  useFocusEffect(useCallback(() => {
    if (!phone) return;
    q.refresh();
    api.readNotifications(phone).catch(() => {});
  }, [phone]));

  if (!ready) return <Loading />;
  if (!phone) return (
    <View style={s.root}>
      <Stack.Screen options={{ title: 'Уведомления' }} />
      <View style={s.head}>
        <Eyebrow>Уведомления</Eyebrow>
        <Text style={s.h1} allowFontScaling={false}>ПОКА{'\n'}ПУСТО</Text>
        <Text style={s.lede}>
          Здесь появятся сообщения клуба: подтверждение брони, отмена, новости
          и турниры. Заведите аккаунт, чтобы клуб знал, кому писать.
        </Text>
      </View>
    </View>
  );

  if (q.loading && !q.data) return <Loading note="Смотрю сообщения" />;
  if (q.error && !q.data) return <Failed message={q.error} onRetry={q.reload} />;

  const items = q.data?.items ?? [];

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: 'Уведомления' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull}
          tintColor={C.dim} />}>
        <View style={s.head}>
          <Eyebrow>Уведомления</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>СООБЩЕНИЯ{'\n'}КЛУБА</Text>
        </View>

        {items.length === 0 && (
          <Text style={s.empty}>
            Сообщений пока нет. Здесь появятся подтверждение брони, отмена,
            новости клуба и турниры.
          </Text>
        )}

        {items.map(n => (
          <View key={n.id} style={[s.card, !n.read && s.cardNew]}>
            <View style={s.row}>
              <Text style={s.title}>{n.title}</Text>
              {!n.read && <View style={s.dot} />}
            </View>
            <Text style={s.body}>{n.body}</Text>
            <Text style={s.when}>
              {whenText(n.createdAt)}{n.forEveryone ? ' · всем' : ''}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  head: { paddingHorizontal: S.xl, paddingTop: 12, paddingBottom: 16 },
  h1: { ...TITLE.page, color: C.text, marginTop: 8 },
  lede: { fontFamily: BODY, color: C.dim, fontSize: 14.5, lineHeight: 21, marginTop: 10 },
  empty: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20,
    marginHorizontal: S.xl },

  card: { marginHorizontal: S.xl, marginBottom: 9, padding: 15,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  cardNew: { borderColor: 'rgba(198,240,51,.32)', backgroundColor: 'rgba(198,240,51,.05)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, color: C.text, fontFamily: DISP, fontSize: 16, letterSpacing: -0.5,
    textTransform: 'uppercase' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.lime },
  body: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 7 },
  when: { ...EYEBROW, color: C.dim2, marginTop: 9 },
});
