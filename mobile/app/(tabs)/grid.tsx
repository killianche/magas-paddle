import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S } from '../../src/theme';
import { COURTS, slotsFor, hh, CLUB } from '../../src/data';
import { IconBall, IconChevron } from '../../src/components/icons';

const NOW = 18;

export default function Grid() {
  const hours: number[] = [];
  for (let h = NOW; h < CLUB.closeHour; h++) hours.push(h);

  const tap = (courtId: string, hour: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/court', params: { id: courtId, hour: String(hour) } });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.ink }} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={s.dayNav}>
        <View style={s.arw}>
          <View style={{ transform: [{ scaleX: -1 }] }}><IconChevron size={16} color={C.dim} /></View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.dayT}>Сегодня</Text>
          <Text style={s.dayS}>вторник, 2 сентября</Text>
        </View>
        <View style={s.arw}><IconChevron size={16} color={C.dim} /></View>
      </View>

      <View style={s.grid}>
        <View style={s.headRow}>
          <View style={{ width: 46 }} />
          {COURTS.map(c => (
            <View key={c.id} style={s.headCell}>
              {c.id === 'f1'
                ? <IconBall />
                : <Text style={s.headT}>К{c.name.replace(/\D/g, '')}</Text>}
            </View>
          ))}
        </View>

        {hours.map(h => (
          <View key={h} style={s.gridRow}>
            <Text style={s.timeCell}>{hh(h)}</Text>
            {COURTS.map(c => {
              if (c.off) return <View key={c.id} style={[s.cell, s.cellOff]} />;
              const st = slotsFor(c.id, NOW).find(x => x.hour === h)!.status;
              const free = st === 'free';
              const past = st === 'past';
              return (
                <Pressable key={c.id} disabled={!free}
                  onPress={() => tap(c.id, h)}
                  style={({ pressed }) => [s.cell, free && s.cellFree, past && s.cellPast,
                    !free && !past && s.cellBusy,
                    pressed && { transform: [{ scale: 0.9 }] }]}>
                  {free && <View style={s.dotFree} />}
                  {!free && !past && <View style={s.dashBusy} />}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={s.legend}>
        <Legend color="rgba(198,240,51,.09)" border="rgba(198,240,51,.46)" label="Свободно" />
        <Legend color={C.surface} border={C.line} label="Занято" />
        <Legend color="transparent" border={C.line} label="Закрыто" dashed />
      </View>

      <View style={s.note}>
        <Text style={s.noteT}>Корт 6 закрыт до 5 сентября — ремонт покрытия.</Text>
      </View>
    </ScrollView>
  );
}

function Legend({ color, border, label, dashed }: {
  color: string; border: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={{ width: 15, height: 15, borderRadius: 5, backgroundColor: color,
        borderWidth: 1, borderColor: border, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Text style={{ color: C.dim, fontSize: 11.5 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: S.xl, paddingBottom: 14 },
  arw: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  dayT: { color: C.text, fontSize: 18, fontWeight: '700' },
  dayS: { color: C.dim2, fontSize: 12 },

  grid: { paddingHorizontal: 12 },
  headRow: { flexDirection: 'row', gap: 4, paddingBottom: 8 },
  headCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headT: { color: C.dim, fontSize: 10.5, fontWeight: '700' },
  gridRow: { flexDirection: 'row', gap: 4, marginBottom: 4, alignItems: 'center' },
  timeCell: { width: 46, color: C.dim2, fontSize: 11.5, fontVariant: ['tabular-nums'] },
  cell: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent', backgroundColor: C.surface2 },
  cellFree: { backgroundColor: 'rgba(198,240,51,.09)', borderColor: 'rgba(198,240,51,.46)' },
  cellBusy: { backgroundColor: C.surface, opacity: 0.6 },
  cellPast: { backgroundColor: 'transparent', borderColor: C.lineSoft, opacity: 0.55 },
  cellOff: { borderStyle: 'dashed', borderColor: C.line, backgroundColor: 'transparent' },
  dotFree: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.lime },
  dashBusy: { width: 10, height: 2, borderRadius: 1, backgroundColor: C.busy },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: S.xl, paddingTop: 16 },
  note: { marginHorizontal: S.xl, marginTop: 16, padding: 12, borderRadius: R.md,
    backgroundColor: 'rgba(240,169,59,.08)', borderWidth: 1, borderColor: 'rgba(240,169,59,.26)' },
  noteT: { color: '#DFCCA8', fontSize: 12.5, lineHeight: 18 },
});
